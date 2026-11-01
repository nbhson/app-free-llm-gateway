import { Zap, Wrench, Gauge, Activity, SlidersHorizontal, FileJson, RefreshCw, Eye } from "lucide-react";
import { useLang } from "../../../../lib/i18n.tsx";
import { HelpTip } from "../HelpTip";
import { Toggle } from "../Toggle";
import { Section } from "../Section";
import type { SettingsState } from "../../types";

type RoutingSectionProps = {
  form: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
  isModified: (key: keyof SettingsState) => boolean;
  onResetSection: () => void;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  costPreview: string;
  previewInput: string;
  setPreviewInput: (v: string) => void;
  previewResult: Record<string, unknown> | null;
  previewLoading: boolean;
  previewError: string | null;
  onPreview: () => void;
};

export function RoutingSection({ form, update, isModified, onResetSection, search, collapsed, onToggle, costPreview, previewInput, setPreviewInput, previewResult, previewLoading, previewError, onPreview }: RoutingSectionProps) {
  const { t } = useLang();
  return (
    <Section id="routing" title={t("settings.compressionRouting") || "Compression & Routing"} icon={<Zap className="w-4 h-4" />} keywords="compression cost routing weight" search={search} collapsed={collapsed} onToggle={onToggle} onResetSection={onResetSection}>
      <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("COMPRESSION_ENABLED") ? "border-amber-line bg-amber-soft/50" : "border-linesoft bg-raised/50"}`}>
        <div>
          <div className="text-sm font-semibold text-title flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.compressionEnabled")} <HelpTip text={t("settings.compressionEnabledTip")} /> {isModified("COMPRESSION_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
          </div>
          <div className="text-xs text-mutedtxt">{t("settings.compressionDesc")}</div>
        </div>
        <Toggle checked={!!form.COMPRESSION_ENABLED} onChange={(v) => update({ COMPRESSION_ENABLED: v ? 1 : 0 })} label="COMPRESSION_ENABLED" />
      </div>

      <div className={`p-3 rounded-lg border ${isModified("COMPRESSION_MAX_TOKENS") ? "border-amber-line bg-amber-soft/30" : "border-line"}`}>
        <label className="text-xs font-semibold text-body flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5 text-mutedtxt" /> COMPRESSION_MAX_TOKENS (512..32000) <HelpTip text={t("settings.compressionMaxTokensTip")} /></span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded border">{form.COMPRESSION_MAX_TOKENS}</span>
        </label>
        <input type="range" min={512} max={32000} step={512} value={form.COMPRESSION_MAX_TOKENS} onChange={(e) => update({ COMPRESSION_MAX_TOKENS: parseInt(e.target.value) || 4096 })} className="w-full mt-2 accent-amber-500" aria-label="COMPRESSION_MAX_TOKENS" />
        <div className="flex justify-between text-[11px] text-mutedtxt">
          <span>512</span>
          <span>16k</span>
          <span>32k</span>
        </div>
      </div>

      <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("COST_ROUTING_ENABLED") ? "border-amber-line bg-amber-soft/50" : "border-linesoft bg-raised/50"}`}>
        <div>
          <div className="text-sm font-semibold text-title flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-mutedtxt" /> {t("settings.costEnabled")} <HelpTip text={t("settings.costEnabledTip")} /> {isModified("COST_ROUTING_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
          </div>
          <div className="text-xs text-mutedtxt">{t("settings.costDesc")}</div>
        </div>
        <Toggle checked={!!form.COST_ROUTING_ENABLED} onChange={(v) => update({ COST_ROUTING_ENABLED: v ? 1 : 0 })} label="COST_ROUTING_ENABLED" />
      </div>

      <div className="border border-line rounded-lg p-3 space-y-3 bg-raised/30">
        <div className="text-xs font-bold text-body">Cost Router Weights • <span className="font-mono font-normal text-mutedtxt">{costPreview}</span></div>
        {([
          { k: "COST_WEIGHT" as const, label: "COST_WEIGHT", min: 0, max: 10, step: 0.5, range: "0..10", tip: t("settings.costWeightTip") },
          { k: "LATENCY_WEIGHT" as const, label: "LATENCY_WEIGHT", min: 0, max: 0.005, step: 0.0001, range: "0..0.005", tip: t("settings.latencyWeightTip") },
          { k: "HEADROOM_WEIGHT" as const, label: "HEADROOM_WEIGHT", min: 0, max: 1, step: 0.05, range: "0..1", tip: t("settings.headroomWeightTip") },
          { k: "SUCCESS_WEIGHT" as const, label: "SUCCESS_WEIGHT", min: 0, max: 5, step: 0.5, range: "0..5", tip: t("settings.successWeightTip") },
        ] as const).map((w) => (
          <div key={w.k} className={`${isModified(w.k) ? "bg-amber-soft border-amber-line" : "bg-surface border-line"} border rounded-lg p-2.5`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-body flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-mutedtxt" /> {w.label} <span className="font-normal text-mutedtxt">({w.range})</span> <HelpTip text={w.tip} /> {isModified(w.k) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
              </label>
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded border">{form[w.k]}</span>
            </div>
            <input type="range" min={w.min} max={w.max} step={w.step} value={form[w.k]} onChange={(e) => update({ [w.k]: parseFloat(e.target.value) } as Partial<SettingsState>)} className="w-full mt-1 accent-amber-500" aria-label={w.label} />
          </div>
        ))}
      </div>

      <div className="border border-line rounded-lg p-3 space-y-2">
        <div className="text-xs font-bold text-body flex items-center gap-1.5">
          <FileJson className="w-3.5 h-3.5" /> Compression Preview • POST /api/compression/preview <span className="font-normal text-mutedtxt">(7 msgs sample triggers compression)</span>
        </div>
        <textarea value={previewInput} onChange={(e) => setPreviewInput(e.target.value)} rows={6} className="w-full rounded-lg border border-line px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder='[{"role":"user","content":"hello"}]' aria-label="Compression preview input" />
        {previewError && <div className="text-xs text-rose-ink bg-rose-soft border border-rose-line rounded px-2 py-1" role="alert">{previewError}</div>}
        <button type="button" onClick={onPreview} disabled={previewLoading} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-ink hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5">
          {previewLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Preview
        </button>
        {previewResult && (
          <pre className="text-xs font-mono bg-codesurface text-emerald-200 p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap break-all" role="status">
            {JSON.stringify(previewResult, null, 2)}
          </pre>
        )}
      </div>
    </Section>
  );
}
