import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { estimateTokens } from "./token-estimator.js";
import type { CompressibleMessage } from "./types.js";

// Reuse the compressible message shape without importing the whole pipeline.
type Msg = Pick<CompressibleMessage, "role" | "content"> & Record<string, unknown>;

function messageText(m: { content?: unknown }): string {
  return typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
}

function head(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export interface SummaryResult {
  text: string;
  /** llm = fresh provider call, cache = reused prefix summary, extractive = no-network fallback */
  via: "llm" | "cache" | "extractive";
}

/**
 * Deterministic no-network fallback: keep a truncated excerpt of every dropped
 * message. Preserves IDs/keywords verbatim (good for recall) at fixed cost.
 */
export function extractiveSummary(dropped: Msg[], perMsgChars = 300, maxTotalChars = 4000): string {
  const lines = dropped.map((m) => `[${m.role}]: ${head(messageText(m).trim(), perMsgChars)}`);
  return head(lines.join("\n"), maxTotalChars);
}

// Prefix cache: consecutive turns share the dropped prefix, so re-summarizing
// the same history every request is avoided. Keyed by content hash.
const summaryCache = new Map<string, string>();

function cacheKey(dropped: Msg[], maxTokens: number, model: string): string {
  const h = crypto.createHash("sha256");
  h.update(model);
  h.update(String(maxTokens));
  for (const m of dropped) {
    h.update(m.role);
    h.update("\n");
    h.update(messageText(m));
    h.update("\n---\n");
  }
  return h.digest("hex");
}

function setCache(key: string, value: string): void {
  summaryCache.set(key, value);
  const cap = config.summaryCacheSize || 200;
  while (summaryCache.size > cap) {
    const oldest = summaryCache.keys().next();
    if (oldest.done) break;
    summaryCache.delete(oldest.value);
  }
}

export function _clearSummaryCache(): void {
  summaryCache.clear();
}

export interface SummarizeOpts {
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
}

/**
 * Condense dropped (older) messages with a fast provider call.
 * Always resolves — on any failure (no provider, timeout, 5xx) falls back to
 * extractiveSummary so the main request path never fails because of this.
 */
export async function summarizeHistory(dropped: Msg[], opts: SummarizeOpts = {}): Promise<SummaryResult> {
  const maxTokens = opts.maxTokens ?? config.summaryMaxTokens;
  const model = opts.model ?? config.summaryModel;
  const timeoutMs = opts.timeoutMs ?? config.summaryTimeoutMs;
  if (dropped.length === 0) return { text: "", via: "extractive" };

  const key = cacheKey(dropped, maxTokens, model);
  const hit = summaryCache.get(key);
  if (hit !== undefined) return { text: hit, via: "cache" };

  try {
    // Lazy import to keep compression.ts light for unit tests (avoids pulling
    // the full provider stack unless an LLM summary is actually attempted).
    const { tryProviders } = await import("./provider-executor.js");
    const { getProvidersForRequest } = await import("./router.js");
    const providerOrder = getProvidersForRequest(model, "tiered");
    if (providerOrder.length === 0) throw new Error("no provider available for summarizer");
    const excerpt = dropped
      .map((m) => `[${m.role}]: ${messageText(m)}`)
      .join("\n---\n");
    // Cap excerpt so the summarizer call itself stays cheap/fast (fail-open covers the rest).
    const excerptCapped = excerpt.length > 30000 ? excerpt.slice(0, 30000) + "\n…[truncated]" : excerpt;
    const result = await tryProviders({
      providerOrder,
      quotaTokens: estimateTokens(excerptCapped) + maxTokens,
      quotaModel: model,
      timeoutMs,
      // sequential: one winner is enough, avoid burning 3x quota for background work
      call: ({ provider, key }) =>
        provider.chat(
          {
            model,
            messages: [
              {
                role: "system",
                content:
                  `You condense chat history. Summarize the excerpt below in at most ~${maxTokens} tokens. ` +
                  `Preserve verbatim: person/project names, IDs, tokens, numbers, decisions, constraints, ` +
                  `code identifiers, file paths, URLs. Plain prose, no preamble, no bullet fluff.`,
              },
              { role: "user", content: excerptCapped },
            ] as unknown as Parameters<typeof provider.chat>[0]["messages"],
            max_tokens: maxTokens,
            stream: false,
          },
          key
        ),
    });
    if (!result.ok) throw new Error(result.errors.map((e) => `${e.provider}:${String(e.error).slice(0, 80)}`).join(" | "));
    const data = (await result.res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const raw = data?.choices?.[0]?.message?.content;
    let text = "";
    if (typeof raw === "string") text = raw;
    else if (Array.isArray(raw)) {
      text = raw
        .map((p) => (p as { text?: string }).text || (p as { content?: string }).content || "")
        .join("");
    } else if (raw) text = String(raw);
    text = text.trim();
    if (!text) throw new Error("empty summary response");
    // Hard cap to the token budget (chars ~= tokens*4 heuristic matches estimator).
    const charCap = maxTokens * 4;
    if (text.length > charCap) text = text.slice(0, charCap) + "…";
    setCache(key, text);
    return { text, via: "llm" };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "summarizer failed, using extractive fallback");
    return { text: extractiveSummary(dropped), via: "extractive" };
  }
}
