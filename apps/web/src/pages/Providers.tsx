import { useEffect, useState } from "react";
import { Search, RefreshCw, ExternalLink, Copy, Check, ArrowUpDown } from "lucide-react";
import { getKeyUrl, getProviderInfoUrl } from "../lib/getKeyUrls";
import { getBaseUrl } from "../lib/getBaseUrls";
import { useLang } from "../lib/i18n.tsx";
import { type ApiHealth, type ApiProvider } from "../lib/api-types.ts";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

interface ProvidersPayload {
  detailed?: ApiProvider[];
  pagination?: { page: number; limit: number; total: number; total_pages: number; has_next?: boolean; has_prev?: boolean };
  count?: number;
  sync?: { lastAdded?: string[]; lastAddedAt?: string | null; bootSync?: { status?: string; at?: string; total?: number; providers?: number } };
}
interface SyncStatus {
  newestProviders?: string[];
  lastAdded?: string[];
  lastAddedAt?: string | null;
  bootSync?: { status?: string; at?: string; total?: number; providers?: number; error?: string };
  liveModels?: { total?: number; providers?: number; generated_at?: string | null } | null;
}

interface HealthPayload {
  providers?: ApiHealth[];
  summary?: { online?: number; total?: number };
}

export default function Providers() {
  const { t } = useLang();
  const [data, setData] = useState<ProvidersPayload | null>(() => {
    try {
      const raw = localStorage.getItem("providersCache");
      if (raw) return JSON.parse(raw) as ProvidersPayload;
    } catch { /* ignore */ }
    return null;
  });
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "free", dir: "desc" });
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [hasKeyOnly, setHasKeyOnly] = useState(() => {
    const v = localStorage.getItem("hasKeyOnly");
    if (v === null) { localStorage.setItem("hasKeyOnly", "1"); return true; }
    return v !== "0";
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(() => {
    try {
      const raw = localStorage.getItem("providersSyncCache");
      if (raw) return JSON.parse(raw) as SyncStatus;
    } catch { /* ignore */ }
    return null;
  });
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [hasRefreshed, setHasRefreshed] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = async () => {
    try {
      // fetch all providers without pagination UI – aggregate pages with limit=50 (backend now also supports 100)
      // env-based: hasKey uses providerKeys from .env
      const fetchPage = async (page: number) => {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (qDebounced) params.set("q", qDebounced);
        if (hasKeyOnly) params.set("hasKey", "1");
        const r = await fetch(`/api/providers?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } });
        return (await r.json()) as ProvidersPayload;
      };
      const first = await fetchPage(1);
      let all = [...(first.detailed || [])];
      const totalPages = first.pagination?.total_pages ?? 1;
      if (totalPages > 1) {
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2)));
        for (const p of rest) all = all.concat(p.detailed || []);
      }
      const merged = { ...first, detailed: all, pagination: first.pagination ? { ...first.pagination, total: all.length } : undefined };
      setData(merged);
      try { localStorage.setItem("providersCache", JSON.stringify(merged)); localStorage.setItem("providersCacheAt", new Date().toISOString()); } catch { /* ignore */ }
    } catch { /* ignore */ }
  };
  const fetchSync = async () => {
    try {
      const r = await fetch("/api/sync/status", { headers: { Authorization: `Bearer ${mk()}` } });
      if (!r.ok) return;
      const j = (await r.json()) as SyncStatus;
      setSyncStatus(j);
      try { localStorage.setItem("providersSyncCache", JSON.stringify(j)); } catch { /* ignore */ }
      if (j.bootSync?.status === "running") setAutoSyncing(true);
      else setAutoSyncing(false);
    } catch { /* ignore */ }
  };
  const checkHealth = () => {
    setLoadingHealth(true);
    fetch("/api/providers/health", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setHealth).finally(() => setLoadingHealth(false));
  };

  useEffect(() => { localStorage.setItem("hasKeyOnly", hasKeyOnly ? "1" : "0"); }, [hasKeyOnly]);

  // Initial display: if no cache, fetch once so page is not empty. Subsequent filter changes require manual Refresh to sync newest.
  useEffect(() => {
    if (!data) {
      load();
      fetchSync();
      setHasRefreshed(true);
    }
  }, []);

  // After initial display, filter changes trigger load only after manual Refresh was done
  useEffect(() => {
    if (!hasRefreshed) return;
    // avoid double-load on mount when data was null (handled above)
    if (!data) return;
    load();
  }, [qDebounced, hasKeyOnly, hasRefreshed]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setHasRefreshed(true);
    try {
      await load();
      await fetchSync();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "provider" ? "asc" : "desc" }));

  const sorted = [...(data?.detailed || [])].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.col === "provider") return a.id.localeCompare(b.id) * dir;
    if (sort.col === "tier") return (a.tier_type || "").localeCompare(b.tier_type || "") * dir;
    if (sort.col === "free") return ((a.free_models || 0) - (b.free_models || 0)) * dir;
    if (sort.col === "keys") {
      const ak = (a.keys === "none" ? 0 : parseInt(a.keys || "") || 0);
      const bk = (b.keys === "none" ? 0 : parseInt(b.keys || "") || 0);
      return (ak - bk) * dir;
    }
    return 0;
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("providers.title")} <span className="text-slate-500 font-mono text-lg">({data?.pagination?.total ?? data?.count ?? sorted.length})</span></h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("providers.subtitle")} {syncStatus?.lastAdded?.length ? <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">NEW: {syncStatus.lastAdded.join(", ")}</span> : null} {autoSyncing && <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"><RefreshCw className="w-3 h-3 animate-spin" /> boot-sync…</span>}</p>
          {syncStatus?.liveModels && <p className="text-[11px] font-mono text-slate-400 mt-1">live-models: {syncStatus.liveModels.total ?? 0} models • {syncStatus.liveModels.providers ?? 0} providers • {syncStatus.liveModels.generated_at ? new Date(syncStatus.liveModels.generated_at).toLocaleString() : "—"} {syncStatus.bootSync?.status ? `• bootSync: ${syncStatus.bootSync.status}` : ""}</p>}
        </div>
      </div>

      {!data ? <p className="text-sm text-slate-400">{t("providers.loading")}</p> : (
        <>
          <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 min-w-[280px] flex-wrap items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input placeholder={t("providers.filter")} value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400 font-medium" />
              </div>
              <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${hasKeyOnly ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 accent-emerald-600" /> {t("providers.hasKey")}
              </label>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 shadow-xs">
                {refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {refreshing ? t("providers.syncing") : t("models.refresh")}
              </button>
              <button onClick={checkHealth} disabled={loadingHealth} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-60">
                {loadingHealth ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />}{loadingHealth ? t("providers.checking") : t("providers.live_check")}
              </button>
            </div>
          </div>

          {health && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /></div>
                  <span className="text-slate-300 mx-1">|</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("providers.live_health_summary")}</h2>
                  <span className="text-[11px] font-mono bg-white border border-slate-200 px-2 py-0.5 rounded-full">{health.summary ? `${health.summary.online}/${health.summary.total} online` : `${health.providers?.length ?? 0} providers`}</span>
                </div>
                <button onClick={() => setHealth(null)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">{t("providers.close")}</button>
              </div>
              <div className="p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed max-h-72">
                <pre className="text-emerald-400"><code>{JSON.stringify(health.summary || health, null, 2)}</code></pre>
              </div>
            </div>
          )}

          {/* sort controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Sort:</span>
            {[
              { key: "provider", label: t("providers.th_provider") },
              { key: "tier", label: t("providers.th_tier") },
              { key: "free", label: t("providers.th_free") },
              { key: "keys", label: t("providers.th_keys") },
            ].map((s) => (
              <button key={s.key} onClick={() => toggleSort(s.key)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-colors ${sort.col === s.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {s.label} <ArrowUpDown className="w-3 h-3 opacity-60" />{sort.col === s.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
              </button>
            ))}
            <span className="ml-auto text-[11px] font-mono text-slate-500">{sorted.length} providers • no pagination</span>
          </div>

          {/* card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map((p: ApiProvider) => {
              const h = health?.providers?.find((x) => (x as unknown as Record<string, unknown>).id === p.id) as unknown as ApiHealth & { status?: string; latency_ms?: number; breaker?: string } | undefined;
              const baseUrl = p.baseUrl || getBaseUrl(p.id);
              const hasKey = p.hasRealKey;
              const isNewest = Boolean((p as unknown as { isNewest?: boolean }).isNewest) || Boolean(syncStatus?.lastAdded?.includes(p.id));
              return (
                <div key={p.id} className={`bg-white rounded-xl border shadow-2xs overflow-hidden flex flex-col transition-colors ${isNewest ? "border-violet-300 bg-violet-50/30 ring-1 ring-violet-200" : hasKey ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200/90"}`} style={isNewest ? { borderLeft: "3px solid #8b5cf6" } : hasKey ? { borderLeft: "3px solid #10b981" } : {}}>
                  {/* header */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold inline-block truncate max-w-full">{p.id}</span>
                        <div className="text-xs text-slate-500 mt-1 truncate">{p.name}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${p.tier_type === "permanent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{p.tier || p.tier_type || "—"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {hasKey && <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">● has key</span>}
                      {isNewest && <span className="inline-block text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full border border-violet-200 animate-pulse">★ NEW</span>}
                      {(p as unknown as { addedAt?: string }).addedAt && <span className="text-[10px] font-mono text-slate-400">{new Date((p as unknown as { addedAt: string }).addedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  <div className="px-4 pb-4 space-y-3 flex-1 flex flex-col">
                    {/* free + keys */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 rounded-lg border border-slate-200/60 p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("providers.th_free")}</div>
                        <div className="font-mono font-bold text-lg text-slate-800 leading-none mt-1">{p.free_models}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-200/60 p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("providers.th_keys")}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`font-mono text-xs font-semibold ${hasKey ? "bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200" : "text-slate-700"}`}>{p.keys}</span>
                          {hasKey && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full border border-emerald-200">✓ real</span>}
                        </div>
                        {h && h.status !== "no-key" && <div className={`text-[11px] font-medium mt-1 ${h.status === "online" ? "text-emerald-600" : "text-rose-600"}`}>• {h.status} {h.latency_ms}ms</div>}
                      </div>
                    </div>

                    {/* health + breaker */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${h?.status === "online" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : h?.status === "offline" || h?.status === "error" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{h?.status || p.status || "—"}</span>
                      {h?.breaker === "open" && <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">[breaker]</span>}
                    </div>

                    {/* caps */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("providers.th_caps")}</div>
                      <div className="flex flex-wrap gap-1">
                        {(p.caps || []).length ? (p.caps || []).slice(0, 6).map((c: string) => <span key={c} className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-medium text-slate-600">{c}</span>) : <span className="text-[11px] text-slate-400">—</span>}
                      </div>
                    </div>

                    {/* base url */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("providers.th_base")}</div>
                      {baseUrl ? (
                        <div className="flex items-center gap-1.5">
                          <code className="flex-1 text-[11px] font-mono bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-md truncate">{baseUrl}</code>
                          <button onClick={() => { navigator.clipboard.writeText(baseUrl); setCopied(p.id); setTimeout(() => setCopied(null), 1500); }} className="p-1.5 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-md bg-white shrink-0">
                            {copied === p.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </div>

                    {/* get key */}
                    <div className="pt-3 mt-auto border-t border-slate-100 flex items-center justify-between gap-2">
                      <a href={getKeyUrl(p.id)} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md text-white shadow-xs ${hasKey ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`}>{hasKey ? "✓ Key" : "Get Key"} <ExternalLink className="w-3 h-3" /></a>
                      {getProviderInfoUrl(p.id) !== "#" ? (
                        <a href={getProviderInfoUrl(p.id)} target="_blank" rel="noopener" className="text-[11px] font-medium text-slate-500 hover:text-slate-700 border border-slate-200 bg-white px-2.5 py-1.5 rounded-md">info ↗</a>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 border border-slate-200 bg-slate-50 px-2.5 py-1.5 rounded-md">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {sorted.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No providers match filter.</p>}
        </>
      )}
    </div>
  );
}
