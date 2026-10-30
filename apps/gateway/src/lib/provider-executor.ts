import type { Provider } from "../providers/base.js";
import { providers, getProvider, resolveProviderId } from "../providers/registry.js";
import { getNextKeyManaged, markRateLimited, markSuccess } from "./key-manager.js";
import { checkQuotaAsync, recordUsage } from "./quota-tracker.js";
import { isOpen, recordSuccess, recordFailure, recordFailureIfRetryable } from "./circuit-breaker.js";
import { logger } from "../middleware/logger.js";
import { isPublicProvider } from "./provider-keys.js";
import { isPlaceholderKey } from "./provider-keys.js";
import { errMessage, type ProviderError } from "./types.js";
import { config } from "../config.js";
import { updateLatencyEMA } from "./adaptive-router.js";
import { metrics } from "./metrics.js";
import { getEffectiveKeys } from "./byok-store.js";
import {
  isModelShapedFailure,
  partitionByPairHealth,
  recordModelFailure,
  recordPairSuccess,
} from "./pair-health.js";

/**
 * Budget/quota error is retryable even when HTTP is 200 with SSE body containing the error.
 * Pollinations returns 403 "reached its budget" but some gateways wrap it as 200 SSE data: {error}
 */
const BUDGET_ERROR_RE = /reached its budget|budget.*exceeded|quota.*exceeded|insufficient.*quota/i;

/**
 * SSE data line whose JSON object STARTS with an "error" key. Upstream APIs
 * emit errors as `data: {"error": {...}}` while normal chat chunks start with
 * `{"id"` / `{"choices"` / `{"candidates"` — matching the opening key of the
 * JSON object avoids false positives on assistant content that merely
 * mentions the word "error".
 */
const SSE_DATA_ERROR_RE = /(^|\n)\s*data:\s*\{"error"\s*:\s*(?!null)/;

export interface ProviderAttempt {
  providerId: string;
  provider: Provider;
  key: string;
  /** Abort signal for the underlying fetch — aborted on executor timeout and
   * when a parallel sibling already won (loser cleanup). Providers combine it
   * with their own internal timeout via AbortSignal.any. */
  signal?: AbortSignal;
}

/**
 * Classify a peeked body prefix as an error hidden behind HTTP 200.
 * - JSON object with a top-level `error` key (legit chat completions never
 *   have one — they carry `choices`/`data`).
 * - SSE data line whose JSON starts with `"error":` (upstream error events).
 * Budget-shaped errors get status 402 (quota semantics), everything else 502.
 */
function classifyPeekedBody(text: string, isSse: boolean): { status: number; text: string } | null {
  if (!text) return null;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      if (parsed && typeof parsed === "object" && parsed.error) {
        const errText = JSON.stringify(parsed.error).slice(0, 600);
        return { status: BUDGET_ERROR_RE.test(errText) ? 402 : 502, text: errText };
      }
      return null;
    } catch {
      // partial/truncated JSON — fall through to SSE shape check
    }
  }
  if (isSse && SSE_DATA_ERROR_RE.test(text)) {
    return { status: BUDGET_ERROR_RE.test(text) ? 402 : 502, text: text.slice(0, 600) };
  }
  return null;
}

/**
 * Peek the first chunk(s) of a 200 response for an upstream error object.
 * Runs for ALL providers (config.providerSsePeekMs window, 0 = off): free
 * providers frequently answer HTTP 200 then stream `data: {"error": ...}` or
 * an error JSON as the first body bytes — without the peek the client gets a
 * broken short stream and the executor never falls back.
 * Reads via tee'd clone (original body untouched), cancels the clone branch,
 * bounded by the peek window so slow-start streams are unaffected.
 */
async function peekBodyError(res: Response): Promise<{ status: number; text: string } | null> {
  const peekMs = config.providerSsePeekMs;
  if (!peekMs) return null;
  const ct = res.headers.get("content-type") || "";
  const isSse = ct.includes("text/event-stream");
  const isJson = ct.includes("application/json");
  if (!isSse && !isJson) return null;
  try {
    const clone = res.clone();
    const reader = clone.body?.getReader();
    if (!reader) {
      if (isSse) return null;
      const text = await clone.text().catch(() => "");
      return classifyPeekedBody(text, isSse);
    }
    const decoder = new TextDecoder();
    let acc = "";
    const deadline = Date.now() + peekMs;
    while (Date.now() < deadline && acc.length < 4096) {
      const remaining = deadline - Date.now();
      const r = (await Promise.race([
        reader.read(),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), Math.max(1, remaining))),
      ])) as { value?: Uint8Array; done?: boolean } | "timeout";
      if (r === "timeout") break;
      if (r.value) acc += decoder.decode(r.value, { stream: true });
      if (r.done) break;
      // conclusive already? (error object at the head of a chunk)
      if (classifyPeekedBody(acc, isSse)) break;
    }
    try { reader.cancel().catch(() => {}); } catch { /* ignore */ }
    return classifyPeekedBody(acc, isSse);
  } catch {
    return null;
  }
}

/**
 * Shared provider fallback executor — single implementation of the
 * breaker → key → quota → skip → call → bookkeeping loop previously
 * duplicated across chat/anthropic/responses/embeddings/images/audio.
 *
 * Behavior preserved per route via options:
 * - quotaTokens: estimated tokens for quota pre-check + usage commit.
 *   Omit to skip quota entirely (embeddings/images/audio legacy behavior).
 * - shouldSkip: per-provider veto (e.g. deprecated model) returning a reason.
 */

export interface ProviderAttempt {
  providerId: string;
  provider: Provider;
  key: string;
}

export interface TryProvidersOpts {
  providerOrder: string[];
  quotaTokens?: number;
  quotaModel?: string;
  vkId?: string;
  shouldSkip?: (providerId: string) => string | null;
  call: (attempt: ProviderAttempt) => Promise<Response>;
  timeoutMs?: number;
  parallel?: number;
  jitterMs?: number;
}

export type TryProvidersResult =
  | { ok: true; providerId: string; key: string; res: Response }
  | { ok: false; errors: ProviderError[] };

function normalizeProviderOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const cid = resolveProviderId(raw);
    if (!seen.has(cid)) { seen.add(cid); out.push(cid); }
  }
  return out;
}

function jitterDelay(baseMs: number, jitterMs: number): Promise<void> {
  if (!jitterMs || jitterMs <= 0) return Promise.resolve();
  const d = Math.floor(Math.random() * jitterMs);
  return new Promise((r) => setTimeout(r, d));
}

/**
 * Ordered provider list: pairs demoted by pair-health (stale model mapping
 * returning 400/404/422) move to the BACK — still reachable when every
 * healthy option failed, but no longer retried from the top each request.
 */
function orderedByPairHealth(normalized: string[], model?: string): string[] {
  if (!model) return normalized;
  const { healthy, demoted } = partitionByPairHealth(normalized.map((pid) => ({ pid, model })));
  if (demoted.length === 0) return normalized;
  return [...healthy, ...demoted].map((x) => x.pid);
}

function retryBackoff(): Promise<void> {
  const base = config.providerRetryBackoffMs;
  if (!base) return Promise.resolve();
  // full jitter in [0, base) — avoids synchronized retry storms
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * base)));
}

type AttemptOutcome =
  | { ok: true; res: Response; key: string }
  | { ok: false; error: ProviderError };

/**
 * Single provider attempt: breaker → key → quota → skip → call → bookkeeping,
 * shared by the sequential and parallel executors so retry/peek/health logic
 * lives in exactly one place.
 *
 * Transient failures (5xx, network errors — NOT our own timeout, NOT 429,
 * NOT 4xx) are retried in place up to config.providerRetries times with
 * jittered backoff before being reported, so one flaky upstream blip no
 * longer burns a fallback hop.
 *
 * onController lets the parallel orchestrator abort losers once a sibling
 * has won.
 */
async function attemptProvider(
  opts: TryProvidersOpts,
  pid: string,
  onController?: (pid: string, c: AbortController) => void,
): Promise<AttemptOutcome> {
  const model = opts.quotaModel;
  const provider = getProvider(pid) || providers[pid];
  if (!provider) return { ok: false, error: { provider: pid, error: "unknown provider" } };
  if (isOpen(pid)) return { ok: false, error: { provider: pid, error: "circuit open (cooldown)" } };
  // BYOK override: if vkId provided, try BYOK keys first
  let key: string | null = null;
  if (opts.vkId) {
    const eff = getEffectiveKeys(pid, opts.vkId, config.providerKeys[pid] || []);
    if (eff.length > 0) key = eff[Math.floor(Math.random()*eff.length)];
    else key = getNextKeyManaged(pid);
  } else {
    key = getNextKeyManaged(pid);
  }
  if (key === null) return { ok: false, error: { provider: pid, error: `no key configured (set ${pid.toUpperCase().replace(/-/g, "_")}_API_KEYS)` } };
  if (!key && !isPublicProvider(pid)) return { ok: false, error: { provider: pid, error: "missing key" } };
  // Don't burn upstream with placeholder keys (hf_xxx, ag_xxx...): fail fast locally
  // so pinned models surface "missing key" instead of cryptic upstream 401/fetch failed -> 502.
  // Skipped in test env so mocked providers (placeholder keys) keep working.
  const isTestEnv = process.env.NODE_ENV === "test" || !!process.env.VITEST;
  if (key && !isTestEnv && isPlaceholderKey(key) && !isPublicProvider(pid)) {
    return { ok: false, error: { provider: pid, error: `missing key (placeholder for ${pid}, set ${pid.toUpperCase().replace(/-/g, "_")}_API_KEYS with a real key)` } };
  }
  if (opts.quotaTokens !== undefined) {
    const quota = await checkQuotaAsync(pid, key, opts.quotaTokens!, model);
    if (!quota.allowed) {
      if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
      return { ok: false, error: { provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs } };
    }
  }
  if (opts.shouldSkip) {
    const reason = opts.shouldSkip(pid);
    if (reason) return { ok: false, error: { provider: pid, error: reason } };
  }

  const timeoutMs = opts.timeoutMs ?? config.providerTimeoutMs;
  const retries = config.providerRetries;
  let controller: AbortController | undefined;
  let timedOut = false;
  for (let attempt = 0; ; attempt++) {
    controller = new AbortController();
    onController?.(pid, controller);
    let timer: NodeJS.Timeout | undefined;
    const t0 = Date.now();
    try {
      // Per-provider fetch timeout — fail fast so next fallback is tried quickly.
      // For streaming, this only times out the initial fetch (headers), not the SSE body.
      // Aborting the controller also cancels the in-flight fetch (previously the
      // loser fetch kept running after the timeout race resolved).
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          try { controller?.abort(); } catch { /* ignore */ }
          reject(new Error(`provider timeout after ${timeoutMs}ms — thử model khác hoặc tắt Web Tools (Globe) nếu bật`));
        }, timeoutMs);
        timer.unref?.();
      });
      const res = await Promise.race([opts.call({ providerId: pid, provider, key, signal: controller.signal }), timeout]);
      const latency = Date.now() - t0;
      metrics.llmLatency(pid, model || "auto", latency);
      if (config.adaptiveRoutingEnabled) updateLatencyEMA(pid, latency);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // 429 carries Retry-After so callers can back off precisely
        let retryAfterMs: number | undefined;
        if (res.status === 429) {
          const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
          retryAfterMs = Number.isNaN(retry) ? 60000 : retry;
          markRateLimited(pid, key, retryAfterMs);
        }
        // Pair health: model-shaped 4xx means this provider's mapping for the
        // model is stale — remember it so the pair drops to the back of the order.
        if (model && isModelShapedFailure(res.status)) recordModelFailure(pid, model, text);
        // 402/403 budget exhausted is also retryable for fallback
        if (res.status === 402 || res.status === 403) {
          const isBudget = BUDGET_ERROR_RE.test(text);
          if (isBudget) recordFailure(pid);
          else recordFailureIfRetryable(pid, res.status);
        } else {
          recordFailureIfRetryable(pid, res.status);
        }
        // Transient 5xx: retry same provider before spending a fallback hop
        if (res.status >= 500 && attempt < retries) { await retryBackoff(); continue; }
        return { ok: false, error: { provider: pid, status: res.status, error: text.slice(0, 1000), retryAfterMs } };
      }
      // HTTP 200 but body starts with an upstream error object / SSE error
      // event — treat as failure so the executor falls back instead of
      // handing the client a broken stream.
      const peeked = await peekBodyError(res);
      if (peeked) {
        recordFailure(pid);
        // peeked errors are frequently transient (flaky gateways) — retry in place
        if (attempt < retries) { await retryBackoff(); continue; }
        return { ok: false, error: { provider: pid, status: peeked.status, error: peeked.text } };
      }
      recordSuccess(pid);
      markSuccess(pid, key);
      if (model) recordPairSuccess(pid, model);
      if (opts.quotaTokens !== undefined) recordUsage(pid, key, opts.quotaTokens!, model);
      return { ok: true, res, key };
    } catch (e) {
      if (timer) clearTimeout(timer);
      const msg = errMessage(e);
      if (timedOut) {
        // Our own timeout — do not retry (would double worst-case latency),
        // but count as failure (breaker treats network-ish errors as provider trouble).
        recordFailureIfRetryable(pid);
        return { ok: false, error: { provider: pid, error: msg } };
      }
      // Aborted by the orchestrator (loser after a sibling won) — do not
      // retry, do not count as provider failure.
      if (controller.signal.aborted) {
        return { ok: false, error: { provider: pid, error: "aborted" } };
      }
      const isTimeout = /timeout/i.test(msg);
      // Network errors (fetch failed, ECONNRESET...) are transient — retry in place
      if (!isTimeout && attempt < retries) { await retryBackoff(); continue; }
      if (!isTimeout) logger.warn({ provider: pid, err: msg }, "provider failed, trying next");
      recordFailureIfRetryable(pid);
      return { ok: false, error: { provider: pid, error: msg } };
    }
  }
}

async function tryProvidersParallel(opts: TryProvidersOpts, batchSize: number): Promise<TryProvidersResult> {
  const normalizedOrder = normalizeProviderOrder(opts.providerOrder);
  const ordered = orderedByPairHealth(normalizedOrder, opts.quotaModel);
  const errors: ProviderError[] = [];
  for (let i = 0; i < ordered.length; i += batchSize) {
    const batch = ordered.slice(i, i + batchSize);
    const controllers = new Map<string, AbortController>();
    const attempts = batch.map(async (pid): Promise<{ providerId: string; key: string; res: Response }> => {
      if (opts.jitterMs) await jitterDelay(0, opts.jitterMs);
      const out = await attemptProvider(opts, pid, (p, c) => controllers.set(p, c));
      if (!out.ok) throw out.error;
      return { providerId: pid, key: out.key, res: out.res };
    });
    try {
      const winner = await Promise.any(attempts);
      // Loser cleanup: abort in-flight sibling fetches (their controllers;
      // aborting a settled fetch is a no-op). Their attemptProvider sees
      // controller.signal.aborted and exits without counting a failure.
      for (const [pid, c] of controllers.entries()) {
        if (pid !== winner.providerId) { try { c.abort(); } catch { /* ignore */ } }
      }
      return { ok: true, providerId: winner.providerId, key: winner.key, res: winner.res };
    } catch {
      const settled = await Promise.allSettled(attempts);
      for (const r of settled) if (r.status === "rejected") errors.push(r.reason as ProviderError);
      logger.warn({ batch: batch.join(","), errors: errors.slice(-batch.length).map((e) => `${e.provider}:${String(e.error).slice(0, 80)}`) }, "parallel batch failed, trying next batch");
    }
  }
  return { ok: false, errors };
}

export async function tryProviders(opts: TryProvidersOpts): Promise<TryProvidersResult> {
  const normalizedOrder = normalizeProviderOrder(opts.providerOrder);
  if (opts.parallel && opts.parallel > 1 && normalizedOrder.length > 1) {
    return tryProvidersParallel({ ...opts, providerOrder: orderedByPairHealth(normalizedOrder, opts.quotaModel) }, Math.min(opts.parallel, 5));
  }
  const ordered = orderedByPairHealth(normalizedOrder, opts.quotaModel);
  const errors: ProviderError[] = [];
  for (const pid of ordered) {
    if (opts.jitterMs) await jitterDelay(0, opts.jitterMs);
    const out = await attemptProvider(opts, pid);
    if (out.ok) return { ok: true, providerId: pid, key: out.key, res: out.res };
    errors.push(out.error);
  }
  return { ok: false, errors };
}

/**
 * Fan-out compare — run providers/models in parallel without cross-fallback.
 * Each model is isolated; we return settled results for UI diff.
 */
export async function tryProvidersSettled(opts: TryProvidersOpts & { providerOrder: string[] }): Promise<Array<{ ok: boolean; providerId: string; res?: Response; error?: string; latencyMs?: number }>> {
  const normalizedOrder = normalizeProviderOrder(opts.providerOrder);
  const tasks = normalizedOrder.map(async (pid) => {
    const t0 = Date.now();
    try {
      if (isOpen(pid)) return { ok: false as const, providerId: pid, error: "circuit open", latencyMs: Date.now()-t0 };
      let key: string | null = null;
      if (opts.vkId) {
        const eff = getEffectiveKeys(pid, opts.vkId, config.providerKeys[pid] || []);
        key = eff.length>0 ? eff[0] : getNextKeyManaged(pid);
      } else key = getNextKeyManaged(pid);
      if (key===null) return { ok:false as const, providerId: pid, error: "no key", latencyMs: Date.now()-t0 };
      const provider = getProvider(pid) || providers[pid];
      if (!provider) return { ok:false as const, providerId: pid, error:"unknown provider", latencyMs: Date.now()-t0 };
      if (opts.quotaTokens !== undefined) {
        const q = await checkQuotaAsync(pid, key, opts.quotaTokens!, opts.quotaModel);
        if (!q.allowed) return { ok:false as const, providerId: pid, error: q.reason || "quota", latencyMs: Date.now()-t0 };
      }
      if (opts.shouldSkip) { const r=opts.shouldSkip(pid); if(r) return { ok:false as const, providerId: pid, error:r, latencyMs: Date.now()-t0 }; }
      const timeoutMs = opts.timeoutMs ?? config.providerTimeoutMs;
      const controller = new AbortController();
      let timer: NodeJS.Timeout|undefined;
      const timeout = new Promise<never>((_,rej)=>{ timer=setTimeout(()=>{ try{controller.abort();}catch{/* ignore */} rej(new Error(`timeout ${timeoutMs}ms`)); }, timeoutMs); timer.unref?.(); });
      const res = await Promise.race([opts.call({ providerId: pid, provider, key, signal: controller.signal }), timeout]).finally(()=>{ if(timer) clearTimeout(timer); });
      if (!res.ok) { const t=await res.text().catch(()=> ""); return { ok:false as const, providerId: pid, error: `HTTP ${res.status}: ${t.slice(0,200)}`, latencyMs: Date.now()-t0 }; }
      return { ok:true as const, providerId: pid, res, latencyMs: Date.now()-t0 };
    } catch (e) { return { ok:false as const, providerId: pid, error: errMessage(e), latencyMs: Date.now()-t0 }; }
  });
  const settled = await Promise.all(tasks);
  // record metrics
  for (const r of settled) if (r.ok) { updateLatencyEMA(r.providerId, r.latencyMs||0); metrics.llmLatency(r.providerId, opts.quotaModel||"compare", r.latencyMs||0); }
  return settled;
}
