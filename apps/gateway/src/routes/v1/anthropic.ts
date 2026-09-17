import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { getProvidersForRequest } from "../../lib/router.js";
import { providers } from "../../providers/registry.js";
import { logger } from "../../middleware/logger.js";
import { estimateTokens, estimateMessagesTokens } from "../../lib/token-estimator.js";
import { recordUsage } from "../../lib/quota-tracker.js";
import { addLog } from "../../lib/request-log.js";
import { hasScope } from "../../lib/virtual-keys.js";
import { compressWithMetrics } from "../../lib/compression.js";
import { rankProvidersByCostAndLatency } from "../../lib/cost-router.js";
import { semanticCache } from "../../lib/semantic-cache.js";
import { loadVerifiedMap } from "../../lib/model-store.js";
import { tryProviders } from "../../lib/provider-executor.js";
import { getRequestVk, type UpstreamChatCompletion, type UpstreamAnthropicMessage, type CompressibleMessage } from "../../lib/types.js";
import type { AnthropicRequest, ChatRequest } from "../../providers/base.js";

const anthropicSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.union([z.string(), z.array(z.any())]),
    }).passthrough()
  ),
  max_tokens: z.number().int().positive().optional(),
  system: z.union([z.string(), z.array(z.any())]).optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  stop_sequences: z.array(z.string()).optional(),
}).passthrough();



/**
 * Convert OpenAI SSE stream to Anthropic SSE events.
 * OpenAI chunk: data: {"choices":[{"delta":{"content":"..."},"finish_reason":null}]}
 * Anthropic event: event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
 */
function openAIStreamToAnthropicStream(openAIStream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const messageId = `msg_${Date.now()}`;
  let started = false;

  return new ReadableStream({
    async start(controller) {
      const reader = openAIStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (!trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === "[DONE]") {
              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`));
              continue;
            }
            try {
              const json = JSON.parse(dataStr);
              if (!started) {
                started = true;
                controller.enqueue(
                  encoder.encode(
                    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`
                  )
                );
                controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`));
              }
              const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
              if (content) {
                controller.enqueue(
                  encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: content } })}\n\n`)
                );
              }
              const finish = json.choices?.[0]?.finish_reason;
              if (finish) {
                const reasonMap: Record<string, string> = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use" };
                const anthropicReason = reasonMap[finish] || "end_turn";
                controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`));
                controller.enqueue(
                  encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: anthropicReason, stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`)
                );
                controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`));
              }
            } catch { /* ignore: malformed SSE chunk */ }
          }
        }
        // Ensure stop if not already
        if (started) {
          // already handled via [DONE]
        } else {
          // No content case
          controller.enqueue(
            encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`)
          );
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

export const anthropicRoute = new Hono();

// Claude Code sends model "auto" -> map to free-llm-gateway/auto for smart routing
// Claude Code sends model "free-llm-gateway/auto" -> keep as is for custom routing
function normalizeAnthropicModel(m: string): string {
  if (!m || m === "auto") return "free-llm-gateway/auto";
  if (m === "free-llm-gateway/auto") return "free-llm-gateway/auto";
  // already anthropic/claude... -> strip prefix handled later
  return m;
}

anthropicRoute.post("/", zValidator("json", anthropicSchema), async (c) => {
  const rawBody = c.req.valid("json");
  // Normalize system: array -> string, and extract system-role messages
  let systemNorm: string | undefined = undefined;
  if (Array.isArray(rawBody.system)) {
    systemNorm = rawBody.system.map((b: { text?: unknown } | string) => (typeof b === "string" ? b : String(b.text ?? ""))).join("\n");
  } else if (typeof rawBody.system === "string") {
    systemNorm = rawBody.system;
  }
  let messagesNorm = Array.isArray(rawBody.messages) ? [...rawBody.messages] : [];
  // Extract messages with role system into systemNorm
  const systemMsgs: string[] = [];
  messagesNorm = messagesNorm.filter((m) => {
    if (m?.role === "system") {
      const content = m.content;
      if (typeof content === "string") systemMsgs.push(content);
      else if (Array.isArray(content)) systemMsgs.push(content.map((b: { text?: unknown } | string) => (typeof b === "string" ? b : String(b.text ?? ""))).join("\n"));
      else if (content) systemMsgs.push(String(content));
      return false;
    }
    return true;
  });
  if (systemMsgs.length > 0) {
    const extra = systemMsgs.join("\n");
    systemNorm = systemNorm ? systemNorm + "\n" + extra : extra;
  }
  const body = { ...rawBody, system: systemNorm, messages: messagesNorm, max_tokens: rawBody.max_tokens || 4096 };
  const rawModel = body.model || config.defaultModel;
  const model = normalizeAnthropicModel(rawModel);
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
    logger.info({ pinned, model }, "x-router pinned (anthropic)");
  } else {
    providerOrder = getProvidersForRequest(model, "tiered");
    // If model includes claude, ensure anthropic provider is tried first
    if (model.toLowerCase().includes("claude") && !providerOrder.includes("anthropic")) {
      providerOrder = ["anthropic", ...providerOrder];
    }
  }

  // Registry already carries the anthropic provider; executor resolves from it.
  if (model.toLowerCase().includes("claude") && !providerOrder.includes("anthropic")) {
    providerOrder.unshift("anthropic");
  }

  const verifiedMap = loadVerifiedMap();
  if (model.includes("/") && verifiedMap.get(model) === "deprecated") {
    logger.warn({ model }, "anthropic: requested model is deprecated, will fallback");
    const prefix = model.split("/")[0];
    providerOrder = providerOrder.filter((p) => p !== prefix);
  }

  // harness 06 Decide Tools: cost-aware re-ranking (parity with chat.ts) — auto always ranked for fast gateway
  const isAuto = model === "free-llm-gateway/auto" || model === "auto";
  const shouldRank = (config.costRoutingEnabled || (isAuto && config.nodeEnv !== "test")) && !pinned && providerOrder.length > 1;
  if (shouldRank) {
    try {
      providerOrder = rankProvidersByCostAndLatency(providerOrder);
      logger.info({ providerOrder, isAuto }, "cost routing re-ranked (anthropic)");
    } catch { /* ignore: cost routing failed */ }
  }
  const isReasoningModel = /3\.0|reasoning|thinking|r1|deepseek|glm-5/i.test(model);
  const baseTimeout = isAuto ? (config.nodeEnv === "test" ? 4000 : config.providerTimeoutAutoMs) : isReasoningModel ? config.providerTimeoutReasoningMs : config.providerTimeoutMs;
  const perProviderTimeout = baseTimeout;

  const estimated = estimateMessagesTokens(body.messages) + (body.max_tokens || 0);
  const startAll = Date.now();

  // harness 01 Retrieve: semantic cache check (non-stream only, parity) - query includes system
  if (config.semanticCacheEnabled && !body.stream) {
    try {
      const q = JSON.stringify({ system: body.system, messages: body.messages });
      const hit = await semanticCache.get(q, model, { vkId: vk?.id, tools: body.tools, temperature: body.temperature });
      if (hit) {
        logger.info({ model, vkId: vk?.id }, "semantic cache hit (anthropic)");
        addLog({ id: `req-${Date.now()}`, timestamp: new Date().toISOString(), virtualKeyId: vk?.id, virtualKeyName: vk?.name, provider: "cache", model, promptTokens: estimateMessagesTokens(body.messages), totalTokens: estimated, latencyMs: Date.now() - startAll, status: 200, verifiedStatus: "cache", cacheHit: true });
        return c.json({
          id: `msg_cache_${Date.now()}`,
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: hit }],
          model,
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: estimateMessagesTokens(body.messages), output_tokens: estimateTokens(hit) },
        });
      }
    } catch { /* ignore: semantic cache failed */ }
  }

  // harness 02 Build Context: compression (parity with chat.ts)
  let messagesToSend: CompressibleMessage[] = body.messages;
  let compressionRatio: number | undefined;
  let compressedTokens: number | undefined;
  if (config.compressionEnabled && body.messages?.length > 6) {
    const maxTokens = config.compressionMaxTokens || 4096;
    const promptTokens = estimateMessagesTokens(body.messages);
    const comp = compressWithMetrics(body.messages, { maxTokens: promptTokens > maxTokens ? maxTokens : undefined });
    if (comp.metrics.applied) {
      messagesToSend = comp.messages;
      compressionRatio = comp.ratio;
      compressedTokens = Math.max(0, estimated - comp.savedTokens);
      logger.info({ model, original: body.messages.length, compressed: messagesToSend.length, ratio: comp.ratio, savedTokens: comp.savedTokens }, "compression applied (anthropic)");
    }
  }

  const estimatedForQuotaBase = estimateMessagesTokens(messagesToSend) + (body.max_tokens || 0);

  const result = await tryProviders({
    providerOrder,
    quotaTokens: estimatedForQuotaBase,
    timeoutMs: perProviderTimeout,
    parallel: config.nodeEnv === "test" ? undefined : pinned ? undefined : isAuto ? config.providerParallelAuto : providerOrder.length > 1 ? Math.min(config.providerParallelDefault, providerOrder.length) : undefined,
    shouldSkip: (pid) => {
      const fullId = model.includes("/") ? model : `${pid}/${model}`;
      if (verifiedMap.get(fullId) === "deprecated" || verifiedMap.get(model) === "deprecated") {
        return "model deprecated per verified-models.json";
      }
      return null;
    },
    call: async ({ provider, key }) => {
      // Build AnthropicRequest — use compressed messages if applied (parity with chat upstream)
      const effectiveAnthMessages = messagesToSend || body.messages;
      const anthReq = {
        model,
        messages: effectiveAnthMessages as unknown as AnthropicRequest["messages"],
        max_tokens: body.max_tokens,
        system: body.system,
        temperature: body.temperature,
        top_p: body.top_p,
        top_k: body.top_k,
        stream: body.stream,
        tools: body.tools,
        tool_choice: body.tool_choice,
        stop_sequences: body.stop_sequences,
      };

      if (provider.anthropic) {
        return provider.anthropic(anthReq, key);
      }
      if (provider.chat) {
        // Translate Anthropic -> OpenAI ChatRequest (use compressed messages if applied)
        const effectiveMessages = messagesToSend || body.messages;
        const chatReq = {
          model,
          messages: [
            ...(body.system ? [{ role: "system" as const, content: body.system }] : []),
            ...effectiveMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          temperature: body.temperature,
          max_tokens: body.max_tokens,
          stream: body.stream,
          tools: body.tools ? (body.tools as Array<{ name?: string; description?: string; input_schema?: unknown }>).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) : undefined,
          tool_choice: body.tool_choice,
          top_p: body.top_p,
          top_k: body.top_k,
          stop: body.stop_sequences,
        };
        return provider.chat(chatReq as unknown as ChatRequest, key);
      }
      throw new Error("provider has no anthropic or chat method");
    },
  });

  if (result.ok) {
    const { providerId: pid, key, res } = result;
    {
      const fullId = model.includes("/") ? model : `${pid}/${model}`;
      const isAnthropicUpstream = !!providers[pid]?.anthropic;
      const latency = Date.now() - startAll;
      const vStatus = verifiedMap.get(fullId) || "unknown";

      if (body.stream) {
        const contentType = res.headers.get("content-type") || "text/event-stream";
        addLog({
          id: `req-${Date.now()}`,
          timestamp: new Date().toISOString(),
          virtualKeyId: vk?.id,
          virtualKeyName: vk?.name,
          provider: pid,
          model,
          promptTokens: estimateMessagesTokens(body.messages),
          totalTokens: estimated,
          latencyMs: latency,
          status: 200,
          verifiedStatus: vStatus,
          compressedTokens,
          compressionRatio,
        });

        // Stream translation
        if (isAnthropicUpstream) {
          // Passthrough Anthropic SSE
          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Provider": pid,
              "X-Model": model,
              "X-Verified": vStatus,
            },
          });
        } else {
          // Convert OpenAI SSE to Anthropic SSE
          const openAIStream = res.body as ReadableStream<Uint8Array>;
          const anthStream = openAIStreamToAnthropicStream(openAIStream, model);
          return new Response(anthStream, {
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
      }

      // Non-stream: translate back to Anthropic format
      if (isAnthropicUpstream) {
        const data = (await res.json().catch(async () => ({ text: await res.text() }))) as UpstreamAnthropicMessage;
        addLog({
          id: `req-${Date.now()}`,
          timestamp: new Date().toISOString(),
          virtualKeyId: vk?.id,
          virtualKeyName: vk?.name,
          provider: pid,
          model,
          promptTokens: data.usage?.input_tokens ?? estimateMessagesTokens(body.messages),
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) || estimated,
          latencyMs: latency,
          status: 200,
          verifiedStatus: vStatus,
          compressedTokens,
          compressionRatio,
        });
        // harness 01: store cache background (tenant-aware) - query includes system
        if (config.semanticCacheEnabled && !body.stream) {
          const text = data.content?.[0]?.text || data.content || "";
          if (text) semanticCache.setBackground({ model, query: JSON.stringify({ system: body.system, messages: body.messages }), tools: body.tools, temperature: body.temperature, vkId: vk?.id }, String(text));
        }
        c.header("X-Provider", pid);
        c.header("X-Verified", vStatus);
        return c.json(data);
      } else {
        const data = (await res.json().catch(async () => ({ text: await res.text() }))) as UpstreamChatCompletion;
        let anthData: {
          id: string;
          type: string;
          role: string;
          content: Array<{ type: string; text: string }>;
          model: string;
          stop_reason: string;
          stop_sequence: null;
          usage: { input_tokens: number; output_tokens: number };
        };
        if (data.choices) {
          // OpenAI format -> Anthropic format
          const rawContent = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.delta?.content ?? "";
          const text = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          const finish = data.choices?.[0]?.finish_reason || "stop";
          const finishMap: Record<string, string> = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use" };
          anthData = {
            id: data.id || `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            content: [{ type: "text", text }],
            model,
            stop_reason: finishMap[finish] || "end_turn",
            stop_sequence: null,
            usage: {
              input_tokens: data.usage?.prompt_tokens || estimateMessagesTokens(body.messages),
              output_tokens: data.usage?.completion_tokens || estimateTokens(text),
            },
          };
          if (data.usage?.total_tokens) recordUsage(pid, key, data.usage.total_tokens);
        } else {
          anthData = {
            id: `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
            model,
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: estimateMessagesTokens(body.messages), output_tokens: 0 },
          };
        }
        addLog({
          id: `req-${Date.now()}`,
          timestamp: new Date().toISOString(),
          virtualKeyId: vk?.id,
          virtualKeyName: vk?.name,
          provider: pid,
          model,
          promptTokens: anthData.usage.input_tokens,
          completionTokens: anthData.usage.output_tokens,
          totalTokens: anthData.usage.input_tokens + anthData.usage.output_tokens,
          latencyMs: latency,
          status: 200,
          verifiedStatus: vStatus,
          compressedTokens,
          compressionRatio,
        });
        if (config.semanticCacheEnabled && !body.stream) {
          const text = anthData.content?.[0]?.text || "";
          if (text) semanticCache.setBackground({ model, query: JSON.stringify({ system: body.system, messages: body.messages }), tools: body.tools, temperature: body.temperature, vkId: vk?.id }, String(text));
        }
        c.header("X-Provider", pid);
        c.header("X-Verified", vStatus);
        return c.json(anthData);
      }
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
    promptTokens: estimateMessagesTokens(body.messages),
    totalTokens: estimated,
    latencyMs: Date.now() - startAll,
    status: 502,
    error: JSON.stringify(errors).slice(0, 500),
  });

  if (process.env.ALLOW_MOCK === "1" && config.nodeEnv === "development" && errors.length > 0) {
    return c.json(
      {
        id: `msg_mock_${Date.now()}`,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: `[mock] All providers failed, returning mock. Errors: ${JSON.stringify(errors).slice(0, 900)}` }],
        model,
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: estimateMessagesTokens(body.messages), output_tokens: 20 },
        _mock: true,
        _errors: errors,
      },
      200
    );
  }

  return c.json({ error: { message: "All providers failed", type: "provider_error", provider_errors: errors } }, 502);
});

anthropicRoute.post("/count_tokens", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    messages?: Array<{ role: string; content: unknown }>;
    system?: string;
    tools?: unknown;
  };
  const messages = body.messages || [];
  const system = body.system || "";
  let tokens = estimateMessagesTokens(messages);
  if (system) tokens += estimateTokens(system);
  // Add tools overhead if present
  if (body.tools) tokens += estimateTokens(JSON.stringify(body.tools));
  return c.json({ input_tokens: tokens });
});

export default anthropicRoute;
