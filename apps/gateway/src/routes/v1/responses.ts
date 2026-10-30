import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { getProvidersForRequest } from "../../lib/router.js";
import { providers } from "../../providers/registry.js";
import { logger } from "../../middleware/logger.js";
import { estimateChatTokens } from "../../lib/token-estimator.js";
import { recordUsage } from "../../lib/quota-tracker.js";
import { addLog } from "../../lib/request-log.js";
import { hasScope } from "../../lib/virtual-keys.js";
import { translateResponsesToChat, translateChatToResponses, createResponsesStreamChunk } from "../../lib/responses-translator.js";
import { tryProviders } from "../../lib/provider-executor.js";
import { getRequestVk, type UpstreamChatCompletion } from "../../lib/types.js";
import type { ResponsesRequest } from "../../providers/base.js";
import fs from "node:fs";
import path from "node:path";

const responsesSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.any())]),
  instructions: z.string().optional(),
  previous_response_id: z.string().optional(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  max_output_tokens: z.number().optional(),
  max_tokens: z.number().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  user: z.string().optional(),
});

function loadVerifiedMap(): Map<string, string> {
  try {
    const p = path.resolve("data/verified-models.json");
    if (!fs.existsSync(p)) return new Map();
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as { models?: Array<{ id: string; status: string }> };
    const m = new Map<string, string>();
    for (const row of data.models || []) m.set(row.id, row.status);
    const hp = path.resolve("data/model-health.json");
    if (fs.existsSync(hp)) {
      const hdata = JSON.parse(fs.readFileSync(hp, "utf-8")) as Record<string, { http_status?: number }>;
      for (const [id, v] of Object.entries(hdata)) {
        if (v.http_status === 404 || v.http_status === 410) m.set(id, "deprecated");
      }
    }
    return m;
  } catch {
    return new Map();
  }
}

export const responsesRoute = new Hono();

/** Minimal context surface used by the shared responses handler (3 routes). */
interface ResponsesHandlerContext {
  req: {
    header: (name: string) => string | undefined;
  };
  header: (name: string, value: string) => void;
  json: (obj: unknown, status?: 200 | 403 | 502) => Response;
}

async function handleResponses(c: ResponsesHandlerContext, body: ResponsesRequest) {
  const model = body.model || config.defaultModel;
  const vk = getRequestVk(c);

  if (vk && !hasScope(vk, model, undefined)) {
    return c.json({ error: { message: `Key not allowed for model ${model}`, type: "insufficient_scope" } }, 403);
  }

  const pinned = c.req.header("x-router")?.trim();
  let providerOrder: string[];
  if (pinned && providers[pinned]) {
    if (vk && !hasScope(vk, undefined, pinned)) {
      return c.json({ error: { message: `Key not allowed for provider ${pinned}`, type: "insufficient_scope" } }, 403);
    }
    providerOrder = [pinned, ...getProvidersForRequest(model, "tiered").filter((p) => p !== pinned)];
    logger.info({ pinned, model }, "x-router pinned (responses)");
  } else {
    providerOrder = getProvidersForRequest(model, "tiered");
  }

  const verifiedMap = loadVerifiedMap();
  if (model.includes("/") && verifiedMap.get(model) === "deprecated") {
    const prefix = model.split("/")[0];
    providerOrder = providerOrder.filter((p) => p !== prefix);
  }

  const chatReq = translateResponsesToChat(body);
  const estimated = estimateChatTokens({
    messages: chatReq.messages,
    max_tokens: body.max_output_tokens ?? body.max_tokens,
  });
  const startAll = Date.now();

  const sessionId = c.req.header("x-session-id") || c.req.header("X-Session-ID") || undefined;
  const parentSessionId = c.req.header("x-parent-session-id") || c.req.header("X-Parent-Session-ID") || undefined;
  if (sessionId) chatReq.sessionId = sessionId;
  if (parentSessionId) chatReq.parentSessionId = parentSessionId;

  const result = await tryProviders({
    providerOrder,
    quotaTokens: estimated.total,
    shouldSkip: (pid) => {
      const fullId = model.includes("/") ? model : `${pid}/${model}`;
      if (verifiedMap.get(fullId) === "deprecated" || verifiedMap.get(model) === "deprecated") {
        return "model deprecated per verified-models.json";
      }
      return null;
    },
    call: ({ provider, key, signal }) =>
      provider.responses ? provider.responses(body, key, signal) : provider.chat(chatReq, key, signal),
  });

  if (result.ok) {
    const { providerId: pid, key, res } = result;
    {
      const fullId = model.includes("/") ? model : `${pid}/${model}`;
      const latency = Date.now() - startAll;
      const vStatus = verifiedMap.get(fullId) || "unknown";

      if (body.stream) {
        addLog({
          id: `req-${Date.now()}`,
          timestamp: new Date().toISOString(),
          virtualKeyId: vk?.id,
          virtualKeyName: vk?.name,
          provider: pid,
          model,
          promptTokens: estimated.prompt,
          totalTokens: estimated.total,
          latencyMs: latency,
          status: 200,
          verifiedStatus: vStatus,
        });

        if (providers[pid]?.responses) {
          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": res.headers.get("content-type") || "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Provider": pid,
              "X-Model": model,
              "X-Verified": vStatus,
            },
          });
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            const encoder = new TextEncoder();
            try {
              if (!reader) {
                controller.close();
                return;
              }
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.enqueue(encoder.encode(createResponsesStreamChunk(model, "", true)));
                  break;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const dataStr = trimmed.slice(5).trim();
                  if (dataStr === "[DONE]") {
                    controller.enqueue(encoder.encode(createResponsesStreamChunk(model, "", true)));
                    continue;
                  }
                  try {
                    const json = JSON.parse(dataStr);
                    const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || json.delta || "";
                    if (delta) controller.enqueue(encoder.encode(createResponsesStreamChunk(model, delta, false)));
                    if (json.choices?.[0]?.finish_reason) {
                      controller.enqueue(encoder.encode(createResponsesStreamChunk(model, "", true)));
                    }
                  } catch { /* ignore */ }
                }
              }
            } catch (e) {
              logger.warn({ provider: pid, err: e instanceof Error ? e.message : String(e) }, "responses stream error");
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Provider": pid,
            "X-Model": model,
            "X-Verified": vStatus,
          },
        });
      }

      const data = (await res.json().catch(async () => ({ text: await res.text() }))) as UpstreamChatCompletion;
      let out: UpstreamChatCompletion;
      if (providers[pid]?.responses) {
        out = data;
        if (!out.id) out.id = `resp_${Date.now()}`;
        if (!out.object) out.object = "response";
      } else if (data.choices) {
        out = translateChatToResponses(data, model);
      } else if (data.output) {
        out = data;
      } else {
        out = translateChatToResponses(
          { choices: [{ message: { content: typeof data === "string" ? data : JSON.stringify(data) } }], usage: data.usage, id: data.id, created: data.created, model },
          model,
        );
      }

      c.header("X-Provider", pid);
      c.header("X-Verified", vStatus);
      const usage = out.usage || data.usage;
      const total = usage?.total_tokens ?? usage?.total_tokens_compat ?? estimated.total;
      // Executor already committed estimated tokens — top up positive delta only.
      const usageDelta = ((usage?.total_tokens ?? usage?.total_tokens_compat) ?? 0) - estimated.total;
      if ((usage?.total_tokens || usage?.total_tokens_compat) && usageDelta > 0) recordUsage(pid, key, usageDelta, model, { countRequest: false });
      addLog({
        id: `req-${Date.now()}`,
        timestamp: new Date().toISOString(),
        virtualKeyId: vk?.id,
        virtualKeyName: vk?.name,
        provider: pid,
        model,
        promptTokens: usage?.prompt_tokens ?? usage?.input_tokens ?? estimated.prompt,
        completionTokens: usage?.completion_tokens ?? usage?.output_tokens ?? 0,
        totalTokens: total,
        latencyMs: latency,
        status: 200,
        verifiedStatus: vStatus,
      });
      return c.json(out);
      }
    }

    const errors = result.errors;

  addLog({
    id: `req-${Date.now()}`,
    timestamp: new Date().toISOString(),
    virtualKeyId: vk?.id,
    virtualKeyName: vk?.name,
    provider: errors[0]?.provider || "none",
    model,
    promptTokens: estimated.prompt,
    totalTokens: estimated.total,
    latencyMs: Date.now() - startAll,
    status: 502,
    error: JSON.stringify(errors).slice(0, 500),
  });

  if (config.nodeEnv === "development" && errors.length > 0) {
    const inputPreview = typeof body.input === "string" ? body.input.slice(0, 100) : JSON.stringify(body.input).slice(0, 100);
    return c.json(
      {
        id: `resp_mock_${Date.now()}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        created: Math.floor(Date.now() / 1000),
        model,
        status: "completed",
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: `[mock] All providers failed, returning mock. Errors: ${JSON.stringify(errors).slice(0, 900)} — configure API keys in .env. Input: "${inputPreview}"` }] }],
        usage: { input_tokens: estimated.prompt, output_tokens: 20, total_tokens: estimated.total, prompt_tokens: estimated.prompt, completion_tokens: 20 },
        _mock: true,
        _errors: errors,
      },
      200,
    );
  }

  return c.json({ error: { message: "All providers failed", type: "provider_error", provider_errors: errors } }, 502);
}

responsesRoute.post("/", zValidator("json", responsesSchema), (c) => handleResponses(c, c.req.valid("json")));
responsesRoute.post("", zValidator("json", responsesSchema), (c) => handleResponses(c, c.req.valid("json")));

responsesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (config.nodeEnv === "development") {
    return c.json({
      id,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: "mock",
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: `[mock] Response ${id} not persisted — dev stub` }] }],
      _mock: true,
    });
  }
  return c.json({ error: { message: `Response ${id} not found`, type: "not_found" } }, 404);
});

responsesRoute.post("/conversations", zValidator("json", responsesSchema), (c) => handleResponses(c, c.req.valid("json")));

export const conversationsRoute = responsesRoute;
