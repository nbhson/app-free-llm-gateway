import { useEffect, useRef, useState } from "react";
import type { ApiLog, ApiProvider, GatewayStats } from "../../../lib/api-types.ts";
import { CACHE_KEYS, type ProvidersPayload, type SyncInfo } from "../types";
import { getMasterKey, isPublicProvider, readLogsCache, readNewestCache, readProvidersCache, readStatsCache, readSyncCache, writeCache } from "../lib/helpers";

export function useUsageData() {
  const [stats, setStats] = useState<GatewayStats | null>(readStatsCache);
  const [logs, setLogs] = useState<ApiLog[]>(readLogsCache);
  const [providers, setProviders] = useState<ApiProvider[]>(readProvidersCache);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [newestProviders, setNewestProviders] = useState<string[]>(readNewestCache);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(readSyncCache);
  const [refreshing, setRefreshing] = useState(false);
  const activeTimerRef = useRef<number | null>(null);
  const prevLogIdRef = useRef<string | null>(null);

  const fetchSync = async () => {
    const key = getMasterKey();
    try {
      const r = await fetch("/api/sync/status", { headers: { Authorization: `Bearer ${key}` } });
      const d = r.ok ? await r.json() : null;
      if (d) {
        if (d?.newestProviders) setNewestProviders(d.newestProviders);
        else if (d?.lastAdded) setNewestProviders(d.lastAdded);
        setSyncInfo({ lastAdded: d.lastAdded, lastAddedAt: d.lastAddedAt, bootSync: d.bootSync });
        writeCache(CACHE_KEYS.sync, { lastAdded: d.lastAdded, lastAddedAt: d.lastAddedAt, bootSync: d.bootSync });
        writeCache(CACHE_KEYS.newest, d.newestProviders || d.lastAdded || []);
        // usage will be loaded based on latest provider — highlight newest
        if (d?.lastAdded?.length) {
          const newest = d.lastAdded[0];
          if (newest) {
            setActiveProvider(newest);
            if (activeTimerRef.current) window.clearTimeout(activeTimerRef.current);
            activeTimerRef.current = window.setTimeout(() => setActiveProvider(null), 4000);
          }
        }
      }
    } catch { /* ignore */ }
  };

  const load = async () => {
    const key = getMasterKey();
    // preserve existing stats/logs until new arrives — do not clear before fetch
    // CRITICAL: never overwrite cache with empty after gateway restart (keep previous allTimeTokens)
    try {
      const r = await fetch("/api/stats", { headers: { Authorization: `Bearer ${key}` } });
      if (r.ok) {
        const d = await r.json();
        if (d) {
          setStats((prev) => {
            // Both shapes are GatewayStats-ish; index optional fields defensively
            const prevLogs = (prev ?? {}) as GatewayStats["logs"];
            const dLogs = (d ?? {}) as GatewayStats["logs"];
            const prevAll = prevLogs?.allTimeTokens ?? 0;
            const prevTotal = prevLogs?.total ?? 0;
            const dAll = dLogs?.allTimeTokens ?? 0;
            const dTotal = dLogs?.total ?? 0;
            // if gateway just restarted and returns 0, keep previous cache (don't refresh to empty)
            const isEmptyAfterRestart = dAll === 0 && dTotal === 0 && (prevAll > 0 || prevTotal > 0);
            const next = isEmptyAfterRestart ? prev as GatewayStats : d as GatewayStats;
            writeCache(CACHE_KEYS.stats, next);
            return next;
          });
        }
      }
    } catch { /* ignore */ }
    try {
      const r2 = await fetch("/api/logs?limit=20", { headers: { Authorization: `Bearer ${key}` } });
      const d2 = r2.ok ? await r2.json() : { data: [] };
      const data: ApiLog[] = d2.data || [];
      // keep previous logs if fetch empty to preserve totals
      if (data.length > 0 || logs.length === 0) {
        setLogs(data);
        writeCache(CACHE_KEYS.logs, data);
        if (data.length > 0) {
          const latest = data[0];
          if (latest.provider && latest.id !== prevLogIdRef.current) {
            prevLogIdRef.current = latest.id;
            setActiveProvider(latest.provider);
            if (activeTimerRef.current) window.clearTimeout(activeTimerRef.current);
            activeTimerRef.current = window.setTimeout(() => setActiveProvider(null), 4000);
          }
        }
      }
    } catch { /* ignore */ }
    // API chỉ cho limit 25/50 => phải fetch đủ 2 trang để lấy hết ~48 providers (bug cũ: limit=100 bị fallback về 25 nên chỉ hiện 7/13)
    // providers loaded based on env model (hasKey via providerKeys)
    const fetchAllProviders = async () => {
      try {
        const r1 = await fetch("/api/providers?limit=50&page=1", { headers: { Authorization: `Bearer ${key}` } });
        if (!r1.ok) return;
        const d1 = (await r1.json()) as ProvidersPayload & { pagination?: { total_pages: number; total: number }; sync?: { lastAdded?: string[]; lastAddedAt?: string | null } };
        let all: ApiProvider[] = d1.detailed || [];
        if (d1.sync?.lastAdded) {
          setNewestProviders(d1.sync.lastAdded);
          setSyncInfo((prev) => prev || { lastAdded: d1.sync!.lastAdded, lastAddedAt: d1.sync!.lastAddedAt || null });
          writeCache(CACHE_KEYS.newest, d1.sync.lastAdded);
        }
        const totalPages = d1.pagination?.total_pages || 1;
        if (totalPages > 1) {
          for (let p = 2; p <= totalPages; p++) {
            const rp = await fetch(`/api/providers?limit=50&page=${p}`, { headers: { Authorization: `Bearer ${key}` } });
            if (!rp.ok) continue;
            const dp = (await rp.json()) as ProvidersPayload;
            if (dp.detailed) all = all.concat(dp.detailed);
          }
        }
        setProviders((prev) => {
          // preserve after gateway restart: if new is empty but cache had data, keep cache
          const next = all.length === 0 && prev.length > 0 ? prev : all;
          writeCache(CACHE_KEYS.providers, next);
          return next;
        });
      } catch { /* ignore */ }
    };
    await fetchAllProviders();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
      await fetchSync();
    } finally {
      setRefreshing(false);
    }
  };

  // Initial display fix: if no cache, fetch once so page not empty (then manual Refresh for newest)
  useEffect(() => {
    const hasCache = (() => { try { return !!localStorage.getItem(CACHE_KEYS.stats); } catch { return false; } })();
    if (!hasCache) {
      load();
      fetchSync();
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const key = getMasterKey();
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    (async () => {
      try {
        const res = await fetch("/api/logs/stream", { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
        if (!res.body) return;
        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const p of parts) {
            const line = p.split("\n").find((l) => l.startsWith("data: "));
            if (line) {
              try {
                const obj = JSON.parse(line.slice(6));
                if (obj.id && obj.provider) {
                  setLogs((prev) => [obj, ...prev].slice(0, 20));
                  setActiveProvider(obj.provider);
                  if (activeTimerRef.current) window.clearTimeout(activeTimerRef.current);
                  activeTimerRef.current = window.setTimeout(() => setActiveProvider(null), 4000);
                  // refresh stats quickly
                  fetch("/api/stats", { headers: { Authorization: `Bearer ${getMasterKey()}` } }).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setStats(d); }).catch(() => {});
                }
              } catch { /* ignore */ }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        /* ignore */
      }
    })();
    return () => { controller.abort(); try { reader?.cancel().catch(() => {}); } catch { /* ignore */ } if (activeTimerRef.current) window.clearTimeout(activeTimerRef.current); };
  }, [live]);

  const usableProviders = providers.filter((p) => p.hasRealKey || isPublicProvider(p.id));
  const displayProviders = usableProviders.length > 0 ? usableProviders : providers.slice(0, 12);
  // sort: newestProviders first (provider vừa được cấp key mới nhất), rồi hasRealKey, rồi public, rồi alphabetical
  const newestSet = new Set(newestProviders);
  const sortedProviders = [...displayProviders].sort((a, b) => {
    const aNew = newestSet.has(a.id) ? 1 : 0;
    const bNew = newestSet.has(b.id) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    // nếu cùng newest, sort theo thời gian addedAt mới nhất trước
    if (aNew && bNew) {
      const aIdx = newestProviders.indexOf(a.id);
      const bIdx = newestProviders.indexOf(b.id);
      if (aIdx !== bIdx) return aIdx - bIdx;
    }
    const aScore = a.hasRealKey ? 2 : isPublicProvider(a.id) ? 1 : 0;
    const bScore = b.hasRealKey ? 2 : isPublicProvider(b.id) ? 1 : 0;
    if (aScore !== bScore) return bScore - aScore;
    return a.id.localeCompare(b.id);
  });

  // Limit to prevent overcrowding; if more than 16, show top 16 by hasRealKey/score
  const topologyProviders = sortedProviders.slice(0, 16);

  return {
    stats, logs, providers, activeProvider, live, setLive, newestProviders, syncInfo, refreshing,
    usableProviders, sortedProviders, topologyProviders,
    handleRefresh,
  };
}
