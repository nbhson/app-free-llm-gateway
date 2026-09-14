/** Shared frontend API shapes — mirrors apps/gateway responses. */

export interface ApiHealth {
  id?: string;
  status?: string;
  http_status?: number;
  error?: string;
  message?: string;
  latency_ms?: number;
  [key: string]: unknown;
}

export interface ApiModel {
  id: string;
  owned_by?: string;
  provider?: string;
  display_name?: string;
  context_length?: number;
  score?: number;
  live_status?: string;
  capabilities?: unknown;
  limit?: unknown;
  health?: ApiHealth;
  persisted_404?: boolean;
  [key: string]: unknown;
}

export interface ApiProvider {
  id: string;
  name?: string;
  tier?: string;
  tier_type?: string;
  caps?: string[];
  noCard?: boolean;
  baseUrl?: string;
  free_models?: number;
  total_models?: number;
  keys?: string;
  hasRealKey?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface ApiLog {
  id: string;
  provider: string;
  model: string;
  timestamp?: string;
  virtualKeyName?: string;
  virtualKeyId?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  status?: number;
  latencyMs?: number;
  error?: string;
  verifiedStatus?: string;
  // Vector 2 extensions
  cost?: number;
  cacheHit?: boolean;
  semanticHit?: boolean;
  compressedTokens?: number;
  compressionRatio?: number;
  _expanded?: boolean;
  [key: string]: unknown;
}

export interface VirtualKeyView {
  id: string;
  name?: string;
  role?: string;
  scopes?: unknown;
  rpmLimit?: number;
  requestCount?: number;
  key?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface GatewayStats {
  providers?: number;
  free_models?: number;
  freellms_providers?: number;
  requests?: number;
  flags?: { semanticCache?: boolean; compression?: boolean; costRouting?: boolean };
  logs?: {
    total?: number;
    requests?: number;
    avgLatencyMs?: number;
    errorRate?: number;
    byProvider?: Record<string, number>;
    tokensByProvider?: Record<string, number>;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    avgTokens?: number;
    allTimeTokens?: number;
    totalCost?: number;
    cacheHitRate?: number;
    compressedSavedTokens?: number;
  };
  [key: string]: unknown;
}

export interface VerifySummary {
  total_verified_free: number;
  total_freellms_free: number;
  total_deprecated: number;
  total_unverified_no_key: number;
  [key: string]: unknown;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
