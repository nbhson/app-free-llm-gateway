import { useEffect, useState } from "react";
import { Search, RefreshCw, X, Check, ChevronDown, Filter, Zap, Copy, Star } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";
import { errMsg, type ApiHealth, type ApiModel, type ApiProvider } from "../lib/api-types.ts";
import { FAVORITES_EVENT, FAVORITES_KEY } from "../lib/favorites.ts";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

function badge(status?: string) {
  if (status === "verified_free") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">verified</span>;
  if (status === "deprecated") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">deprecated</span>;
  if (status === "unverified_no_key") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">no-key</span>;
  if (status === "public" || status === "alias") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{status}</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{status || "unverified"}</span>;
}

function parseLimit(limit?: unknown): string { return typeof limit === "string" && limit ? limit : "-"; }

export default function Models() {
  const { t } = useLang();
  const [models, setModels] = useState<ApiModel[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [provider, setProvider] = useState("");
  const [providerDebounced, setProviderDebounced] = useState("");
  const [verified, setVerified] = useState<string>("all");
  const [live, setLive] = useState<Record<string, ApiHealth>>({});
  const [checking, setChecking] = useState(false);
  const [checkingOne, setCheckingOne] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "score", dir: "desc" });
  const [total, setTotal] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasKeyOnly, setHasKeyOnly] = useState(() => {
    const v = localStorage.getItem("hasKeyOnly");
    const migrated = localStorage.getItem("hasKeyOnly_migrated");
    if (!migrated) { localStorage.setItem("hasKeyOnly_migrated", "1"); localStorage.setItem("hasKeyOnly", "0"); return false; }
    if (v === null) { localStorage.setItem("hasKeyOnly", "0"); return false; }
    return v !== "0";
  });
  const [hide404, setHide404] = useState(() => {
    const v = localStorage.getItem("hide404");
    const migrated = localStorage.getItem("hide404_migrated");
    if (!migrated) { localStorage.setItem("hide404_migrated", "1"); localStorage.setItem("hide404", "1"); return true; }
    return v !== "0";
  });
  const [hidePayment, setHidePayment] = useState(() => {
    const v = localStorage.getItem("hidePayment");
    if (v === null) { localStorage.setItem("hidePayment", "1"); return true; }
    return v !== "0";
  });
  const [hideInvalid, setHideInvalid] = useState(() => {
    const v = localStorage.getItem("hideInvalid");
    if (v === null) { localStorage.setItem("hideInvalid", "1"); return true; }
    return v !== "0";
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [allProviders, setAllProviders] = useState<ApiProvider[]>(() => {
    try {
      const raw = localStorage.getItem("modelsAllProvidersCache");
      if (raw) return JSON.parse(raw) as ApiProvider[];
    } catch { /* ignore */ }
    return [];
  });
  const [syncStatus, setSyncStatus] = useState<{ lastAdded?: string[]; lastAddedAt?: string | null; bootSync?: { status?: string; total?: number }; liveModels?: { total?: number; generated_at?: string | null } } | null>(() => {
    try {
      const raw = localStorage.getItem("modelsSyncCache");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  });
  const [hasRefreshed, setHasRefreshed] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(FAVORITES_KEY); return new Set(raw ? JSON.parse(raw) as string[] : []); } catch { return new Set(); }
  });
  const [favOnly, setFavOnly] = useState(() => localStorage.getItem("modelsFavOnly") === "1");

  useEffect(() => { const id = setTimeout(() => setQDebounced(q), 400); return () => clearTimeout(id); }, [q]);
  useEffect(() => { const id = setTimeout(() => setProviderDebounced(provider.trim()), 400); return () => clearTimeout(id); }, [provider]);

  const fetchAllProviders = async () => {
    try {
      const r = await fetch(`/api/providers?limit=100`, { headers: { Authorization: `Bearer ${mk()}` } });
      const d = await r.json();
      const list = (d.detailed || []) as ApiProvider[];
      list.sort((a, b) => a.id.localeCompare(b.id));
      setAllProviders(list);
      try { localStorage.setItem("modelsAllProvidersCache", JSON.stringify(list)); } catch { /* ignore */ }
    } catch { /* ignore */ }
  };

  const fetchModels = () => {
    const params = new URLSearchParams();
    if (verified !== "all") params.set("verified", verified);
    if (qDebounced) params.set("q", qDebounced);
    if (providerDebounced) params.set("provider", providerDebounced);
    if (hasKeyOnly) params.set("hasKey", "1");
    params.set("limit", "1000");
    params.set("page", "1");
    fetch(`/v1/models?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => {
      const data = d.data || [];
      setModels(data);
      setTotal(d.total ?? data.length ?? 0);
      try { localStorage.setItem("modelsCache", JSON.stringify(data)); localStorage.setItem("modelsTotalCache", String(d.total ?? data.length)); } catch { /* ignore */ }
    }).catch(() => {});
  };
  const fetchUsage = () => {
    fetch(`/api/logs?limit=200`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => {
      const map: Record<string, number> = {}; for (const l of d.data || []) { const id = l.model || ""; map[id] = (map[id] || 0) + 1; }
      // preserve previous usage until new arrives is already handled by not clearing; just update
      setUsage(map);
      try { localStorage.setItem("modelsUsageCache", JSON.stringify(map)); } catch { /* ignore */ }
    }).catch(() => {});
  };
  const fetchSync = async () => {
    try {
      const r = await fetch("/api/sync/status", { headers: { Authorization: `Bearer ${mk()}` } });
      if (!r.ok) return;
      const j = await r.json();
      setSyncStatus(j);
      try { localStorage.setItem("modelsSyncCache", JSON.stringify(j)); } catch { /* ignore */ }
    } catch { /* ignore */ }
  };

  // No auto-sync on reload — manual Refresh will trigger (env-based hasKey filter preserved, usage kept)
  useEffect(() => {
    if (!hasRefreshed) return;
    fetchModels();
    fetchUsage();
  }, [verified, qDebounced, providerDebounced, hasKeyOnly, hide404, hidePayment, hideInvalid, hasRefreshed]);
  useEffect(() => {
    if (!hasRefreshed) return;
    fetchSync();
    fetchAllProviders();
  }, [hasRefreshed]);

  // Load cached models/usage on first mount if exists (preserve apiKey/logs/totals without network)
  useEffect(() => {
    try {
      const cached = localStorage.getItem("modelsCache");
      const cachedTotal = localStorage.getItem("modelsTotalCache");
      const cachedUsage = localStorage.getItem("modelsUsageCache");
      if (cached) {
        const data = JSON.parse(cached);
        setModels(data);
        if (cachedTotal) setTotal(parseInt(cachedTotal, 10));
      }
      if (cachedUsage) setUsage(JSON.parse(cachedUsage));
    } catch { /* ignore */ }
  }, []);
  // Initial display fix: fetch once on mount if no cache so page not empty (then manual Refresh for newest)
  useEffect(() => {
    const hasCache = (() => { try { return !!localStorage.getItem("modelsCache"); } catch { return false; } })();
    if (!hasCache) {
      setHasRefreshed(true);
      fetchModels();
      fetchUsage();
      fetchSync();
      fetchAllProviders();
    }
  }, []);
  useEffect(() => { setSelected(new Set()); }, [verified, qDebounced, providerDebounced, hasKeyOnly, hide404, hidePayment, hideInvalid, favOnly]);
  useEffect(() => { localStorage.setItem("hide404", hide404 ? "1" : "0"); }, [hide404]);
  useEffect(() => { localStorage.setItem("hidePayment", hidePayment ? "1" : "0"); }, [hidePayment]);
  useEffect(() => { localStorage.setItem("hideInvalid", hideInvalid ? "1" : "0"); }, [hideInvalid]);
  useEffect(() => { localStorage.setItem("hasKeyOnly", hasKeyOnly ? "1" : "0"); }, [hasKeyOnly]);
  useEffect(() => { localStorage.setItem("modelsFavOnly", favOnly ? "1" : "0"); }, [favOnly]);
  useEffect(() => {
    const onFav = () => { try { const raw = localStorage.getItem(FAVORITES_KEY); setFavorites(new Set(raw ? JSON.parse(raw) as string[] : [])); } catch { /* ignore */ } };
    window.addEventListener(FAVORITES_EVENT, onFav);
    window.addEventListener("storage", onFav as EventListener);
    return () => { window.removeEventListener(FAVORITES_EVENT, onFav); window.removeEventListener("storage", onFav as EventListener); };
  }, []);
  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])); window.dispatchEvent(new CustomEvent(FAVORITES_EVENT)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setHasRefreshed(true);
    try {
      // manual sync per-page: env-based providers (hasKey respects current toggle, not reset), latest usage preserved
      await Promise.all([fetchModels(), fetchUsage(), fetchSync(), fetchAllProviders()]);
    } finally {
      setRefreshing(false);
    }
  };
  const handleResetFilters = () => {
    setQ("");
    setProvider("");
    setVerified("all");
    // match "Reset default" semantics: restore default toggles (hasKeyOnly stays env-based)
    setHasKeyOnly(true);
    setHide404(true);
    setHidePayment(true);
    setHideInvalid(true);
    setFavOnly(false);
    setSelected(new Set());
  };

  const syncLive = async () => {
    if (!confirm("Sync Live sẽ gọi provider.models() bằng key thật trong .env để cập nhật danh sách model mới nhất (có thể mất 10-20s). Tiếp tục?")) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/models/live/sync`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" } });
      const data = await res.json().catch(() => null);
      await fetch(`/api/verify`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }) }).catch(() => {});
      alert(data ? `Sync xong: ${data.total} live models từ ${data.providers} providers` : "Sync done"); fetchModels();
    } catch (e) { alert("Sync failed: " + errMsg(e)); } finally { setSyncing(false); }
  };

  const filtered = [...models].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.col === "id") return a.id.localeCompare(b.id) * dir;
    if (sort.col === "provider") return (a.owned_by || a.provider || "").localeCompare(b.owned_by || b.provider || "") * dir;
    if (sort.col === "context") return ((a.context_length || 0) - (b.context_length || 0)) * dir;
    if (sort.col === "score") return ((a.score || 0) - (b.score || 0)) * dir;
    if (sort.col === "used") return ((usage[a.id] || 0) - (usage[b.id] || 0)) * dir;
    if (sort.col === "status") return (a.live_status || "").localeCompare(b.live_status || "") * dir;
    return 0;
  });
  const isDisabledForHide = (m: ApiModel) => {
    if ((usage[m.id] || 0) > 0) return false;
    const liveH = live[m.id];
    if (liveH && (liveH.status === "usable" || liveH.http_status === 200)) return false;
    const h = m.health; const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || !!m.persisted_404; const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || "")); return is404 || isGone || m.live_status === "deprecated";
  };
  const isPaymentForHide = (m: ApiModel) => {
    if ((usage[m.id] || 0) > 0) return false;
    const liveH = live[m.id];
    if (liveH && (liveH.status === "usable" || liveH.http_status === 200)) return false;
    const h = m.health;
    if (!h) return false;
    const status = h.http_status;
    const err = (h.error || h.message || "").toLowerCase();
    if (status === 402 || status === 429) {
      if (/out of credits|no payment|payment method|insufficient|quota|billing|payment_required|unpaid|exceeded|balance|credit/i.test(err)) return true;
      if (status === 402) return true;
    }
    if (/you're out of credits|out of credits|no payment method|payment required|insufficient.*credit|quota exceeded|billing|unpaid/i.test(err)) return true;
    return false;
  };
  const ALIAS_IDS = new Set(["free-llm-gateway/auto","auto","gpt-4","gpt-3.5","claude-3","gemini","gemini-flash","llama","qwen","glm","kimi","code","embedding","rerank","deepseek","mistral","kilo-auto"]);
  const isInvalidId = (m: ApiModel) => {
    const id: string = (m.id || "").trim();
    if (!id) return true;
    if (ALIAS_IDS.has(id)) return false;
    if (m.owned_by === "gateway" && id === "free-llm-gateway/auto") return false;
    if (!id.includes("/")) return true;
    if (/\s/.test(id)) return true;
    if (/[^a-zA-Z0-9-_/.:]/.test(id)) return true;
    if (id.startsWith("/") || id.endsWith("/") || id.includes("//")) return true;
    return false;
  };
  let filteredAfterHide = filtered;
  if (hide404) filteredAfterHide = filteredAfterHide.filter((m) => !isDisabledForHide(m));
  if (hidePayment) filteredAfterHide = filteredAfterHide.filter((m) => !isPaymentForHide(m));
  if (hideInvalid) filteredAfterHide = filteredAfterHide.filter((m) => !isInvalidId(m));
  if (favOnly) filteredAfterHide = filteredAfterHide.filter((m) => favorites.has(m.id));
  const visible = Array.from(new Map(filteredAfterHide.map((m) => [m.id, m])).values());
  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "id" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");
  const isRowDisabled = (m: ApiModel) => {
    // If model was recently used successfully (via chat logs), don't show as disabled even if health says 404
    if ((usage[m.id] || 0) > 0) return false;
    const liveH = live[m.id];
    if (liveH && (liveH.status === "usable" || liveH.http_status === 200)) return false;
    const h = liveH || m.health;
    const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || !!m.persisted_404;
    const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || ""));
    const isPayment = (()=>{ const err=(h?.error||"").toLowerCase(); const st=h?.http_status; return st===402 || /you're out of credits|out of credits|no payment method|payment required|insufficient|quota exceeded|billing|unpaid/i.test(err); })();
    return is404 || isGone || isPayment || isInvalidId(m) || m.live_status === "deprecated";
  };
  const isCheckboxDisabled = (m: ApiModel) => isInvalidId(m);
  const visibleEnabled = visible.filter((m) => !isCheckboxDisabled(m));
  const allVisibleSelected = visibleEnabled.length > 0 && visibleEnabled.every((m) => selected.has(m.id));
  const toggle = (id: string) => {
    const m = visible.find((x) => x.id === id);
    if (m && isCheckboxDisabled(m)) return;
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleAll = () => { if (allVisibleSelected) setSelected(new Set()); else setSelected(new Set(visibleEnabled.map((m) => m.id))); };
  const hasFilter = !!(qDebounced || providerDebounced);
  const checkSingle = async (id: string) => {
    const found = visible.find((x) => x.id === id);
    if (found && isCheckboxDisabled(found)) return;
    setCheckingOne(id);
    try {
      const res = await fetch(`/api/models/health?model=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${mk()}` } });
      const data = (await res.json().catch(() => null)) as ApiHealth | null;
      if (data) {
        setLive((prev) => ({ ...prev, [id]: data }));
        if (data.http_status === 404 || data.http_status === 410 || /model_not_found|Gone/i.test(data.error || "")) {
          await fetch(`/api/models/health/mark`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], http_status: data.http_status, error: data.error }) }).catch(() => {});
          try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); cur[id] = { http_status: data.http_status, updated_at: new Date().toISOString() }; localStorage.setItem("modelHealth404", JSON.stringify(cur)); } catch { /* ignore */ }
        } else if (data.status === "usable" || data.http_status === 200) {
          // persist usable to DB so reload keeps non-red (overwrites 404)
          await fetch(`/api/models/health/mark`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], status: "usable", http_status: 200, latency_ms: data.latency_ms || 0 }) }).catch(() => {});
          try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); if (cur[id]) { delete cur[id]; localStorage.setItem("modelHealth404", JSON.stringify(cur)); } } catch { /* ignore */ }
          try { const cur2 = JSON.parse(localStorage.getItem("modelHealthUsable") || "{}"); cur2[id] = { status: "usable", http_status: data.http_status || 200, latency_ms: data.latency_ms, updated_at: new Date().toISOString() }; localStorage.setItem("modelHealthUsable", JSON.stringify(cur2)); } catch { /* ignore */ }
          // Also clear persisted health in models state so isRowDisabled/isDisabledForHide no longer sees old 404
          setModels((prev) => prev.map((m) => m.id === id ? { ...m, health: { status: "usable", http_status: 200, latency_ms: data.latency_ms || 0 }, persisted_404: false, live_status: "verified_free" } : m));
        }
      }
    } finally { setCheckingOne(null); }
  };
  const checkSelected = async () => {
    const ids = Array.from(selected); if (ids.length === 0) { alert("Chọn ít nhất 1 model (tick checkbox)"); return; }
    if (ids.length > 20) { if (!confirm(`Check ${ids.length} models sẽ mất ~${ids.length * 2}s và có thể hit rate limit. Tiếp tục?`)) return; }
    setChecking(true);
    try {
      const toPersist: string[] = []; const persistPayload: Array<{ id: string; http_status?: number; error?: string }> = []; const toRemove: string[] = [];
      for (const id of ids) {
        const res = await fetch(`/api/models/health?model=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${mk()}` } });
        const data = await res.json().catch(() => null);
        if (data) {
          setLive((prev) => ({ ...prev, [id]: data }));
          if (data.http_status === 404 || data.http_status === 410 || /model_not_found|Gone/i.test(data.error || "")) { toPersist.push(id); persistPayload.push({ id, http_status: data.http_status, error: data.error }); }
          else if (data.status === "usable" || data.http_status === 200) { toRemove.push(id); }
        }
      }
      if (toPersist.length > 0) {
        await fetch(`/api/models/health/mark`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: toPersist, http_status: 404, error: "model_not_found", details: persistPayload }) }).catch(() => {});
        try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); for (const id of toPersist) cur[id] = { http_status: 404, updated_at: new Date().toISOString() }; localStorage.setItem("modelHealth404", JSON.stringify(cur)); } catch { /* ignore */ }
      }
      for (const id of toRemove) {
        const ld = live[id] || {};
        await fetch(`/api/models/health/mark`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], status: "usable", http_status: 200, latency_ms: ld.latency_ms || 0 }) }).catch(() => {});
        try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); if (cur[id]) { delete cur[id]; localStorage.setItem("modelHealth404", JSON.stringify(cur)); } } catch { /* ignore */ }
        try { const cur2 = JSON.parse(localStorage.getItem("modelHealthUsable") || "{}"); const liveData = live[id] || {}; cur2[id] = { status: "usable", http_status: 200, latency_ms: liveData.latency_ms || 0, updated_at: new Date().toISOString() }; localStorage.setItem("modelHealthUsable", JSON.stringify(cur2)); } catch { /* ignore */ }
      }
      if (toRemove.length > 0) {
        setModels((prev) => prev.map((m) => toRemove.includes(m.id) ? { ...m, health: { status: "usable", http_status: 200, latency_ms: live[m.id]?.latency_ms || 0 }, persisted_404: false, live_status: "verified_free" } : m));
      }
    } finally { setChecking(false); }
  };
  useEffect(() => {
    fetch(`/api/models/health/persisted`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => { const map: Record<string, ApiHealth> = {}; for (const row of (d.data || []) as ApiHealth[]) if (row.id) map[row.id] = row; if (Object.keys(map).length > 0) setLive((prev) => ({ ...prev, ...map })); }).catch(() => {});
    try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); if (Object.keys(cur).length > 0) setLive((prev) => ({ ...prev, ...cur })); } catch { /* ignore */ }
    try { const cur2 = JSON.parse(localStorage.getItem("modelHealthUsable") || "{}"); if (Object.keys(cur2).length > 0) setLive((prev) => ({ ...prev, ...cur2 })); } catch { /* ignore */ }
  }, []);

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("models.title")} <span className="text-sm font-mono font-semibold bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">{visible.length}</span></h1>
        <span className="text-xs text-slate-500 font-mono">{visible.length} models</span>
        {syncStatus?.lastAdded?.length ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">NEW provider: {syncStatus.lastAdded.join(", ")}</span> : null}
        {syncStatus?.bootSync?.status === "running" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full"><RefreshCw className="w-3 h-3 animate-spin" /> auto syncing…</span>}
        {syncStatus?.liveModels && <span className="text-[11px] font-mono text-slate-400">live: {syncStatus.liveModels.total ?? 0} • {syncStatus.liveModels.generated_at ? new Date(syncStatus.liveModels.generated_at).toLocaleTimeString() : ""}</span>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input placeholder="Filter by ID..." value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400" />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full"><X className="w-3 h-3 text-slate-400" /></button>}
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-[220px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 appearance-none">
              <option value="">All providers</option>
              {allProviders.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.hasRealKey} title={!p.hasRealKey ? "no key" : "has key"}>
                  {p.id}{!p.hasRealKey ? " (no key)" : ""}
                </option>
              ))}
            </select>
            {provider && <button onClick={() => setProvider("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full"><X className="w-3 h-3 text-slate-400" /></button>}
          </div>
          <select value={verified} onChange={(e) => setVerified(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold">
            <option value="all">{t("models.verified_all")} ({total})</option>
            <option value="free">{t("models.verified_free")}</option>
            <option value="deprecated">{t("models.verified_deprecated")}</option>
            <option value="unverified">{t("models.verified_unverified")}</option>
          </select>
          <div className="relative">
            <button type="button" onClick={() => setFilterOpen(!filterOpen)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-500" /> Filters {(hasKeyOnly?1:0)+(hide404?1:0)+(hidePayment?1:0)+(hideInvalid?1:0)+(favOnly?1:0) > 0 && <span className="bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">{(hasKeyOnly?1:0)+(hide404?1:0)+(hidePayment?1:0)+(hideInvalid?1:0)+(favOnly?1:0)}</span>} <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>
            {filterOpen && (
              <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-20">
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-emerald-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hasKey")}</span>
                  {hasKeyOnly && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hide404} onChange={(e) => setHide404(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-rose-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hide404")}</span>
                  {hide404 && <Check className="w-3.5 h-3.5 text-rose-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hidePayment} onChange={(e) => setHidePayment(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-amber-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hide_payment")}</span>
                  {hidePayment && <Check className="w-3.5 h-3.5 text-amber-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hideInvalid} onChange={(e) => setHideInvalid(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-slate-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hide_invalid")}</span>
                  {hideInvalid && <Check className="w-3.5 h-3.5 text-slate-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-amber-500" />
                  <span className="text-xs font-semibold text-slate-700 flex-1 flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-500" />{t("models.favorites_only")}</span>
                  {favOnly && <Check className="w-3.5 h-3.5 text-amber-600" />}
                </label>
                <div className="border-t border-slate-100 mt-2 pt-2 px-3 flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">{(hasKeyOnly?1:0)+(hide404?1:0)+(hidePayment?1:0)+(hideInvalid?1:0)+(favOnly?1:0)} active</span>
                  <button onClick={handleResetFilters} className="text-[11px] font-semibold text-slate-600 hover:text-slate-900">Reset default</button>
                </div>
              </div>
            )}
          </div>
          <div className="ml-auto flex flex-wrap gap-2 items-center">
            <div className="relative group" title={!hasFilter ? t("models.check_live_tooltip") : ""}>
              <button onClick={checkSelected} disabled={checking || selected.size === 0 || !hasFilter} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs ${!hasFilter ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed" : selected.size > 0 ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white text-slate-400 border border-slate-200"}`}>{checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}{checking ? t("models.checking") : `${t("models.check_live")} (${selected.size})`}</button>
              {!hasFilter && <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block bg-slate-900 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10">{t("models.check_live_tooltip")}</span>}
            </div>
            <div className="relative group">
              <button onClick={syncLive} disabled={syncing} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${syncing ? "bg-slate-100 text-slate-500 border border-slate-200" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{syncing ? t("models.syncing") : t("models.sync")}</button>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block bg-slate-900 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10 max-w-[220px] text-center">{t("models.sync_hint")}</span>
            </div>
            <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60">{refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {refreshing ? t("models.syncing") : t("models.refresh")}</button>
          </div>
        </div>
        {(qDebounced || providerDebounced || verified !== "all" || hasKeyOnly || hide404 || hidePayment || hideInvalid || favOnly) && (
          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-600 border-t border-slate-100 pt-3">
            <span className="font-semibold">Filters:</span>
            {qDebounced && <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">id: {qDebounced}<button onClick={() => setQ("")} className="p-0.5 hover:bg-slate-200 rounded-full"><X className="w-3 h-3" /></button></span>}
            {providerDebounced && <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full font-semibold">provider: {providerDebounced}<button onClick={() => setProvider("")} className="p-0.5 hover:bg-blue-100 rounded-full"><X className="w-3 h-3" /></button></span>}
            {verified !== "all" && <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">{verified}<button onClick={() => setVerified("all")} className="p-0.5 hover:bg-slate-200 rounded-full"><X className="w-3 h-3" /></button></span>}
            {hasKeyOnly && <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hasKey")}</span>}
            {hide404 && <span className="bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hide404")}</span>}
            {hidePayment && <span className="bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hide_payment")}</span>}
            {hideInvalid && <span className="bg-slate-100 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hide_invalid")}</span>}
            {favOnly && <span className="bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500 text-amber-500" />{t("models.favorites_only")} ({favorites.size})</span>}
            <span className="ml-auto text-slate-400 font-mono">{selected.size} selected • {visible.length} visible</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />{t("models.verified_desc")}</div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-3 py-3 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={visibleEnabled.length === 0} className="w-4 h-4 accent-slate-900" /></th>
                <th className="px-2 py-3 text-center" title={t("models.favorite")}>{t("models.th_fav")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("id")}>{t("models.th_id")} {arrow("id")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("provider")}>{t("models.th_provider")} {arrow("provider")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("context")}>{t("models.th_context")} {arrow("context")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("score")}>{t("models.th_score")} {arrow("score")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("status")}>{t("models.th_status")} {arrow("status")}</th>
                <th className="px-3 py-3">{t("models.th_live")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("used")}>{t("models.th_used")} {arrow("used")}</th>
                <th className="px-3 py-3 text-center">{t("models.check")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((m, idx) => {
                const h = live[m.id] || m.health || (m.persisted_404 ? { http_status: 404, error: "model_not_found" } : null);
                const used = usage[m.id] || 0;
                // use centralized logic so Check usable survives reload (live usable + DB 200)
                const disabled = isRowDisabled(m);
                const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || m.persisted_404;
                const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || ""));
                const isPayment = (()=>{ const err=(h?.error||"").toLowerCase(); const st=h?.http_status; return st===402 || /you're out of credits|out of credits|no payment method|payment required|insufficient|quota exceeded|billing|unpaid/i.test(err); })();
                const isInvalid = isInvalidId(m);
                const fav = favorites.has(m.id);
                return (
                  <tr key={`${m.id}::${idx}`} className={`${disabled ? `${isPayment ? "bg-amber-50/60 opacity-60 line-through decoration-amber-400" : isInvalid ? "bg-slate-100/60 opacity-60 line-through decoration-slate-400" : "bg-rose-50/60 opacity-60 line-through decoration-rose-400"}` : fav ? "bg-amber-50/30" : selected.has(m.id) ? "bg-blue-50/40" : "hover:bg-slate-50/80"} transition-colors`} title={isInvalid ? "Invalid model ID" : isPayment ? "Out of credits / payment required" : is404 || isGone ? "404/410" : fav ? t("models.favorite") : ""}>
                    <td className="px-3 py-3 text-center"><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} disabled={isInvalid} className="w-4 h-4 accent-slate-900 disabled:opacity-30 disabled:cursor-not-allowed" /></td>
                    <td className="px-2 py-3 text-center"><button onClick={() => toggleFav(m.id)} title={fav ? t("models.remove_fav") : t("models.add_fav")} className={`p-1 rounded-md transition-colors ${fav ? "text-amber-500 hover:bg-amber-100" : "text-slate-300 hover:text-amber-400 hover:bg-amber-50"}`}><Star className={`w-4 h-4 ${fav ? "fill-amber-400 text-amber-500" : ""}`} /></button></td>
                    <td className="px-3 py-3"><div className="inline-flex items-center gap-1.5 group/id"><code className={`text-xs font-mono px-2 py-0.5 rounded border font-semibold ${disabled ? (isInvalid ? "bg-slate-200 text-slate-600 border-slate-300 line-through" : isPayment ? "bg-amber-100 text-amber-700 border-amber-200 line-through" : "bg-rose-100 text-rose-700 border-rose-200 line-through") : fav ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-800 border-slate-200"}`}>{m.id}</code><button onClick={() => { navigator.clipboard.writeText(m.id).catch(()=>{}); setCopiedId(m.id); setTimeout(()=> setCopiedId(null), 1500); }} className="p-1 rounded-md hover:bg-slate-200 opacity-70 hover:opacity-100 transition-colors" title="Copy ID">{copiedId === m.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400 group-hover/id:text-slate-600" />}</button></div></td>
                    <td className="px-3 py-3 font-medium text-slate-700">{m.owned_by || m.provider}</td>
                    <td className="px-3 py-3 font-mono text-slate-600">{m.context_length ? (m.context_length >= 1000000 ? (m.context_length/1000000)+"M" : m.context_length >= 1000 ? Math.round(m.context_length/1000)+"K" : m.context_length) : "-"}</td>
                    <td className="px-3 py-3 font-mono font-bold">{m.score ?? "-"}</td>
                    <td className="px-3 py-3">{badge(m.live_status)}</td>
                    <td className="px-3 py-3 text-xs">{h ? (isPayment ? <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold text-[11px]">out of credits {h.http_status ? ` ${h.http_status}` : ""}</span> : h.status === "usable" ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold text-[11px]"><Check className="w-3 h-3" /> usable {h.latency_ms}ms</span> : h.status === "no-key" ? <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">no-key</span> : <span className="text-rose-700 font-semibold">{h.status}{h.http_status ? ` ${h.http_status}` : ""}</span>) : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 font-mono text-slate-600"><span className={used>0 ? "font-bold text-slate-800" : ""}>{used}</span> / {parseLimit(m.limit)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => checkSingle(m.id)} disabled={isInvalid || checkingOne === m.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border ${isInvalid ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"}`} title={isInvalid ? "Invalid model ID — disabled" : t("models.check")}>
                        {checkingOne === m.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} {t("models.check")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <div className="p-8 text-center text-sm text-slate-400">{favOnly && favorites.size === 0 ? t("chat.no_favorites") : t("models.no_match")}</div>}
        <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-200 text-xs font-mono text-slate-600 flex items-center justify-between">
          <span>{visible.length} models • {selected.size} selected{favorites.size > 0 ? ` • ★ ${favorites.size} favorites` : ""}</span>
          {favorites.size > 0 && <span className="hidden sm:inline text-[11px] text-amber-600">{t("models.favorites_tip")}</span>}
        </div>
      </div>
    </div>
  );
}
