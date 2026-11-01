import { useUsageData } from "../features/usage/hooks/useUsageData";
import { UsageHeader } from "../features/usage/components/UsageHeader";
import { UsageSummaryBar } from "../features/usage/components/UsageSummaryBar";
import { TopologyCard } from "../features/usage/components/TopologyCard";
import { UsageCharts } from "../features/usage/components/UsageCharts";

export default function Usage() {
  const {
    stats, logs, providers, activeProvider, live, setLive, newestProviders, syncInfo, refreshing,
    usableProviders, sortedProviders, topologyProviders,
    handleRefresh,
  } = useUsageData();

  return (
    <div className="space-y-6 pb-12">
      <UsageHeader refreshing={refreshing} live={live} onRefresh={handleRefresh} onToggleLive={() => setLive(!live)} />

      {/* Summary bar */}
      <UsageSummaryBar stats={stats} activeProvider={activeProvider} />

      {/* Topology Chart */}
      <TopologyCard
        syncInfo={syncInfo}
        topologyProviders={topologyProviders}
        sortedCount={sortedProviders.length}
        usableCount={usableProviders.length}
        totalCount={providers.length}
        newestProviders={newestProviders}
        activeProvider={activeProvider}
        logs={logs}
      />

      {/* Charts moved from Logs */}
      <UsageCharts stats={stats} />
    </div>
  );
}
