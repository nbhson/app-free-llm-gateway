import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { resolveDataPath } from "./paths.js";
import { slidingCheck } from "./sliding-window.js";

// Freellms limits mapping (from docs/CONFIGURATION.md + freellms scan)
export const FREELLMS_LIMITS: Record<string, { rpm?: number; rpd?: number; tpm?: number; tpd?: number; note?: string }> = {
  "nvidia-nim": { rpm: 40, note: "40 shared, phone required" },
  groq: { rpm: 30, rpd: 14400, note: "30 RPM primary, per-model" },
  cerebras: { rpm: 15, tpm: 30000, tpd: 1000000 },
  "google-gemini": { rpm: 15, rpd: 1500, tpd: 1500 },
  gemini: { rpm: 15, rpd: 1500 },
  "ovhcloud-ai-endpoints": { rpm: 2, note: "2 anon" },
  "agnes-ai": { rpm: 30 },
  openrouter: { rpd: 200 },
  "kilo-code": { rpm: 3, note: "~200/hr" }, // 200/hr ~3/min
  cohere: { rpm: 30 },
  sambanova: { rpm: 30 },
  siliconflow: { rpm: 30 },
  "llm7-io": { rpm: 30 },
  "chutes-ai": { rpm: 30 },
  "glhf-chat": { rpm: 30 },
  pollinations: { rpm: 60, note: "no key, public" },
};

type Window = { count: number; resetAt: number };

const rpmWindows = new Map<string, Window>(); // key: provider or virtualKey
const tpmWindows = new Map<string, Window>();
const rpdWindows = new Map<string, Window>(); // 24h
const tpdWindows = new Map<string, Window>();

const QUOTA_STORE_PATH = resolveDataPath("quota-state.json");
const isQuotaTestEnv = process.env.NODE_ENV === "test" || !!process.env.VITEST;

function loadQuotaPersisted(): void {
  if (isQuotaTestEnv) return;
  try {
    if (!fs.existsSync(QUOTA_STORE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(QUOTA_STORE_PATH, "utf-8")) as {
      rpm?: Record<string, Window>;
      tpm?: Record<string, Window>;
      rpd?: Record<string, Window>;
      tpd?: Record<string, Window>;
    };
    const now = Date.now();
    const fill = (map: Map<string, Window>, obj?: Record<string, Window>) => {
      if (!obj) return;
      for (const [k, w] of Object.entries(obj)) {
        if (w.resetAt > now) map.set(k, w);
      }
    };
    fill(rpmWindows, raw.rpm);
    fill(tpmWindows, raw.tpm);
    fill(rpdWindows, raw.rpd);
    fill(tpdWindows, raw.tpd);
    const total = rpmWindows.size + tpmWindows.size + rpdWindows.size + tpdWindows.size;
    if (total > 0) logger.info({ total }, "[quota] restored windows from disk");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[quota] load failed");
  }
}

function persistQuotaSync(): void {
  if (isQuotaTestEnv) return;
  try {
    const now = Date.now();
    const toObj = (map: Map<string, Window>) => {
      const o: Record<string, Window> = {};
      for (const [k, w] of map.entries()) if (w.resetAt > now) o[k] = w;
      return o;
    };
    const out = { rpm: toObj(rpmWindows), tpm: toObj(tpmWindows), rpd: toObj(rpdWindows), tpd: toObj(tpdWindows) };
    fs.mkdirSync(path.dirname(QUOTA_STORE_PATH), { recursive: true });
    const tmp = `${QUOTA_STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, QUOTA_STORE_PATH);
  } catch { /* ignore */ }
}

let quotaPersistTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleQuotaPersist(): void {
  if (isQuotaTestEnv) return;
  if (quotaPersistTimer) return;
  quotaPersistTimer = setTimeout(() => {
    quotaPersistTimer = null;
    persistQuotaSync();
  }, 800);
  quotaPersistTimer.unref?.();
}

loadQuotaPersisted();

if (!isQuotaTestEnv && typeof process !== "undefined" && typeof process.on === "function") {
  const flush = () => { try { persistQuotaSync(); } catch { /* ignore */ } };
  try { process.on("exit", flush); } catch { /* ignore */ }
  for (const sig of ["SIGTERM", "SIGINT", "SIGUSR2", "SIGHUP"] as const) {
    try { process.on(sig as NodeJS.Signals, () => { flush(); }); } catch { /* ignore */ }
  }
  try { process.on("beforeExit", flush); } catch { /* ignore */ }
}

function windowKey(provider: string, keyPrefix: string) {
  return `${provider}:${keyPrefix}`;
}

export function checkQuota(provider: string, key: string, estimatedTokens: number): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return { allowed: true };
  const now = Date.now();
  const k = windowKey(provider, key.slice(0, 8));

  // RPM check (60s window)
  if (limits.rpm) {
    let w = rpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    if (w.count >= limits.rpm) {
      return { allowed: false, reason: `RPM limit ${limits.rpm} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // TPM check
  if (limits.tpm) {
    let w = tpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    if (w.count + estimatedTokens > limits.tpm) {
      return { allowed: false, reason: `TPM limit ${limits.tpm} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // RPD check (24h)
  if (limits.rpd) {
    let w = rpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    if (w.count >= limits.rpd) {
      return { allowed: false, reason: `RPD limit ${limits.rpd} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // TPD check (24h)
  if (limits.tpd) {
    let w = tpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    if (w.count + estimatedTokens > limits.tpd) {
      return { allowed: false, reason: `TPD limit ${limits.tpd} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // Try Redis if available for distributed quota (fallback to in-memory if not)
  // Note: Redis path is async but checkQuota is sync for now; we keep in-memory as primary and rely on key-manager cooldown for distributed 429
  return { allowed: true };
}

export function recordUsage(provider: string, key: string, tokens: number, model?: string) {
  const now = Date.now();
  const k = windowKey(provider, key.slice(0, 8));
  const limits = FREELLMS_LIMITS[provider];
  if (limits?.rpm) {
    let w = rpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    w.count++;
    rpmWindows.set(k, w);
  }
  if (limits?.tpm) {
    let w = tpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    w.count += tokens;
    tpmWindows.set(k, w);
  }
  if (limits?.rpd) {
    let w = rpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    w.count++;
    rpdWindows.set(k, w);
  }
  if (limits?.tpd) {
    let w = tpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    w.count += tokens;
    tpdWindows.set(k, w);
  }
  // also track per-model prefix if enabled (light in-memory)
  if (model && config.perModelQuotaEnabled) {
    const km = `${provider}:${model.slice(0,40)}:${key.slice(0,8)}`;
    if (limits?.rpm) {
      let w = rpmWindows.get(km);
      if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
      w.count++; rpmWindows.set(km, w);
    }
  }
  // Redis commit (best-effort): mirrors the increments into sliding windows (once)
  void commitUsageAsync(provider, key, tokens, model).catch(() => {});
  scheduleQuotaPersist();
  logger.debug({ provider, tokens, k }, "quota usage recorded");
}

const MIN_MS = 60000;
const DAY_MS = 86400000;

interface QuotaDim {
  kind: string;
  ns: string;
  limit: number;
  windowMs: number;
  tokens: number;
  incr: number;
}

function quotaDims(provider: string, keyPrefix: string, estimatedTokens: number, commit: boolean, model?: string): QuotaDim[] {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return [];
  const modelSuffix = model && config.perModelQuotaEnabled ? `:${model.replace(/[^a-z0-9-]/gi, "_").slice(0, 40)}` : "";
  const base = `quota:${provider}${modelSuffix}:${keyPrefix}`;
  const dims: QuotaDim[] = [];
  if (limits.rpm) dims.push({ kind: "RPM", ns: `${base}:rpm`, limit: limits.rpm, windowMs: MIN_MS, tokens: 1, incr: commit ? 1 : 0 });
  if (limits.tpm) dims.push({ kind: "TPM", ns: `${base}:tpm`, limit: limits.tpm, windowMs: MIN_MS, tokens: estimatedTokens, incr: commit ? estimatedTokens : 0 });
  if (limits.rpd) dims.push({ kind: "RPD", ns: `${base}:rpd`, limit: limits.rpd, windowMs: DAY_MS, tokens: 1, incr: commit ? 1 : 0 });
  if (limits.tpd) dims.push({ kind: "TPD", ns: `${base}:tpd`, limit: limits.tpd, windowMs: DAY_MS, tokens: estimatedTokens, incr: commit ? estimatedTokens : 0 });
  return dims;
}

async function commitUsageAsync(provider: string, key: string, tokens: number, model?: string): Promise<void> {
  const dims = quotaDims(provider, key.slice(0, 8), tokens, true, model);
  if (dims.length === 0) return;
  // parallel fire — best-effort background, don't block
  await Promise.all(dims.map((d) => slidingCheck({ namespace: d.ns, limit: d.limit, tokens: d.tokens, incr: d.incr, windowMs: d.windowMs }).catch(() => null)));
}

/**
 * Async quota check: Redis sliding-window-counter when available (distributed,
 * no boundary spike), otherwise the in-memory fixed window. TPM shadows TPD
 * note: a provider with both trips TPM first by design (per-minute binds tighter).
 */
function slidingCheckWithFallback(
  args: Parameters<typeof slidingCheck>[0],
): ReturnType<typeof slidingCheck> {
  // 250ms race so slow Redis doesn't block gateway hot path (fallback to in-memory)
  const race = new Promise<null>((resolve) => {
    const t = setTimeout(() => resolve(null), 250);
    (t as unknown as { unref?: () => void }).unref?.();
  });
  return Promise.race([slidingCheck(args).catch(() => null), race]) as ReturnType<typeof slidingCheck>;
}

export async function checkQuotaAsync(
  provider: string,
  key: string,
  estimatedTokens: number,
  model?: string
): Promise<{ allowed: boolean; reason?: string; retryAfterMs?: number }> {
  const dims = quotaDims(provider, key.slice(0, 8), estimatedTokens, false, model);
  if (dims.length === 0) return { allowed: true };
  // Parallel probe — single round-trip batch, fallback to in-memory if Redis unavailable/slow
  const results = await Promise.all(dims.map((d) => slidingCheckWithFallback({ namespace: d.ns, limit: d.limit, tokens: d.tokens, incr: 0, windowMs: d.windowMs })));
  if (results.some((r) => r === null)) return checkQuota(provider, key, estimatedTokens);
  for (let i = 0; i < dims.length; i++) {
    const r = results[i];
    if (r && !r.allowed) {
      return { allowed: false, reason: `${dims[i].kind} limit ${dims[i].limit} exceeded`, retryAfterMs: r.retryAfterMs };
    }
  }
  return { allowed: true };
}

export function resetQuotaForTest(): void {
  rpmWindows.clear();
  tpmWindows.clear();
  rpdWindows.clear();
  tpdWindows.clear();
  if (!isQuotaTestEnv) { try { fs.unlinkSync(QUOTA_STORE_PATH); } catch { /* ignore */ } }
}

export function getQuotaState(provider: string, key: string) {
  const limits = FREELLMS_LIMITS[provider];
  const k = windowKey(provider, key.slice(0, 8));
  return {
    provider,
    limits,
    rpm: rpmWindows.get(k),
    tpm: tpmWindows.get(k),
    rpd: rpdWindows.get(k),
    tpd: tpdWindows.get(k),
  };
}
function getWorstHeadroomForProvider(provider: string): number {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return 1;
  const prefix = `${provider}:`;
  let worst = 1;
  let found = false;
  const consider = (map: Map<string, Window>, limit?: number) => {
    if (!limit) return;
    for (const [k, w] of map.entries()) {
      if (!k.startsWith(prefix)) continue;
      found = true;
      const h = Math.max(0, 1 - w.count / limit);
      worst = Math.min(worst, h);
    }
  };
  consider(rpmWindows, limits.rpm);
  consider(tpmWindows, limits.tpm);
  consider(rpdWindows, limits.rpd);
  consider(tpdWindows, limits.tpd);
  return found ? worst : 1;
}
export function getQuotaHeadroom(provider: string, key: string): number {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return 1;
  // empty key => aggregate across all keys for provider (fix cost-router always 1 bug)
  if (!key) return getWorstHeadroomForProvider(provider);
  const st = getQuotaState(provider, key);
  // if no window yet for this specific key but other keys exist, fall back to worst
  if (!st.rpm && !st.tpm && !st.rpd && !st.tpd) return getWorstHeadroomForProvider(provider);
  let headroom = 1;
  if (limits.rpm && st.rpm) headroom = Math.min(headroom, 1 - st.rpm.count / limits.rpm);
  if (limits.tpm && st.tpm) headroom = Math.min(headroom, 1 - st.tpm.count / limits.tpm);
  if (limits.rpd && st.rpd) headroom = Math.min(headroom, 1 - st.rpd.count / limits.rpd);
  if (limits.tpd && st.tpd) headroom = Math.min(headroom, 1 - st.tpd.count / limits.tpd);
  return Math.max(0, headroom);
}
