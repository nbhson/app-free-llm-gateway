import { config } from "../config.js";
import { FREELLMS_COST, getProviderSuccessRate } from "./cost-router.js";
import { getQuotaHeadroom } from "./quota-tracker.js";
import { getAllStates } from "./circuit-breaker.js";

/**
 * Adaptive routing EWMA — augments cost-router with live EMA latency.
 * Latency EMA is maintained in-memory (no file I/O) and updated on each success.
 * Score = cost*W + emaLatency*W - headroom*W - success*W (+ breaker penalty)
 */

const emaLatency = new Map<string, number>(); // provider -> EMA ms
const lastUpdate = new Map<string, number>();

export function updateLatencyEMA(provider: string, latencyMs: number): void {
  const alpha = config.adaptiveEmaAlpha ?? 0.3;
  const prev = emaLatency.get(provider);
  if (prev === undefined) emaLatency.set(provider, latencyMs);
  else emaLatency.set(provider, alpha * latencyMs + (1 - alpha) * prev);
  lastUpdate.set(provider, Date.now());
}

export function getEmaLatency(provider: string): number | null {
  return emaLatency.get(provider) ?? null;
}

export function getAdaptiveScores(providerIds: string[], _model?: string): Array<{ provider: string; cost: number; emaLatency: number; quotaHeadroom: number; successRate: number; breakerPenalty: number; score: number }> {
  const breakers = getAllStates() as Record<string, { state?: string }>;
  return providerIds.map((provider) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const ema = emaLatency.get(provider) ?? 100; // cold start 100ms
    const quotaHeadroom = getQuotaHeadroom(provider, "");
    const successRate = getProviderSuccessRate(provider);
    const breakerPenalty = breakers[provider]?.state === "open" ? 10 : breakers[provider]?.state === "half-open" ? 2 : 0;
    const score = cost * config.costWeight + ema * config.latencyWeight - quotaHeadroom * config.headroomWeight - successRate * config.successWeight + breakerPenalty;
    return { provider, cost, emaLatency: ema, quotaHeadroom, successRate, breakerPenalty, score };
  }).sort((a,b)=> a.score - b.score);
}

export async function adaptiveRank(providerIds: string[], _model?: string): Promise<string[]> {
  if (!config.adaptiveRoutingEnabled) return providerIds;
  return getAdaptiveScores(providerIds).map(s=> s.provider);
}

export function getAdaptiveState(): Record<string, { emaLatency: number; lastUpdate: number | null }> {
  const out: Record<string, { emaLatency: number; lastUpdate: number | null }> = {};
  for (const [k,v] of emaLatency) out[k] = { emaLatency: v, lastUpdate: lastUpdate.get(k) ?? null };
  return out;
}

export function resetAdaptive(): void { emaLatency.clear(); lastUpdate.clear(); }
