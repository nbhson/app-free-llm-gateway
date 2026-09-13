import React from "react";
import { useLang } from "../lib/i18n.tsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";
import { Trophy, Zap, Clock, Gauge, DollarSign, Activity, Download, Copy, RefreshCw, Play, ChevronDown, Star, Search, X, Square, AlertTriangle, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { mean, medianSorted, quantileSorted, standardDeviation } from "simple-statistics";

const STORAGE_MODELS = "benchmarkModels";
const STORAGE_HISTORY = "benchmarkHistory";
const MODELS_LIMIT = 1000;

const PRESETS = [
  { key: "preset_hello", prompt: "Say hello in one sentence." },
  { key: "preset_haiku", prompt: "Write a haiku about autumn wind." },
  { key: "preset_explain", prompt: "Explain quantum computing in 100 words for a 10-year-old. Be concise." },
  { key: "preset_code", prompt: "Write a Python function to find the longest palindromic substring. Include tests and complexity." },
  { key: "preset_reasoning", prompt: "A train leaves Hanoi at 60km/h and another leaves Saigon at 80km/h, distance 1600km. When do they meet? Show steps." },
  { key: "preset_long", prompt: "Write a 400-word essay on why open-source LLMs matter. Include 3 arguments, examples, and conclusion." },
];

type RawResult = { model: string; provider: string; ok: boolean; content: string; error: string | null; latencyMs: number; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null };

type Agg = {
  model: string;
  provider: string;
  runs: RawResult[];
  okCount: number;
  failCount: number;
  successRate: number;
  avgLatency: number;
  medianLatency: number;
  minLatency: number;
  maxLatency: number;
  p50: number;
  p95: number;
  stdDev: number;
  avgTokens: number;
  avgTps: number; // tokens/sec — mean of per-run tps (best-practice)
  avgCost: number;
  lastContent: string;
};

// ---------- Best-practice cost model ----------
// Free-tier providers have 0 cost; others use public per-1M completion pricing (approx, for relative comparison)
// Source: provider pricing pages (groq, openrouter, together, fireworks, deepseek, anthropic ballpark)
// We keep it transparent: estimate only, not billing.
const FREE_PROVIDERS = new Set(["pollinations", "llm7-io", "ollama-cloud", "free-llm-gateway"]);
function estimateCost(provider: string, tokens: number, modelId?: string): number {
  if (FREE_PROVIDERS.has(provider)) return 0;
  // model-specific overrides (cheap vs flagship)
  const modelKey = (modelId || "").toLowerCase();
  if (modelKey.includes("llama-3.1-8b") || modelKey.includes("gemma-2-9b")) return (tokens / 1_000_000) * 0.05;
  if (modelKey.includes("llama-3.3-70b") || modelKey.includes("70b")) return (tokens / 1_000_000) * 0.59;
  if (modelKey.includes("gpt-4o") || modelKey.includes("claude-3.5")) return (tokens / 1_000_000) * 5.0;
  const costs: Record<string, number> = {
    groq: 0.59, // llama-70b ballpark
    openrouter: 0.5,
    together: 0.6,
    fireworks: 0.5,
    deepseek: 0.14,
    anthropic: 3.0,
    openai: 2.5,
    google: 0.5,
    nvidia: 0.3,
    kilo: 0.2,
    "kilo-code": 0.2,
  };
  const per1M = costs[provider] ?? 0.3;
  return (tokens / 1_000_000) * per1M;
}

// ---------- Statistics via simple-statistics (externally vetted, best-practice) ----------
// Uses: mean, medianSorted, quantileSorted (linear interpolation), standardDeviation
// Replaces hand-rolled percentile to avoid off-by-one and variance bias.

function aggregate(resultsByRun: RawResult[][]): Agg[] {
  const byModel = new Map<string, RawResult[]>();
  for (const run of resultsByRun) for (const r of run) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }
  const aggs: Agg[] = [];
  for (const [model, runs] of byModel) {
    const oks = runs.filter((r) => r.ok);
    // latency: use only successful non-zero latencies for stats (failures distort avg)
    const latOk = oks.map((r) => r.latencyMs).filter((n) => n > 0).sort((a, b) => a - b);
    const latsAll = runs.map((r) => r.latencyMs).filter((n) => n > 0).sort((a, b) => a - b);
    const lats = latOk.length ? latOk : latsAll;
    const tokensArr = runs.map((r) => r.usage?.completion_tokens ?? Math.ceil((r.content?.length || 0) / 4));
    // per-run tps then average (more accurate than avgTokens/avgLatency)
    const tpsArr = runs.map((r, i) => {
      const tok = tokensArr[i] ?? 0;
      const ms = r.latencyMs || 0;
      if (!r.ok || ms <= 0 || tok <= 0) return 0;
      return tok / (ms / 1000);
    }).filter((v) => v > 0);
    const avgLatency = lats.length ? Math.round(mean(lats)) : 0;
    const medianLatency = lats.length ? Math.round(medianSorted(lats)) : 0;
    const p50 = medianLatency;
    const p95 = lats.length ? Math.round(quantileSorted(lats, 0.95)) : 0;
    const avgTokens = tokensArr.length ? Math.round(mean(tokensArr)) : 0;
    const avgTps = tpsArr.length ? Math.round(mean(tpsArr) * 10) / 10 : 0;
    // population stdDev of latency (simple-statistics uses sample by default, use population for benchmark stability)
    const stdDev = lats.length >= 2 ? Math.round(standardDeviation(lats)) : 0;
    const provider = runs[0]?.provider || model.split("/")[0];
    const avgCost = estimateCost(provider, avgTokens, model);
    aggs.push({
      model,
      provider,
      runs,
      okCount: oks.length,
      failCount: runs.length - oks.length,
      successRate: runs.length ? oks.length / runs.length : 0,
      avgLatency,
      medianLatency,
      minLatency: lats.length ? Math.min(...lats) : 0,
      maxLatency: lats.length ? Math.max(...lats) : 0,
      p50,
      p95,
      stdDev,
      avgTokens,
      avgTps,
      avgCost,
      lastContent: oks[oks.length - 1]?.content || runs[runs.length - 1]?.content || "",
    });
  }
  // Rank: successRate desc primary, then avgLatency asc, then p95 asc as tie-breaker
  aggs.sort((a, b) => {
    if (a.successRate !== b.successRate) return b.successRate - a.successRate;
    if (a.avgLatency !== b.avgLatency) return a.avgLatency - b.avgLatency;
    return a.p95 - b.p95;
  });
  return aggs;
}

function getMasterKey(): string {
  try { return localStorage.getItem("masterKey") || ""; } catch { return ""; }
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function Benchmark() {
  const { t } = useLang();
  const [prompt, setPrompt] = React.useState(PRESETS[2].prompt);
  const [models, setModels] = React.useState<string[]>(() => {
    try {
      const v = localStorage.getItem(STORAGE_MODELS);
      return v ? JSON.parse(v) : ["free-llm-gateway/auto", "groq/llama-3.3-70b-versatile", "kilo-code/kilo-auto"];
    } catch {
      return ["free-llm-gateway/auto", "groq/llama-3.3-70b-versatile"];
    }
  });
  const [available, setAvailable] = React.useState<{ id: string; provider: string; hasKey?: boolean }[]>([]);
  const [q, setQ] = React.useState("");
  const [runs, setRuns] = React.useState(3);
  const [temperature, setTemperature] = React.useState(0.7);
  const [maxTokens, setMaxTokens] = React.useState(512);
  const [showAvail, setShowAvail] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState<string>("");
  const [rawByRun, setRawByRun] = React.useState<RawResult[][]>([]);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [abortCtrl, setAbortCtrl] = React.useState<AbortController | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [favorites, setFavorites] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("favoriteModels") || "[]");
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    localStorage.setItem(STORAGE_MODELS, JSON.stringify(models));
  }, [models]);

  // Fetch models with live masterKey (not stale closure)
  React.useEffect(() => {
    const key = getMasterKey();
    fetch(`/v1/models?limit=${MODELS_LIMIT}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.data || d.models || []).map((m: { id: string; provider?: string }) => ({ id: m.id, provider: m.provider || m.id.split("/")[0] })) as typeof available;
        if (list.length) setAvailable(list);
      })
      .catch(() => {});
    const onFav = () => {
      try { setFavorites(JSON.parse(localStorage.getItem("favoriteModels") || "[]")); } catch { /* ignore */ }
    };
    window.addEventListener("favorites-updated", onFav);
    window.addEventListener("storage", onFav);
    return () => {
      window.removeEventListener("favorites-updated", onFav);
      window.removeEventListener("storage", onFav);
    };
  }, []); // fetch once, not on masterKey to avoid spam; runBenchmark reads live key

  const filteredAvail = React.useMemo(() => {
    const s = q.toLowerCase();
    let list = available;
    if (s) list = list.filter((m) => m.id.toLowerCase().includes(s) || m.provider.toLowerCase().includes(s));
    const favSet = new Set(favorites);
    list = [...list].sort((a, b) => (favSet.has(b.id) ? 1 : 0) - (favSet.has(a.id) ? 1 : 0));
    return list.slice(0, 80);
  }, [available, q, favorites]);

  const aggs = React.useMemo(() => aggregate(rawByRun), [rawByRun]);
  const winner = aggs[0]?.model;

  const cancel = () => {
    abortCtrl?.abort();
    setLoading(false);
    setProgress("");
    setAbortCtrl(null);
  };

  const runBenchmark = async () => {
    if (!prompt.trim() || models.length < 2) return;
    const key = getMasterKey();
    if (!key) { setError("Missing MASTER_KEY in header — set it first"); return; }
    setError(null);
    setLoading(true);
    setRawByRun([]);
    setProgress(`0/${runs}`);
    const ctrl = new AbortController();
    setAbortCtrl(ctrl);
    const allRuns: RawResult[][] = [];
    for (let i = 0; i < runs; i++) {
      if (ctrl.signal.aborted) break;
      setProgress(`${i + 1}/${runs}`);
      try {
        const res = await fetch("/v1/chat/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ models, messages: [{ role: "user", content: prompt }], temperature, max_tokens: maxTokens }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
        }
        const data = (await res.json()) as { results: RawResult[]; totalLatencyMs?: number };
        // Server is authoritative for per-model latencyMs — do NOT fallback to client total which would inflate fast models
        const normalized = (data.results || []).map((r) => ({
          ...r,
          // keep server latencyMs; if missing/invalid, mark 0 and surface in UI
          latencyMs: typeof r.latencyMs === "number" && r.latencyMs > 0 ? r.latencyMs : 0,
        }));
        allRuns.push(normalized);
        setRawByRun([...allRuns]);
      } catch (e) {
        if ((e as Error).name === "AbortError") break;
        const fail = models.map((m) => ({ model: m, provider: m.split("/")[0], ok: false, content: "", error: String((e as Error).message || e), latencyMs: 0, usage: null } as RawResult));
        allRuns.push(fail);
        setRawByRun([...allRuns]);
        setError(String((e as Error).message || e));
      }
      if (i < runs - 1 && !ctrl.signal.aborted) await new Promise((r) => setTimeout(r, 400));
    }
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify({ at: new Date().toISOString(), prompt, models, temperature, maxTokens, aggs: aggregate(allRuns) }));
    } catch { /* ignore */ }
    setLoading(false);
    setProgress("");
    setAbortCtrl(null);
  };

  const exportCsv = () => {
    const header = "rank,model,provider,avgLatencyMs,median,p50,p95,min,max,stdDev,avgTokens,avgTps,successRate,avgCost,ok,fail\n";
    const rows = aggs.map((a, i) => [i + 1, csvEscape(a.model), csvEscape(a.provider), a.avgLatency, a.medianLatency, a.p50, a.p95, a.minLatency, a.maxLatency, a.stdDev, a.avgTokens, a.avgTps, a.successRate.toFixed(3), a.avgCost.toFixed(5), a.okCount, a.failCount].join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `benchmark-${new Date().toISOString().slice(0, 10)}-${Date.now()}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify({ prompt, models, runs, temperature, maxTokens, aggs, exportedAt: new Date().toISOString() }, null, 2));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Trophy className="w-6 h-6 text-amber-500" /> {t("benchmark.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("benchmark.subtitle")} • {runs} runs, avg/median/p95/stdDev, auto-rank.
            <code className="ml-1 px-1 py-0.5 bg-slate-100 rounded text-xs">POST /v1/chat/compare</code> (isolated, no cross-fallback).
          </p>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><Info className="w-3 h-3" /> Latency đo server-side per-model (ms), TPS = completion_tokens / latency, cost ước tính minh bạch (free=0).</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/metrics" target="_blank" className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> /metrics</a>
          <a href="/api/stats" target="_blank" className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50">/api/stats</a>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1 whitespace-pre-wrap break-words">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Config */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Gauge className="w-4 h-4 text-violet-600" /> {t("benchmark.config")}</div>

        {/* Model picker */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">{t("benchmark.models")} ({models.length}/5):</span>
            {models.map((m) => (
              <span key={m} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${m === winner ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                {favorites.includes(m) && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />} {m}
                <button onClick={() => setModels(models.filter((x) => x !== m))} className="ml-1 hover:text-rose-600"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button onClick={() => setShowAvail(!showAvail)} className="text-xs px-2.5 py-1 rounded-lg bg-slate-900 text-white inline-flex items-center gap-1">{showAvail ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />} {showAvail ? t("benchmark.close") : t("benchmark.add_model")}</button>
            <button onClick={() => setModels(["free-llm-gateway/auto", "groq/llama-3.3-70b-versatile", "kilo-code/kilo-auto"])} className="text-xs px-2 py-1 border rounded-lg bg-white">{t("benchmark.reset")}</button>
          </div>
          {showAvail && (
            <div className="border rounded-xl p-3 bg-slate-50/50 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("benchmark.filter_placeholder")} className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-white" />
                </div>
                <span className="text-xs text-slate-500 py-2">{filteredAvail.length}/{available.length} models</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[220px] overflow-auto pr-1">
                {filteredAvail.map((m) => {
                  const sel = models.includes(m.id);
                  const fav = favorites.includes(m.id);
                  return (
                    <button key={m.id} disabled={sel || models.length >= 5} onClick={() => setModels([...models, m.id].slice(0, 5))} className={`text-left px-2.5 py-2 rounded-lg border text-xs flex items-center justify-between ${sel ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white hover:bg-slate-50 border-slate-200"}`}>
                      <span className="truncate flex items-center gap-1.5">{fav && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}{m.id}</span>
                      <span className="text-[11px] text-slate-400 ml-2">{m.provider}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="text-[11px] text-slate-500">{t("benchmark.tip")}</div>
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => setPrompt(p.prompt)} className={`text-xs px-2.5 py-1 rounded-full border ${prompt === p.prompt ? "bg-violet-600 text-white border-violet-600" : "bg-white hover:bg-slate-50 border-slate-200"}`}>{t(`benchmark.${p.key}`)}</button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("benchmark.prompt_placeholder")} className="w-full border rounded-xl p-3 text-sm min-h-[96px] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5">{t("benchmark.runs")}: <input type="range" min={1} max={5} value={runs} onChange={(e) => setRuns(parseInt(e.target.value))} className="w-24" /> <span className="font-mono font-bold w-6">{runs}</span><span className="text-slate-400"> (avg/median/p95)</span></label>
            <label className="inline-flex items-center gap-1.5">{t("benchmark.temp")}: <input type="range" min={0} max={1} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-24" /> <span className="font-mono w-8">{temperature}</span></label>
            <label className="inline-flex items-center gap-1.5">max_tokens: <input type="range" min={32} max={2048} step={32} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value))} className="w-24" /> <span className="font-mono w-12">{maxTokens}</span></label>
            <span className="text-slate-400">• {prompt.length} {t("benchmark.chars")} • {t("benchmark.tokens_est")} {Math.ceil(prompt.length / 4)} tokens</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          {!loading ? (
            <button onClick={runBenchmark} disabled={!prompt.trim() || models.length < 2} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold shadow hover:bg-black disabled:opacity-50">
              <Play className="w-4 h-4 fill-white" /> {`${t("benchmark.run")} (${models.length} models × ${runs} runs)`}
            </button>
          ) : (
            <button onClick={cancel} className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold shadow hover:bg-rose-700">
              <Square className="w-4 h-4 fill-white" /> Cancel ({progress})
            </button>
          )}
          {loading && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t("benchmark.running")} {progress}...</span>}
          {aggs.length > 0 && !loading && (
            <>
              <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-xs font-medium hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> {t("benchmark.export_csv")}</button>
              <button onClick={copyJson} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-xs font-medium hover:bg-slate-50"><Copy className="w-3.5 h-3.5" /> {t("benchmark.copy_json")}</button>
              <button onClick={() => setRawByRun([])} className="text-xs px-3 py-2 rounded-lg border bg-white hover:bg-slate-50">{t("benchmark.clear")}</button>
            </>
          )}
          <span className="text-xs text-slate-500">{t("benchmark.isolated_note")}</span>
        </div>
      </div>

      {/* Leaderboard */}
      {aggs.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm"><Trophy className="w-4 h-4 text-amber-500" /> {t("benchmark.leaderboard")} — {runs} runs × {models.length} models • prompt {prompt.slice(0, 48)}…</div>
              <div className="text-xs text-slate-500">{t("benchmark.winner")}: <span className="font-mono font-bold text-amber-700">{winner}</span></div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs font-semibold text-slate-500 bg-slate-50/70">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Provider</th>
                    <th className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{t("benchmark.avg")}</span></th>
                    <th className="px-3 py-2 text-right">Median</th>
                    <th className="px-3 py-2 text-right">{t("benchmark.p95")}</th>
                    <th className="px-3 py-2 text-right">{t("benchmark.min_max")}</th>
                    <th className="px-3 py-2 text-right">σ</th>
                    <th className="px-3 py-2 text-right"><Gauge className="w-3 h-3 inline" /> {t("benchmark.tps")}</th>
                    <th className="px-3 py-2 text-right"><DollarSign className="w-3 h-3 inline" />{t("benchmark.cost")}</th>
                    <th className="px-3 py-2 text-center">{t("benchmark.success")}</th>
                    <th className="px-3 py-2 text-left">{t("benchmark.last_output")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aggs.map((a, i) => (
                    <tr key={a.model} className={`${i === 0 ? "bg-amber-50/60" : ""} hover:bg-slate-50/60`}>
                      <td className="px-3 py-2.5 font-bold">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs max-w-[220px] truncate" title={a.model}>{a.model} {i === 0 && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px]">{t("benchmark.winner")}</span>}</td>
                      <td className="px-3 py-2 text-xs"><span className="px-2 py-0.5 rounded-full bg-slate-100 border text-[11px]">{a.provider}</span></td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">{a.avgLatency || "—"} <span className="text-slate-400 font-normal">{a.avgLatency ? "ms" : ""}</span></td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{a.medianLatency ? `${a.medianLatency}ms` : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{a.p95 ? `${a.p95}ms` : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">{a.minLatency || "—"}/{a.maxLatency || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">{a.stdDev || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">{a.avgTps}<span className="text-slate-400 font-normal">/s</span></td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{a.avgCost === 0 ? <span className="text-emerald-600 font-bold">free</span> : `$${a.avgCost.toFixed(4)}`}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${a.successRate === 1 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : a.successRate >= 0.5 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                          {a.okCount}/{a.runs.length} • {Math.round(a.successRate * 100)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="text-xs text-slate-600 line-clamp-2">{a.lastContent ? a.lastContent.slice(0, 160) : <span className="text-rose-500">{a.runs.find((r) => !r.ok)?.error?.slice(0, 120) || "—"}</span>}</div>
                        <button onClick={() => setExpanded(expanded === a.model ? null : a.model)} className="text-[11px] text-violet-600 hover:underline inline-flex items-center gap-1 mt-1">{t("benchmark.detail")} <ChevronDown className={`w-3 h-3 transition ${expanded === a.model ? "rotate-180" : ""}`} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-slate-50 border-t text-[11px] text-slate-500 flex flex-wrap gap-3">
              <span>• Avg = mean latency (ok runs only)</span>
              <span>• Median/P95 = percentile with linear interpolation</span>
              <span>• σ = stdDev</span>
              <span>• TPS = mean(completion_tokens / latency) per ok run</span>
              <span>• Cost = (tokens/1M)*price, free providers = 0</span>
            </div>
          </div>

          {/* Expand detail */}
          {expanded && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">{t("benchmark.detail")} — {expanded}</h3>
                <button onClick={() => setExpanded(null)} className="text-xs px-2 py-1 border rounded-lg bg-white">{t("benchmark.close_detail")}</button>
              </div>
              {(() => {
                const a = aggs.find((x) => x.model === expanded);
                if (!a) return null;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-50 border"><div className="text-slate-500">{t("benchmark.avg_latency")}</div><div className="font-mono font-bold text-lg">{a.avgLatency || "—"}ms</div><div className="text-slate-400">median {a.medianLatency} / p95 {a.p95} / σ {a.stdDev}</div><div className="text-slate-400">min {a.minLatency} / max {a.maxLatency}</div></div>
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200"><div className="text-slate-500">{t("benchmark.throughput")}</div><div className="font-mono font-bold text-lg text-emerald-700">{a.avgTps} tok/s</div><div className="text-slate-400">{a.avgTokens} avg tokens • per-run TPS mean</div></div>
                      <div className="p-3 rounded-lg bg-violet-50 border border-violet-200"><div className="text-slate-500">{t("benchmark.cost_est")}</div><div className="font-mono font-bold text-lg">{a.avgCost === 0 ? <span className="text-emerald-600">free</span> : `$${a.avgCost.toFixed(4)}`}</div><div className="text-slate-400">per run • provider {a.provider} • est. only</div></div>
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><div className="text-slate-500">{t("benchmark.reliability")}</div><div className="font-mono font-bold text-lg">{Math.round(a.successRate * 100)}%</div><div className="text-slate-400">{a.okCount} ok / {a.failCount} fail • {a.runs.length} runs</div></div>
                    </div>
                    {a.runs.map((r, idx) => (
                      <div key={idx} className={`rounded-xl border p-3 ${r.ok ? "bg-white border-slate-200" : "bg-rose-50 border-rose-200"}`}>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-2">
                          <span>{t("benchmark.run_label")} #{idx + 1} • {r.provider} • {r.latencyMs ? `${r.latencyMs}ms` : "no timing"} • {r.usage?.completion_tokens ?? Math.ceil((r.content?.length || 0) / 4)} {t("benchmark.tokens_label")} • {r.ok ? t("benchmark.ok") : t("benchmark.fail")}</span>
                          <span className="text-slate-400">{r.usage ? `${r.usage.prompt_tokens ?? "?"}/${r.usage.completion_tokens ?? "?"}/${r.usage.total_tokens ?? "?"}` : "estimated"}</span>
                        </div>
                        {r.ok ? (
                          <div className="prose prose-sm max-w-none text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{r.content.slice(0, 4000)}</ReactMarkdown>{r.content.length > 4000 && <span className="text-xs text-slate-400">… truncated {r.content.length - 4000} chars</span>}</div>
                        ) : (
                          <div className="text-xs text-rose-700 whitespace-pre-wrap bg-white rounded-lg p-2 border border-rose-100">{r.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-blue-600" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("benchmark.latency_chart")}</h3></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aggs.map((a) => ({ name: a.model.split("/").pop() || a.model, latency: a.avgLatency, median: a.medianLatency, p95: a.p95 }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip />
                  <Bar dataKey="latency" fill="#2563eb" radius={[0, 4, 4, 0]} name="avg ms" />
                  <Bar dataKey="median" fill="#60a5fa" radius={[0, 4, 4, 0]} name="median ms" />
                  <Bar dataKey="p95" fill="#94a3b8" radius={[0, 4, 4, 0]} name="p95 ms" />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-[11px] text-slate-400 mt-1">P95 via linear interpolation — cần ≥3 runs để có ý nghĩa, 5 runs khuyến nghị.</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-emerald-600" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("benchmark.throughput_chart")}</h3></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aggs.map((a) => ({ name: a.model.split("/").pop() || a.model, tps: a.avgTps, tokens: a.avgTokens }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="tps" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="tok" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar yAxisId="tps" dataKey="tps" fill="#10b981" radius={[4, 4, 0, 0]} name="tok/s (mean per-run)" />
                  <Bar yAxisId="tok" dataKey="tokens" fill="#a7f3d0" radius={[4, 4, 0, 0]} name="avg tokens" />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-[11px] text-slate-400 mt-1">TPS = tokens / seconds per ok run, rồi mean — chính xác hơn avgTokens/avgLatency.</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-violet-600" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("benchmark.radar_title")}</h3></div>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={aggs.map((a) => {
                  const maxLat = Math.max(...aggs.map((x) => x.avgLatency), 1);
                  const maxTps = Math.max(...aggs.map((x) => x.avgTps), 1);
                  return { model: (a.model.split("/").pop() || a.model).slice(0, 12), latencyScore: Math.round((1 - a.avgLatency / maxLat) * 100), tpsScore: Math.round((a.avgTps / maxTps) * 100), success: Math.round(a.successRate * 100) };
                })}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="model" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="latency (invert)" dataKey="latencyScore" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} />
                  <Radar name="throughput" dataKey="tpsScore" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                  <Radar name="success" dataKey="success" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
              <div className="text-xs text-slate-500">{t("benchmark.radar_desc")}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><DollarSign className="w-4 h-4 text-amber-600" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("benchmark.cost_chart")}</h3></div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={aggs.map((a) => ({ name: (a.model.split("/").pop() || a.model).slice(0, 12), cost: Math.round(a.avgCost * 100000) / 100000, tokens: a.avgTokens }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="cost" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis yAxisId="tok" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: unknown, n: unknown) => String(n) === "cost ($)" ? `$${Number(v).toFixed(5)}` : String(v ?? "")} />
                  <Bar yAxisId="tok" dataKey="tokens" fill="#e9d5ff" radius={[4, 4, 0, 0]} name="avg tokens" />
                  <Bar yAxisId="cost" dataKey="cost" fill="#9333ea" radius={[4, 4, 0, 0]} name="cost ($)" />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-slate-500">{t("benchmark.cost_desc")} • free providers hiển thị 0.</div>
            </div>
          </div>

          {/* Raw prompt */}
          <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs">
            <div className="font-mono font-bold mb-2 opacity-80 flex items-center gap-2"><Zap className="w-3 h-3 text-amber-400" /> {t("benchmark.config_copy")}</div>
            <pre className="whitespace-pre-wrap break-words text-slate-300">POST /v1/chat/compare{"\n"}{JSON.stringify({ models, messages: [{ role: "user", content: prompt }], temperature, max_tokens: maxTokens, runs }, null, 2)}</pre>
          </div>
        </>
      )}

      {!aggs.length && !loading && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-3"><Trophy className="w-6 h-6 text-amber-600" /></div>
          <h3 className="font-bold text-slate-800">{t("benchmark.empty_title")}</h3>
          <p className="text-sm text-slate-500 mt-1">{t("benchmark.empty_desc").replace("{runs}", String(runs))}</p>
          <p className="text-xs text-slate-400 mt-2">{t("benchmark.empty_hint")}</p>
          <p className="text-[11px] text-slate-400 mt-3 flex items-center justify-center gap-1"><Info className="w-3 h-3" /> Server đo latency per-model, rank success → avgLatency → p95. Dùng ≥3 runs để median/p95 có ý nghĩa.</p>
        </div>
      )}
    </div>
  );
}
