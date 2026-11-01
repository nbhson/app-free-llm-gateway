import { BarChart3 } from "lucide-react";
import { useLang } from "../../../../lib/i18n.tsx";
import { HelpTip } from "../HelpTip";
import { Section } from "../Section";
import type { SettingsState } from "../../types";

type AnalyticsSectionProps = {
  form: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
  isModified: (key: keyof SettingsState) => boolean;
  onResetSection: () => void;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
};

export function AnalyticsSection({ form, update, isModified, onResetSection, search, collapsed, onToggle }: AnalyticsSectionProps) {
  const { t } = useLang();
  return (
    <Section id="analytics" title={t("settings.analytics") || "Analytics"} icon={<BarChart3 className="w-4 h-4" />} keywords="analytics retention" search={search} collapsed={collapsed} onToggle={onToggle} onResetSection={onResetSection}>
      <div className={`${isModified("ANALYTICS_RETENTION_DAYS") ? "border-amber-line bg-amber-soft/30" : "border-line"} border rounded-lg p-3`}>
        <label className="text-xs font-semibold text-body flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-mutedtxt" /> ANALYTICS_RETENTION_DAYS (1..365) <HelpTip text={t("settings.analyticsRetentionTip")} /></label>
        <input type="range" min={1} max={365} value={form.ANALYTICS_RETENTION_DAYS} onChange={(e) => update({ ANALYTICS_RETENTION_DAYS: parseInt(e.target.value) || 30 })} className="w-full accent-amber-500 mt-2" aria-label="ANALYTICS_RETENTION_DAYS" />
        <div className="flex justify-between text-xs text-mutedtxt font-mono">
          <span>1</span>
          <span className="font-bold text-title">{form.ANALYTICS_RETENTION_DAYS} days</span>
          <span>365</span>
        </div>
        <p className="text-xs text-mutedtxt mt-1">{t("settings.analyticsDesc")}</p>
      </div>
    </Section>
  );
}
