import { Network, Sparkles } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import type { ApiLog, ApiProvider } from "../../../lib/api-types.ts";
import type { SyncInfo } from "../types";
import { ProviderTopology } from "./ProviderTopology";

type TopologyCardProps = {
  syncInfo: SyncInfo | null;
  topologyProviders: ApiProvider[];
  sortedCount: number;
  usableCount: number;
  totalCount: number;
  newestProviders: string[];
  activeProvider: string | null;
  logs: ApiLog[];
};

export function TopologyCard({ syncInfo, topologyProviders, sortedCount, usableCount, totalCount, newestProviders, activeProvider, logs }: TopologyCardProps) {
  const { t } = useLang();
  return (
    <div className="bg-surface rounded-xl border border-line/90 shadow-2xs overflow-hidden">
      <div className="px-5 py-3.5 border-b border-linesoft bg-raised/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs"><Network className="w-4 h-4" /></div>
          <div>
            <h2 className="text-sm font-bold text-heading">{t("usage.topology_title") || "Provider Topology"}</h2>
            <p className="text-[11px] text-mutedtxt font-medium">{t("usage.topology_desc") || "App in center • green line = active provider • animation on active"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> {t("usage.has_key") || "Has key"}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-500 inline-block" /> {t("usage.public") || "No key needed"}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block" style={{ width: 16 }} /> active</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-strong inline-block" style={{ width: 16 }} /> idle</span>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {syncInfo?.lastAdded?.length ? <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-violet-ink bg-violet-soft border border-violet-line px-3 py-1.5 rounded-full"><Sparkles className="w-3.5 h-3.5" /> NEW provider: {syncInfo.lastAdded.join(", ")} {syncInfo.lastAddedAt ? `• ${new Date(syncInfo.lastAddedAt).toLocaleString()}` : ""} {syncInfo.bootSync?.status ? `• bootSync: ${syncInfo.bootSync.status}` : ""}</div> : null}
        {topologyProviders.length === 0 ? (
          <p className="text-xs text-mutedtxt text-center py-12">{t("dashboard.no_data")}</p>
        ) : (
          <ProviderTopology providers={topologyProviders} activeProvider={activeProvider} newestProviders={newestProviders} logs={logs} />
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
          <span className="text-mutedtxt">Showing {topologyProviders.length} providers ({usableCount} usable) • total {totalCount}</span>
          {topologyProviders.length < sortedCount && <span className="text-amber-ink">• showing top 16</span>}
          {newestProviders.length > 0 && <span className="text-violet-ink">• newest: {newestProviders.join(", ")}</span>}
        </div>
      </div>
    </div>
  );
}
