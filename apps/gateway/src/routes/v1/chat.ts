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
import { compressWithMetrics } from "../../lib/compression.js";
import { logGenAI } from "../../lib/otel.js";
import { FREELLMS_COST, rankProvidersByCostAndLatency } from "../../lib/cost-router.js";
import { adaptiveRank } from "../../lib/adaptive-router.js";
import { semanticCache } from "../../lib/semantic-cache.js";
import { loadVerifiedMap, loadHealthMap } from "../../lib/model-store.js";
import { tryProviders } from "../../lib/provider-executor.js";
import { getRequestVk, type UpstreamChatCompletion, type CompressibleMessage } from "../../lib/types.js";
import type { ChatMessage } from "../../providers/base.js";
import { shouldEnableWebTools, getWebTools, executeWebSearch, executeWebFetch } from "../../lib/web-tools.js";

const contentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  content: z.string().optional(),
  image_url: z.object({ url: z.string() }).optional(),
  source: z.unknown().optional(),
}).passthrough();

const toolCallSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  function: z.object({
    name: z.string().optional(),
    arguments: z.string().optional(),
    description: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const toolSchema = z.object({
  type: z.string().optional(),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.unknown().optional(),
  }).passthrough().optional(),
}).passthrough();

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.union([z.string(), z.array(contentPartSchema)]),
      tool_call_id: z.string().optional(),
      name: z.string().optional(),
      tool_calls: z.array(toolCallSchema).optional(),
    }).passthrough()
  ),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  tools: z.array(toolSchema).optional(),
  tool_choice: z.union([z.string(), z.record(z.unknown())]).optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  n: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  user: z.string().optional(),
});

export const chatRoute = new Hono();

chatRoute.post(
  "/completions",
  zValidator("json", chatSchema),
  async (c) => {
    const body = c.req.valid("json");
    const model = body.model || config.defaultModel;
    const vk = getRequestVk(c);

    // Scope check for virtual key
    if (vk && !hasScope(vk, model, undefined)) {
      return c.json({ error: { message: `Key not allowed for model ${model}`, type: "insufficient_scope" } }, 403);
    }

    // x-router header to pin provider
    const pinned = c.req.header("x-router")?.trim();
    let providerOrder: string[];
    if (pinned && providers[pinned]) {
      if (vk && !hasScope(vk, undefined, pinned)) {
        return c.json({ error: { message: `Key not allowed for provider ${pinned}`, type: "insufficient_scope" } }, 403);
      }
      providerOrder = [pinned, ...getProvidersForRequest(model, "tiered").filter((p) => p !== pinned)];
      logger.info({ pinned, model }, "x-router pinned");
    } else {
      providerOrder = getProvidersForRequest(model, "tiered");
    }

    // Filter deprecated models if verified data exists
    // Only skip providers where the model is explicitly deprecated AND has health data
    const verifiedMap = loadVerifiedMap();
    const healthMap = loadHealthMap();
    if (model.includes("/") && verifiedMap.get(model) === "deprecated") {
      logger.warn({ model }, "requested model is deprecated, will fallback to other providers");
      // Don't blindly filter by prefix - instead check per-provider health
      // If the requesting provider has health data showing usable, keep it
      const prefix = model.split("/")[0];
      const healthEntry = healthMap.get(model);
      // Only filter out if the specific provider-model combination is unusable
      if (healthEntry && healthEntry.status !== "usable") {
        providerOrder = providerOrder.filter((p) => p !== prefix);
        logger.info({ model, filteredOut: prefix }, "filtered deprecated provider");
      }
    }

    // Vector 2: cost-aware re-ranking (skip if x-router pinned)
    const isAuto = model === "free-llm-gateway/auto" || model === "auto";
    // P8 adaptive: prefer adaptiveRank when ADAPTIVE_ROUTING_ENABLED=1, otherwise cost router
    const shouldRank = (config.costRoutingEnabled || config.adaptiveRoutingEnabled || (isAuto && config.nodeEnv !== "test")) && !pinned && providerOrder.length > 1;
    if (shouldRank) {
      try {
        if (config.adaptiveRoutingEnabled) {
          providerOrder = await adaptiveRank(providerOrder, model);
          logger.info({ providerOrder, isAuto, adaptive: true }, "adaptive routing re-ranked");
        } else {
          providerOrder = rankProvidersByCostAndLatency(providerOrder);
          logger.info({ providerOrder, isAuto }, "cost routing re-ranked");
        }
      } catch { /* ignore */ }
    }
    // Auto uses shorter per-provider timeout to fail fast (8s vs 25s) — sequential fallback 3 providers ~24s max vs 54s before
    // In test, keep timeout under vitest 5000ms to avoid test timeout
    const perProviderTimeout = isAuto ? (config.nodeEnv === "test" ? 4000 : config.providerTimeoutAutoMs) : config.providerTimeoutMs;

    const estimated = estimateChatTokens({ messages: body.messages, max_tokens: body.max_tokens });
    const startAll = Date.now();

    // Web tools toggle per-request (must be early to skip cache when searching)
    const _webToolsForCacheCheck = shouldEnableWebTools(c);

    // Vector 2: semantic cache check first (cheapest) - only for non-stream, skip when web tools active (fresh data)
    // harness 01 Retrieve: tenant-aware key (vkId + tools + temperature) prevents poisoning
    let cacheHitContent: string | null = null;
    if (config.semanticCacheEnabled && !body.stream && !_webToolsForCacheCheck) {
      try {
        const q = JSON.stringify(body.messages);
        cacheHitContent = await semanticCache.get(q, model, {
          vkId: vk?.id,
          tools: body.tools,
          temperature: body.temperature,
        });
        if (cacheHitContent) {
          logger.info({ model, vkId: vk?.id }, "semantic cache hit");
          logGenAI("chat", { model, provider: "cache", promptTokens: estimated.prompt, latencyMs: Date.now() - startAll, cacheHit: true });
          addLog({ id: `req-${Date.now()}`, timestamp: new Date().toISOString(), virtualKeyId: vk?.id, virtualKeyName: vk?.name, provider: "cache", model, promptTokens: estimated.prompt, completionTokens: estimateChatTokens({ messages: [{ role: "assistant", content: cacheHitContent }] }).prompt, totalTokens: estimated.prompt + 20, latencyMs: Date.now() - startAll, status: 200, verifiedStatus: "cache", cacheHit: true });
          return c.json({ id: `chatcmpl-cache-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: "assistant", content: cacheHitContent }, finish_reason: "stop" }], usage: { prompt_tokens: estimated.prompt, completion_tokens: 20, total_tokens: estimated.prompt + 20 } });
        }
      } catch { /* ignore */ }
    }

    // Vector 2: optional compression (only on cache miss) - harness 02 Build Context pipeline
    // Workflow Stage: metrics + guard + token budget
    let messagesToSend: CompressibleMessage[] = body.messages;
    let compressionRatio: number | undefined;
    let compressedTokens: number | undefined;
    if (config.compressionEnabled && body.messages?.length > 6) {
      const maxTokens = config.compressionMaxTokens || 4096;
      const comp = compressWithMetrics(body.messages, { maxTokens: estimated.prompt > maxTokens ? maxTokens : undefined });
      if (comp.metrics.applied) {
        messagesToSend = comp.messages;
        compressionRatio = comp.ratio;
        compressedTokens = Math.max(0, estimated.prompt - comp.savedTokens);
        logger.info({ model, original: body.messages.length, compressed: messagesToSend.length, ratio: comp.ratio, savedTokens: comp.savedTokens, durationMs: comp.metrics.durationMs }, "compression applied");
      }
    }
    const estimatedForQuota = estimateChatTokens({ messages: messagesToSend, max_tokens: body.max_tokens });
    const preMs = Date.now() - startAll; // time spent before upstream (verified/health/router/estimate/cache/compress)

    // Extract session IDs for providers that require them (opencode free tier, etc.)
    const sessionId = c.req.header("x-session-id") || c.req.header("X-Session-ID") || undefined;
    const parentSessionId = c.req.header("x-parent-session-id") || c.req.header("X-Parent-Session-ID") || undefined;

    // ---- Web tools: inject gateway-hosted web_search + web_fetch ----
    const webToolsForRequest = shouldEnableWebTools(c);
    let effectiveTools: unknown[] | undefined = body.tools as unknown[] | undefined;
    let effectiveToolChoice: unknown = body.tool_choice;
    if (webToolsForRequest) {
      const injected = getWebTools() as unknown[];
      const existing = (body.tools as unknown[] | undefined) || [];
      // avoid duplicate if client already sent same name
      const existingNames = new Set(existing.map((t: unknown) => (t as { function?: { name?: string } })?.function?.name));
      const toAdd = injected.filter((t: unknown) => !existingNames.has((t as { function: { name: string } }).function.name));
      effectiveTools = [...existing, ...toAdd];
      if (!effectiveToolChoice) effectiveToolChoice = "auto";
      logger.info({ tools: effectiveTools.length }, "web tools injected");
    }

    // Helper to call provider — for auto, race 3 providers in parallel gateway-wide (not only Chat page)
    // When x-router pinned, disable parallel to preserve pin order (test pins pollinations first)
    // In test env, keep sequential for determinism
    const parallelForCall = isAuto && !pinned && config.nodeEnv !== "test" ? config.providerParallelAuto : undefined;
    const callProvider = (msgs: unknown[], useStream: boolean | undefined, tools: unknown[] | undefined, toolChoice: unknown) =>
      tryProviders({
        providerOrder,
        quotaTokens: estimatedForQuota.total,
        quotaModel: model,
        vkId: vk?.id,
        timeoutMs: perProviderTimeout,
        parallel: parallelForCall,
        jitterMs: isAuto && !pinned && config.nodeEnv !== "test" ? 80 : 30,
        shouldSkip: (pid) => {
          const fullId = model.includes("/") ? model : `${pid}/${model}`;
          const requestedPrefix = model.split("/")[0];
          if (verifiedMap.get(fullId) === "deprecated" && pid !== requestedPrefix) {
            return "model deprecated per verified-models.json";
          }
          return null;
        },
        call: ({ provider, key }) =>
          provider.chat(
            {
              model,
              messages: msgs as unknown as ChatMessage[],
              temperature: body.temperature,
              max_tokens: body.max_tokens,
              stream: useStream,
              tools: tools as unknown as ChatMessage[] | undefined,
              tool_choice: toolChoice,
              top_p: body.top_p,
              top_k: body.top_k,
              n: body.n,
              stop: body.stop,
              presence_penalty: body.presence_penalty,
              frequency_penalty: body.frequency_penalty,
              user: body.user,
              sessionId,
              parentSessionId,
            },
            key
          ),
      });

    // Web tools loop: if enabled, we do non-stream tool iterations first
    let result: Awaited<ReturnType<typeof tryProviders>> | null = null;
    const loopMessages: unknown[] = [...messagesToSend] as unknown[];
    let webIterations = 0;
    const finalStreamRequested = !!body.stream;

    if (webToolsForRequest) {
      // Loop up to webToolsMaxIterations tool calls
      while (webIterations <= config.webToolsMaxIterations) {
        const useStream = false; // intermediate always non-stream to reliably parse tool_calls
        const r = await callProvider(loopMessages, useStream, effectiveTools, effectiveToolChoice);
        if (!r.ok) {
          result = r;
          break;
        }
        // Parse response to detect tool_calls
        let data: UpstreamChatCompletion | null = null;
        try {
          const text = await r.res.clone().text();
          data = JSON.parse(text) as UpstreamChatCompletion;
        } catch {
          // If not JSON, treat as final
          result = r;
          break;
        }
        const msg = data?.choices?.[0]?.message as { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>; content?: unknown } | undefined;
        const toolCalls = msg?.tool_calls || [];
        const webCalls = toolCalls.filter((tc) => tc.function?.name === "web_search" || tc.function?.name === "web_fetch");
        if (webCalls.length === 0) {
          // No web tool needed -> final result is this response (re-create response from data)
          // We keep r as result; but we need to allow streaming for final if requested
          if (finalStreamRequested) {
            // Do one more streaming call with the enriched loopMessages (which may have grown)
            const streamResult = await callProvider(loopMessages, true, effectiveTools, effectiveToolChoice);
            if (streamResult.ok) {
              result = streamResult;
            } else {
              // fallback to non-stream data
              result = r;
              // store data for non-stream path below: we will reconstruct
              // To avoid double-read, create a new Response with JSON
              const bodyText = JSON.stringify(data);
              result = { ok: true, providerId: r.providerId, key: r.key, res: new Response(bodyText, { headers: { "content-type": "application/json" } }) } as typeof r;
            }
          } else {
            // Ensure result res is fresh (we cloned, so need to recreate)
            const bodyText = JSON.stringify(data);
            result = { ok: true, providerId: r.providerId, key: r.key, res: new Response(bodyText, { headers: { "content-type": "application/json" } }) } as typeof r;
          }
          break;
        }

        // Execute web tools
        logger.info({ webCalls: webCalls.map((c) => c.function?.name), iter: webIterations }, "executing web tools");
        // Need to push assistant tool_calls message + tool results
        const assistantMsg: Record<string, unknown> = {
          role: "assistant",
          content: msg?.content ?? null,
          tool_calls: toolCalls,
        };
        loopMessages.push(assistantMsg);

        for (const tc of webCalls) {
          const name = tc.function?.name || "";
          const argsRaw = tc.function?.arguments || "{}";
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(argsRaw) as Record<string, unknown>;
          } catch {
            args = {};
          }
          let toolResult = "";
          try {
            if (name === "web_search") {
              const q = String(args.query || args.q || "").trim();
              const count = typeof args.count === "number" ? args.count : undefined;
              if (!q) throw new Error("Missing query for web_search");
              toolResult = await executeWebSearch(q, count);
            } else if (name === "web_fetch") {
              const url = String(args.url || "").trim();
              if (!url) throw new Error("Missing url for web_fetch");
              toolResult = await executeWebFetch(url);
            }
          } catch (e) {
            toolResult = `Error executing ${name}: ${(e as Error).message}`;
          }
          loopMessages.push({
            role: "tool",
            tool_call_id: tc.id || `call_${Date.now()}`,
            name,
            content: toolResult,
          });
        }

        // Also need to push other non-web tool_calls as error (not supported)
        const nonWebCalls = toolCalls.filter((tc) => tc.function?.name !== "web_search" && tc.function?.name !== "web_fetch");
        for (const tc of nonWebCalls) {
          loopMessages.push({
            role: "tool",
            tool_call_id: tc.id || `call_${Date.now()}`,
            name: tc.function?.name || "unknown",
            content: `Tool ${tc.function?.name} not supported by gateway. Only web_search and web_fetch are available.`,
          });
        }

        webIterations++;
        if (webIterations > config.webToolsMaxIterations) {
          logger.warn("web tools max iterations reached");
          // Make final call with current loopMessages
          const finalR = await callProvider(loopMessages, finalStreamRequested ? true : false, effectiveTools, effectiveToolChoice);
          result = finalR;
          break;
        }
        // continue loop to let LLM see tool results
      }
    } else {
      result = await callProvider(messagesToSend as unknown[], body.stream, effectiveTools, effectiveToolChoice);
    }

    // Fallback: if web tools were injected and all providers failed with tool/invalid-model errors, retry once without tools
    if (result && !result.ok && webToolsForRequest) {
      const errs = result.errors as Array<{ provider?: string; error?: string; status?: number }>;
      const seemsToolRelated = errs.some((e) => /tool|function|web_search|web_fetch|invalid model|not a valid model|does not support tools/i.test(e.error || "")) || errs.every((e) => e.status === 400);
      if (seemsToolRelated) {
        logger.warn({ errors: errs.slice(0, 2), model }, "web-tools request failed for all providers — retrying without web tools as fallback");
        const retry = await callProvider(messagesToSend as unknown[], body.stream, undefined, undefined);
        if (retry.ok) {
          logger.info({ provider: retry.providerId, model }, "fallback without web tools succeeded");
          result = retry;
        } else {
          // keep original errors but append retry errors for visibility
          (errs as unknown[]).push(...retry.errors.map((e) => ({ ...e, note: "retry without web-tools" })));
        }
      }
    }

    if (!result) {
      return c.json({ error: { message: "No provider result", type: "provider_error" } }, 502);
    }

    if (result.ok) {
      const { providerId: pid, key, res } = result;
      {
        const fullId = model.includes("/") ? model : `${pid}/${model}`;
        // Success: record + log
        const latency = Date.now() - startAll;
        const vStatus = verifiedMap.get(fullId) || "unknown";
        logGenAI("chat", { provider: pid, model, promptTokens: estimated.prompt, latencyMs: latency, traceId: `req-${Date.now()}` });

        if (body.stream) {
          const contentType = res.headers.get("content-type") || "text/event-stream";
          const per1M = FREELLMS_COST[pid] ?? 0.05;
          const streamCost = (estimated.total / 1_000_000) * per1M;
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
            compressedTokens,
            compressionRatio,
            cost: Number(streamCost.toFixed(6)),
          });
          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Provider": pid,
              "X-Model": model,
              "X-Verified": vStatus,
              "X-Gateway-PreMs": String(preMs),
              "X-Gateway-Provider-Count": String(providerOrder.length),
            },
          });
        }

        const data = (await res.json().catch(async () => ({ text: await res.text() }))) as UpstreamChatCompletion;
        if (data.choices) {
          c.header("X-Provider", pid);
          c.header("X-Verified", vStatus);
          c.header("X-Gateway-PreMs", String(preMs));
          c.header("X-Gateway-Provider-Count", String(providerOrder.length));
          const usage = data.usage;
          const total = usage?.total_tokens || estimated.total;
          if (usage?.total_tokens) recordUsage(pid, key, total);
          const per1M2 = FREELLMS_COST[pid] ?? 0.05;
          const actualCost = (total / 1_000_000) * per1M2;
          addLog({
            id: `req-${Date.now()}`,
            timestamp: new Date().toISOString(),
            virtualKeyId: vk?.id,
            virtualKeyName: vk?.name,
            provider: pid,
            model,
            promptTokens: usage?.prompt_tokens ?? estimated.prompt,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: total,
            latencyMs: latency,
            status: 200,
            verifiedStatus: vStatus,
            compressedTokens,
            compressionRatio,
            cost: Number(actualCost.toFixed(6)),
          });
          // Vector 2: store in semantic cache if enabled - background async (harness 10 Automation, non-blocking)
          if (config.semanticCacheEnabled) {
            const text = data.choices?.[0]?.message?.content || "";
            if (text) {
              semanticCache.setBackground(
                { model, query: JSON.stringify(body.messages), tools: body.tools, temperature: body.temperature, vkId: vk?.id },
                String(text),
              );
            }
          }
          return c.json(data);
        }
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
        return c.json({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: `${pid}/${model}`,
          choices: [{ index: 0, message: { role: "assistant", content: typeof data === "string" ? data : JSON.stringify(data) }, finish_reason: "stop" }],
          usage: { prompt_tokens: estimated.prompt, completion_tokens: 0, total_tokens: estimated.total },
        });
      }
    }

    const errors = result.errors;

    // Log failure with full provider summary (not just first)
    logger.warn({ model, providerOrder, errors: errors.slice(0, 5), latency: Date.now() - startAll }, "all providers failed for chat");
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
      error: JSON.stringify(errors).slice(0, 800),
    });

    if (process.env.ALLOW_MOCK === "1" && config.nodeEnv === "development" && errors.length > 0) {
      return c.json(
        {
          id: `chatcmpl-mock-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `[mock] All providers failed, returning mock. Errors: ${JSON.stringify(errors).slice(0, 900)} — configure API keys in .env to get real responses. You asked: "${String(body.messages.at(-1)?.content ?? "").slice(0, 100)}"`,
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: estimated.prompt, completion_tokens: 20, total_tokens: estimated.total },
          _mock: true,
          _errors: errors,
        },
        200
      );
    }

    // User-friendly detail: top 3 errors + actionable suggestion
    const topErrors = errors.slice(0, 3).map((e) => `${e.provider}: ${String(e.error || "").slice(0, 180)}${e.status ? ` (${e.status})` : ""}`).join(" | ");
    const suggestion = webToolsForRequest
      ? "Thử tắt Web Tools (Globe) rồi gửi lại, hoặc chọn model khác (kilo-code/kilo-auto, kiraai/kira-auto, openrouter/auto)."
      : errors.some((e) => /timeout/i.test(e.error || ""))
        ? `Provider timeout sau ${config.providerTimeoutMs}ms — thử lại sau 10-30s hoặc chọn model khác (pollinations/openai, groq/llama-3.3-70b).`
        : errors.some((e) => e.status === 400 && /invalid model/i.test(e.error || ""))
          ? "Model không tồn tại trên provider này — thử chọn model trong danh sách Chat (6 default + Favorites) hoặc dùng free-llm-gateway/auto."
          : "Thử chọn model khác hoặc tắt/bật Web Tools và gửi lại.";
    const detailedMessage = `All providers failed (${errors.length} tried). ${topErrors}. Gợi ý: ${suggestion}`;
    return c.json({ error: { message: detailedMessage, type: "provider_error", provider_errors: errors, hint: suggestion } }, 502);
  }
);
