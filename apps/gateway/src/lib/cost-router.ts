import fs from "node:fs";
import { resolveDataPath } from "./paths.js";
import { getQuotaHeadroom as getQuotaHeadroomFromTracker } from "./quota-tracker.js";
import { getStats } from "./request-log.js";
import { logger } from "../middleware/logger.js";
import { config } from "../config.js";

export interface ProviderScore {
  provider: string;
  cost: number;
  latency: number;
  quotaHeadroom: number;
  successRate: number;
  score: number;
}

// $ per 1M tokens (input blended). Free = 0
export const FREELLMS_COST: Record<string, number> = {
  groq: 0.05,
  "nvidia-nim": 0,
  nvidia: 0,
  cerebras: 0,
  "google-gemini": 0,
  gemini: 0,
  "cloudflare-workers-ai": 0,
  cohere: 0,
  sambanova: 0,
  siliconflow: 0,
  "llm7-io": 0,
  pollinations: 0,
  openrouter: 0.1,
  "kilo-code": 0,
  "chutes-ai": 0,
  chutes: 0,
  "ovhcloud-ai-endpoints": 0,
  "agnes-ai": 0,
  modelscope: 0,
  "z-ai-zhipu-ai": 0,
  "mistral-ai": 0,
  mistral: 0,
  together: 0.08,
  fireworks: 0.07,
  "aion-labs": 0,
  deepseek: 0.14,
  nscale: 0,
  nebius: 0,
  kiosapi: 0,
};

const STATS_PATH = resolveDataPath("provider-stats.json");

/** Latency entry in provider-stats.json: raw ms or EMA object. */
export type LatencyEntry = number | { emaLatencyMs?: number; latency?: number };

let latencyCache: { data: Record<string, LatencyEntry>; loadedAt: number } | null = null;
const LATENCY_CACHE_TTL_MS = 5000;
let latencyWatchInitialized = false;

function ensureLatencyWatcher(): void {
  if (latencyWatchInitialized) return;
  latencyWatchInitialized = true;
  try {
    fs.watchFile(STATS_PATH, { interval: 5000 }, () => {
      latencyCache = null;
    });
  } catch { /* ignore */ }
}

export function stopLatencyWatcher(): void {
  try {
    fs.unwatchFile(STATS_PATH);
  } catch { /* ignore */ }
  latencyWatchInitialized = false;
}

async function loadLatencyData(): Promise<Record<string, LatencyEntry> | null> {
  try {
    const now = Date.now();
    if (latencyCache && now - latencyCache.loadedAt < LATENCY_CACHE_TTL_MS) {
      return latencyCache.data;
    }
    ensureLatencyWatcher();
    if (!fs.existsSync(STATS_PATH)) return null;
    const raw = await fs.promises.readFile(STATS_PATH, "utf-8");
    const j = JSON.parse(raw) as Record<string, LatencyEntry>;
    latencyCache = { data: j, loadedAt: now };
    return j;
  } catch {
    return null;
  }
}

function readLatencyValue(j: Record<string, LatencyEntry>, provider: string): number | null {
  const v: LatencyEntry | undefined = j[provider];
  if (typeof v === "number") return v;
  if (v && typeof v.emaLatencyMs === "number") return v.emaLatencyMs;
  if (v && typeof v.latency === "number") return v.latency;
  return null;
}

function getLatency(provider: string): number {
  try {
    const now = Date.now();
    let j: Record<string, LatencyEntry> | null = null;
    if (latencyCache && now - latencyCache.loadedAt < LATENCY_CACHE_TTL_MS) {
      j = latencyCache.data;
    } else {
      // sync fallback for hot path (kept for backward compat); async version preferred via getLatencyAsync
      if (!fs.existsSync(STATS_PATH)) return 100;
      // avoid blocking: return cached or fallback, async load will refresh next call
      if (latencyCache) j = latencyCache.data;
      else {
        ensureLatencyWatcher();
        // trigger async refresh without blocking
        loadLatencyData().catch(() => {});
        return 100;
      }
    }
    if (!j) return 100;
    return readLatencyValue(j, provider) ?? 100;
  } catch { /* ignore */ }
  return 100; // fallback
}

export async function getLatencyAsync(provider: string): Promise<number> {
  const j = await loadLatencyData();
  if (!j) return 100;
  return readLatencyValue(j, provider) ?? 100;
}

function getQuotaHeadroom(provider: string): number {
  try {
    // Use empty key to get average headroom across keys; if tracker supports aggregation it will return avg,
    // otherwise fallback to 1 (no quota pressure)
    return getQuotaHeadroomFromTracker(provider, "");
  } catch {
    return 1;
  }
}

let syncPricingLock = false;
let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1h

const DEFAULT_COST_WEIGHT = 5; // cost dominates latency (free-first)
const DEFAULT_LATENCY_WEIGHT = 0.0005; // half previous to ensure cheapest wins
const HEADROOM_WEIGHT = 0.3; // quota pressure more visible
const DEFAULT_SUCCESS_WEIGHT = 2; // failing providers demoted even before breaker opens

/**
 * Rolling success rate from request-log (last 100). Defaults to 1 (no data =
 * no penalty) so cold providers are not punished.
 */
export function getProviderSuccessRate(provider: string): number {
  try {
    const stats = getStats() as { byProvider?: Record<string, number>; errorsByProvider?: Record<string, number> };
    const total = stats.byProvider?.[provider] ?? 0;
    if (total === 0) return 1;
    const errs = stats.errorsByProvider?.[provider] ?? 0;
    return Math.max(0, Math.min(1, 1 - errs / total));
  } catch {
    return 1;
  }
}

function resolveWeights(opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number } = {}): {
  costWeight: number;
  latencyWeight: number;
  headroomWeight: number;
  successWeight: number;
} {
  // harness 06 Decide Tools: env overrides allow A/B testing without code change
  // Direct import — config has no circular dependency on cost-router (verified)
  return {
    costWeight: opts.costWeight ?? config.costWeight ?? DEFAULT_COST_WEIGHT,
    latencyWeight: opts.latencyWeight ?? config.latencyWeight ?? DEFAULT_LATENCY_WEIGHT,
    headroomWeight: opts.headroomWeight ?? config.headroomWeight ?? HEADROOM_WEIGHT,
    successWeight: opts.successWeight ?? config.successWeight ?? DEFAULT_SUCCESS_WEIGHT,
  };
}

function buildScores(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number } = {},
): ProviderScore[] {
  const { costWeight, latencyWeight, headroomWeight, successWeight } = resolveWeights(opts);
  const scored: ProviderScore[] = providerIds.map((provider) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const latency = getLatency(provider);
    const quotaHeadroom = getQuotaHeadroom(provider);
    const successRate = getProviderSuccessRate(provider);
    const score = cost * costWeight + latency * latencyWeight - quotaHeadroom * headroomWeight - successRate * successWeight;
    return { provider, cost, latency, quotaHeadroom, successRate, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

export async function buildScoresAsync(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number } = {},
): Promise<ProviderScore[]> {
  const { costWeight, latencyWeight, headroomWeight, successWeight } = resolveWeights(opts);
  const latencies = await Promise.all(providerIds.map((p) => getLatencyAsync(p)));
  const scored: ProviderScore[] = providerIds.map((provider, idx) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const latency = latencies[idx];
    const quotaHeadroom = getQuotaHeadroom(provider);
    const successRate = getProviderSuccessRate(provider);
    const score = cost * costWeight + latency * latencyWeight - quotaHeadroom * headroomWeight - successRate * successWeight;
    return { provider, cost, latency, quotaHeadroom, successRate, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

/**
 * Rank providers by weighted cost + latency - quota headroom.
 * Lower score is better. Sort ascending.
 * Env COST_WEIGHT/LATENCY_WEIGHT/HEADROOM_WEIGHT now override defaults (harness 06).
 */
export function rankProvidersByCostAndLatency(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number } = {},
): string[] {
  return buildScores(providerIds, opts).map((s) => s.provider);
}

export async function rankProvidersByCostAndLatencyAsync(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number } = {},
): Promise<string[]> {
  return (await buildScoresAsync(providerIds, opts)).map((s) => s.provider);
}

export function scoreProviders(
  providerIds: string[],
  opts?: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number },
): ProviderScore[] {
  return buildScores(providerIds, opts);
}

export async function scoreProvidersAsync(
  providerIds: string[],
  opts?: { costWeight?: number; latencyWeight?: number; headroomWeight?: number; successWeight?: number },
): Promise<ProviderScore[]> {
  return buildScoresAsync(providerIds, opts);
}

/**
 * Sync pricing from LiteLLM CDN, fallback to hardcoded FREELLMS_COST.
 * Handles both input_cost_per_token and input_cost_per_1k_tokens with proper normalization.
 * Now with cooldown + lock to avoid concurrent fetch storms.
 */
export async function syncPricing(): Promise<Record<string, number>> {
  if (syncPricingLock) {
    logger.info("[cost-router] syncPricing already in progress, skip");
    return { ...FREELLMS_COST };
  }
  if (Date.now() - lastSyncAt < SYNC_COOLDOWN_MS) {
    return { ...FREELLMS_COST };
  }
  syncPricingLock = true;
  const url = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { input_cost_per_token?: unknown; input_cost_per_1k_tokens?: unknown }>;
    let updated = 0;
    for (const [key, val] of Object.entries(data)) {
      let perToken: number | null = null;
      const perTok = val.input_cost_per_token;
      if (typeof perTok === "number" && perTok > 0) perToken = perTok;
      else if (typeof perTok === "string" && parseFloat(perTok) > 0) perToken = parseFloat(perTok);
      else if (typeof val.input_cost_per_1k_tokens === "number" && val.input_cost_per_1k_tokens > 0) perToken = val.input_cost_per_1k_tokens / 1000;
      if (perToken !== null && perToken > 0) {
        const slug = key.split("/")[0].toLowerCase();
        if (FREELLMS_COST[slug] !== undefined) {
          FREELLMS_COST[slug] = perToken * 1_000_000;
          updated++;
        }
      }
    }
    lastSyncAt = Date.now();
    logger.info({ updated }, "[cost-router] pricing synced from LiteLLM CDN");
  } catch (err) {
    // cooldown on failure too — avoid hammering CDN on repeated errors (15min cooldown)
    lastSyncAt = Date.now();
    logger.warn({ err: (err as Error).message }, "[cost-router] syncPricing fallback to hardcoded");
  } finally {
    syncPricingLock = false;
  }
  return { ...FREELLMS_COST };
}
