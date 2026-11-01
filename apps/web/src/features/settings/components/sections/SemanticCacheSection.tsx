import { Database, Gauge, Clock, SlidersHorizontal, Cpu, Blocks, Search, Layers } from "lucide-react";
import { useLang } from "../../../../lib/i18n.tsx";
import { HelpTip } from "../HelpTip";
import { Toggle } from "../Toggle";
import { Section } from "../Section";
import type { CheckStatus, SettingsState } from "../../types";

type SemanticCacheSectionProps = {
  form: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
  isModified: (key: keyof SettingsState) => boolean;
  onResetSection: () => void;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  embStatus: CheckStatus;
  setEmbStatus: (s: CheckStatus) => void;
  fallbackStatuses: Record<string, CheckStatus>;
  setFallbackStatuses: (s: Record<string, CheckStatus>) => void;
  checkPrimary: () => void;
  checkFallbacks: () => void;
};

export function SemanticCacheSection({ form, update, isModified, onResetSection, search, collapsed, onToggle, embStatus, setEmbStatus, fallbackStatuses, setFallbackStatuses, checkPrimary, checkFallbacks }: SemanticCacheSectionProps) {
  const { t } = useLang();
  return (
    <Section id="semantic" title={t("settings.semanticCache") || "Semantic Cache"} icon={<Layers className="w-4 h-4" />} desc={t("settings.enabledOnlyIf") as string} keywords="semantic cache threshold ttl embedding" search={search} collapsed={collapsed} onToggle={onToggle} onResetSection={onResetSection}>
      <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("SEMANTIC_CACHE_ENABLED") ? "border-amber-line bg-amber-soft/50" : "border-transparent"}`}>
        <div>
          <div className="text-sm font-semibold text-title flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.semanticEnabled")} <HelpTip text={t("settings.semanticEnabledTip")} /> {isModified("SEMANTIC_CACHE_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" aria-label="modified" />}
          </div>
          <div className="text-xs text-mutedtxt">{t("settings.semanticEnabledDesc")}</div>
        </div>
        <Toggle checked={!!form.SEMANTIC_CACHE_ENABLED} onChange={(v) => update({ SEMANTIC_CACHE_ENABLED: v ? 1 : 0 })} label="SEMANTIC_CACHE_ENABLED" />
      </div>

      <div className={`p-3 rounded-lg border ${isModified("SEMANTIC_THRESHOLD") ? "border-amber-line bg-amber-soft/30" : "border-linesoft bg-raised/50"}`}>
        <label className="text-xs font-semibold text-body flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.threshold")} <span className="font-normal text-mutedtxt">(0.0-1.0)</span> <HelpTip text={t("settings.thresholdTip")} />
          {isModified("SEMANTIC_THRESHOLD") && <span className="px-1.5 py-0.5 rounded bg-amber-wash text-amber-ink text-[10px]">modified</span>}
        </label>
        <div className="flex items-center gap-3 mt-2">
          <input type="range" min={0.7} max={0.99} step={0.01} value={form.SEMANTIC_THRESHOLD} onChange={(e) => update({ SEMANTIC_THRESHOLD: parseFloat(e.target.value) || 0.92 })} className="flex-1 accent-amber-500" aria-label="SEMANTIC_THRESHOLD slider" />
          <input type="number" step="0.01" min={0} max={1} value={form.SEMANTIC_THRESHOLD} onChange={(e) => update({ SEMANTIC_THRESHOLD: parseFloat(e.target.value) || 0 })} className="w-20 rounded-lg border border-line px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" aria-label="SEMANTIC_THRESHOLD input" />
        </div>
        <p className="text-xs text-mutedtxt mt-1">{t("settings.thresholdDesc")} • Recommended 0.92 <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" title="recommended" /></p>
      </div>

      <div className={`${isModified("CACHE_TTL_S") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
        <label className="text-xs font-semibold text-body flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.ttl")} <HelpTip text={t("settings.ttlTip")} /> {isModified("CACHE_TTL_S") && <span className="px-1.5 py-0.5 rounded bg-amber-wash text-amber-ink text-[10px]">modified</span>}
        </label>
        <input type="number" min={60} max={604800} value={form.CACHE_TTL_S} onChange={(e) => update({ CACHE_TTL_S: parseInt(e.target.value) || 3600 })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" aria-label="CACHE_TTL_S" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[{ label: "1h", v: 3600 }, { label: "6h", v: 21600 }, { label: "24h", v: 86400 }, { label: "7d", v: 604800 }].map((p) => (
            <button key={p.label} type="button" onClick={() => update({ CACHE_TTL_S: p.v })} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${form.CACHE_TTL_S === p.v ? "bg-amber-500 text-white border-amber-500" : "bg-surface border-line hover:bg-raised"}`} aria-pressed={form.CACHE_TTL_S === p.v}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-mutedtxt mt-1">{t("settings.ttlDesc")} • cap 7d</p>
      </div>

      <div className={`border rounded-lg p-3 ${isModified("SEMANTIC_CACHE_MAX_MEM") || isModified("SEMANTIC_CACHE_SCAN_CAP") ? "border-amber-line bg-amber-soft/20" : "border-linesoft bg-raised/30"}`}>
        <div className="text-xs font-bold text-body mb-2 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced Cache <HelpTip text={t("settings.advancedCacheTip")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Database className="w-3 h-3 text-mutedtxt" /> MAX_MEM (100..10000) <HelpTip text={t("settings.maxMemTip")} /></label>
            <input type="number" min={100} max={10000} value={form.SEMANTIC_CACHE_MAX_MEM} onChange={(e) => update({ SEMANTIC_CACHE_MAX_MEM: parseInt(e.target.value) || 1000 })} className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-mono ${isModified("SEMANTIC_CACHE_MAX_MEM") ? "border-amber-line bg-amber-soft" : "border-line"}`} aria-label="SEMANTIC_CACHE_MAX_MEM" />
          </div>
          <div>
            <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Search className="w-3 h-3 text-mutedtxt" /> SCAN_CAP (10..1000) <HelpTip text={t("settings.scanCapTip")} /></label>
            <input type="number" min={10} max={1000} value={form.SEMANTIC_CACHE_SCAN_CAP} onChange={(e) => update({ SEMANTIC_CACHE_SCAN_CAP: parseInt(e.target.value) || 200 })} className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-mono ${isModified("SEMANTIC_CACHE_SCAN_CAP") ? "border-amber-line bg-amber-soft" : "border-line"}`} aria-label="SEMANTIC_CACHE_SCAN_CAP" />
          </div>
        </div>
      </div>

      <div className={`${isModified("EMBEDDING_MODEL") ? "border-amber-line" : "border-line"} border rounded-lg p-3`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-body flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.embeddingModel")} <HelpTip text={t("settings.embeddingModelTip")} /> {isModified("EMBEDDING_MODEL") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
          </label>
          <button type="button" onClick={checkPrimary} disabled={embStatus === "checking"} className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${embStatus === "ok" ? "bg-emerald-soft border-emerald-line text-emerald-ink" : embStatus === "error" ? "bg-red-soft border-red-line text-red-ink" : "bg-surface border-line text-body hover:bg-raised"} ${embStatus === "checking" ? "opacity-70" : ""}`} aria-live="polite">
            {embStatus === "checking" ? (t("settings.checking") || "Checking...") : embStatus === "ok" ? "✓ OK" : embStatus === "error" ? "✗ Fail" : (t("settings.check") || "Check")}
          </button>
        </div>
        <input type="text" value={form.EMBEDDING_MODEL} onChange={(e) => { update({ EMBEDDING_MODEL: e.target.value }); setEmbStatus("idle"); }} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 ${embStatus === "ok" ? "border-green-500 ring-green-500 bg-green-soft/30" : embStatus === "error" ? "border-red-500 ring-red-500 bg-red-soft/30" : "border-line focus:ring-amber-500"}`} aria-label="EMBEDDING_MODEL" />
        <p className="text-xs text-mutedtxt mt-1">{t("settings.embeddingFallbackDesc")}</p>
      </div>

      <div className={`${isModified("EMBEDDING_FALLBACKS") ? "border-amber-line" : "border-line"} border rounded-lg p-3`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-body flex items-center gap-1.5">
            <Blocks className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.embeddingFallbacks")} <span className="font-normal text-mutedtxt">(comma-separated)</span> <HelpTip text={t("settings.embeddingFallbacksTip")} />
          </label>
          <button type="button" onClick={checkFallbacks} className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-surface border-line text-body hover:bg-raised">
            {Object.values(fallbackStatuses).some((v) => v === "checking") ? (t("settings.checking") || "Checking...") : (t("settings.check") || "Check")}
          </button>
        </div>
        <input type="text" value={form.EMBEDDING_FALLBACKS} onChange={(e) => { update({ EMBEDDING_FALLBACKS: e.target.value }); setFallbackStatuses({}); }} className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 ${Object.keys(fallbackStatuses).length > 0 && Object.values(fallbackStatuses).every((v) => v === "ok") ? "border-green-500 ring-green-500 bg-green-soft/30" : Object.values(fallbackStatuses).some((v) => v === "error") ? "border-red-500 ring-red-500 bg-red-soft/30" : "border-line focus:ring-amber-500"}`} placeholder="nvidia-nim/nvidia/nv-embed-v1,cloudflare-..." aria-label="EMBEDDING_FALLBACKS" />
        {Object.keys(fallbackStatuses).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2" role="status" aria-live="polite">
            {form.EMBEDDING_FALLBACKS.split(",").map((s) => s.trim()).filter(Boolean).map((m) => {
              const st = fallbackStatuses[m] || "idle";
              return (
                <span key={m} className={`px-2 py-0.5 rounded-full text-xs font-mono border ${st === "ok" ? "bg-green-soft border-green-line text-green-ink" : st === "error" ? "bg-red-soft border-red-line text-red-ink" : st === "checking" ? "bg-amber-soft border-amber-line text-amber-ink" : "bg-muted border-line text-secondary"}`}>
                  {m} {st === "ok" ? "✓" : st === "error" ? "✗" : st === "checking" ? "…" : ""}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}
