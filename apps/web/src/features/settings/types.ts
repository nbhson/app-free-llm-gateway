export type SettingsState = {
  SEMANTIC_CACHE_ENABLED: number;
  SEMANTIC_THRESHOLD: number;
  CACHE_TTL_S: number;
  EMBEDDING_MODEL: string;
  EMBEDDING_FALLBACKS: string;
  SEMANTIC_CACHE_MAX_MEM: number;
  SEMANTIC_CACHE_SCAN_CAP: number;
  COMPRESSION_ENABLED: number;
  COMPRESSION_MAX_TOKENS: number;
  COST_ROUTING_ENABLED: number;
  COST_WEIGHT: number;
  LATENCY_WEIGHT: number;
  HEADROOM_WEIGHT: number;
  SUCCESS_WEIGHT: number;
  ANALYTICS_RETENTION_DAYS: number;
  PROVIDER_TIMEOUT_MS: number;
  PROVIDER_TIMEOUT_AUTO_MS: number;
  PROVIDER_TIMEOUT_REASONING_MS: number;
  PROVIDER_PARALLEL_AUTO: number;
  PROVIDER_PARALLEL_DEFAULT: number;
  CIRCUIT_BREAKER_THRESHOLD: number;
  CIRCUIT_BREAKER_COOLDOWN_MS: number;
  WEB_TOOLS_ENABLED: number;
  WEB_SEARCH_PROVIDER: string;
  WEB_FETCH_TIMEOUT_MS: number;
  WEB_FETCH_MAX_BYTES: number;
  WEB_SEARCH_MAX_RESULTS: number;
  WEB_TOOLS_MAX_ITERATIONS: number;
  WEB_CACHE_TTL_S: number;
  FALLBACK_TIERS: string; // JSON string
};

export type SettingsSource = ".env" | "localStorage";

export type CheckStatus = "idle" | "checking" | "ok" | "error";

export type CacheStats = {
  enabled?: boolean;
  hits?: number;
  misses?: number;
  hitRate?: number;
  size?: number;
  error?: string;
};
