import { DEFAULTS, STORAGE_KEY } from "./constants";
import type { SettingsState } from "../types";

export function getMasterKey(): string {
  return localStorage.getItem("masterKey") || "fgk-master-dev-key";
}

export function normalizeTiersString(s: string): string {
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return s;
    const cleaned = parsed.map((tier: unknown) => {
      if (!Array.isArray(tier)) return [];
      const deduped = [...new Set((tier as unknown[]).filter((x) => typeof x === "string" && (x as string).trim()).map((x) => (x as string).trim()))];
      return deduped.slice(0, 60);
    }).filter((t: string[]) => t.length > 0);
    return JSON.stringify(cleaned);
  } catch {
    return s;
  }
}

export function loadStored(): SettingsState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Migrate: old FALLBACK_TIERS may be array not string
    if (Array.isArray(parsed.FALLBACK_TIERS)) {
      parsed.FALLBACK_TIERS = JSON.stringify(parsed.FALLBACK_TIERS);
    }
    if (typeof parsed.FALLBACK_TIERS === "string") {
      parsed.FALLBACK_TIERS = normalizeTiersString(parsed.FALLBACK_TIERS as string);
    }
    // Ensure all defaults present + coerce types
    const merged = { ...DEFAULTS, ...parsed } as SettingsState;
    // Clamp numeric fields to valid ranges (defensive)
    merged.SEMANTIC_THRESHOLD = Math.min(1, Math.max(0, Number(merged.SEMANTIC_THRESHOLD) || 0.92));
    merged.CACHE_TTL_S = Math.min(604800, Math.max(60, parseInt(String(merged.CACHE_TTL_S), 10) || 3600));
    merged.SEMANTIC_CACHE_MAX_MEM = Math.min(10000, Math.max(100, parseInt(String(merged.SEMANTIC_CACHE_MAX_MEM), 10) || 1000));
    merged.SEMANTIC_CACHE_SCAN_CAP = Math.min(1000, Math.max(10, parseInt(String(merged.SEMANTIC_CACHE_SCAN_CAP), 10) || 200));
    merged.COMPRESSION_MAX_TOKENS = Math.min(32000, Math.max(512, parseInt(String(merged.COMPRESSION_MAX_TOKENS), 10) || 4096));
    merged.ANALYTICS_RETENTION_DAYS = Math.min(365, Math.max(1, parseInt(String(merged.ANALYTICS_RETENTION_DAYS), 10) || 30));
    return merged;
  } catch {
    return null;
  }
}

export function validateSettings(s: SettingsState): string[] {
  const errs: string[] = [];
  if (s.SEMANTIC_THRESHOLD < 0 || s.SEMANTIC_THRESHOLD > 1 || !Number.isFinite(s.SEMANTIC_THRESHOLD)) errs.push("SEMANTIC_THRESHOLD must be 0..1");
  if (!Number.isFinite(s.CACHE_TTL_S) || s.CACHE_TTL_S < 60 || s.CACHE_TTL_S > 604800) errs.push("CACHE_TTL_S must be 60..604800");
  if (!s.EMBEDDING_MODEL.trim()) errs.push("EMBEDDING_MODEL empty");
  if (s.EMBEDDING_MODEL.length > 200) errs.push("EMBEDDING_MODEL too long");
  if (s.EMBEDDING_FALLBACKS.length > 2000) errs.push("EMBEDDING_FALLBACKS too long");
  if (s.SEMANTIC_CACHE_MAX_MEM < 100 || s.SEMANTIC_CACHE_MAX_MEM > 10000) errs.push("SEMANTIC_CACHE_MAX_MEM 100..10000");
  if (s.SEMANTIC_CACHE_SCAN_CAP < 10 || s.SEMANTIC_CACHE_SCAN_CAP > 1000) errs.push("SEMANTIC_CACHE_SCAN_CAP 10..1000");
  if (s.COMPRESSION_MAX_TOKENS < 512 || s.COMPRESSION_MAX_TOKENS > 32000) errs.push("COMPRESSION_MAX_TOKENS 512..32000");
  for (const k of ["COST_WEIGHT", "LATENCY_WEIGHT", "HEADROOM_WEIGHT", "SUCCESS_WEIGHT"] as const) {
    const v = s[k];
    if (!Number.isFinite(v) || v < 0 || v > 1000) errs.push(`${k} must be 0..1000`);
  }
  if (s.ANALYTICS_RETENTION_DAYS < 1 || s.ANALYTICS_RETENTION_DAYS > 365) errs.push("ANALYTICS_RETENTION_DAYS 1..365");
  if (s.PROVIDER_TIMEOUT_MS < 1000 || s.PROVIDER_TIMEOUT_MS > 120000) errs.push("PROVIDER_TIMEOUT_MS 1000..120000");
  if (s.PROVIDER_TIMEOUT_AUTO_MS < 1000 || s.PROVIDER_TIMEOUT_AUTO_MS > 30000) errs.push("PROVIDER_TIMEOUT_AUTO_MS 1000..30000");
  if (s.PROVIDER_TIMEOUT_REASONING_MS < 1000 || s.PROVIDER_TIMEOUT_REASONING_MS > 120000) errs.push("PROVIDER_TIMEOUT_REASONING_MS 1000..120000");
  if (s.PROVIDER_PARALLEL_AUTO < 1 || s.PROVIDER_PARALLEL_AUTO > 5) errs.push("PROVIDER_PARALLEL_AUTO 1..5");
  if (s.PROVIDER_PARALLEL_DEFAULT < 1 || s.PROVIDER_PARALLEL_DEFAULT > 5) errs.push("PROVIDER_PARALLEL_DEFAULT 1..5");
  if (s.CIRCUIT_BREAKER_THRESHOLD < 1 || s.CIRCUIT_BREAKER_THRESHOLD > 100) errs.push("CIRCUIT_BREAKER_THRESHOLD 1..100");
  if (s.CIRCUIT_BREAKER_COOLDOWN_MS < 1000 || s.CIRCUIT_BREAKER_COOLDOWN_MS > 300000) errs.push("CIRCUIT_BREAKER_COOLDOWN_MS 1000..300000");
  if (!["tavily", "brave", "serper", "jina"].includes(s.WEB_SEARCH_PROVIDER)) errs.push("WEB_SEARCH_PROVIDER invalid");
  if (s.WEB_FETCH_TIMEOUT_MS < 1000 || s.WEB_FETCH_TIMEOUT_MS > 30000) errs.push("WEB_FETCH_TIMEOUT_MS 1000..30000");
  if (s.WEB_FETCH_MAX_BYTES < 1000 || s.WEB_FETCH_MAX_BYTES > 2000000) errs.push("WEB_FETCH_MAX_BYTES 1000..2000000");
  if (s.WEB_SEARCH_MAX_RESULTS < 1 || s.WEB_SEARCH_MAX_RESULTS > 10) errs.push("WEB_SEARCH_MAX_RESULTS 1..10");
  if (s.WEB_TOOLS_MAX_ITERATIONS < 1 || s.WEB_TOOLS_MAX_ITERATIONS > 5) errs.push("WEB_TOOLS_MAX_ITERATIONS 1..5");
  if (s.WEB_CACHE_TTL_S < 60 || s.WEB_CACHE_TTL_S > 86400) errs.push("WEB_CACHE_TTL_S 60..86400");
  try {
    const tiers = JSON.parse(s.FALLBACK_TIERS);
    if (!Array.isArray(tiers) || tiers.length === 0 || tiers.length > 8) errs.push("FALLBACK_TIERS must be 1..8 tiers");
    else {
      let total = 0;
      for (const t of tiers) {
        if (!Array.isArray(t) || t.length === 0) errs.push("Each tier must be non-empty array");
        else total += t.length;
      }
      if (total > 200) errs.push("Total providers exceed 200");
    }
  } catch {
    errs.push("FALLBACK_TIERS invalid JSON");
  }
  return errs;
}

export async function copyWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
