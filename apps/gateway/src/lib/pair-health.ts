import fs from "node:fs";
import path from "node:path";
import { logger } from "../middleware/logger.js";
import { resolveDataPath } from "./paths.js";

/**
 * Pair health — per (provider, model) failure memory.
 *
 * The provider-level circuit breaker (circuit-breaker.ts) never trips on plain
 * 4xx (400/404/422 "model not found" is the request's fault, not the
 * provider's), so a provider whose mapping for a model is stale gets retried
 * from the top of the order on every request — the client eats the same 400
 * each time while fallback still eventually succeeds.
 *
 * This module remembers consecutive model-shaped failures per pair and, after
 * a threshold, demotes the pair to the BACK of the provider order for a TTL
 * (it is skipped only when every other option is exhausted). Success on the
 * pair clears the counter immediately. Persisted so a gateway restart doesn't
 * re-learn stale mappings the hard way.
 */

export interface PairState {
  consecutive: number;
  demotedUntil: number;
  lastError: string;
  updatedAt: number;
}

const pairs = new Map<string, PairState>();
const STORE_PATH = resolveDataPath("pair-health.json");
const isTestEnv = process.env.NODE_ENV === "test" || !!process.env.VITEST;

export const MODEL_FAIL_THRESHOLD = 2; // consecutive 400/404/422 before demote
export const MODEL_DEMOTE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function pairKey(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

/** Model-shaped failure = the request reached the provider but the model/params don't exist there. */
export function isModelShapedFailure(status: number): boolean {
  return status === 400 || status === 404 || status === 422;
}

function loadPersisted(): void {
  if (isTestEnv) return;
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as Record<string, PairState>;
    const now = Date.now();
    for (const [k, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      // drop entries fully past their demote window — nothing worth keeping
      if ((v.demotedUntil ?? 0) < now && (v.updatedAt ?? 0) < now - MODEL_DEMOTE_TTL_MS) continue;
      pairs.set(k, v);
    }
    if (pairs.size > 0) logger.info({ count: pairs.size }, "[pair-health] restored from disk");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[pair-health] load failed");
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSync(): void {
  if (isTestEnv) return;
  try {
    const now = Date.now();
    const out: Record<string, PairState> = {};
    for (const [k, v] of pairs.entries()) {
      if ((v.demotedUntil ?? 0) < now && (v.updatedAt ?? 0) < now - MODEL_DEMOTE_TTL_MS) continue;
      out[k] = v;
    }
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch { /* ignore: persist failed */ }
}

function schedulePersist(): void {
  if (isTestEnv) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistSync();
  }, 800);
  persistTimer.unref?.();
}

loadPersisted();

if (!isTestEnv && typeof process !== "undefined" && typeof process.on === "function") {
  const flush = () => { try { persistSync(); } catch { /* ignore */ } };
  try { process.on("exit", flush); } catch { /* ignore */ }
  for (const sig of ["SIGTERM", "SIGINT", "SIGUSR2", "SIGHUP"] as const) {
    try { process.on(sig as NodeJS.Signals, () => { flush(); }); } catch { /* ignore */ }
  }
}

/**
 * Whether the pair is currently demoted. Demoted pairs are tried LAST (the
 * executor reorders rather than skips — a demoted pair must still be reachable
 * when every healthy option failed).
 */
export function isDemoted(providerId: string, model: string): boolean {
  const p = pairs.get(pairKey(providerId, model));
  if (!p) return false;
  if (p.demotedUntil <= Date.now()) return false;
  return p.consecutive >= MODEL_FAIL_THRESHOLD;
}

/** Split an order into healthy pairs first, demoted pairs last (stable within groups). */
export function partitionByPairHealth(
  order: Array<{ pid: string; model?: string }>,
): { healthy: typeof order; demoted: typeof order } {
  const healthy: typeof order = [];
  const demoted: typeof order = [];
  for (const item of order) {
    if (item.model && isDemoted(item.pid, item.model)) demoted.push(item);
    else healthy.push(item);
  }
  return { healthy, demoted };
}

/** Record a model-shaped failure (400/404/422). Demotes after threshold. */
export function recordModelFailure(providerId: string, model: string, errText: string): void {
  const k = pairKey(providerId, model);
  const p = pairs.get(k) ?? { consecutive: 0, demotedUntil: 0, lastError: "", updatedAt: 0 };
  p.consecutive++;
  p.lastError = String(errText).slice(0, 300);
  p.updatedAt = Date.now();
  if (p.consecutive >= MODEL_FAIL_THRESHOLD) {
    p.demotedUntil = Date.now() + MODEL_DEMOTE_TTL_MS;
    logger.warn({ provider: providerId, model, consecutive: p.consecutive, ttlMs: MODEL_DEMOTE_TTL_MS, lastError: p.lastError }, "[pair-health] pair demoted to back of order");
  }
  pairs.set(k, p);
  schedulePersist();
}

/** Any success on the pair clears the failure memory. */
export function recordPairSuccess(providerId: string, model: string): void {
  const k = pairKey(providerId, model);
  const p = pairs.get(k);
  if (p && (p.consecutive > 0 || p.demotedUntil > 0)) {
    p.consecutive = 0;
    p.demotedUntil = 0;
    p.updatedAt = Date.now();
    schedulePersist();
  }
}

export function getPairState(providerId: string, model: string): PairState | undefined {
  return pairs.get(pairKey(providerId, model));
}

export function getAllPairStates(): Record<string, PairState> {
  return Object.fromEntries(pairs.entries());
}

export function _resetPairHealth(): void {
  pairs.clear();
}
