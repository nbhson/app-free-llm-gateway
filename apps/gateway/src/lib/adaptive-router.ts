import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { FREELLMS_COST, getProviderSuccessRate } from "./cost-router.js";
import { getQuotaHeadroom } from "./quota-tracker.js";
import { getAllStates } from "./circuit-breaker.js";
import { resolveDataPath } from "./paths.js";

/**
 * Adaptive routing EWMA — augments cost-router with live EMA latency.
 * Latency EMA is maintained in-memory (no file I/O) and updated on each success.
 * Score = cost*W + emaLatency*W - headroom*W - success*W (+ breaker penalty)
 */

const emaLatency = new Map<string, number>(); // provider -> EMA ms
const lastUpdate = new Map<string, number>();

const ADAPTIVE_STORE_PATH = resolveDataPath("adaptive-state.json");
const isAdaptiveTestEnv = process.env.NODE_ENV === "test" || !!process.env.VITEST;

function loadAdaptivePersisted(): void {
  if (isAdaptiveTestEnv) return;
  try {
    if (!fs.existsSync(ADAPTIVE_STORE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(ADAPTIVE_STORE_PATH, "utf-8")) as Record<string, { emaLatency?: number; lastUpdate?: number }>;
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v.emaLatency === "number") emaLatency.set(k, v.emaLatency);
      if (typeof v.lastUpdate === "number") lastUpdate.set(k, v.lastUpdate);
    }
    if (Object.keys(raw).length > 0) console.warn(`[adaptive] restored ${emaLatency.size} EMA entries from disk`);
  } catch { /* ignore */ }
}

function persistAdaptiveSync(): void {
  if (isAdaptiveTestEnv) return;
  try {
    const out: Record<string, { emaLatency: number; lastUpdate: number | null }> = {};
    for (const [k, v] of emaLatency.entries()) out[k] = { emaLatency: v, lastUpdate: lastUpdate.get(k) ?? null };
    fs.mkdirSync(path.dirname(ADAPTIVE_STORE_PATH), { recursive: true });
    const tmp = `${ADAPTIVE_STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, ADAPTIVE_STORE_PATH);
  } catch { /* ignore */ }
}

let adaptivePersistTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAdaptivePersist(): void {
  if (isAdaptiveTestEnv) return;
  if (adaptivePersistTimer) return;
  adaptivePersistTimer = setTimeout(() => {
    adaptivePersistTimer = null;
    persistAdaptiveSync();
  }, 800);
  adaptivePersistTimer.unref?.();
}

loadAdaptivePersisted();

if (!isAdaptiveTestEnv && typeof process !== "undefined" && typeof process.on === "function") {
  const flush = () => { try { persistAdaptiveSync(); } catch { /* ignore */ } };
  try { process.on("exit", flush); } catch { /* ignore */ }
  for (const sig of ["SIGTERM", "SIGINT", "SIGUSR2", "SIGHUP"] as const) {
    try { process.on(sig as NodeJS.Signals, () => { flush(); }); } catch { /* ignore */ }
  }
  try { process.on("beforeExit", flush); } catch { /* ignore */ }
}

export function updateLatencyEMA(provider: string, latencyMs: number): void {
  const alpha = config.adaptiveEmaAlpha ?? 0.3;
  const prev = emaLatency.get(provider);
  if (prev === undefined) emaLatency.set(provider, latencyMs);
  else emaLatency.set(provider, alpha * latencyMs + (1 - alpha) * prev);
  lastUpdate.set(provider, Date.now());
  scheduleAdaptivePersist();
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

export function resetAdaptive(): void {
  emaLatency.clear();
  lastUpdate.clear();
  if (!isAdaptiveTestEnv) { try { fs.unlinkSync(ADAPTIVE_STORE_PATH); } catch { /* ignore */ } }
}
