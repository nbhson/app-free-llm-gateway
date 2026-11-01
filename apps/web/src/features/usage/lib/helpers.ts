import type { ApiLog, ApiProvider, GatewayStats } from "../../../lib/api-types.ts";
import { CACHE_KEYS, type SyncInfo } from "../types";

export function getMasterKey() {
  return localStorage.getItem("masterKey") || "fgk-master-dev-key";
}

export const PUBLIC_PROVIDERS = new Set(["pollinations", "llm7-io", "ollama-cloud", "glhf-chat", "glhf"]);

export function isPublicProvider(id: string) {
  return PUBLIC_PROVIDERS.has(id);
}

export function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

export function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function readSyncCache(): SyncInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.sync);
    if (raw) return JSON.parse(raw) as SyncInfo;
  } catch { /* ignore */ }
  return null;
}

export function readStatsCache(): GatewayStats | null {
  return readCache<GatewayStats | null>(CACHE_KEYS.stats, null);
}

export function readLogsCache(): ApiLog[] {
  return readCache<ApiLog[]>(CACHE_KEYS.logs, []);
}

export function readProvidersCache(): ApiProvider[] {
  return readCache<ApiProvider[]>(CACHE_KEYS.providers, []);
}

export function readNewestCache(): string[] {
  return readCache<string[]>(CACHE_KEYS.newest, []);
}
