import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getRequestVk } from "../../lib/types.js";
import { getProvidersForRequest } from "../../lib/router.js";
import { config } from "../../config.js";
import { providers, getProvider, resolveProviderId } from "../../providers/registry.js";
import { estimateMessagesTokens } from "../../lib/token-estimator.js";
import { metrics } from "../../lib/metrics.js";

export const compareRoute = new Hono();

const compareSchema = z.object({
  models: z.array(z.string().min(1)).min(2).max(5),
  messages: z.array(z.object({ role: z.string(), content: z.union([z.string(), z.array(z.union([z.string(), z.record(z.unknown())]))]), tool_calls: z.array(z.unknown()).optional() }).passthrough()).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(32000).optional(),
  stream: z.boolean().optional().default(false),
});

/**
 * POST /v1/chat/compare — fan-out to 2-5 models in parallel (isolated, no cross-fallback)
 * Best-practice:
 *  - per-model latency measured server-side with high-resolution t0 (not shared clientMs)
 *  - usage parsing supports prompt_tokens/completion_tokens/total_tokens
 *  - no cross-fallback by design (isolated); provider resolution uses first capable provider only
 *  - errors classified (no_key / unknown_provider / upstream HTTP) with accurate timing
 * Returns: { results: [{model, provider, latencyMs, content, usage, ok, error}] }
 */
compareRoute.post("/compare", zValidator("json", compareSchema), async (c) => {
  const body = c.req.valid("json");
  const vk = getRequestVk(c);
  const start = Date.now();

  // For each model, resolve provider order (respect fallback + adaptive if enabled)
  const modelProviders: Array<{ model: string; providerId: string }> = [];
  for (const m of body.models) {
    const order = getProvidersForRequest(m);
    const pid = order[0] || "pollinations";
    modelProviders.push({ model: m, providerId: pid });
  }

  const quotaTokens = estimateMessagesTokens(body.messages as Array<{ role: string; content: unknown }>);

  const calls: Array<{ model: string; providerId: string }> = modelProviders;

  // Isolated fan-out: each model measured independently, no shared t0
  const settled = await Promise.all(calls.map(async ({ model, providerId: rawId }) => {
    const t0 = Date.now();
    const providerId = resolveProviderId(rawId);
    const provider = getProvider(providerId) || providers[providerId];
    if (!provider) {
      return { model, providerId, ok: false as const, error: `unknown provider: ${providerId}`, latencyMs: Date.now() - t0, content: "", usage: null as unknown };
    }
    const key = (config.providerKeys[providerId] || [])[0] || "";
    const isPublic = ["pollinations", "llm7-io", "ollama-cloud"].includes(providerId);
    if (!key && !isPublic) {
      return { model, providerId, ok: false as const, error: `no key for provider ${providerId} — add key in Providers`, latencyMs: Date.now() - t0, content: "", usage: null as unknown };
    }
    try {
      const req = {
        model: model.includes("/") ? model.split("/").slice(1).join("/") : model,
        messages: body.messages as unknown as Array<{ role: "user" | "system" | "assistant" | "tool"; content: unknown }>,
        stream: false as const,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
      } as unknown as Parameters<typeof provider.chat>[0];
      const res = (await provider.chat(req, key)) as Response;
      const latencyMs = Date.now() - t0;
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        try { metrics.llmLatency(providerId, model, latencyMs); } catch { /* ignore */ }
        return { model, providerId, ok: false as const, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, latencyMs, content: "", usage: null as unknown };
      }
      const data = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string | unknown } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
      };
      const rawContent = data.choices?.[0]?.message?.content ?? "";
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const usage = data.usage && typeof data.usage === "object" ? data.usage : null;
      try { metrics.llmLatency(providerId, model, latencyMs); } catch { /* ignore */ }
      return { model, providerId, ok: true as const, content, latencyMs, usage };
    } catch (e) {
      const latencyMs = Date.now() - t0;
      try { metrics.llmLatency(providerId, model, latencyMs); } catch { /* ignore */ }
      return { model, providerId, ok: false as const, error: (e as Error).message?.slice(0, 500) || "unknown error", latencyMs, content: "", usage: null as unknown };
    }
  }));

  return c.json({
    object: "compare.results",
    created: Math.floor(start / 1000),
    models: body.models,
    results: settled.map((r) => ({
      model: (r as { model: string }).model,
      provider: (r as { providerId: string }).providerId,
      ok: (r as { ok: boolean }).ok,
      content: (r as { content?: string }).content || "",
      error: (r as { error?: string }).error || null,
      // server-authoritative per-model latency (high-res, not client total)
      latencyMs: (r as { latencyMs: number }).latencyMs,
      usage: (r as { usage?: unknown }).usage || null,
    })),
    totalLatencyMs: Date.now() - start,
    quotaTokens,
    vk: vk?.id || null,
  });
});
