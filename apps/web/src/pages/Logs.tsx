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
          <h1 className="text-2xl font-bold tracking-tight text-heading">{t("logs.title")}</h1>
          <p className="text-sm text-mutedtxt mt-0.5">{t("logs.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-surface border border-line hover:bg-raised shadow-2xs"><RefreshCw className="w-3.5 h-3.5" />{t("logs.refresh")}</button>
          <button onClick={() => setLive(!live)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold shadow-xs border ${live ? "bg-emerald-600 text-white border-emerald-600" : "bg-surface text-body border-line"}`}>{live ? <Radio className="w-3.5 h-3.5 animate-pulse" /> : null}{live ? t("logs.live_on") : t("logs.live_off")}</button>
        </div>
      </div>

      {authError && <div className="px-4 py-3 bg-rose-soft border border-rose-line text-rose-ink rounded-xl text-xs font-semibold">⚠️ {authError} — {t("logs.auth_error_hint")}</div>}

      <div className="px-5 py-3.5 bg-codesurface text-codetextbright rounded-xl shadow-xs border border-codeline flex flex-wrap justify-between gap-3 text-xs font-medium">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />{stats?.logs?.total ?? 0} requests</span>
          <span className="text-body">•</span><span className="text-mutedtxt">{stats?.logs?.allTimeTokens?.toLocaleString() ?? 0} tokens all-time</span>
          <span className="text-body">•</span><span className="font-mono font-bold text-emerald-400">{stats?.logs?.avgLatencyMs ?? 0}ms avg</span>
          <span className="text-body">•</span><span>{Math.round((stats?.logs?.errorRate || 0) * 100)}% err</span>
          {(stats?.logs?.cacheHitRate ?? 0) > 0 && <><span className="text-body">•</span><span className="text-sky-300">{Math.round((stats!.logs!.cacheHitRate ?? 0) * 100)}% cache hit</span></>}
          {(stats?.logs?.compressedSavedTokens ?? 0) > 0 && <><span className="text-body">•</span><span className="text-violet-300">{stats!.logs!.compressedSavedTokens?.toLocaleString()} tokens saved (compression)</span></>}
          {(stats?.logs?.totalCost ?? 0) > 0 && <><span className="text-body">•</span><span className="text-amber-300">${stats!.logs!.totalCost?.toFixed(4)} est. cost</span></>}
        </div>
        <span className="text-sky-300 font-mono">{Object.keys(stats?.logs?.byProvider||{}).length} providers</span>
      </div>
      {stats?.flags && (
        <div className="px-4 py-2.5 bg-surface rounded-xl border border-line flex flex-wrap items-center gap-2 text-xs">
          <span className="text-mutedtxt font-semibold">Settings:</span>
          <span className={`px-2 py-0.5 rounded-full border font-bold text-[11px] ${stats.flags.compression ? "bg-violet-soft text-violet-ink border-violet-line" : "bg-raised text-mutedtxt border-line"}`}>compression {stats.flags.compression ? "ON" : "OFF"}</span>
          <span className={`px-2 py-0.5 rounded-full border font-bold text-[11px] ${stats.flags.semanticCache ? "bg-sky-soft text-sky-ink border-sky-line" : "bg-raised text-mutedtxt border-line"}`}>semantic cache {stats.flags.semanticCache ? "ON" : "OFF"}</span>
          <span className={`px-2 py-0.5 rounded-full border font-bold text-[11px] ${stats.flags.costRouting ? "bg-amber-soft text-amber-ink border-amber-line" : "bg-raised text-mutedtxt border-line"}`}>cost routing {stats.flags.costRouting ? "ON" : "OFF"}</span>
          <span className="ml-auto text-[11px] text-mutedtxt">xem chi tiết ở Settings page</span>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-line/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-raised text-secondary font-bold border-b border-line/80 uppercase tracking-wider text-[11px]">
              <tr><th className="px-4 py-3"></th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Key</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Tokens</th><th className="px-4 py-3">MS</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Verified</th></tr>
            </thead>
            <tbody className="divide-y divide-divsoft">
              {visibleLogs.map((l) => {
                const expanded = l._expanded;
                const savedTokens = l.compressedTokens !== undefined && l.promptTokens !== undefined
                  ? Math.max(0, l.promptTokens - l.compressedTokens)
                  : undefined;
                return (
                  <React.Fragment key={l.id}>
                    <tr className={`${expanded ? "bg-raised/80" : "hover:bg-raised/80"} cursor-pointer`} onClick={() => setLogs((prev) => prev.map((x) => x.id === l.id ? { ...x, _expanded: !x._expanded } : x))}>
                      <td className="px-4 py-3"><span className="inline-flex items-center justify-center w-6 h-6 rounded bg-muted border border-line text-[11px] font-bold">{expanded ? "−" : "+"}</span></td>
                      <td className="px-4 py-3 font-mono text-secondary">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : "-"}</td>
                      <td className="px-4 py-3 font-mono text-[11px]">{l.virtualKeyName || l.virtualKeyId || "-"}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border border-line">{l.provider}</span></td>
                      <td className="px-4 py-3 font-mono text-[11px] max-w-[200px] truncate" title={l.model}>{l.model}</td>
                      <td className="px-4 py-3 font-mono">
                        {l.totalTokens ?? "-"}<span className="text-mutedtxt text-[10px]"> ({l.promptTokens ?? 0}+{l.completionTokens ?? 0})</span>
                        {savedTokens !== undefined && savedTokens > 0 && (
                          <div className="text-[10px] text-violet-ink" title={`Original prompt ${l.promptTokens}, compressed to ${l.compressedTokens}`}>
                            ↓ {l.compressedTokens} compressed (−{savedTokens})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">{l.latencyMs}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${l.status === 200 ? "bg-emerald-soft text-emerald-ink border-emerald-line" : "bg-rose-soft text-rose-ink border-rose-line"}`}>{l.status}</span></td>
                      <td className="px-4 py-3 text-[11px]">
                        <span className={l.cacheHit || l.semanticHit ? "text-sky-ink font-semibold" : ""}>{l.verifiedStatus || "-"}</span>
                        {l.cacheHit && <span className="ml-1 text-[10px] font-bold text-sky-ink bg-sky-soft px-1.5 py-0.5 rounded border border-sky-line">cache</span>}
                        {l.semanticHit && !l.cacheHit && <span className="ml-1 text-[10px] font-bold text-indigo-ink bg-indigo-soft px-1.5 py-0.5 rounded border border-indigo-line">semantic</span>}
                        {l.semanticHit && l.cacheHit && <span className="ml-1 text-[10px] font-bold text-indigo-ink bg-indigo-soft px-1.5 py-0.5 rounded border border-indigo-line">semantic</span>}
                        {l.cost !== undefined && l.cost > 0 && <span className="ml-1 text-[10px] font-bold text-amber-ink bg-amber-soft px-1.5 py-0.5 rounded border border-amber-line">${l.cost}</span>}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={9} className="bg-raised/80 p-4">
                          <div className="grid md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-1"><div><b>ID:</b> <code className="bg-surface border px-1.5 py-0.5 rounded font-mono text-[11px]">{l.id}</code></div><div><b>Time:</b> {l.timestamp ? new Date(l.timestamp).toLocaleString() : "-"}</div><div><b>Key:</b> {l.virtualKeyName} ({l.virtualKeyId})</div><div><b>Provider:</b> {l.provider}</div><div><b>Model:</b> <code className="bg-surface border px-1.5 py-0.5 rounded font-mono text-[11px]">{l.model}</code></div></div>
                            <div className="space-y-1"><div><b>Tokens:</b> {l.promptTokens ?? 0} prompt + {l.completionTokens ?? 0} completion = <b>{l.totalTokens ?? 0}</b></div><div><b>Latency:</b> {l.latencyMs}ms</div><div><b>Status:</b> {l.status}</div><div><b>Verified:</b> {l.verifiedStatus || "-"}</div>{l.compressedTokens !== undefined && l.compressedTokens > 0 && <div className="bg-violet-soft border border-violet-line rounded-lg px-3 py-2"><b className="text-violet-ink">Compact:</b> {l.promptTokens} → {l.compressedTokens} tokens <span className="text-violet-ink font-bold">(saved {savedTokens} = {l.promptTokens ? Math.round((savedTokens! / l.promptTokens)*100) : 0}%, ratio {typeof l.compressionRatio === "number" ? l.compressionRatio.toFixed(3) : l.compressionRatio ?? "-"})</span> — Settings: COMPRESSION_ENABLED{(l.compressionRatio ?? 0) > 0 ? " ON" : " (log shows compact)"}</div>}{l.cacheHit && <div><b>Cache:</b> <span className="text-sky-ink font-semibold">cache hit (semantic cache ON)</span>{l.semanticHit ? " • semantic" : ""}</div>}{!l.cacheHit && l.semanticHit && <div><b>Cache:</b> <span className="text-indigo-ink font-semibold">semantic hit</span></div>}{l.cost !== undefined && l.cost > 0 && <div><b>Cost:</b> ${l.cost} (est.) — cost routing {l.cost > 0 ? "active" : "off"}</div>}<pre className="bg-surface border border-line rounded-lg p-3 max-h-32 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-all">{l.error || "—"}</pre></div>
                          </div>
                          <div className="mt-3"><b className="text-xs">Raw JSON:</b><pre className="bg-codebg text-codetext rounded-xl p-4 font-mono text-xs overflow-auto max-h-48 mt-1">{JSON.stringify(l, null, 2)}</pre></div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && <div className="p-8 text-center text-sm text-mutedtxt">{t("logs.no_logs")}</div>}
        {moreCount > 0 && (
          <div className="px-4 py-3 text-center text-xs font-mono text-mutedtxt bg-raised border-t border-line/80">
            ... + {moreCount} more
          </div>
        )}
      </div>
    </div>
  );
}
