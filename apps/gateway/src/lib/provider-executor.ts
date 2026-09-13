import type { Provider } from "../providers/base.js";
import { providers } from "../providers/registry.js";
import { getNextKeyManaged, markRateLimited, markSuccess } from "./key-manager.js";
import { checkQuotaAsync, recordUsage } from "./quota-tracker.js";
import { isOpen, recordSuccess, recordFailureIfRetryable } from "./circuit-breaker.js";
import { logger } from "../middleware/logger.js";
import { isPublicProvider } from "./provider-keys.js";
import { errMessage, type ProviderError } from "./types.js";
import { config } from "../config.js";
import { updateLatencyEMA } from "./adaptive-router.js";
import { metrics } from "./metrics.js";
import { getEffectiveKeys } from "./byok-store.js";

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

function jitterDelay(baseMs: number, jitterMs: number): Promise<void> {
  if (!jitterMs || jitterMs <= 0) return Promise.resolve();
  const d = Math.floor(Math.random() * jitterMs);
  return new Promise((r) => setTimeout(r, d));
}

async function tryProvidersParallel(opts: TryProvidersOpts, batchSize: number): Promise<TryProvidersResult> {
  const errors: ProviderError[] = [];
  for (let i = 0; i < opts.providerOrder.length; i += batchSize) {
    const batch = opts.providerOrder.slice(i, i + batchSize);
    const attempts = batch.map(async (pid): Promise<{ providerId: string; key: string; res: Response }> => {
      if (opts.jitterMs) await jitterDelay(0, opts.jitterMs);
      const provider = providers[pid];
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
          recordFailureIfRetryable(pid, res.status);
          throw { provider: pid, status: res.status, error: text.slice(0, 600), retryAfterMs } as ProviderError;
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
  if (opts.parallel && opts.parallel > 1 && opts.providerOrder.length > 1) {
    return tryProvidersParallel(opts, Math.min(opts.parallel, 5));
  }
  const errors: ProviderError[] = [];
  for (const pid of opts.providerOrder) {
    if (opts.jitterMs) await jitterDelay(0, opts.jitterMs);
    const provider = providers[pid];
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
        // 4xx (except 429) is a client/request error — not provider fault, don't trip breaker
        recordFailureIfRetryable(pid, res.status);
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
  const tasks = opts.providerOrder.map(async (pid) => {
    const t0 = Date.now();
    try {
      if (isOpen(pid)) return { ok: false as const, providerId: pid, error: "circuit open", latencyMs: Date.now()-t0 };
      let key: string | null = null;
      if (opts.vkId) {
        const eff = getEffectiveKeys(pid, opts.vkId, config.providerKeys[pid] || []);
        key = eff.length>0 ? eff[0] : getNextKeyManaged(pid);
      } else key = getNextKeyManaged(pid);
      if (key===null) return { ok:false as const, providerId: pid, error: "no key", latencyMs: Date.now()-t0 };
      const provider = providers[pid];
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
