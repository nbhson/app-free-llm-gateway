import { useEffect, useState, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Activity, BarChart3, Network, Zap, Server, RefreshCw, Radio, Sparkles } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";
import type { ApiLog, GatewayStats, ApiProvider } from "../lib/api-types.ts";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

const PUBLIC_PROVIDERS = new Set(["pollinations", "llm7-io", "ollama-cloud", "glhf-chat", "glhf"]);

function isPublicProvider(id: string) { return PUBLIC_PROVIDERS.has(id); }

interface ProvidersPayload {
  detailed?: ApiProvider[];
  count?: number;
}

export default function Usage() {
  const { t } = useLang();
  const [stats, setStats] = useState<GatewayStats | null>(() => {
    try { const raw = localStorage.getItem("usageStatsCache"); if (raw) return JSON.parse(raw) as GatewayStats; } catch { /* ignore */ }
    return null;
  });
  const [logs, setLogs] = useState<ApiLog[]>(() => {
    try { const raw = localStorage.getItem("usageLogsCache"); if (raw) return JSON.parse(raw) as ApiLog[]; } catch { /* ignore */ }
    return [];
  });
  const [providers, setProviders] = useState<ApiProvider[]>(() => {
    try { const raw = localStorage.getItem("usageProvidersCache"); if (raw) return JSON.parse(raw) as ApiProvider[]; } catch { /* ignore */ }
    return [];
  });
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [newestProviders, setNewestProviders] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("usageNewestCache"); if (raw) return JSON.parse(raw) as string[]; } catch { /* ignore */ }
    return [];
  });
  const [syncInfo, setSyncInfo] = useState<{ lastAdded?: string[]; lastAddedAt?: string | null; bootSync?: { status?: string } } | null>(() => {
    try { const raw = localStorage.getItem("usageSyncCache"); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
    return null;
  });
  const [refreshing, setRefreshing] = useState(false);
  const activeTimerRef = useRef<number | null>(null);
  const prevLogIdRef = useRef<string | null>(null);

  const fetchSync = async () => {
    const key = mk();
    try {
      const r = await fetch("/api/sync/status", { headers: { Authorization: `Bearer ${key}` } });
      const d = r.ok ? await r.json() : null;
      if (d) {
        if (d?.newestProviders) setNewestProviders(d.newestProviders);
        else if (d?.lastAdded) setNewestProviders(d.lastAdded);
        setSyncInfo({ lastAdded: d.lastAdded, lastAddedAt: d.lastAddedAt, bootSync: d.bootSync });
        try { localStorage.setItem("usageSyncCache", JSON.stringify({ lastAdded: d.lastAdded, lastAddedAt: d.lastAddedAt, bootSync: d.bootSync })); localStorage.setItem("usageNewestCache", JSON.stringify(d.newestProviders || d.lastAdded || [])); } catch { /* ignore */ }
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
    const key = mk();
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
            try { localStorage.setItem("usageStatsCache", JSON.stringify(next)); } catch { /* ignore */ }
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
        try { localStorage.setItem("usageLogsCache", JSON.stringify(data)); } catch { /* ignore */ }
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
          try { localStorage.setItem("usageNewestCache", JSON.stringify(d1.sync.lastAdded)); } catch { /* ignore */ }
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
          try { localStorage.setItem("usageProvidersCache", JSON.stringify(next)); } catch { /* ignore */ }
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
    const hasCache = (() => { try { return !!localStorage.getItem("usageStatsCache"); } catch { return false; } })();
    if (!hasCache) {
      load();
      fetchSync();
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const key = mk();
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
                  fetch("/api/stats", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setStats(d); }).catch(() => {});
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

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("usage.title") || "Usage"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("usage.subtitle") || "Token analytics, request distribution and live provider topology."}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs disabled:opacity-60">{refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{refreshing ? t("providers.syncing") : t("logs.refresh")}</button>
          <button onClick={() => setLive(!live)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold shadow-xs border ${live ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200"}`}>{live ? <Radio className="w-3.5 h-3.5 animate-pulse" /> : null}{live ? t("logs.live_on") : t("logs.live_off")}</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-5 py-3.5 bg-slate-900 text-slate-100 rounded-xl shadow-xs border border-slate-800 flex flex-wrap justify-between gap-3 text-xs font-medium">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />{stats?.logs?.total ?? 0} requests</span>
          <span className="text-slate-700">•</span><span className="text-slate-300">{stats?.logs?.allTimeTokens?.toLocaleString() ?? 0} tokens all-time</span>
          <span className="text-slate-700">•</span><span className="font-mono font-bold text-emerald-400">{stats?.logs?.avgLatencyMs ?? 0}ms avg</span>
          <span className="text-slate-700">•</span><span>{Math.round((stats?.logs?.errorRate || 0) * 100)}% err</span>
          {activeProvider && <><span className="text-slate-700">•</span><span className="inline-flex items-center gap-1.5 font-mono text-emerald-300"><Activity className="w-3 h-3" />{activeProvider}</span></>}
        </div>
        <span className="text-sky-300 font-mono">{Object.keys(stats?.logs?.byProvider || {}).length} providers</span>
      </div>

      {/* Topology Chart */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs"><Network className="w-4 h-4" /></div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t("usage.topology_title") || "Provider Topology"}</h2>
              <p className="text-[11px] text-slate-500 font-medium">{t("usage.topology_desc") || "App in center • green line = active provider • animation on active"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> {t("usage.has_key") || "Has key"}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-500 inline-block" /> {t("usage.public") || "No key needed"}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block" style={{ width: 16 }} /> active</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-300 inline-block" style={{ width: 16 }} /> idle</span>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {syncInfo?.lastAdded?.length ? <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full"><Sparkles className="w-3.5 h-3.5" /> NEW provider: {syncInfo.lastAdded.join(", ")} {syncInfo.lastAddedAt ? `• ${new Date(syncInfo.lastAddedAt).toLocaleString()}` : ""} {syncInfo.bootSync?.status ? `• bootSync: ${syncInfo.bootSync.status}` : ""}</div> : null}
          {topologyProviders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-12">{t("dashboard.no_data")}</p>
          ) : (
            <ProviderTopology providers={topologyProviders} activeProvider={activeProvider} newestProviders={newestProviders} logs={logs} />
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
            <span className="text-slate-500">Showing {topologyProviders.length} providers ({usableProviders.length} usable) • total {providers.length}</span>
            {topologyProviders.length < sortedProviders.length && <span className="text-amber-600">• showing top 16</span>}
            {newestProviders.length > 0 && <span className="text-violet-600">• newest: {newestProviders.join(", ")}</span>}
          </div>
        </div>
      </div>

      {/* Charts moved from Logs */}
      {stats?.logs && (
        <>
          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-blue-50 rounded-lg"><BarChart3 className="w-3.5 h-3.5 text-blue-600" /></div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("dashboard.requests_by_provider")}</h3></div>
              {stats?.logs?.byProvider && Object.keys(stats.logs.byProvider).length > 0 ? (
                <ResponsiveContainer width="100%" height={180}><BarChart data={Object.entries(stats.logs.byProvider).map(([name, v]) => ({ name, count: v as number }))}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
              ) : <p className="text-xs text-slate-400">{t("dashboard.no_data")}</p>}
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-purple-50 rounded-lg"><Sparkles className="w-3.5 h-3.5 text-purple-600" /></div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("dashboard.tokens_by_provider")}</h3></div>
              {stats?.logs?.tokensByProvider && Object.keys(stats.logs.tokensByProvider).length > 0 ? (
                <ResponsiveContainer width="100%" height={180}><BarChart data={Object.entries(stats.logs.tokensByProvider).map(([name, v]) => ({ name, tokens: v as number }))}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="tokens" fill="#9333ea" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
              ) : <p className="text-xs text-slate-400">{t("dashboard.no_data")}</p>}
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-emerald-50 rounded-lg"><Activity className="w-3.5 h-3.5 text-emerald-600" /></div><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("logs.status_distribution")}</h3></div>
              {(stats?.logs?.total || 0) > 0 ? (
                <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{ name: "success", value: 100 - Math.round((stats.logs.errorRate || 0) * 100) }, { name: "error", value: Math.round((stats.logs.errorRate || 0) * 100) }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label><Cell fill="#10b981" /><Cell fill="#ef4444" /></Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
              ) : <p className="text-xs text-slate-400">{t("dashboard.no_data")}</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs text-xs leading-relaxed">
            <b>{t("logs.tokens")}</b> {(stats?.logs?.totalTokens ?? 0).toLocaleString()} last 100 ({(stats?.logs?.promptTokens ?? 0).toLocaleString()} prompt + {(stats?.logs?.completionTokens ?? 0).toLocaleString()} completion, avg {stats?.logs?.avgTokens ?? 0}/req) • <b>{t("logs.all_time")}</b> {(stats?.logs?.allTimeTokens ?? 0).toLocaleString()} • <b>{t("logs.by_provider")}</b> {Object.entries(stats?.logs?.tokensByProvider || {}).map(([k, v]) => `${k}:${(v as number).toLocaleString()}`).join(" • ") || "—"}
          </div>
        </>
      )}
    </div>
  );
}

function ProviderTopology({ providers, activeProvider, newestProviders, logs }: { providers: ApiProvider[]; activeProvider: string | null; newestProviders?: string[]; logs: ApiLog[] }) {
  const n = providers.length;
  const width = 800;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const radius = n <= 6 ? 130 : n <= 10 ? 150 : 165;
  // compute positions
  const nodes = providers.map((p, i) => {
    const angle = -90 + (360 / n) * i; // start top
    const rad = (angle * Math.PI) / 180;
    const x = cx + radius * Math.cos(rad);
    const y = cy + radius * Math.sin(rad);
    return { p, x, y, angle };
  });

  const requestCountByProvider = logs.reduce<Record<string, number>>((acc, l) => { acc[l.provider] = (acc[l.provider] || 0) + 1; return acc; }, {});

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px] h-[400px] select-none">
        <defs>
          {/* gradient for active line */}
          <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="1" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#22c55e" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* background subtle grid */}
        <rect x="0" y="0" width={width} height={height} rx="16" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />

        {/* center app node shadow */}
        {/* lines */}
        {nodes.map(({ p, x, y }) => {
          const isActive = activeProvider === p.id;
          const isPublic = isPublicProvider(p.id);
          const hasKey = !!p.hasRealKey;
          const isNewest = newestProviders?.includes(p.id);
          // determine line color: active green, newest violet, else based on availability
          const idleColor = isActive ? "#22c55e" : isNewest ? "#c4b5fd" : hasKey ? "#cbd5e1" : isPublic ? "#bae6fd" : "#e2e8f0";
          return (
            <g key={`line-${p.id}`}>
              {/* idle line */}
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={idleColor}
                strokeWidth={isActive ? 3 : isNewest ? 2.6 : 1.8}
                strokeLinecap="round"
                opacity={isActive || isNewest ? 1 : 0.85}
                style={isActive || isNewest ? { filter: "url(#glow)" } : undefined}
              />
              {/* animated dash overlay for active */}
              {isActive && (
                <>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="white"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray="8 10"
                    opacity={0.95}
                    className="animate-dash"
                  />
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="#22c55e"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray="12 12"
                    className="animate-dash-slow"
                    opacity={0.9}
                  />
                  {/* moving dot */}
                  <circle r="5" fill="#22c55e" stroke="white" strokeWidth="2" opacity={0.95}>
                    <animateMotion dur="1.2s" repeatCount="indefinite" path={`M ${cx} ${cy} L ${x} ${y}`} />
                  </circle>
                </>
              )}
            </g>
          );
        })}

        {/* provider nodes */}
        {nodes.map(({ p, x, y }) => {
          const isActive = activeProvider === p.id;
          const isPublic = isPublicProvider(p.id);
          const hasKey = !!p.hasRealKey;
          const isNewest = newestProviders?.includes(p.id);
          const count = requestCountByProvider[p.id] || 0;
          const bg = isNewest ? "#f5f3ff" : hasKey ? "#ecfdf5" : isPublic ? "#f0f9ff" : "#ffffff";
          const border = isActive ? "#22c55e" : isNewest ? "#8b5cf6" : hasKey ? "#6ee7b7" : isPublic ? "#7dd3fc" : "#e2e8f0";
          const textColor = isNewest ? "#5b21b6" : hasKey ? "#065f46" : isPublic ? "#0c4a6e" : "#334155";
          return (
            <g key={`node-${p.id}`} className="cursor-pointer">
              {/* node rect centered at x,y */}
              <g transform={`translate(${x}, ${y})`}>
                <rect
                  x={-52}
                  y={-18}
                  width={104}
                  height={36}
                  rx={10}
                  fill={bg}
                  stroke={border}
                  strokeWidth={isActive || isNewest ? 2.5 : 1.4}
                  style={isActive || isNewest ? { filter: "url(#glow)" } : undefined}
                />
                {isNewest && !isActive && <circle r={6} cx={46} cy={-14} fill="#8b5cf6" opacity={0.9} stroke="white" strokeWidth={1.2} />}
                {/* provider icon circle */}
                <g transform={`translate(-36, 0)`}>
                  <circle r={12} fill={hasKey ? "#10b981" : isPublic ? "#0ea5e9" : "#94a3b8"} />
                  <foreignObject x={-7} y={-7} width={14} height={14} style={{ overflow: "visible" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, color: "white" }}>
                      <Server size={10} />
                    </div>
                  </foreignObject>
                </g>
                <text
                  x={-18}
                  y={-2}
                  textAnchor="start"
                  fontSize="10"
                  fontWeight="700"
                  fill={textColor}
                  className="font-mono"
                >
                  {p.id.length > 13 ? p.id.slice(0, 13) + "…" : p.id}
                </text>
                <text x={-18} y={10} textAnchor="start" fontSize="8.5" fontWeight="600" fill={isActive ? "#15803d" : isNewest ? "#7c3aed" : "#64748b"}>
                  {isNewest ? "★ NEW" : hasKey ? "● has key" : isPublic ? "no key needed" : "no key"} {count > 0 ? `• ${count}` : ""}
                </text>
                {(isActive || isNewest) && (
                  <g transform={`translate(42, -14)`}>
                    <circle r={7} fill={isActive ? "#22c55e" : "#8b5cf6"} />
                    <circle r={7} fill="none" stroke={isActive ? "#22c55e" : "#8b5cf6"} strokeWidth={2} opacity={0.4}>
                      <animate attributeName="r" values="7;13;7" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {/* central app node */}
        <g transform={`translate(${cx}, ${cy})`} style={{ filter: "drop-shadow(0 4px 12px rgba(15,23,42,0.15))" }}>
          {/* outer glow when active */}
          {activeProvider && <circle r={58} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.25} strokeDasharray="6 6">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
          </circle>}
          <rect x={-70} y={-32} width={140} height={64} rx={16} fill="#0f172a" stroke={activeProvider ? "#22c55e" : "#1e293b"} strokeWidth={activeProvider ? 2.5 : 1.5} />
          <g transform={`translate(0, -10)`}>
            <rect x={-18} y={-14} width={36} height={28} rx={8} fill="white" opacity={0.08} />
            <foreignObject x={-12} y={-10} width={24} height={20}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 20, color: "#f59e0b" }}>
                <Zap size={18} fill="white" color="#f59e0b" />
              </div>
            </foreignObject>
          </g>
          <text x={0} y={18} textAnchor="middle" fontSize="11" fontWeight="800" fill="white" letterSpacing="0.3">Free LLM Gateway</text>
          <text x={0} y={28} textAnchor="middle" fontSize="8" fontWeight="600" fill={activeProvider ? "#86efac" : "#94a3b8"} letterSpacing="0.8">APP • {activeProvider ? `→ ${activeProvider}` : "idle"}</text>
          {activeProvider && (
            <g transform={`translate(0, -38)`}>
              <rect x={-28} y={-8} width={56} height={16} rx={8} fill="#22c55e" />
              <text x={0} y={3} textAnchor="middle" fontSize="8" fontWeight="800" fill="white">● LIVE</text>
            </g>
          )}
        </g>
      </svg>

      <style>{`
        .animate-dash { animation: dash 0.8s linear infinite; }
        .animate-dash-slow { animation: dash 1.2s linear infinite reverse; }
        @keyframes dash { to { stroke-dashoffset: -24; } }
      `}</style>

      {/* legend below svg for mobile */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 text-white"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />{activeProvider ? `${activeProvider} active` : "no active request"}</span>
        <span className="text-slate-400">• Tap Refresh or send POST /v1/chat/completions to trigger animation</span>
      </div>
    </div>
  );
}
