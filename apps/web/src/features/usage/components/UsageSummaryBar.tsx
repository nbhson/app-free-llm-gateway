import { Activity } from "lucide-react";
import type { GatewayStats } from "../../../lib/api-types.ts";

type UsageSummaryBarProps = {
  stats: GatewayStats | null;
  activeProvider: string | null;
};

export function UsageSummaryBar({ stats, activeProvider }: UsageSummaryBarProps) {
  return (
    <div className="px-5 py-3.5 bg-codesurface text-codetextbright rounded-xl shadow-xs border border-codeline flex flex-wrap justify-between gap-3 text-xs font-medium">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />{stats?.logs?.total ?? 0} requests</span>
        <span className="text-body">•</span><span className="text-mutedtxt">{stats?.logs?.allTimeTokens?.toLocaleString() ?? 0} tokens all-time</span>
        <span className="text-body">•</span><span className="font-mono font-bold text-emerald-400">{stats?.logs?.avgLatencyMs ?? 0}ms avg</span>
        <span className="text-body">•</span><span>{Math.round((stats?.logs?.errorRate || 0) * 100)}% err</span>
        {activeProvider && <><span className="text-body">•</span><span className="inline-flex items-center gap-1.5 font-mono text-emerald-300"><Activity className="w-3 h-3" />{activeProvider}</span></>}
      </div>
      <span className="text-sky-300 font-mono">{Object.keys(stats?.logs?.byProvider || {}).length} providers</span>
    </div>
  );
}
