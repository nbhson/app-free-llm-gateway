import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Layers, Activity, Clock, Sparkles, BarChart3, Copy, Check, X, PanelRight, Zap, Key, Terminal, ArrowRight } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLang } from "../lib/i18n.tsx";
import type { ApiLog, GatewayStats, VerifySummary } from "../lib/api-types.ts";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Dashboard() {
  const { t } = useLang();
  const [health, setHealth] = useState<{ status?: string; providers?: number; [key: string]: unknown } | null>(null);
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [verify, setVerify] = useState<VerifySummary | null>(null);
  const [recent, setRecent] = useState<ApiLog[]>([]);
  const [copiedHealth, setCopiedHealth] = useState(false);
  const [copiedStats, setCopiedStats] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    fetch("/v1/health").then((r) => r.json()).then(setHealth).catch(() => {});
    const key = mk();
    fetch("/api/stats", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).then(setStats).catch(() => {});
    fetch("/api/verify/summary", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).then(setVerify).catch(() => {});
    fetch("/api/logs?limit=5", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).then((d) => setRecent(d.data || [])).catch(() => {});
  }, []);

  const handleCopyHealth = () => {
    navigator.clipboard.writeText(JSON.stringify(health, null, 2));
    setCopiedHealth(true); setTimeout(()=>setCopiedHealth(false),2000);
  };
  const handleCopyStats = () => {
    navigator.clipboard.writeText(JSON.stringify(stats, null, 2));
    setCopiedStats(true); setTimeout(()=>setCopiedStats(false),2000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-heading">{t("dashboard.title")}</h1>
          <p className="text-sm text-mutedtxt mt-0.5">{t("dashboard.subtitle")}</p>
        </div>
        <button onClick={() => setShowSidebar(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 shadow-xs">
          <PanelRight className="w-3.5 h-3.5" /> {t("dashboard.gateway_health")} & {t("dashboard.stats_detail")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs hover:shadow-xs hover:border-linestrong transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-center justify-between text-mutedtxt">
            <span className="text-[11px] font-bold uppercase tracking-wider text-mutedtxt">{t("dashboard.providers")}</span>
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-secondary group-hover:bg-strong/70 transition-colors"><Layers className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold tracking-tight text-heading font-mono">{stats?.providers ?? 40}</div>
            <div className="mt-2.5 pt-2.5 border-t border-linesoft flex items-center justify-between text-xs text-secondary">
              <span className="font-semibold text-emerald-ink bg-emerald-soft px-1.5 py-0.5 rounded border border-emerald-line/60">{stats?.free_models ?? 316} free</span>
              <span className="text-slate-400">/</span>
              <span className="text-secondary">365 total</span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-mutedtxt">{stats?.freellms_providers ?? 30} freellms</span>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs hover:shadow-xs hover:border-linestrong transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-center justify-between text-mutedtxt">
            <span className="text-[11px] font-bold uppercase tracking-wider text-mutedtxt">{t("dashboard.verify")}</span>
            <div className="w-8 h-8 rounded-lg bg-amber-soft flex items-center justify-center text-amber-ink group-hover:bg-amber-wash/70 transition-colors"><Activity className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            {verify ? (
              <>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono" style={{ color: verify.total_verified_free > 300 ? "#059669" : "#ea580c" }}>
                  {verify.total_verified_free}<span className="text-base font-semibold text-slate-400">/{verify.total_freellms_free}</span><span className="text-xs font-semibold text-amber-ink ml-1.5">verified</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full mt-2.5 overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${(verify.total_verified_free / verify.total_freellms_free) * 100}%` }} />
                  <div className="bg-rose-500 h-full" style={{ width: `${(verify.total_deprecated / verify.total_freellms_free) * 100}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-mutedtxt font-medium">
                  <span className="text-rose-ink font-semibold">{verify.total_deprecated} deprecated</span>
                  <span className="text-slate-300">•</span>
                  <span>{verify.total_unverified_no_key} unverified</span>
                </div>
              </>
            ) : <span className="text-xs text-slate-400">loading / no data</span>}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs hover:shadow-xs hover:border-linestrong transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-center justify-between text-mutedtxt">
            <span className="text-[11px] font-bold uppercase tracking-wider text-mutedtxt">{t("dashboard.requests")}</span>
            <div className="w-8 h-8 rounded-lg bg-blue-soft flex items-center justify-center text-blue-ink group-hover:bg-blue-wash/70 transition-colors"><Clock className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold tracking-tight text-heading font-mono">{stats?.logs?.total ?? stats?.requests ?? 0}</div>
            <div className="mt-2.5 pt-2.5 border-t border-linesoft flex items-center justify-between text-xs text-secondary">
              <span className="font-mono text-emerald-ink bg-emerald-soft px-1.5 py-0.5 rounded border border-emerald-line/60 font-semibold">{stats?.logs?.avgLatencyMs ?? 0}ms</span>
              <span className="text-slate-300">•</span>
              <span className="text-secondary font-medium">{Math.round((stats?.logs?.errorRate || 0) * 100)}% err</span>
              <span className="text-slate-300">•</span>
              <span className="text-mutedtxt font-medium">{Object.keys(stats?.logs?.byProvider || {}).length} providers</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-soft/70 to-teal-soft/40 rounded-xl p-5 border border-emerald-line/80 shadow-2xs hover:shadow-xs hover:border-emerald-line transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-center justify-between text-emerald-ink">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-ink">{t("dashboard.tokens")}</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-wash/80 flex items-center justify-center text-emerald-ink group-hover:bg-emerald-200/80 transition-colors"><Sparkles className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold tracking-tight text-emerald-ink font-mono">{(stats?.logs?.allTimeTokens ?? 0).toLocaleString()} <span className="text-xs font-bold uppercase tracking-wider text-emerald-ink">total</span></div>
            <div className="mt-2.5 pt-2.5 border-t border-emerald-line/60 flex items-center justify-between text-xs text-emerald-ink/90 font-medium">
              <span>{(stats?.logs?.promptTokens ?? 0).toLocaleString()} prompt</span>
              <span className="text-emerald-300">•</span>
              <span>{(stats?.logs?.completionTokens ?? 0).toLocaleString()} completion</span>
            </div>
            <div className="text-[11px] text-emerald-ink/80 mt-1 font-medium flex justify-between items-center">
              <span>All-time tokens</span>
              <span className="font-mono text-[10px] bg-emerald-wash text-emerald-ink px-1.5 py-0.5 rounded">avg {stats?.logs?.avgTokens ?? 0}/req</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Guideline */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-800 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white"><Zap className="w-4 h-4" /></div>
            <div><h2 className="text-sm font-bold text-white">{t("dashboard.quick_guideline_title")}</h2><p className="text-xs text-slate-400">{t("dashboard.quick_guideline_desc")} — <NavLink to="/keys" className="underline text-amber-300 hover:text-amber-200">Keys</NavLink></p></div>
          </div>
          <NavLink to="/keys" className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface text-heading hover:bg-muted">{t("dashboard.go_to_keys")} <ArrowRight className="w-3.5 h-3.5" /></NavLink>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-white/10 rounded-xl p-4 border border-white/10 hover:bg-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">1</span><Key className="w-4 h-4 text-amber-300" /><span className="text-xs font-bold text-white">{t("dashboard.step1_title")}</span></div>
            <p className="text-xs text-slate-300 leading-relaxed">{t("dashboard.step1_desc")}</p>
            <p className="text-[11px] text-slate-400 mt-2">{t("dashboard.step1_check")}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 border border-white/10 hover:bg-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span><Key className="w-4 h-4 text-blue-300" /><span className="text-xs font-bold text-white">{t("dashboard.step2_title")}</span></div>
            <p className="text-xs text-slate-300 leading-relaxed">{t("dashboard.step2_desc")}</p>
            <p className="text-[11px] text-slate-400 mt-2">{t("dashboard.step2_need")}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 border border-white/10 hover:bg-white/15 transition-colors">
            <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">3-4</span><Terminal className="w-4 h-4 text-emerald-300" /><span className="text-xs font-bold text-white">{t("dashboard.step3_title")}</span></div>
            <p className="text-xs text-slate-300 leading-relaxed">{t("dashboard.step3_desc")}</p>
            <p className="text-[11px] text-slate-400 mt-2">{t("dashboard.step3_table")}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /><h3 className="text-sm font-bold text-heading">{t("dashboard.requests_by_provider")}</h3></div>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-blue-soft text-blue-ink border border-blue-line/70">{Object.keys(stats?.logs?.byProvider||{}).length} providers</span>
          </div>
          {stats?.logs?.byProvider && Object.keys(stats.logs.byProvider).length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={Object.entries(stats.logs.byProvider).map(([name, v]) => ({ name, count: v as number }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400">{t("dashboard.no_data")}</p>}
        </div>
        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-500" /><h3 className="text-sm font-bold text-heading">{t("dashboard.latency")}</h3></div>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-emerald-soft text-emerald-ink border border-emerald-line/70">{stats?.logs?.avgLatencyMs ?? 0} ms avg</span>
          </div>
          {recent.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={[...recent].reverse().map((r) => ({ time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-", ms: r.latencyMs }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="ms" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400">{t("dashboard.no_data")}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-surface rounded-xl p-5 border border-line/90 shadow-2xs">
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-heading">{t("dashboard.verify_dist")}</h3><span className="text-xs font-mono bg-muted px-2 py-0.5 rounded border">{verify?.total_verified_free ?? 0}/{verify?.total_freellms_free ?? 316}</span></div>
          {verify ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={[{ name: "verified", value: verify.total_verified_free }, { name: "deprecated", value: verify.total_deprecated }, { name: "unverified", value: verify.total_unverified_no_key }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  <Cell fill="#10b981" /><Cell fill="#ef4444" /><Cell fill="#eab308" />
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400">{t("dashboard.no_verify")}</p>}
        </div>
        <div className="lg:col-span-8 bg-surface rounded-xl border border-line/90 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-linesoft flex items-center justify-between bg-raised/70">
            <h3 className="text-sm font-bold text-heading">{t("dashboard.recent_logs")}</h3>
            <span className="text-xs text-secondary font-semibold bg-muted px-2 py-0.5 rounded border border-line/70">{recent.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {recent.length === 0 ? <p className="p-4 text-sm text-slate-400">{t("dashboard.no_requests")}</p> : (
              <table className="w-full text-left text-xs">
                <thead className="bg-raised text-secondary font-bold border-b border-line/80 uppercase tracking-wider text-[11px]">
                  <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Tokens</th><th className="px-4 py-3">MS</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-divsoft">
                  {recent.map((l) => <tr key={l.id} className="hover:bg-raised/80"><td className="px-4 py-3 font-mono text-secondary">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : "-"}</td><td className="px-4 py-3"><span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-title border font-semibold">{l.provider}</span></td><td className="px-4 py-3 font-semibold text-title">{l.model.split("/").pop()}</td><td className="px-4 py-3 font-mono">{l.totalTokens ?? "-"}<span className="text-slate-400"> ({l.promptTokens ?? 0}+{l.completionTokens ?? 0})</span></td><td className="px-4 py-3 font-mono">{l.latencyMs}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-[11px] border ${l.status === 200 ? "text-emerald-ink bg-emerald-soft border-emerald-line" : "text-rose-ink bg-rose-soft border-rose-line"}`}>{l.status}</span></td></tr>)}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showSidebar && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" onClick={() => setShowSidebar(false)} />
          <div className="fixed right-0 top-0 h-full w-[520px] max-w-[90vw] bg-surface shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-sm font-bold text-heading">{t("dashboard.sidebar_title")}</h2>
              <button onClick={() => setShowSidebar(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4 text-secondary" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-raised/50">
              <div className="bg-surface rounded-xl border border-line/90 shadow-2xs overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-linesoft bg-raised/70">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /></div>
                    <span className="text-slate-300 mx-1">|</span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-body">{t("dashboard.gateway_health")}</h2>
                  </div>
                  <button onClick={handleCopyHealth} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-secondary bg-surface hover:bg-muted border border-line shadow-2xs">
                    {copiedHealth ? <Check className="w-3.5 h-3.5 text-emerald-ink" /> : <Copy className="w-3.5 h-3.5" />}<span>{copiedHealth ? "Copied" : "Copy JSON"}</span>
                  </button>
                </div>
                <div className="p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed max-h-[45vh]">
                  <pre className="text-emerald-400"><code>{JSON.stringify(health, null, 2) || "loading..."}</code></pre>
                </div>
              </div>
              <div className="bg-surface rounded-xl border border-line/90 shadow-2xs overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-linesoft bg-raised/70">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /></div>
                    <span className="text-slate-300 mx-1">|</span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-body">{t("dashboard.stats_detail")}</h2>
                  </div>
                  <button onClick={handleCopyStats} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-secondary bg-surface hover:bg-muted border border-line shadow-2xs">
                    {copiedStats ? <Check className="w-3.5 h-3.5 text-emerald-ink" /> : <Copy className="w-3.5 h-3.5" />}<span>{copiedStats ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed max-h-[45vh]">
                  <pre className="text-sky-300"><code>{JSON.stringify(stats, null, 2).slice(0, 4000) || "loading..."}{JSON.stringify(stats, null, 2).length > 4000 ? "\n... (truncated, Copy để xem đủ)" : ""}</code></pre>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
