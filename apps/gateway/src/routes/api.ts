import { Hono } from "hono";
import { providerIds, providerMeta, providers } from "../providers/registry.js";
import { config } from "../config.js";
import { listVirtualKeys, createVirtualKey, deleteVirtualKey } from "../lib/virtual-keys.js";
import { getLogs, getStats, onLog } from "../lib/request-log.js";
import { getAllStates } from "../lib/circuit-breaker.js";
import { readDataJson, resolveDataPath } from "../lib/paths.js";
import { semanticCache } from "../lib/semantic-cache.js";
import { hasRealKey, isPublicProvider } from "../lib/provider-keys.js";
import { errMessage, type FreellmsModelEntry, type FreellmsProviderEntry } from "../lib/types.js";
import { getAdaptiveScores, getAdaptiveState } from "../lib/adaptive-router.js";
import { getByokForVk, setByokKeys } from "../lib/byok-store.js";
import { getStats as getRequestStats } from "../lib/request-log.js";
import fs from "node:fs";
import path from "node:path";

/** Health entry persisted in data/model-health.json. */
export interface ModelHealthEntry {
  status?: string;
  http_status?: number;
  error?: string;
  updated_at?: string;
  provider?: string;
  latency_ms?: number;
  [key: string]: unknown;
}

/** Provider health row for GET /api/providers/health. */
export interface ProviderHealthRow {
  id: string;
  status: string;
  keys?: number;
  latency_ms?: number;
  breaker?: string;
  failures?: number;
  error?: string;
}

function loadProvidersJson(): FreellmsProviderEntry[] {
  return readDataJson<FreellmsProviderEntry[]>("freellms-providers.json", []);
}

export const apiRoute = new Hono();

apiRoute.get("/sync/status", async (c) => {
  try {
    const { getFingerprintState, getNewestProviders } = await import("../jobs/boot-sync.js");
    const state = getFingerprintState();
    const live = readDataJson<{ total?: number; providers?: number; generated_at?: string | null; models?: unknown[] } | null>("live-models.json", null);
    const newest = getNewestProviders(5);
    return c.json({
      fingerprint: state,
      newestProviders: newest,
      lastAdded: state?.lastAdded || [],
      lastAddedAt: state?.lastAddedAt || null,
      bootSync: state?.bootSync || null,
      liveModels: live ? { total: live.total || 0, providers: live.providers || 0, generated_at: live.generated_at || null } : null,
      hasRealKeyCount: Object.values(state?.providers || {}).filter((v) => (v as { hasKey: boolean }).hasKey).length,
    });
  } catch (e) {
    return c.json({ error: errMessage(e) }, 500);
  }
});
apiRoute.post("/sync/boot", async (c) => {
  try {
    const { runBootSync } = await import("../jobs/boot-sync.js");
    const body = await c.req.json().catch(() => ({} as { force?: boolean }));
    const res = await runBootSync({ force: !!body.force, reason: body.force ? "manual_force" : "manual" });
    return c.json(res);
  } catch (e) {
    return c.json({ error: errMessage(e) }, 500);
  }
});

apiRoute.get("/providers", (c) => {
  const freellms = loadProvidersJson();
  const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
  const rawLimit = parseInt(c.req.query("limit") || c.req.query("per_page") || "25", 10);
  const limit = [25, 50, 100].includes(rawLimit) ? rawLimit : rawLimit > 50 ? 100 : 25;
  const q = (c.req.query("q") || "").toLowerCase();
  // Fallback free_models from freellms-models-free.json + models.yaml when freellms-providers.json is stale (b-ai/tokenharbor)
  const freeModelsArr = readDataJson<Array<{ slug?: string }>>("freellms-models-free.json", []);
  const countBySlug = new Map<string, number>();
  for (const m of freeModelsArr) if (m.slug) countBySlug.set(m.slug, (countBySlug.get(m.slug) || 0) + 1);
  try {
    // Prefer split models/ directory (per-provider files), fallback to legacy models.yaml
    let yamlText = "";
    const roots = [resolveDataPath(".."), resolveDataPath("."), path.resolve(".")];
    for (const root of roots) {
      try {
        const dir = path.join(root, "models");
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml"));
          yamlText = files.map((f) => fs.readFileSync(path.join(dir, f), "utf-8")).join("\n");
          if (yamlText) break;
        }
      } catch { /* ignore */ }
    }
    if (!yamlText) {
      const yamlCandidates = [resolveDataPath("../models.yaml"), resolveDataPath("models.yaml"), path.resolve("models.yaml")];
      for (const p of yamlCandidates) {
        try { if (fs.existsSync(p)) { yamlText = fs.readFileSync(p, "utf-8"); if (yamlText) break; } } catch { /* ignore */ }
      }
    }
    if (yamlText) {
      const providerCounts = new Map<string, number>();
      for (const m of yamlText.matchAll(/provider:\s*([^\n]+)/g)) {
        const s = m[1].trim();
        providerCounts.set(s, (providerCounts.get(s) || 0) + 1);
      }
      for (const [k, v] of providerCounts) if (!freellms.find((x) => x.slug === k)) countBySlug.set(k, v);
    }
  } catch { /* ignore */ }
  // fingerprint for newest provider tracking (sau khi update .env và restart)
  let fingerprint: Record<string, { hasKey: boolean; addedAt?: string }> = {};
  let newestSet = new Set<string>();
  try {
    const data = readDataJson<{ providers?: Record<string, { hasKey: boolean; addedAt?: string }>; lastAdded?: string[] } | null>(".provider-fingerprint.json", null);
    if (data?.providers) fingerprint = data.providers;
    if (data?.lastAdded) newestSet = new Set(data.lastAdded);
  } catch { /* ignore */ }
  let detailed = providerIds.map((id) => {
    const meta = providerMeta[id] || { name: id, tier: "", tier_type: "", caps: [], noCard: true };
    const fre = freellms.find((x: { slug?: string; name?: string; tier?: string; tier_type?: string; caps?: string[]; noCard?: boolean; baseUrl?: string; free_models?: number; total_models?: number }) => x.slug === id);
    const keys = config.providerKeys[id] || [];
    const hasReal = hasRealKey(id);
    // baseUrl fallback chain: freellms json -> registry provider -> empty
    const registryBase = (() => {
      try { const p = (providers as Record<string, { baseUrl?: string; id?: string }>)[id]; return (p as unknown as { baseUrl?: string })?.baseUrl || ""; } catch { return ""; }
    })();
    const fallbackBaseUrl = (fre as { baseUrl?: string } | undefined)?.baseUrl || registryBase || "";
    const fallbackFree = fre?.free_models ?? (countBySlug.get(id) ?? 0);
    const fallbackTotal = fre?.total_models ?? fallbackFree;
    const fp = fingerprint[id];
    return {
      id,
      name: meta.name || fre?.name || id,
      tier: meta.tier || fre?.tier || "",
      tier_type: meta.tier_type || fre?.tier_type || "",
      caps: meta.caps || fre?.caps || [],
      noCard: meta.noCard ?? fre?.noCard ?? true,
      baseUrl: fallbackBaseUrl,
      free_models: fallbackFree,
      total_models: fallbackTotal,
      keys: keys.length > 0 ? `${keys.length} keys` : "none",
      hasRealKey: hasReal,
      status: keys.length > 0 || id === "pollinations" ? "ready" : "no-key",
      addedAt: fp?.addedAt || null,
      isNewest: newestSet.has(id),
    };
  });
  const hasKeyOnly = c.req.query("hasKey") === "1" || c.req.query("has_key") === "1";
  if (q) detailed = detailed.filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  if (hasKeyOnly) {
    detailed = detailed.filter((p) => hasRealKey(p.id) || isPublicProvider(p.id));
  }
  const total = detailed.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const curPage = Math.min(page, totalPages);
  const offset = (curPage - 1) * limit;
  const paginated = detailed.slice(offset, offset + limit);

  // expose newest for Usage chart auto-highlight
  let syncInfo: { lastAdded?: string[]; lastAddedAt?: string | null; bootSync?: unknown } | null = null;
  try {
    const fpRaw = readDataJson<{ lastAdded?: string[]; lastAddedAt?: string; bootSync?: unknown } | null>(".provider-fingerprint.json", null);
    if (fpRaw) syncInfo = { lastAdded: fpRaw.lastAdded, lastAddedAt: fpRaw.lastAddedAt || null, bootSync: fpRaw.bootSync };
  } catch { /* ignore */ }
  return c.json({
    providers: providerIds,
    count: providerIds.length,
    freellms_count: freellms.length || 30,
    tiers: config.fallbackTiers,
    keysConfigured: Object.fromEntries(
      Object.entries(config.providerKeys).map(([k, v]) => [k, v.length > 0 ? `${v.length} keys` : "none"])
    ),
    defaultModel: config.defaultModel,
    detailed: paginated,
    pagination: { page: curPage, limit, total, total_pages: totalPages, has_next: curPage < totalPages, has_prev: curPage > 1 },
    filters: { q: q || null, hasKey: hasKeyOnly || false },
    sync: syncInfo,
  });
});

apiRoute.get("/providers/health", async (c) => {
  const { providers } = await import("../providers/registry.js");
  const breakers = getAllStates() as Record<string, { state?: string; failures?: number }>;
  const results: ProviderHealthRow[] = [];
  const timeoutMs = 5000;

  await Promise.all(
    providerIds.map(async (id) => {
      const keys = config.providerKeys[id] || [];
      const hasKey = keys.length > 0;
      const isPublic = ["pollinations", "llm7-io", "ollama-cloud", "glhf-chat"].includes(id);
      if (!hasKey && !isPublic) {
        results.push({ id, status: "no-key", keys: 0, latency_ms: 0, breaker: breakers[id]?.state || "closed" });
        return;
      }
      const key = keys[0] || "";
      const provider = providers[id];
      if (!provider) {
        results.push({ id, status: "unknown", error: "no provider" });
        return;
      }
      const start = Date.now();
      try {
        const ok = await Promise.race([
          provider.health(key),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ]);
        const latency = Date.now() - start;
        results.push({
          id,
          status: ok ? "online" : "offline",
          keys: keys.length,
          latency_ms: latency,
          breaker: breakers[id]?.state || "closed",
          failures: breakers[id]?.failures || 0,
        });
      } catch (e) {
        results.push({ id, status: "error", keys: keys.length, latency_ms: Date.now() - start, error: errMessage(e), breaker: breakers[id]?.state || "closed" });
      }
    })
  );

  results.sort((a, b) => a.id.localeCompare(b.id));

  const summary = {
    total: results.length,
    online: results.filter((r) => r.status === "online").length,
    offline: results.filter((r) => r.status === "offline").length,
    no_key: results.filter((r) => r.status === "no-key").length,
    open_breaker: results.filter((r) => r.breaker === "open").length,
  };

  return c.json({
    status: "live",
    generated_at: new Date().toISOString(),
    summary,
    providers: results,
  });
});

apiRoute.get("/models/sync", (c) => {
  return c.json({
    source: "freellms.org",
    last_sync: "2026-09-06",
    models_yaml: "models.yaml (316 free)",
    data_files: ["data/freellms-providers.json", "data/freellms-models-free.json"],
    script: "python scripts/sync-freellms.py",
  });
});

apiRoute.get("/verify", (c) => {
  const data = readDataJson<Record<string, unknown> | null>("verified-models.json", null);
  if (!data) return c.json({ status: "no_data", message: "Run POST /api/verify or wait for 24h scheduler" }, 404);
  return c.json(data);
});

apiRoute.get("/verify/summary", (c) => {
  const data = readDataJson<Record<string, unknown> | null>("verified-summary.json", null);
  if (!data) return c.json({ status: "no_data" }, 404);
  return c.json(data);
});

apiRoute.post("/verify", async (c) => {
  const { verifyFreeModels, saveVerifyReport } = await import("../jobs/verify-free.js");
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body.dryRun ?? false;
  const report = await verifyFreeModels({ dryRun });
  await saveVerifyReport(report);
  return c.json(report);
});
apiRoute.post("/models/live/sync", async (c) => {
  const { syncLiveModels } = await import("../jobs/sync-live-models.js");
  const body = await c.req.json().catch(() => ({}));
  const freeOnly = body.freeOnly ?? true;
  const result = await syncLiveModels({ freeOnly });
  return c.json({ ...result, generated_at: new Date().toISOString(), free_only: freeOnly });
});
apiRoute.get("/models/live", (c) => {
  const data = readDataJson<{ total: number; models: unknown[]; generated_at: string | null } | null>("live-models.json", null);
  if (!data) return c.json({ total: 0, models: [], generated_at: null, note: "Run POST /api/models/live/sync with real keys to generate" });
  return c.json(data);
});

apiRoute.get("/models/health", async (c) => {
  const provider = c.req.query("provider");
  const model = c.req.query("model");
  const limit = Math.min(parseInt(c.req.query("limit") || "10", 10), 50);
  const { probeModel, probeModels } = await import("../jobs/probe-models.js");
  const { readDataJson } = await import("../lib/paths.js");

  if (model) {
    // Single model probe: ?model=nvidia-nim/z-ai/glm-5.2
    const result = await probeModel(model.split("/")[0], model);
    return c.json(result);
  }

  // Bulk probe: provider filter or top models
  const all = readDataJson<FreellmsModelEntry[]>("freellms-models-free.json", []);
  let ids: string[] = all.map((m) => `${m.slug}/${m.name}`);
  if (provider) ids = ids.filter((id) => id.startsWith(provider + "/"));
  ids = ids.slice(0, limit);
  if (ids.length === 0) return c.json({ error: "no models found", provider, limit }, 400);
  const results = await probeModels(ids, { concurrency: 3 });
  const summary = {
    total: results.length,
    usable: results.filter((r) => r.status === "usable").length,
    unusable: results.filter((r) => r.status === "unusable").length,
    no_key: results.filter((r) => r.status === "no-key").length,
    error: results.filter((r) => r.status === "error" || r.status === "timeout").length,
  };
  return c.json({ provider: provider || "all", limit, summary, models: results });
});

// Persisted 404/410 health: stored in data/model-health.json so reload keeps strikethrough
// MUST be before /:id route to avoid shadowing
function readModelHealth(): Record<string, ModelHealthEntry> {
  return readDataJson<Record<string, ModelHealthEntry>>("model-health.json", {});
}
function writeModelHealth(map: Record<string, ModelHealthEntry>) {
  const p = resolveDataPath("model-health.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(map, null, 2));
}
apiRoute.get("/models/health/persisted", (c) => {
  const map = readModelHealth();
  const list = Object.entries(map).map(([id, v]) => ({ id, ...v }));
  return c.json({ object: "list", total: list.length, data: list });
});
apiRoute.post("/models/health/mark", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const rawIds: unknown = body.ids || (body.id ? [body.id] : []);
  const ids: string[] = (Array.isArray(rawIds) ? rawIds : [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 200))
    .slice(0, 100);
  const status = typeof body.status === "string" ? body.status.slice(0, 32) : "unusable";
  const http_status = Math.min(Math.max(Number(body.http_status) || 404, 100), 599);
  const error = typeof body.error === "string" ? body.error.slice(0, 500) : "model_not_found";
  if (ids.length === 0) return c.json({ error: "ids required" }, 400);
  const map = readModelHealth();
  const now = new Date().toISOString();
  for (const id of ids) {
    // persist usable/200 to override previous 404/410 so reload keeps non-red
    if (status === "usable" || http_status === 200) {
      map[id] = { status: "usable", http_status: 200, error: "", updated_at: now, provider: id.split("/")[0], latency_ms: body.latency_ms || 0 };
    } else if (http_status === 404 || http_status === 410 || /model_not_found|Gone/i.test(error)) {
      map[id] = { status, http_status, error: String(error).slice(0, 500), updated_at: now, provider: id.split("/")[0] };
    }
  }
  writeModelHealth(map);
  return c.json({ saved: ids.length, total: Object.keys(map).length });
});
apiRoute.delete("/models/health/persisted", (c) => {
  const p = resolveDataPath("model-health.json");
  try { fs.unlinkSync(p); } catch { /* ignore */ }
  return c.json({ deleted: true });
});
apiRoute.delete("/models/health/persisted/:id", async (c) => {
  const full = c.req.url.split("/api/models/health/persisted/")[1]?.split("?")[0];
  const id = full ? decodeURIComponent(full) : c.req.param("id");
  const map = readModelHealth();
  if (map[id]) { delete map[id]; writeModelHealth(map); return c.json({ deleted: true, id }); }
  return c.json({ error: "not found" }, 404);
});

apiRoute.get("/models/health/:id", async (c) => {
  const id = c.req.param("id");
  // Hono param stops at /, so we also try to get full path after /models/health/
  const full = c.req.url.split("/api/models/health/")[1]?.split("?")[0];
  const modelId = full ? decodeURIComponent(full) : id;
  const { probeModel } = await import("../jobs/probe-models.js");
  const providerId = modelId.split("/")[0];
  const result = await probeModel(providerId, modelId);
  return c.json(result);
});

apiRoute.get("/keys", (c) => {
  const keys = listVirtualKeys();
  return c.json({ object: "list", data: keys, total: keys.length });
});

apiRoute.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return c.json({ error: { message: "name required", type: "invalid_request" } }, 400);
  const scopesRaw = (body.scopes ?? { models: ["*"], providers: ["*"] }) as {
    models?: unknown;
    providers?: unknown;
  };
  const cleanList = (v: unknown): string[] => {
    if (!Array.isArray(v)) return ["*"];
    return v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 120))
      .slice(0, 50);
  };
  const rpmLimit = Math.min(Math.max(Number(body.rpmLimit ?? body.rpm_limit ?? 60) || 60, 1), 10000);
  const tpdLimit = Math.min(Math.max(Number(body.tpdLimit ?? body.tpd_limit ?? 100000) || 100000, 100), 100_000_000);
  const role = body.role === "admin" ? "admin" : "user";
  const vk = createVirtualKey({
    name,
    scopes: { models: cleanList(scopesRaw.models), providers: cleanList(scopesRaw.providers) },
    rpmLimit,
    tpdLimit,
    role,
  });
  return c.json({ id: vk.id, key: vk.key, name: vk.name, scopes: vk.scopes, rpmLimit: vk.rpmLimit, createdAt: vk.createdAt }, 201);
});

apiRoute.delete("/keys/:id", (c) => {
  const id = c.req.param("id");
  const ok = deleteVirtualKey(id);
  if (!ok) return c.json({ error: { message: "not found", type: "not_found" } }, 404);
  return c.json({ deleted: true, id });
});

apiRoute.get("/logs", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const logs = getLogs(limit, offset);
  return c.json({ object: "list", data: logs, total: logs.length });
});

apiRoute.get("/logs/stream", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`));
      const off = onLog((log) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`));
        } catch { /* ignore */ }
      });
      c.req.raw.signal.addEventListener("abort", () => {
        off();
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});

apiRoute.get("/config", (c) => {
  return c.json({
    SEMANTIC_CACHE_ENABLED: config.semanticCacheEnabled ? 1 : 0,
    SEMANTIC_THRESHOLD: config.semanticCacheThreshold,
    CACHE_TTL_S: config.semanticCacheTtlSec,
    EMBEDDING_MODEL: config.embeddingModels ? config.embeddingModels.join(",") : config.embeddingModel,
    EMBEDDING_FALLBACKS: config.embeddingFallbacks ? config.embeddingFallbacks.join(",") : "",
    SEMANTIC_CACHE_MAX_MEM: config.semanticCacheMaxMemEntries,
    SEMANTIC_CACHE_SCAN_CAP: config.semanticCacheScanCap,
    COMPRESSION_ENABLED: config.compressionEnabled ? 1 : 0,
    COMPRESSION_MAX_TOKENS: config.compressionMaxTokens,
    COST_ROUTING_ENABLED: config.costRoutingEnabled ? 1 : 0,
    COST_WEIGHT: config.costWeight,
    LATENCY_WEIGHT: config.latencyWeight,
    HEADROOM_WEIGHT: config.headroomWeight,
    SUCCESS_WEIGHT: config.successWeight,
    ANALYTICS_RETENTION_DAYS: config.analyticsRetentionDays,
    PROVIDER_TIMEOUT_MS: config.providerTimeoutMs,
    PROVIDER_TIMEOUT_AUTO_MS: config.providerTimeoutAutoMs,
    PROVIDER_PARALLEL_AUTO: config.providerParallelAuto,
    CIRCUIT_BREAKER_THRESHOLD: config.circuitBreakerThreshold,
    CIRCUIT_BREAKER_COOLDOWN_MS: config.circuitBreakerCooldownMs,
    WEB_TOOLS_ENABLED: config.webToolsEnabled ? 1 : 0,
    WEB_SEARCH_PROVIDER: config.webSearchProvider,
    WEB_FETCH_TIMEOUT_MS: config.webFetchTimeoutMs,
    WEB_FETCH_MAX_BYTES: config.webFetchMaxBytes,
    WEB_SEARCH_MAX_RESULTS: config.webSearchMaxResults,
    WEB_TOOLS_MAX_ITERATIONS: config.webToolsMaxIterations,
    WEB_CACHE_TTL_S: config.webCacheTtlSec,
    FALLBACK_TIERS: JSON.stringify(config.fallbackTiers),
    ADAPTIVE_ROUTING_ENABLED: config.adaptiveRoutingEnabled ? 1 : 0,
    ADAPTIVE_EMA_ALPHA: config.adaptiveEmaAlpha,
    PER_MODEL_QUOTA_ENABLED: config.perModelQuotaEnabled ? 1 : 0,
    PROMETHEUS_ENABLED: config.prometheusEnabled ? 1 : 0,
    BYOK_ENABLED: config.byokEnabled ? 1 : 0,
    LOCAL_EMBEDDING_ENABLED: config.localEmbeddingEnabled ? 1 : 0,
    LOCAL_EMBEDDING_MODEL: config.localEmbeddingModel,
    MCP_ENABLED: config.mcpEnabled ? 1 : 0,
    COMPARE_MAX_CONCURRENCY: config.compareMaxConcurrency,
    ALERT_WEBHOOK_URL: config.alertWebhookUrl ? "***" : "",
    ALERT_THRESHOLD_ERROR_RATE: config.alertThresholdErrorRate,
    _source: ".env",
  });
});

apiRoute.put("/config", async (c) => {
  const rawBody = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return c.json({ errors: ["Invalid JSON body: expected object"], applied: {} }, 400);
  }
  const body = rawBody;
  const errors: string[] = [];
  const pending: Record<string, unknown> = {}; // validate first, apply atomically
  const applied: Record<string, unknown> = {};

  function parseBoolStrict(v: unknown): boolean | null {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (v === 1) return true;
      if (v === 0) return false;
      return null;
    }
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(s)) return true;
      if (["0", "false", "no", "off"].includes(s)) return false;
    }
    return null;
  }

  // Collect validations into pending, never mutate config yet
  if (body.SEMANTIC_CACHE_ENABLED !== undefined) {
    const b = parseBoolStrict(body.SEMANTIC_CACHE_ENABLED);
    if (b === null) errors.push("SEMANTIC_CACHE_ENABLED must be 0/1/true/false");
    else pending.semanticCacheEnabled = b;
  }
  if (body.SEMANTIC_THRESHOLD !== undefined) {
    const v = Number(body.SEMANTIC_THRESHOLD);
    if (!Number.isFinite(v) || v < 0 || v > 1) errors.push("SEMANTIC_THRESHOLD must be 0..1");
    else pending.semanticCacheThreshold = v;
  }
  if (body.CACHE_TTL_S !== undefined) {
    const v = parseInt(String(body.CACHE_TTL_S), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("CACHE_TTL_S must be >0");
    else pending.semanticCacheTtlSec = Math.min(v, 86400 * 7);
  }
  if (body.EMBEDDING_MODEL !== undefined) {
    const s = String(body.EMBEDDING_MODEL).trim();
    if (!s) errors.push("EMBEDDING_MODEL empty");
    else if (s.length > 200) errors.push("EMBEDDING_MODEL too long");
    else {
      const list = s.split(",").map((x) => x.trim()).filter(Boolean);
      if (list.length === 0) errors.push("EMBEDDING_MODEL empty after parse");
      else { pending.embeddingModel = list[0]; pending.embeddingModels = list; }
    }
  }
  if (body.EMBEDDING_FALLBACKS !== undefined) {
    const s = String(body.EMBEDDING_FALLBACKS);
    if (s.length > 2000) errors.push("EMBEDDING_FALLBACKS too long");
    else {
      const list = s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
      pending.embeddingFallbacks = list;
    }
  }
  if (body.SEMANTIC_CACHE_MAX_MEM !== undefined) {
    const v = parseInt(String(body.SEMANTIC_CACHE_MAX_MEM), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("SEMANTIC_CACHE_MAX_MEM must be >0");
    else pending.semanticCacheMaxMemEntries = Math.min(v, 10000);
  }
  if (body.SEMANTIC_CACHE_SCAN_CAP !== undefined) {
    const v = parseInt(String(body.SEMANTIC_CACHE_SCAN_CAP), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("SEMANTIC_CACHE_SCAN_CAP must be >0");
    else pending.semanticCacheScanCap = Math.min(v, 1000);
  }
  if (body.COMPRESSION_ENABLED !== undefined) {
    const b = parseBoolStrict(body.COMPRESSION_ENABLED);
    if (b === null) errors.push("COMPRESSION_ENABLED must be 0/1/true/false");
    else pending.compressionEnabled = b;
  }
  if (body.COMPRESSION_MAX_TOKENS !== undefined) {
    const v = parseInt(String(body.COMPRESSION_MAX_TOKENS), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("COMPRESSION_MAX_TOKENS must be >0");
    else pending.compressionMaxTokens = Math.min(v, 32000);
  }
  if (body.COST_ROUTING_ENABLED !== undefined) {
    const b = parseBoolStrict(body.COST_ROUTING_ENABLED);
    if (b === null) errors.push("COST_ROUTING_ENABLED must be 0/1/true/false");
    else pending.costRoutingEnabled = b;
  }
  for (const k of ["COST_WEIGHT", "LATENCY_WEIGHT", "HEADROOM_WEIGHT", "SUCCESS_WEIGHT"] as const) {
    if (body[k] !== undefined) {
      const v = parseFloat(String(body[k]));
      if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be >=0`);
      else if (v > 1000) errors.push(`${k} too large (max 1000)`);
      else {
        const map: Record<string, string> = { COST_WEIGHT: "costWeight", LATENCY_WEIGHT: "latencyWeight", HEADROOM_WEIGHT: "headroomWeight", SUCCESS_WEIGHT: "successWeight" };
        pending[map[k]] = v;
      }
    }
  }
  if (body.ANALYTICS_RETENTION_DAYS !== undefined) {
    const v = parseInt(String(body.ANALYTICS_RETENTION_DAYS), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("ANALYTICS_RETENTION_DAYS must be >0");
    else pending.analyticsRetentionDays = Math.min(v, 365);
  }
  if (body.PROVIDER_TIMEOUT_MS !== undefined) {
    const v = parseInt(String(body.PROVIDER_TIMEOUT_MS), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("PROVIDER_TIMEOUT_MS must be >0");
    else pending.providerTimeoutMs = Math.min(v, 120000);
  }
  if (body.PROVIDER_TIMEOUT_AUTO_MS !== undefined) {
    const v = parseInt(String(body.PROVIDER_TIMEOUT_AUTO_MS), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("PROVIDER_TIMEOUT_AUTO_MS must be >0");
    else pending.providerTimeoutAutoMs = Math.min(v, 30000);
  }
  if (body.PROVIDER_PARALLEL_AUTO !== undefined) {
    const v = parseInt(String(body.PROVIDER_PARALLEL_AUTO), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("PROVIDER_PARALLEL_AUTO must be >0");
    else pending.providerParallelAuto = Math.min(v, 5);
  }
  if (body.CIRCUIT_BREAKER_THRESHOLD !== undefined) {
    const v = parseInt(String(body.CIRCUIT_BREAKER_THRESHOLD), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("CIRCUIT_BREAKER_THRESHOLD must be >0");
    else if (v > 100) errors.push("CIRCUIT_BREAKER_THRESHOLD max 100");
    else pending.circuitBreakerThreshold = v;
  }
  if (body.CIRCUIT_BREAKER_COOLDOWN_MS !== undefined) {
    const v = parseInt(String(body.CIRCUIT_BREAKER_COOLDOWN_MS), 10);
    if (!Number.isFinite(v) || v <= 0) errors.push("CIRCUIT_BREAKER_COOLDOWN_MS must be >0");
    else pending.circuitBreakerCooldownMs = Math.min(v, 300000);
  }
  if (body.WEB_TOOLS_ENABLED !== undefined) {
    const b = parseBoolStrict(body.WEB_TOOLS_ENABLED);
    if (b === null) errors.push("WEB_TOOLS_ENABLED must be 0/1/true/false");
    else pending.webToolsEnabled = b;
  }
  if (body.WEB_SEARCH_PROVIDER !== undefined) {
    const s = String(body.WEB_SEARCH_PROVIDER).trim().toLowerCase();
    const allowed = ["tavily", "brave", "serper", "jina"];
    if (!allowed.includes(s)) errors.push("WEB_SEARCH_PROVIDER must be tavily|brave|serper|jina");
    else pending.webSearchProvider = s;
  }
  for (const k of ["WEB_FETCH_TIMEOUT_MS", "WEB_FETCH_MAX_BYTES", "WEB_SEARCH_MAX_RESULTS", "WEB_TOOLS_MAX_ITERATIONS", "WEB_CACHE_TTL_S"] as const) {
    if (body[k] !== undefined) {
      const v = parseInt(String(body[k]), 10);
      if (!Number.isFinite(v) || v <= 0) errors.push(`${k} must be >0`);
      else {
        const map: Record<string, string> = { WEB_FETCH_TIMEOUT_MS: "webFetchTimeoutMs", WEB_FETCH_MAX_BYTES: "webFetchMaxBytes", WEB_SEARCH_MAX_RESULTS: "webSearchMaxResults", WEB_TOOLS_MAX_ITERATIONS: "webToolsMaxIterations", WEB_CACHE_TTL_S: "webCacheTtlSec" };
        const caps: Record<string, number> = { WEB_FETCH_TIMEOUT_MS: 30000, WEB_FETCH_MAX_BYTES: 2000000, WEB_SEARCH_MAX_RESULTS: 10, WEB_TOOLS_MAX_ITERATIONS: 5, WEB_CACHE_TTL_S: 86400 };
        pending[map[k]] = Math.min(v, caps[k]);
      }
    }
  }
  if (body.FALLBACK_TIERS !== undefined) {
    try {
      const raw = typeof body.FALLBACK_TIERS === "string" ? JSON.parse(body.FALLBACK_TIERS) : body.FALLBACK_TIERS;
      if (!Array.isArray(raw) || raw.length === 0) throw new Error("must be non-empty array");
      if (raw.length > 8) throw new Error("max 8 tiers");
      const tiers: string[][] = [];
      let totalProviders = 0;
      for (const tier of raw) {
        if (!Array.isArray(tier)) throw new Error("each tier must be array");
        const clean = tier.filter((p: unknown) => typeof p === "string" && (p as string).trim().length > 0).map((p: string) => p.trim()).slice(0, 60);
        if (clean.length === 0) throw new Error("each tier must have at least one provider");
        // dedupe within tier
        const deduped = [...new Set(clean)];
        totalProviders += deduped.length;
        tiers.push(deduped);
      }
      if (totalProviders > 200) throw new Error("total providers exceed 200");
      pending.fallbackTiers = tiers;
    } catch (e) {
      errors.push(`FALLBACK_TIERS invalid: ${errMessage(e)}`);
    }
  }
  // P8 flags
  if (body.ADAPTIVE_ROUTING_ENABLED !== undefined) {
    const b = parseBoolStrict(body.ADAPTIVE_ROUTING_ENABLED);
    if (b===null) errors.push("ADAPTIVE_ROUTING_ENABLED must be 0/1/true/false"); else pending.adaptiveRoutingEnabled = b;
  }
  if (body.ADAPTIVE_EMA_ALPHA !== undefined) {
    const v = parseFloat(String(body.ADAPTIVE_EMA_ALPHA));
    if (!Number.isFinite(v) || v<=0 || v>1) errors.push("ADAPTIVE_EMA_ALPHA must be 0..1"); else pending.adaptiveEmaAlpha = v;
  }
  if (body.PER_MODEL_QUOTA_ENABLED !== undefined) {
    const b = parseBoolStrict(body.PER_MODEL_QUOTA_ENABLED);
    if (b===null) errors.push("PER_MODEL_QUOTA_ENABLED must be 0/1/true/false"); else pending.perModelQuotaEnabled = b;
  }
  if (body.PROMETHEUS_ENABLED !== undefined) {
    const b = parseBoolStrict(body.PROMETHEUS_ENABLED);
    if (b===null) errors.push("PROMETHEUS_ENABLED must be 0/1/true/false"); else pending.prometheusEnabled = b;
  }
  if (body.BYOK_ENABLED !== undefined) {
    const b = parseBoolStrict(body.BYOK_ENABLED);
    if (b===null) errors.push("BYOK_ENABLED must be 0/1/true/false"); else pending.byokEnabled = b;
  }
  if (body.LOCAL_EMBEDDING_ENABLED !== undefined) {
    const b = parseBoolStrict(body.LOCAL_EMBEDDING_ENABLED);
    if (b===null) errors.push("LOCAL_EMBEDDING_ENABLED must be 0/1/true/false"); else pending.localEmbeddingEnabled = b;
  }
  if (body.LOCAL_EMBEDDING_MODEL !== undefined) {
    const s = String(body.LOCAL_EMBEDDING_MODEL).trim();
    if (!s) errors.push("LOCAL_EMBEDDING_MODEL empty"); else if (s.length>200) errors.push("LOCAL_EMBEDDING_MODEL too long"); else pending.localEmbeddingModel = s;
  }
  if (body.MCP_ENABLED !== undefined) {
    const b = parseBoolStrict(body.MCP_ENABLED);
    if (b===null) errors.push("MCP_ENABLED must be 0/1/true/false"); else pending.mcpEnabled = b;
  }
  if (body.COMPARE_MAX_CONCURRENCY !== undefined) {
    const v = parseInt(String(body.COMPARE_MAX_CONCURRENCY),10);
    if (!Number.isFinite(v)||v<=0) errors.push("COMPARE_MAX_CONCURRENCY must be >0"); else pending.compareMaxConcurrency = Math.min(v,5);
  }
  if (body.ALERT_WEBHOOK_URL !== undefined) {
    const s = String(body.ALERT_WEBHOOK_URL).trim();
    if (s.length>500) errors.push("ALERT_WEBHOOK_URL too long"); else pending.alertWebhookUrl = s;
  }
  if (body.ALERT_THRESHOLD_ERROR_RATE !== undefined) {
    const v = parseFloat(String(body.ALERT_THRESHOLD_ERROR_RATE));
    if (!Number.isFinite(v)||v<0||v>1) errors.push("ALERT_THRESHOLD_ERROR_RATE must be 0..1"); else pending.alertThresholdErrorRate = v;
  }

  // Unknown keys warning (ignore but report)
  const known = new Set(["SEMANTIC_CACHE_ENABLED","SEMANTIC_THRESHOLD","CACHE_TTL_S","EMBEDDING_MODEL","EMBEDDING_FALLBACKS","SEMANTIC_CACHE_MAX_MEM","SEMANTIC_CACHE_SCAN_CAP","COMPRESSION_ENABLED","COMPRESSION_MAX_TOKENS","COST_ROUTING_ENABLED","COST_WEIGHT","LATENCY_WEIGHT","HEADROOM_WEIGHT","SUCCESS_WEIGHT","ANALYTICS_RETENTION_DAYS","PROVIDER_TIMEOUT_MS","PROVIDER_TIMEOUT_AUTO_MS","PROVIDER_PARALLEL_AUTO","CIRCUIT_BREAKER_THRESHOLD","CIRCUIT_BREAKER_COOLDOWN_MS","WEB_TOOLS_ENABLED","WEB_SEARCH_PROVIDER","WEB_FETCH_TIMEOUT_MS","WEB_FETCH_MAX_BYTES","WEB_SEARCH_MAX_RESULTS","WEB_TOOLS_MAX_ITERATIONS","WEB_CACHE_TTL_S","FALLBACK_TIERS","ADAPTIVE_ROUTING_ENABLED","ADAPTIVE_EMA_ALPHA","PER_MODEL_QUOTA_ENABLED","PROMETHEUS_ENABLED","BYOK_ENABLED","LOCAL_EMBEDDING_ENABLED","LOCAL_EMBEDDING_MODEL","MCP_ENABLED","COMPARE_MAX_CONCURRENCY","ALERT_WEBHOOK_URL","ALERT_THRESHOLD_ERROR_RATE","_source"]);
  for (const k of Object.keys(body)) {
    if (!known.has(k) && !k.startsWith("_")) errors.push(`Unknown key: ${k}`);
  }

  if (errors.length > 0) {
    return c.json({ errors, applied: {} }, 400);
  }

  // Atomic apply: only now mutate config
  const reverseMap: Record<string, string> = {
    semanticCacheEnabled: "SEMANTIC_CACHE_ENABLED",
    semanticCacheThreshold: "SEMANTIC_THRESHOLD",
    semanticCacheTtlSec: "CACHE_TTL_S",
    embeddingModel: "EMBEDDING_MODEL",
    embeddingFallbacks: "EMBEDDING_FALLBACKS",
    semanticCacheMaxMemEntries: "SEMANTIC_CACHE_MAX_MEM",
    semanticCacheScanCap: "SEMANTIC_CACHE_SCAN_CAP",
    compressionEnabled: "COMPRESSION_ENABLED",
    compressionMaxTokens: "COMPRESSION_MAX_TOKENS",
    costRoutingEnabled: "COST_ROUTING_ENABLED",
    costWeight: "COST_WEIGHT",
    latencyWeight: "LATENCY_WEIGHT",
    headroomWeight: "HEADROOM_WEIGHT",
    successWeight: "SUCCESS_WEIGHT",
    analyticsRetentionDays: "ANALYTICS_RETENTION_DAYS",
    providerTimeoutMs: "PROVIDER_TIMEOUT_MS",
    providerTimeoutAutoMs: "PROVIDER_TIMEOUT_AUTO_MS",
    providerParallelAuto: "PROVIDER_PARALLEL_AUTO",
    circuitBreakerThreshold: "CIRCUIT_BREAKER_THRESHOLD",
    circuitBreakerCooldownMs: "CIRCUIT_BREAKER_COOLDOWN_MS",
    webToolsEnabled: "WEB_TOOLS_ENABLED",
    webSearchProvider: "WEB_SEARCH_PROVIDER",
    webFetchTimeoutMs: "WEB_FETCH_TIMEOUT_MS",
    webFetchMaxBytes: "WEB_FETCH_MAX_BYTES",
    webSearchMaxResults: "WEB_SEARCH_MAX_RESULTS",
    webToolsMaxIterations: "WEB_TOOLS_MAX_ITERATIONS",
    webCacheTtlSec: "WEB_CACHE_TTL_S",
    fallbackTiers: "FALLBACK_TIERS",
    adaptiveRoutingEnabled: "ADAPTIVE_ROUTING_ENABLED",
    adaptiveEmaAlpha: "ADAPTIVE_EMA_ALPHA",
    perModelQuotaEnabled: "PER_MODEL_QUOTA_ENABLED",
    prometheusEnabled: "PROMETHEUS_ENABLED",
    byokEnabled: "BYOK_ENABLED",
    localEmbeddingEnabled: "LOCAL_EMBEDDING_ENABLED",
    localEmbeddingModel: "LOCAL_EMBEDDING_MODEL",
    mcpEnabled: "MCP_ENABLED",
    compareMaxConcurrency: "COMPARE_MAX_CONCURRENCY",
    alertWebhookUrl: "ALERT_WEBHOOK_URL",
    alertThresholdErrorRate: "ALERT_THRESHOLD_ERROR_RATE",
  };
  for (const [internal, value] of Object.entries(pending)) {
    (config as unknown as Record<string, unknown>)[internal] = value;
    const external = reverseMap[internal] || internal;
    if (external === "EMBEDDING_MODEL") {
      // already set embeddingModels too
      (config as unknown as Record<string, unknown>).embeddingModels = value === (pending.embeddingModel as string).split(",")[0] ? pending.embeddingModels : [value];
      applied[external] = pending.embeddingModels ? (pending.embeddingModels as string[]).join(",") : value;
    } else if (external === "FALLBACK_TIERS") {
      applied[external] = JSON.stringify(value);
    } else if (external === "EMBEDDING_FALLBACKS") {
      applied[external] = (value as string[]).join(",");
    } else if (typeof value === "boolean") {
      applied[external] = value ? 1 : 0;
    } else {
      applied[external] = value;
    }
    // also handle embeddingModels side effect
    if (internal === "embeddingModel" && pending.embeddingModels) {
      (config as unknown as Record<string, unknown>).embeddingModels = pending.embeddingModels;
    }
  }
  // live sync frozen singletons so every toggle in /settings actually works without restart
  const changedKeys = new Set(Object.keys(applied));
  if (changedKeys.has("CACHE_TTL_S") || changedKeys.has("SEMANTIC_CACHE_MAX_MEM") || changedKeys.has("SEMANTIC_CACHE_SCAN_CAP") || changedKeys.has("SEMANTIC_THRESHOLD")) {
    try {
      const { semanticCache } = await import("../lib/semantic-cache.js");
      (semanticCache as unknown as { syncConfig?: () => void }).syncConfig?.();
    } catch { /* ignore */ }
  }
  if (changedKeys.has("CIRCUIT_BREAKER_THRESHOLD") || changedKeys.has("CIRCUIT_BREAKER_COOLDOWN_MS")) {
    try {
      const { syncBreakerConfig } = await import("../lib/circuit-breaker.js");
      syncBreakerConfig();
    } catch { /* ignore */ }
  }
  // audit
  try {
    const vk = (c as unknown as { get?: (k: string) => unknown }).get?.("vk") || null;
    const { logger } = await import("../middleware/logger.js");
    logger.info({ applied: Object.keys(applied), vk: (vk as { id?: string })?.id || "master" }, "[config] PUT /api/config applied");
  } catch { /* ignore */ }

  return c.json({ applied, updated: Object.keys(applied).length, message: "Config updated in-memory (restart still needed to persist to .env)" });
});

apiRoute.get("/stats", (c) => {
  const freellms = loadProvidersJson();
  const freeModelsArr = readDataJson<FreellmsModelEntry[]>("freellms-models-free.json", []);
  const freeModels = freeModelsArr.length || 316;
  const logStats = getStats();
  return c.json({
    uptime: process.uptime(),
    requests: logStats.total,
    providers: providerIds.length,
    freellms_providers: freellms.length || 30,
    free_models: freeModels,
    total_models: 365,
    tiers: config.fallbackTiers,
    logs: logStats,
    breakers: getAllStates(),
    flags: { semanticCache: config.semanticCacheEnabled, compression: config.compressionEnabled, costRouting: config.costRoutingEnabled },
  });
});

// Vector 2 analytics & cache endpoints
apiRoute.get("/analytics", async (c) => {
  const interval = (c.req.query("interval") as "hour" | "day") || "day";
  const groupBy = (c.req.query("groupBy") as "provider" | "key" | "model") || "provider";
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  try {
    const { getAnalytics, getCostBreakdown, calculateSavings } = await import("../lib/analytics.js");
    const analytics = await getAnalytics({ interval, groupBy, limit });
    const cost = getCostBreakdown();
    const savings = await calculateSavings();
    return c.json({ interval, groupBy, analytics, cost, savings, generated_at: new Date().toISOString() });
  } catch (e) {
    return c.json({ interval, groupBy, error: errMessage(e) }, 500);
  }
});

apiRoute.get("/cache/stats", async (c) => {
  try {
    const stats = await semanticCache.getStats();
    return c.json({ enabled: config.semanticCacheEnabled, ...stats });
  } catch (e) {
    return c.json({ enabled: config.semanticCacheEnabled, error: errMessage(e) }, 500);
  }
});

apiRoute.delete("/cache", async (c) => {
  try {
    await semanticCache.clear();
    return c.json({ cleared: true });
  } catch (e) {
    return c.json({ error: errMessage(e) }, 500);
  }
});

apiRoute.post("/compression/preview", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    messages?: Array<{ role: string; content: unknown }>;
    maxTokens?: number;
  };
  const messages = body.messages || [];
  try {
    const { compressMessages } = await import("../lib/compression.js");
    const result = compressMessages(messages, body.maxTokens ? { maxTokens: body.maxTokens } : undefined);
    return c.json({ original: messages.length, compressed: result.messages.length, ratio: result.ratio, savedTokens: result.savedTokens, preview: result.messages.slice(0, 3) });
  } catch (e) {
    return c.json({ error: errMessage(e) }, 500);
  }
});

// ---- P8: Adaptive routing scores ----
apiRoute.get("/routing/scores", async (c) => {
  const model = c.req.query("model") || "auto";
  const { getProvidersForRequest } = await import("../lib/router.js");
  const providers = getProvidersForRequest(model);
  const scores = getAdaptiveScores(providers, model);
  return c.json({ model, adaptiveEnabled: config.adaptiveRoutingEnabled, scores, state: getAdaptiveState() });
});

apiRoute.get("/routing/state", (c) => {
  return c.json({ enabled: config.adaptiveRoutingEnabled, emaAlpha: config.adaptiveEmaAlpha, state: getAdaptiveState() });
});

// ---- P8: BYOK self-serve ----
apiRoute.get("/byok", (c) => {
  if (!config.byokEnabled) return c.json({ error: "BYOK disabled" }, 403);
  const vk = (c as unknown as { get: (k:string)=>unknown }).get?.("vk") as { id: string; role: string } | null;
  const vkId = c.req.query("vkId") || vk?.id || "";
  if (!vkId) return c.json({ error: "vkId required" }, 400);
  // user can only view own unless admin
  if (vk && vk.role !== "admin" && vk.id !== vkId) return c.json({ error: "forbidden" }, 403);
  const data = getByokForVk(vkId);
  // mask keys
  const masked = Object.fromEntries(Object.entries(data).map(([p, keys])=> [p, keys.map((k)=> k.slice(0,8)+"***")]));
  return c.json({ vkId, providers: masked, count: Object.keys(data).length });
});

apiRoute.post("/byok", async (c) => {
  if (!config.byokEnabled) return c.json({ error: "BYOK disabled" }, 403);
  const vk = (c as unknown as { get: (k:string)=>unknown }).get?.("vk") as { id: string; role: string } | null;
  const body = await c.req.json().catch(()=> ({} as Record<string,unknown>));
  const vkId = String(body.vkId || vk?.id || "").trim();
  const provider = String(body.provider || "").trim();
  const keys = Array.isArray(body.keys) ? (body.keys as unknown[]).filter((x): x is string=> typeof x==="string" && x.trim().length>0).map(s=> s.trim()).slice(0,10) : [];
  if (!vkId || !provider) return c.json({ error: "vkId and provider required" }, 400);
  if (vk && vk.role !== "admin" && vk.id !== vkId) return c.json({ error: "forbidden: can only set own BYOK" }, 403);
  if (keys.length===0) return c.json({ error: "keys empty" }, 400);
  // validate provider exists
  const { providerIds } = await import("../providers/registry.js");
  if (!providerIds.includes(provider)) return c.json({ error: `unknown provider ${provider}` }, 400);
  setByokKeys(vkId, provider, keys);
  const { metrics } = await import("../lib/metrics.js");
  metrics.byokKeys(provider, keys.length);
  return c.json({ saved: true, vkId, provider, count: keys.length });
});

apiRoute.delete("/byok", async (c) => {
  if (!config.byokEnabled) return c.json({ error: "BYOK disabled" }, 403);
  const vk = (c as unknown as { get: (k:string)=>unknown }).get?.("vk") as { id: string; role: string } | null;
  const vkId = c.req.query("vkId") || vk?.id || "";
  const provider = c.req.query("provider") || "";
  if (!vkId || !provider) return c.json({ error: "vkId and provider required" }, 400);
  if (vk && vk.role !== "admin" && vk.id !== vkId) return c.json({ error: "forbidden" }, 403);
  setByokKeys(vkId, provider, []);
  return c.json({ deleted: true, vkId, provider });
});

// ---- P8: Alerts webhook ----
apiRoute.get("/alerts", (c) => {
  const stats = getRequestStats();
  const errorRate = stats.errorRate;
  const threshold = config.alertThresholdErrorRate;
  const firing = errorRate >= threshold && stats.last100.length >= 10;
  return c.json({ errorRate, threshold, firing, webhookConfigured: !!config.alertWebhookUrl, stats: { total: stats.total, avgLatencyMs: stats.avgLatencyMs, p95LatencyMs: stats.p95LatencyMs } });
});

apiRoute.post("/alerts/test", async (c) => {
  if (!config.alertWebhookUrl) return c.json({ error: "ALERT_WEBHOOK_URL not configured" }, 400);
  try {
    const stats = getRequestStats();
    const res = await fetch(config.alertWebhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Gateway alert test: errorRate ${(stats.errorRate*100).toFixed(1)}%`, stats, at: new Date().toISOString() }) });
    return c.json({ sent: res.ok, status: res.status });
  } catch (e) { return c.json({ error: errMessage(e) }, 500); }
});

// ---- P8: Quota per-model ----
apiRoute.get("/quota", async (c) => {
  const provider = c.req.query("provider") || "";
  const model = c.req.query("model") || "";
  if (!provider) return c.json({ error: "provider required" }, 400);
  const { getQuotaState, getQuotaHeadroom } = await import("../lib/quota-tracker.js");
  // headroom aggregated
  const headroom = getQuotaHeadroom(provider, "");
  const st = getQuotaState(provider, "");
  return c.json({ provider, model: model||null, perModelEnabled: config.perModelQuotaEnabled, headroom, state: st, limits: st.limits || null });
});
