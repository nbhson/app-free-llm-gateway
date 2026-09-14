import type { Provider } from "../providers/base.js";
import { providers, getProvider, resolveProviderId } from "../providers/registry.js";
import { getNextKeyManaged, markRateLimited, markSuccess } from "./key-manager.js";
import { checkQuotaAsync, recordUsage } from "./quota-tracker.js";
import { isOpen, recordSuccess, recordFailure, recordFailureIfRetryable } from "./circuit-breaker.js";
import { logger } from "../middleware/logger.js";
import { isPublicProvider } from "./provider-keys.js";
import { errMessage, type ProviderError } from "./types.js";
import { config } from "../config.js";
import { updateLatencyEMA } from "./adaptive-router.js";
import { metrics } from "./metrics.js";
import { getEffectiveKeys } from "./byok-store.js";

/**
 * Budget/quota error is retryable even when HTTP is 200 with SSE body containing the error.
 * Pollinations returns 403 "reached its budget" but some gateways wrap it as 200 SSE data: {error}
 */
const BUDGET_ERROR_RE = /reached its budget|budget.*exceeded|quota.*exceeded|insufficient.*quota/i;

async function detectBudgetErrorInResponse(res: Response): Promise<string | null> {
  // Only peek for responses that look like they might be budget errors; avoid
  // consuming successful streams. Use clone + short reader timeout (400ms).
  try {
    const clone = res.clone();
    const reader = clone.body?.getReader();
    if (!reader) {
      const text = await clone.text().catch(() => "");
      if (BUDGET_ERROR_RE.test(text)) return text.slice(0, 600);
      return null;
    }
    const decoder = new TextDecoder();
    let acc = "";
    const timeoutMs = 500;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => resolve(), timeoutMs);
      timer.unref?.();
    });
    const readPromise = (async () => {
      try {
        const { value, done } = await reader.read();
        if (value) acc += decoder.decode(value, { stream: true });
        // try one more chunk if first is very small and not yet conclusive
        if (!BUDGET_ERROR_RE.test(acc) && acc.length < 400 && !done) {
          const r2 = await Promise.race([
            reader.read(),
            new Promise<{ value: undefined; done: true }>((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), 200)),
          ]) as { value?: Uint8Array; done?: boolean };
          if ((r2 as { value?: Uint8Array }).value) acc += decoder.decode((r2 as { value: Uint8Array }).value!, { stream: true });
        }
      } catch { /* ignore */ }
      try { reader.cancel().catch(() => {}); } catch { /* ignore */ }
    })();
    await Promise.race([readPromise, timeout]);
    if (timer) clearTimeout(timer);
    try { reader.cancel().catch(() => {}); } catch { /* ignore */ }
    if (BUDGET_ERROR_RE.test(acc)) return acc.slice(0, 600);
    return null;
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

async function tryProvidersParallel(opts: TryProvidersOpts, batchSize: number): Promise<TryProvidersResult> {
  const normalizedOrder = normalizeProviderOrder(opts.providerOrder);
  const errors: ProviderError[] = [];
  for (let i = 0; i < normalizedOrder.length; i += batchSize) {
    const batch = normalizedOrder.slice(i, i + batchSize);
    const attempts = batch.map(async (pid): Promise<{ providerId: string; key: string; res: Response }> => {
      if (opts.jitterMs) await jitterDelay(0, opts.jitterMs);
      const provider = getProvider(pid) || providers[pid];
      if (!provider) throw { provider: pid, error: "unknown provider" } as ProviderError;
      if (isOpen(pid)) throw { provider: pid, error: "circuit open (cooldown)" } as ProviderError;
      // BYOK override: if vkId provided, try BYOK keys first
      let key: string | null = null;
      if (opts.vkId) {
        const eff = getEffectiveKeys(pid, opts.vkId, config.providerKeys[pid] || []);
        if (eff.length > 0) key = eff[Math.floor(Math.random()*eff.length)];
        else key = getNextKeyManaged(pid);
      } else {
        key = getNextKeyManaged(pid);
      }
      if (key === null) throw { provider: pid, error: `no key configured (set ${pid.toUpperCase().replace(/-/g, "_")}_API_KEYS)` } as ProviderError;
      if (!key && !isPublicProvider(pid)) throw { provider: pid, error: "missing key" } as ProviderError;
      if (opts.quotaTokens !== undefined) {
        const quota = await checkQuotaAsync(pid, key, opts.quotaTokens!, opts.quotaModel);
        if (!quota.allowed) {
          if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
          throw { provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs } as ProviderError;
        }
      }
      if (opts.shouldSkip) {
        const reason = opts.shouldSkip(pid);
        if (reason) throw { provider: pid, error: reason } as ProviderError;
      }
      const timeoutMs = opts.timeoutMs ?? config.providerTimeoutMs;
      let timer: NodeJS.Timeout | undefined;
      const t0 = Date.now();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`provider timeout after ${timeoutMs}ms — thử model khác hoặc tắt Web Tools (Globe) nếu bật`)), timeoutMs);
        timer.unref?.();
      });
      try {
        const res = await Promise.race([opts.call({ providerId: pid, provider, key }), timeout]);
        const latency = Date.now() - t0;
        metrics.llmLatency(pid, opts.quotaModel || "auto", latency);
        if (config.adaptiveRoutingEnabled) updateLatencyEMA(pid, latency);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let retryAfterMs: number | undefined;
          if (res.status === 429) {
            const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
            retryAfterMs = Number.isNaN(retry) ? 60000 : retry;
            markRateLimited(pid, key, retryAfterMs);
          }
          // 402/403 budget exhausted is also retryable for fallback
          if (res.status === 402 || res.status === 403) {
            const isBudget = BUDGET_ERROR_RE.test(text);
            if (isBudget) recordFailure(pid);
            else recordFailureIfRetryable(pid, res.status);
          } else {
            recordFailureIfRetryable(pid, res.status);
          }
          throw { provider: pid, status: res.status, error: text.slice(0, 600), retryAfterMs } as ProviderError;
        }
        // Stream success but body contains budget error (Pollinations returns 200 SSE with error)
        const budgetText = await detectBudgetErrorInResponse(res);
        if (budgetText) {
          recordFailure(pid);
          throw { provider: pid, status: 402, error: budgetText } as ProviderError;
        }
        recordSuccess(pid);
        markSuccess(pid, key);
        if (opts.quotaTokens !== undefined) recordUsage(pid, key, opts.quotaTokens!, opts.quotaModel);
        return { providerId: pid, key, res };
      } finally { if (timer) clearTimeout(timer); }
    });
    try {
      const winner = await Promise.any(attempts);
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
    return tryProvidersParallel({ ...opts, providerOrder: normalizedOrder }, Math.min(opts.parallel, 5));
  }
  const errors: ProviderError[] = [];
  for (const pid of normalizedOrder) {
    if (opts.jitterMs) await jitterDelay(0, opts.jitterMs);
    const provider = getProvider(pid) || providers[pid];
    if (!provider) continue;

    if (isOpen(pid)) {
      errors.push({ provider: pid, error: "circuit open (cooldown)" });
      continue;
    }

    let key: string | null = null;
    if (opts.vkId) {
      const eff = getEffectiveKeys(pid, opts.vkId, config.providerKeys[pid] || []);
      if (eff.length > 0) key = eff[Math.floor(Math.random()*eff.length)];
      else key = getNextKeyManaged(pid);
    } else {
      key = getNextKeyManaged(pid);
    }
    if (key === null) {
      errors.push({ provider: pid, error: `no key configured (set ${pid.toUpperCase().replace(/-/g, "_")}_API_KEYS)` });
      continue;
    }
    if (!key && !isPublicProvider(pid)) {
      errors.push({ provider: pid, error: "missing key" });
      continue;
    }

    if (opts.quotaTokens !== undefined) {
      const quota = await checkQuotaAsync(pid, key, opts.quotaTokens, opts.quotaModel);
      if (!quota.allowed) {
        errors.push({ provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs });
        if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
        continue;
      }
    }

    if (opts.shouldSkip) {
      const reason = opts.shouldSkip(pid);
      if (reason) {
        errors.push({ provider: pid, error: reason });
        continue;
      }
    }

    try {
      // Per-provider fetch timeout — fail fast so next fallback is tried quickly.
      // For streaming, this only times out the initial fetch (headers), not the SSE body.
      // Use opts.timeoutMs if provided (auto uses shorter timeout), else config.providerTimeoutMs (default 25s)
      const callWithTimeout = async () => {
        const timeoutMs = opts.timeoutMs ?? config.providerTimeoutMs;
        let timer: NodeJS.Timeout | undefined;
        const t0 = Date.now();
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`provider timeout after ${timeoutMs}ms — thử model khác hoặc tắt Web Tools (Globe) nếu bật`)), timeoutMs);
          timer.unref?.();
        });
        try {
          const res = await Promise.race([opts.call({ providerId: pid, provider, key }), timeout]);
          const latency = Date.now() - t0;
          metrics.llmLatency(pid, opts.quotaModel || "auto", latency);
          if (config.adaptiveRoutingEnabled) updateLatencyEMA(pid, latency);
          return res;
        } finally { if (timer) clearTimeout(timer); }
      };
      const res = await callWithTimeout();
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // 429 carries Retry-After so callers can back off precisely
        let retryAfterMs: number | undefined;
        if (res.status === 429) {
          const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
          retryAfterMs = Number.isNaN(retry) ? 60000 : retry;
          markRateLimited(pid, key, retryAfterMs);
        }
        errors.push({ provider: pid, status: res.status, error: text.slice(0, 600), retryAfterMs });
        if (res.status === 402 || res.status === 403) {
          const isBudget = BUDGET_ERROR_RE.test(text);
          if (isBudget) recordFailure(pid);
          else recordFailureIfRetryable(pid, res.status);
        } else {
          recordFailureIfRetryable(pid, res.status);
        }
        continue;
      }
      // Check streaming success that actually contains budget error in SSE body (Pollinations 200 with error)
      const budgetTextSeq = await detectBudgetErrorInResponse(res);
      if (budgetTextSeq) {
        errors.push({ provider: pid, status: 402, error: budgetTextSeq });
        recordFailure(pid);
        continue;
      }
      recordSuccess(pid);
      markSuccess(pid, key);
      if (opts.quotaTokens !== undefined) recordUsage(pid, key, opts.quotaTokens, opts.quotaModel);
      return { ok: true, providerId: pid, key, res };
    } catch (e) {
      const msg = errMessage(e);
      logger.warn({ provider: pid, err: msg }, "provider failed, trying next");
      errors.push({ provider: pid, error: msg });
      recordFailureIfRetryable(pid);
      continue;
    }
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
      let timer: NodeJS.Timeout|undefined;
      const timeout = new Promise<never>((_,rej)=>{ timer=setTimeout(()=>rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs); timer.unref?.(); });
      const res = await Promise.race([opts.call({ providerId: pid, provider, key }), timeout]).finally(()=>{ if(timer) clearTimeout(timer); });
      if (!res.ok) { const t=await res.text().catch(()=> ""); return { ok:false as const, providerId: pid, error: `HTTP ${res.status}: ${t.slice(0,200)}`, latencyMs: Date.now()-t0 }; }
      return { ok:true as const, providerId: pid, res, latencyMs: Date.now()-t0 };
    } catch (e) { return { ok:false as const, providerId: pid, error: errMessage(e), latencyMs: Date.now()-t0 }; }
  });
  const settled = await Promise.all(tasks);
  // record metrics
  for (const r of settled) if (r.ok) { updateLatencyEMA(r.providerId, r.latencyMs||0); metrics.llmLatency(r.providerId, opts.quotaModel||"compare", r.latencyMs||0); }
  return settled;
}
