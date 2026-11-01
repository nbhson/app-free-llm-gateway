import { ShieldAlert, Timer, Clock, Cpu, Server, Blocks, AlertTriangle } from "lucide-react";
import { useLang } from "../../../../lib/i18n.tsx";
import { HelpTip } from "../HelpTip";
import { Section } from "../Section";
import type { SettingsState } from "../../types";

type ReliabilitySectionProps = {
  form: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
  isModified: (key: keyof SettingsState) => boolean;
  onResetSection: () => void;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
};

export function ReliabilitySection({ form, update, isModified, onResetSection, search, collapsed, onToggle }: ReliabilitySectionProps) {
  const { t } = useLang();
  return (
    <Section id="reliability" title="Reliability & Timeouts" icon={<ShieldAlert className="w-4 h-4" />} desc="Provider timeout, parallel auto, circuit breaker" keywords="timeout parallel breaker" search={search} collapsed={collapsed} onToggle={onToggle} onResetSection={onResetSection}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`${isModified("PROVIDER_TIMEOUT_MS") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-mutedtxt" /> PROVIDER_TIMEOUT_MS (1k..120k) <HelpTip text={t("settings.providerTimeoutTip")} /></label>
          <input type="number" min={1000} max={120000} value={form.PROVIDER_TIMEOUT_MS} onChange={(e) => update({ PROVIDER_TIMEOUT_MS: parseInt(e.target.value) || 25000 })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" aria-label="PROVIDER_TIMEOUT_MS" />
        </div>
        <div className={`${isModified("PROVIDER_TIMEOUT_AUTO_MS") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-mutedtxt" /> PROVIDER_TIMEOUT_AUTO_MS (1k..30k) <span className="font-normal text-mutedtxt">rec ≥12k</span> <HelpTip text={t("settings.providerTimeoutAutoTip")} /></label>
          <input type="number" min={1000} max={30000} value={form.PROVIDER_TIMEOUT_AUTO_MS} onChange={(e) => update({ PROVIDER_TIMEOUT_AUTO_MS: parseInt(e.target.value) || 12000 })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" aria-label="PROVIDER_TIMEOUT_AUTO_MS" />
        </div>
        <div className={`${isModified("PROVIDER_TIMEOUT_REASONING_MS") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-mutedtxt" /> PROVIDER_TIMEOUT_REASONING_MS (1k..120k) <span className="font-normal text-amber-ink">rec ≥60k</span> <HelpTip text={t("settings.providerTimeoutReasoningTip")} /></label>
          <input type="number" min={1000} max={120000} value={form.PROVIDER_TIMEOUT_REASONING_MS} onChange={(e) => update({ PROVIDER_TIMEOUT_REASONING_MS: parseInt(e.target.value) || 60000 })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" aria-label="PROVIDER_TIMEOUT_REASONING_MS" />
        </div>
        <div className={`${isModified("PROVIDER_PARALLEL_AUTO") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-mutedtxt" /> PROVIDER_PARALLEL_AUTO (1..5) <HelpTip text={t("settings.parallelAutoTip")} /></label>
          <input type="range" min={1} max={5} value={form.PROVIDER_PARALLEL_AUTO} onChange={(e) => update({ PROVIDER_PARALLEL_AUTO: parseInt(e.target.value) || 3 })} className="w-full accent-amber-500 mt-2" aria-label="PROVIDER_PARALLEL_AUTO" />
          <div className="text-xs font-mono text-center bg-muted rounded py-0.5 mt-1">{form.PROVIDER_PARALLEL_AUTO}</div>
        </div>
        <div className={`${isModified("PROVIDER_PARALLEL_DEFAULT") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Blocks className="w-3.5 h-3.5 text-mutedtxt" /> PROVIDER_PARALLEL_DEFAULT (1..5) <HelpTip text={t("settings.parallelDefaultTip")} /></label>
          <input type="range" min={1} max={5} value={form.PROVIDER_PARALLEL_DEFAULT} onChange={(e) => update({ PROVIDER_PARALLEL_DEFAULT: parseInt(e.target.value) || 2 })} className="w-full accent-amber-500 mt-2" aria-label="PROVIDER_PARALLEL_DEFAULT" />
          <div className="text-xs font-mono text-center bg-muted rounded py-0.5 mt-1">{form.PROVIDER_PARALLEL_DEFAULT}</div>
        </div>
        <div className={`${isModified("CIRCUIT_BREAKER_THRESHOLD") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-mutedtxt" /> CIRCUIT_BREAKER_THRESHOLD (1..100) <span className="font-normal text-mutedtxt">rec 8</span> <HelpTip text={t("settings.breakerThresholdTip")} /></label>
          <input type="number" min={1} max={100} value={form.CIRCUIT_BREAKER_THRESHOLD} onChange={(e) => update({ CIRCUIT_BREAKER_THRESHOLD: parseInt(e.target.value) || 8 })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" aria-label="CIRCUIT_BREAKER_THRESHOLD" />
        </div>
        <div className={`sm:col-span-2 ${isModified("CIRCUIT_BREAKER_COOLDOWN_MS") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-mutedtxt" /> CIRCUIT_BREAKER_COOLDOWN_MS (1k..300k) <HelpTip text={t("settings.breakerCooldownTip")} /></label>
          <input type="number" min={1000} max={300000} value={form.CIRCUIT_BREAKER_COOLDOWN_MS} onChange={(e) => update({ CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(e.target.value) || 20000 })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" aria-label="CIRCUIT_BREAKER_COOLDOWN_MS" />
        </div>
      </div>
      {(form.PROVIDER_TIMEOUT_REASONING_MS < 50000 || form.PROVIDER_TIMEOUT_AUTO_MS < 10000) && (
        <div className="mt-3 flex gap-2 p-3 rounded-lg border bg-amber-soft border-amber-line text-xs text-amber-ink" role="alert">
          <AlertTriangle className="w-4 h-4 text-amber-ink shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Dễ 502 với context lớn</div>
            <p className="mt-1 leading-relaxed">Agnes 3.0 / reasoning với 130k tokens từng timeout 35s trong log. Khuyến nghị <span className="font-mono bg-surface px-1 rounded border">REASONING_MS ≥ 60000</span> + <span className="font-mono bg-surface px-1 rounded border">AUTO_MS ≥ 12000</span> và bật <span className="font-mono bg-surface px-1 rounded border">COMPRESSION_ENABLED</span> (8192 tokens).</p>
          </div>
        </div>
      )}
      {form.CIRCUIT_BREAKER_THRESHOLD <= 5 && (
        <div className="mt-2 flex gap-2 p-3 rounded-lg border bg-rose-soft border-rose-line text-xs text-rose-ink" role="alert">
          <ShieldAlert className="w-4 h-4 text-rose-ink shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Circuit breaker quá nhạy</div>
            <p className="mt-1">Threshold 5 + cooldown 30s khiến 5 timeout liên tiếp (như log agnes) mở breaker 30s → loạt 502 <span className="font-mono bg-surface px-1 rounded border">circuit open</span>. Đã nâng default lên 8 / 20s.</p>
          </div>
        </div>
      )}
      {!form.COMPRESSION_ENABLED && (
        <div className="mt-2 text-xs text-secondary bg-raised border border-line rounded-lg p-3">
          <span className="font-bold">Gợi ý:</span> Log gần đây có request 160k-220k tokens. Bật <span className="font-mono">COMPRESSION_ENABLED</span> để tự động <span className="font-mono">relevanceKeep + codeDedup</span> giảm prompt trước khi gửi upstream, giảm timeout đáng kể.
        </div>
      )}
    </Section>
  );
}
