import { Globe, Search, Timer, FileJson, Activity, Clock } from "lucide-react";
import { useLang } from "../../../../lib/i18n.tsx";
import { HelpTip } from "../HelpTip";
import { Toggle } from "../Toggle";
import { Section } from "../Section";
import type { SettingsState } from "../../types";

type WebToolsSectionProps = {
  form: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
  isModified: (key: keyof SettingsState) => boolean;
  onResetSection: () => void;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
};

export function WebToolsSection({ form, update, isModified, onResetSection, search, collapsed, onToggle }: WebToolsSectionProps) {
  const { t } = useLang();
  return (
    <Section id="webtools" title="Web Tools" icon={<Globe className="w-4 h-4" />} desc="Gateway-hosted web_search + web_fetch" keywords="web tools search fetch tavily" search={search} collapsed={collapsed} onToggle={onToggle} onResetSection={onResetSection}>
      <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("WEB_TOOLS_ENABLED") ? "border-amber-line bg-amber-soft/50" : "border-linesoft bg-raised/50"}`}>
        <div>
          <div className="text-sm font-semibold text-title flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-mutedtxt" /> WEB_TOOLS_ENABLED <HelpTip text={t("settings.webToolsEnabledTip")} /> {isModified("WEB_TOOLS_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
          </div>
          <div className="text-xs text-mutedtxt">Enable gateway web_search/web_fetch loop</div>
        </div>
        <Toggle checked={!!form.WEB_TOOLS_ENABLED} onChange={(v) => update({ WEB_TOOLS_ENABLED: v ? 1 : 0 })} label="WEB_TOOLS_ENABLED" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`${isModified("WEB_SEARCH_PROVIDER") ? "border-amber-line" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Search className="w-3 h-3 text-mutedtxt" /> WEB_SEARCH_PROVIDER <HelpTip text={t("settings.webSearchProviderTip")} /></label>
          <select value={form.WEB_SEARCH_PROVIDER} onChange={(e) => update({ WEB_SEARCH_PROVIDER: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm bg-surface" aria-label="WEB_SEARCH_PROVIDER">
            <option value="tavily">tavily</option>
            <option value="brave">brave</option>
            <option value="serper">serper</option>
            <option value="jina">jina</option>
          </select>
        </div>
        <div className={`${isModified("WEB_FETCH_TIMEOUT_MS") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Timer className="w-3 h-3 text-mutedtxt" /> FETCH_TIMEOUT_MS (1k..30k) <HelpTip text={t("settings.webFetchTimeoutTip")} /></label>
          <input type="number" min={1000} max={30000} value={form.WEB_FETCH_TIMEOUT_MS} onChange={(e) => update({ WEB_FETCH_TIMEOUT_MS: parseInt(e.target.value) || 8000 })} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm font-mono" aria-label="WEB_FETCH_TIMEOUT_MS" />
        </div>
        <div className="border border-line rounded-lg p-3">
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><FileJson className="w-3 h-3 text-mutedtxt" /> FETCH_MAX_BYTES (1k..2M) <HelpTip text={t("settings.webFetchMaxBytesTip")} /></label>
          <input type="number" min={1000} max={2000000} value={form.WEB_FETCH_MAX_BYTES} onChange={(e) => update({ WEB_FETCH_MAX_BYTES: parseInt(e.target.value) || 500000 })} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm font-mono" aria-label="WEB_FETCH_MAX_BYTES" />
        </div>
        <div className="border border-line rounded-lg p-3">
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Search className="w-3 h-3 text-mutedtxt" /> SEARCH_MAX_RESULTS (1..10) <HelpTip text={t("settings.webSearchMaxResultsTip")} /></label>
          <input type="range" min={1} max={10} value={form.WEB_SEARCH_MAX_RESULTS} onChange={(e) => update({ WEB_SEARCH_MAX_RESULTS: parseInt(e.target.value) || 5 })} className="w-full accent-amber-500 mt-2" aria-label="WEB_SEARCH_MAX_RESULTS" />
          <div className="text-xs font-mono text-center bg-muted rounded py-0.5 mt-1">{form.WEB_SEARCH_MAX_RESULTS}</div>
        </div>
        <div className="border border-line rounded-lg p-3">
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Activity className="w-3 h-3 text-mutedtxt" /> MAX_ITERATIONS (1..5) <HelpTip text={t("settings.webMaxIterationsTip")} /></label>
          <input type="range" min={1} max={5} value={form.WEB_TOOLS_MAX_ITERATIONS} onChange={(e) => update({ WEB_TOOLS_MAX_ITERATIONS: parseInt(e.target.value) || 3 })} className="w-full accent-amber-500 mt-2" aria-label="WEB_TOOLS_MAX_ITERATIONS" />
          <div className="text-xs font-mono text-center bg-muted rounded py-0.5 mt-1">{form.WEB_TOOLS_MAX_ITERATIONS}</div>
        </div>
        <div className="border border-line rounded-lg p-3">
          <label className="text-xs font-semibold text-body flex items-center gap-1.5"><Clock className="w-3 h-3 text-mutedtxt" /> WEB_CACHE_TTL_S (60..86400) <HelpTip text={t("settings.webCacheTtlTip")} /></label>
          <input type="number" min={60} max={86400} value={form.WEB_CACHE_TTL_S} onChange={(e) => update({ WEB_CACHE_TTL_S: parseInt(e.target.value) || 3600 })} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm font-mono" aria-label="WEB_CACHE_TTL_S" />
        </div>
      </div>
    </Section>
  );
}
