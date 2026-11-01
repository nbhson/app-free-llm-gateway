import type { ApiProvider } from "../../lib/api-types.ts";

export interface ProvidersPayload {
  detailed?: ApiProvider[];
  count?: number;
}

export interface SyncInfo {
  lastAdded?: string[];
  lastAddedAt?: string | null;
  bootSync?: { status?: string };
}

export const CACHE_KEYS = {
  stats: "usageStatsCache",
  logs: "usageLogsCache",
  providers: "usageProvidersCache",
  newest: "usageNewestCache",
  sync: "usageSyncCache",
} as const;
