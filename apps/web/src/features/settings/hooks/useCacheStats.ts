import { useCallback, useEffect, useState } from "react";
import { getMasterKey } from "../lib/helpers";
import type { CacheStats } from "../types";

export function useCacheStats() {
  // P1: cache stats
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // cache stats polling
  const fetchCacheStats = useCallback(async () => {
    const key = getMasterKey();
    setCacheLoading(true);
    setCacheError(null);
    try {
      const r = await fetch("/api/cache/stats", { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setCacheStats(d);
    } catch (e) {
      setCacheError((e as Error).message);
    } finally {
      setCacheLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchCacheStats();
    const id = window.setInterval(fetchCacheStats, 30000);
    return () => window.clearInterval(id);
  }, [fetchCacheStats]);

  const handleClearCache = useCallback(async (onMsg: (msg: string) => void, scheduleClear: (ms: number) => void) => {
    if (!confirm("Clear semantic cache? This removes all cached embeddings and completions.")) return;
    const key = getMasterKey();
    setClearingCache(true);
    try {
      const r = await fetch("/api/cache", { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `HTTP ${r.status}`);
      }
      await fetchCacheStats();
      onMsg("✅ Cache cleared");
      scheduleClear(3000);
    } catch (e) {
      onMsg(`❌ Clear cache failed: ${(e as Error).message}`);
      scheduleClear(4000);
    } finally {
      setClearingCache(false);
    }
  }, [fetchCacheStats]);

  return { cacheStats, cacheLoading, cacheError, clearingCache, fetchCacheStats, handleClearCache };
}
