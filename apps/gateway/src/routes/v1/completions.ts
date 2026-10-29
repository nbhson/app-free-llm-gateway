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
import { tryProviders } from "../../lib/provider-executor.js";
import { getRequestVk } from "../../lib/types.js";
import { FREELLMS_COST } from "../../lib/cost-router.js";
import { logGenAI } from "../../lib/otel.js";

/**
 * Legacy OpenAI text completions — POST /v1/completions.
 *
 * Previously a 400 stub. Older SDKs/tools (and some eval harnesses) still speak
 * the pre-chat text-completions API, so we translate the prompt into chat
 * messages and reuse the same provider fallback pipeline as
 * /v1/chat/completions (breaker, key rotation, quota, logging — via tryProviders).
 *
 * Non-streaming only: legacy completions streaming requires a per-provider SSE
 * translator; requests with stream=true get a clear 400 instead of silently
 * wrong output. A `prompt` array is joined into a single completion (noted in
 * the response via `_fanout_note`).
 */

const completionsSchema = z.object({
  model: z.string().min(1),
  prompt: z.union([z.string(), z.array(z.string())]),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional(),
  user: z.string().optional(),
}).passthrough();

export const completionsRoute = new Hono();

/** Extract the generated text from an upstream chat-completion payload. */
function extractText(data: unknown): string {
  const d = data as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> };
  const msg = d?.choices?.[0];
  const content = msg?.message?.content ?? msg?.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof (p as { text?: unknown })?.text === "string" ? (p as { text: string }).text : "")).join("");
  }
  return "";
}

completionsRoute.post(
  "/",
  zValidator("json", completionsSchema),
  async (c) => {
    const body = c.req.valid("json");
    if (body.stream) {
      return c.json({ error: { message: "Streaming is not supported on /v1/completions — use POST /v1/chat/completions with stream=true", type: "invalid_request_error" } }, 400);
    }

    const vk = getRequestVk(c);
    const model = body.model || "free-llm-gateway/auto";
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
    } else {
      providerOrder = getProvidersForRequest(model, "tiered");
    }

    // Legacy prompt (string | string[]) → one chat request. A prompt array means
    // N independent completions in the legacy API; we join into a single prompt
    // and flag it in the response rather than fanning out N upstream calls.
    const prompts = Array.isArray(body.prompt) ? body.prompt : [body.prompt];
    const joinedPrompt = prompts.join("\n\n");
    const startAll = Date.now();
    const estimated = estimateChatTokens({ messages: [{ role: "user", content: joinedPrompt }], max_tokens: body.max_tokens });

    const result = await tryProviders({
      providerOrder,
      quotaTokens: estimated.total,
      quotaModel: model,
      vkId: vk?.id,
      timeoutMs: config.providerTimeoutMs,
      call: ({ provider, key }) =>
        provider.chat(
          {
            model,
            messages: [{ role: "user", content: joinedPrompt }],
            temperature: body.temperature,
            max_tokens: body.max_tokens,
            stream: false,
            top_p: body.top_p,
            stop: body.stop,
            user: body.user,
          },
          key
        ),
    });

    const latency = Date.now() - startAll;

    if (!result.ok) {
      const errors = result.errors;
      logger.warn({ model, providerOrder, errors: errors.slice(0, 5), latency }, "all providers failed for legacy completions");
      addLog({
        id: `req-${Date.now()}`,
        timestamp: new Date().toISOString(),
        virtualKeyId: vk?.id,
        virtualKeyName: vk?.name,
        provider: errors[0]?.provider || "none",
        model,
        promptTokens: estimated.prompt,
        totalTokens: estimated.total,
        latencyMs: latency,
        status: 502,
        error: JSON.stringify(errors).slice(0, 2000),
      });
      const topErrors = errors.slice(0, 3).map((e) => `${e.provider}: ${String(e.error || "").slice(0, 180)}`).join(" | ");
      const isMissingKey = errors.length > 0 && errors.every((e) => /no key configured|missing key/i.test(e.error || ""));
      return c.json(
        { error: { message: `All providers failed (${errors.length} tried). ${topErrors}`, type: isMissingKey ? "missing_key" : "provider_error", provider_errors: errors } },
        isMissingKey ? 400 : 502
      );
    }

    const { providerId: pid, key, res } = result;
    let data: unknown = null;
    try {
      data = JSON.parse(await res.text());
    } catch {
      // non-JSON upstream body → extractText falls back to empty → 502 below
    }
    const text = extractText(data);
    if (!text) {
      return c.json({ error: { message: "Upstream returned no completion text", type: "provider_error" } }, 502);
    }

    const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null)?.usage;
    const total = usage?.total_tokens ?? estimated.total;
    if (usage?.total_tokens) recordUsage(pid, key, total);
    const per1M = FREELLMS_COST[pid] ?? 0.05;
    const cost = Number(((total / 1_000_000) * per1M).toFixed(6));

    logGenAI("chat", { provider: pid, model, promptTokens: estimated.prompt, latencyMs: latency });
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
      cost,
    });

    return c.json({
      id: `cmpl-${Date.now()}`,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          text,
          logprobs: null,
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage?.prompt_tokens ?? estimated.prompt,
        completion_tokens: usage?.completion_tokens ?? 0,
        total_tokens: total,
      },
      _provider: pid,
      ...(prompts.length > 1 ? { _fanout_note: "Multiple prompts were joined into a single completion; use /v1/chat/completions for per-prompt fan-out." } : {}),
    });
  }
);
