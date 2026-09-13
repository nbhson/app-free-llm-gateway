import React, { useEffect, useState } from "react";
import { RefreshCw, Radio } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";
import type { ApiLog, GatewayStats } from "../lib/api-types.ts";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Logs() {
  const { t } = useLang();
  const [logs, setLogs] = useState<ApiLog[]>(() => {
    try { const raw = localStorage.getItem("logsCache"); if (raw) return JSON.parse(raw) as ApiLog[]; } catch { /* ignore */ }
    return [];
  });
  const [live, setLive] = useState(false);
  const [stats, setStats] = useState<GatewayStats | null>(() => {
    try { const raw = localStorage.getItem("logsStatsCache"); if (raw) return JSON.parse(raw) as GatewayStats; } catch { /* ignore */ }
    return null;
  });

  const DISPLAY_LIMIT = 50;
  const [authError, setAuthError] = useState<string | null>(null);
  const load = () => {
    // preserve existing logs/stats until new arrives — do not clear on error
    fetch("/api/logs?limit=100", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => { if (!r.ok) { setAuthError(r.status === 401 ? t("logs.auth_error") : `Error ${r.status}`); return null; } setAuthError(null); return r.json(); }).then((d) => {
      if (d?.data) {
        setLogs(d.data);
        try { localStorage.setItem("logsCache", JSON.stringify(d.data)); } catch { /* ignore */ }
      }
    }).catch(() => {});
    fetch("/api/stats", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => { if (!r.ok) { if (r.status === 401) setAuthError(t("logs.auth_error")); return null; } return r.json(); }).then((d) => {
      if (d) {
        // preserve total request/total token if new has 0 but old has value? Keep latest non-zero
        setStats((prev) => {
          if (!prev) return d;
          // if new logs missing, keep prev logs
          if (d?.logs && (!d.logs.total || d.logs.total === 0) && prev.logs?.total) {
            // keep prev total if new is empty (preserve)
            return { ...d, logs: { ...prev.logs, ...d.logs, total: d.logs.total || prev.logs.total, allTimeTokens: d.logs.allTimeTokens || prev.logs.allTimeTokens } };
          }
          return d;
        });
        try { localStorage.setItem("logsStatsCache", JSON.stringify(d)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  };
  const visibleLogs = logs.slice(0, DISPLAY_LIMIT);
  const totalCount = stats?.logs?.total ?? logs.length;
  const moreCount = Math.max(0, totalCount - DISPLAY_LIMIT);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!live) return;
    const key = mk();
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    (async () => {
      try {
        const res = await fetch("/api/logs/stream", { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
        if (!res.body) return;
        reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read(); if (done) break;
          buf += decoder.decode(value, { stream: true }); const parts = buf.split("\n\n"); buf = parts.pop() || "";
          for (const p of parts) { const line = p.split("\n").find((l) => l.startsWith("data: ")); if (line) { try { const obj = JSON.parse(line.slice(6)); if (obj.id) setLogs((prev) => [obj, ...prev].slice(0, 100)); } catch { /* ignore */ } } }
        }
      } catch (e) { if ((e as Error).name === "AbortError") return; /* ignore */ }
    })();
    const timer = setInterval(load, 2000);
    return () => { controller.abort(); try { reader?.cancel().catch(() => {}); } catch { /* ignore */ } clearInterval(timer); };
  }, [live]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("logs.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("logs.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs"><RefreshCw className="w-3.5 h-3.5" />{t("logs.refresh")}</button>
          <button onClick={() => setLive(!live)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold shadow-xs border ${live ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200"}`}>{live ? <Radio className="w-3.5 h-3.5 animate-pulse" /> : null}{live ? t("logs.live_on") : t("logs.live_off")}</button>
        </div>
      </div>

      {authError && <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">⚠️ {authError} — {t("logs.auth_error_hint")}</div>}

      <div className="px-5 py-3.5 bg-slate-900 text-slate-100 rounded-xl shadow-xs border border-slate-800 flex flex-wrap justify-between gap-3 text-xs font-medium">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />{stats?.logs?.total ?? 0} requests</span>
          <span className="text-slate-700">•</span><span className="text-slate-300">{stats?.logs?.allTimeTokens?.toLocaleString() ?? 0} tokens all-time</span>
          <span className="text-slate-700">•</span><span className="font-mono font-bold text-emerald-400">{stats?.logs?.avgLatencyMs ?? 0}ms avg</span>
          <span className="text-slate-700">•</span><span>{Math.round((stats?.logs?.errorRate || 0) * 100)}% err</span>
        </div>
        <span className="text-sky-300 font-mono">{Object.keys(stats?.logs?.byProvider||{}).length} providers</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
              <tr><th className="px-4 py-3"></th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Key</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Tokens</th><th className="px-4 py-3">MS</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Verified</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLogs.map((l) => {
                const expanded = l._expanded;
                return (
                  <React.Fragment key={l.id}>
                    <tr className={`${expanded ? "bg-slate-50/80" : "hover:bg-slate-50/80"} cursor-pointer`} onClick={() => setLogs((prev) => prev.map((x) => x.id === l.id ? { ...x, _expanded: !x._expanded } : x))}>
                      <td className="px-4 py-3"><span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 border border-slate-200 text-[11px] font-bold">{expanded ? "−" : "+"}</span></td>
                      <td className="px-4 py-3 font-mono text-slate-600">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : "-"}</td>
                      <td className="px-4 py-3 font-mono text-[11px]">{l.virtualKeyName || l.virtualKeyId || "-"}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200">{l.provider}</span></td>
                      <td className="px-4 py-3 font-mono text-[11px] max-w-[200px] truncate" title={l.model}>{l.model}</td>
                      <td className="px-4 py-3 font-mono">{l.totalTokens ?? "-"}<span className="text-slate-400 text-[10px]"> ({l.promptTokens ?? 0}+{l.completionTokens ?? 0})</span></td>
                      <td className="px-4 py-3 font-mono">{l.latencyMs}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${l.status === 200 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>{l.status}</span></td>
                      <td className="px-4 py-3 text-[11px]">{l.verifiedStatus || "-"}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={9} className="bg-slate-50/80 p-4">
                          <div className="grid md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-1"><div><b>ID:</b> <code className="bg-white border px-1.5 py-0.5 rounded font-mono text-[11px]">{l.id}</code></div><div><b>Time:</b> {l.timestamp ? new Date(l.timestamp).toLocaleString() : "-"}</div><div><b>Key:</b> {l.virtualKeyName} ({l.virtualKeyId})</div><div><b>Provider:</b> {l.provider}</div><div><b>Model:</b> <code className="bg-white border px-1.5 py-0.5 rounded font-mono text-[11px]">{l.model}</code></div></div>
                            <div className="space-y-1"><div><b>Tokens:</b> {l.promptTokens ?? 0} prompt + {l.completionTokens ?? 0} completion = <b>{l.totalTokens ?? 0}</b></div><div><b>Latency:</b> {l.latencyMs}ms</div><div><b>Status:</b> {l.status}</div><div><b>Verified:</b> {l.verifiedStatus || "-"}</div><pre className="bg-white border border-slate-200 rounded-lg p-3 max-h-32 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-all">{l.error || "—"}</pre></div>
                          </div>
                          <div className="mt-3"><b className="text-xs">Raw JSON:</b><pre className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-auto max-h-48 mt-1">{JSON.stringify(l, null, 2)}</pre></div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && <div className="p-8 text-center text-sm text-slate-400">{t("logs.no_logs")}</div>}
        {moreCount > 0 && (
          <div className="px-4 py-3 text-center text-xs font-mono text-slate-500 bg-slate-50 border-t border-slate-200/80">
            ... + {moreCount} more
          </div>
        )}
      </div>
    </div>
  );
}
