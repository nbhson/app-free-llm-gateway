import { describe, it, expect } from "vitest";
import { apiRoute } from "./api.js";
import { providerIds } from "../providers/registry.js";
import { resJson } from "../lib/types.js";
import { hasRealKey, isPublicProvider } from "../lib/provider-keys.js";

interface ApiProvidersResponse {
  providers: string[];
  count: number;
  detailed: Array<{
    id: string;
    name?: string;
    tier?: string;
    tier_type?: string;
    base_url?: string;
    hasKey?: boolean;
    no_card?: boolean;
    models?: number;
    free_models?: number;
    health?: string;
    addedAt?: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  filters?: { q?: string; hasKey?: boolean };
}

interface ApiKeysResponse {
  object: string;
  data: Array<{
    id: string;
    name: string;
    role: string;
    scopes?: Record<string, unknown>;
    rpmLimit: number;
    createdAt: string;
    updatedAt: string;
    hash?: unknown;
  }>;
}

interface ApiSyncResponse {
  source: string;
  script: string;
}

interface ApiConfigResponse {
  [key: string]: unknown;
  _source?: string;
}

interface ApiStatsResponse {
  providers: number;
  free_models: number;
  total_models: number;
  models_source: string;
  logs: { total: number };
  breakers: unknown;
  flags: { semanticCache: boolean; compression: boolean; costRouting: boolean };
}

interface ApiLogsResponse {
  object: string;
  data: unknown[];
}

interface ApiAnalyticsResponse {
  interval: string;
  groupBy: string;
  cost: unknown;
  analytics: { totalRequests: number };
  savings: { hitRate: number };
  generated_at: string;
}

interface ApiCacheStatsResponse {
  enabled: boolean;
  hits: number;
}

interface ApiCompressionPreviewResponse {
  original: number;
  compressed: number;
  ratio: number;
  savedTokens: number;
}

interface ApiPersistedHealthResponse {
  data: Array<{ id: string }>;
}

describe("api /providers", () => {
  it("lists all providers with pagination shape", async () => {
    const res = await apiRoute.request("/providers");
    expect(res.status).toBe(200);
    const data = await resJson<ApiProvidersResponse>(res);
    expect(data.providers).toEqual(providerIds);
    expect(data.count).toBe(providerIds.length);
    expect(data.detailed).toHaveLength(25);
    expect(data.pagination).toMatchObject({ page: 1, limit: 25, total: providerIds.length });
    expect(data.detailed[0]).toHaveProperty("hasRealKey");
    expect(data.detailed[0]).toHaveProperty("status");
  });

  it("clamps limit to 25/50 and searches by q", async () => {
    const bad = await resJson<ApiProvidersResponse>(await apiRoute.request("/providers?limit=30"));
    expect(bad.pagination.limit).toBe(25);
    const fifty = await resJson<ApiProvidersResponse>(await apiRoute.request("/providers?limit=50"));
    expect(fifty.pagination.limit).toBe(50);
    expect(fifty.detailed.length).toBeGreaterThan(0);
    expect(fifty.detailed.length).toBeLessThanOrEqual(50); // total may exceed 50 after new providers
    const q = await resJson<ApiProvidersResponse>(await apiRoute.request("/providers?q=groq"));
    expect(q.filters?.q).toBe("groq");
    expect(q.detailed.length).toBeGreaterThan(0);
    for (const p of q.detailed) {
      expect((p.id + (p.name ?? "")).toLowerCase()).toContain("groq");
    }
  });

  it("hasKey=1 only returns keyed or public providers", async () => {
    const data = await resJson<ApiProvidersResponse>(await apiRoute.request("/providers?hasKey=1&limit=50"));
    expect(data.filters?.hasKey).toBe(true);
    expect(data.detailed.length).toBeGreaterThan(0);
    for (const p of data.detailed) {
      expect(hasRealKey(p.id) || isPublicProvider(p.id)).toBe(true);
    }
  });

  it("page beyond range clamps to last page", async () => {
    const data = await resJson<ApiProvidersResponse>(await apiRoute.request("/providers?page=99"));
    expect(data.pagination.page).toBe(data.pagination.total_pages);
  });
});

describe("api /keys CRUD + validation", () => {
  it("POST without name -> 400", async () => {
    const res = await apiRoute.request("/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("full lifecycle: create (201) -> listed -> rpm clamped -> delete -> 404", async () => {
    const name = `api-test-${Date.now()}`;
    const res = await apiRoute.request("/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scopes: { models: ["groq/x"], providers: ["groq"] }, rpmLimit: 999999, role: "user" }),
    });
    expect(res.status).toBe(201);
    const created = await resJson<Record<string, unknown>>(res);
    expect((created.key as string).startsWith("fgk-")).toBe(true);
    expect((created.rpmLimit as number)).toBe(10000); // clamped
    expect(created.scopes).toMatchObject({ models: ["groq/x"], providers: ["groq"] });

    const listed = await resJson<ApiKeysResponse>(await apiRoute.request("/keys"));
    expect(listed.object).toBe("list");
    expect(listed.data.some((k) => k.id === (created.id as string))).toBe(true);
    // hash/key never leaked in list
    expect(listed.data.find((k) => k.id === (created.id as string))?.hash).toBeUndefined();

    const del = await apiRoute.request(`/keys/${created.id as string}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const del2 = await apiRoute.request(`/keys/${created.id as string}`, { method: "DELETE" });
    expect(del2.status).toBe(404);
  });
});

describe("api misc read endpoints", () => {
  it("GET /models/sync returns static source info", async () => {
    const data = await resJson<ApiSyncResponse>(await apiRoute.request("/models/sync"));
    expect(data.source).toBe("freellms.org");
    expect(data.script).toContain("sync-freellms");
  });

  it("GET /verify + /verify/summary serve data files when present", async () => {
    // apps/data/verified-models.json exists after scheduler/sync runs; fresh clones 404
    for (const p of ["/verify", "/verify/summary"]) {
      const res = await apiRoute.request(p);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const data = await resJson<Record<string, unknown>>(res);
        expect(typeof data).toBe("object");
      }
    }
  });

  it("GET /config exposes Vector 2 flags from .env", async () => {
    const data = await resJson<ApiConfigResponse>(await apiRoute.request("/config"));
    for (const k of ["SEMANTIC_CACHE_ENABLED", "COMPRESSION_ENABLED", "COST_ROUTING_ENABLED", "EMBEDDING_MODEL", "ANALYTICS_RETENTION_DAYS"]) {
      expect(data).toHaveProperty(k);
    }
    expect(data._source).toBe(".env");
  });

  it("GET /stats aggregates gateway state (counts derived from real data, no hardcoded fallback)", async () => {
    const data = await resJson<ApiStatsResponse>(await apiRoute.request("/stats"));
    expect(data.providers).toBe(providerIds.length);
    expect(data.free_models).toBeGreaterThan(300);
    // total_models mirrors the live models/ catalog instead of a stale hardcode
    expect(data.total_models).toBeGreaterThanOrEqual(data.free_models);
    expect(typeof data.models_source).toBe("string");
    expect(data.logs).toHaveProperty("total");
    expect(data).toHaveProperty("breakers");
    expect(data.flags).toHaveProperty("semanticCache");
  });

  it("GET /logs returns list shape", async () => {
    const data = await resJson<ApiLogsResponse>(await apiRoute.request("/logs?limit=5"));
    expect(data.object).toBe("list");
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /analytics echoes interval/groupBy with real computed payload", async () => {
    const data = await resJson<ApiAnalyticsResponse>(await apiRoute.request("/analytics?interval=hour&groupBy=model&limit=5"));
    expect(data.interval).toBe("hour");
    expect(data.groupBy).toBe("model");
    expect(data).toHaveProperty("cost");
    expect(data).toHaveProperty("generated_at");
    // awaited (not dangling Promises): analytics is a computed object
    expect(typeof data.analytics.totalRequests).toBe("number");
    expect(typeof data.savings.hitRate).toBe("number");
  });

  it("GET /cache/stats + DELETE /cache lifecycle", async () => {
    const stats = await resJson<ApiCacheStatsResponse>(await apiRoute.request("/cache/stats"));
    expect(typeof stats.enabled).toBe("boolean");
    expect(typeof stats.hits).toBe("number");
    const cleared = await resJson<{ cleared: boolean }>(await apiRoute.request("/cache", { method: "DELETE" }));
    expect(cleared.cleared).toBe(true);
  });

  it("POST /compression/preview compresses long history", async () => {
    const messages = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `message ${i} `.repeat(20) })),
    ];
    const data = await resJson<ApiCompressionPreviewResponse>(
      await apiRoute.request("/compression/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      })
    );
    expect(data.original).toBe(21);
    expect(data.compressed).toBeLessThan(21);
    expect(data.ratio).toBeLessThan(1);
    expect(data.savedTokens).toBeGreaterThan(0);
  });
});

describe("api persisted model health lifecycle", () => {
  const id = `test-health-model-${Date.now()}`;

  it("POST /models/health/mark requires ids", async () => {
    const res = await apiRoute.request("/models/health/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("mark 404 -> persisted -> mark usable -> delete", async () => {
    const marked = await resJson<{ saved: number }>(
      await apiRoute.request("/models/health/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], http_status: 404, error: "model_not_found" }),
      })
    );
    expect(marked.saved).toBe(1);

    const list = await resJson<ApiPersistedHealthResponse>(await apiRoute.request("/models/health/persisted"));
    expect(list.data.some((m) => m.id === id)).toBe(true);

    // usable/200 overrides 404 so reload keeps non-red
    const usable = await resJson<{ saved: number }>(
      await apiRoute.request("/models/health/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], status: "usable", http_status: 200 }),
      })
    );
    expect(usable.saved).toBe(1);

    const del = await resJson<{ deleted: boolean }>(
      await apiRoute.request(`/models/health/persisted/${id}`, { method: "DELETE" })
    );
    expect(del.deleted).toBe(true);
    const del2 = await apiRoute.request(`/models/health/persisted/${id}`, { method: "DELETE" });
    expect(del2.status).toBe(404);
  });
});
