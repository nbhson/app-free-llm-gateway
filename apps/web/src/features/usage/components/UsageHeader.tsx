import { RefreshCw, Radio } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";

type UsageHeaderProps = {
  refreshing: boolean;
  live: boolean;
  onRefresh: () => void;
  onToggleLive: () => void;
};

export function UsageHeader({ refreshing, live, onRefresh, onToggleLive }: UsageHeaderProps) {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-heading">{t("usage.title") || "Usage"}</h1>
        <p className="text-sm text-mutedtxt mt-0.5">{t("usage.subtitle") || "Token analytics, request distribution and live provider topology."}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-surface border border-line hover:bg-raised shadow-2xs disabled:opacity-60">{refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{refreshing ? t("providers.syncing") : t("logs.refresh")}</button>
        <button onClick={onToggleLive} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold shadow-xs border ${live ? "bg-emerald-600 text-white border-emerald-600" : "bg-surface text-body border-line"}`}>{live ? <Radio className="w-3.5 h-3.5 animate-pulse" /> : null}{live ? t("logs.live_on") : t("logs.live_off")}</button>
      </div>
    </div>
  );
}
