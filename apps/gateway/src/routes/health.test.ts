import { describe, it, expect } from "vitest";
import { healthRoute } from "./v1/health.js";
import { providerIds } from "../providers/registry.js";
import { resJson, type HealthResponse, type ReadyResponse } from "../lib/types.js";

describe("health route", () => {
  it("GET / returns ok + version + provider count", async () => {
    const res = await healthRoute.request("/");
    expect(res.status).toBe(200);
    const data = await resJson<HealthResponse>(res);
    expect(data.status).toBe("ok");
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(data.providers).toBe(providerIds.length);
    expect(data.providers).toBeGreaterThan(30);
    expect(typeof data.uptime).toBe("number");
    expect(Array.isArray(data.tiers)).toBe(true);
    expect(typeof data.timestamp).toBe("string");
  });

  it("GET /ready returns ready true", async () => {
    const res = await healthRoute.request("/ready");
    expect(res.status).toBe(200);
    expect(await resJson<ReadyResponse>(res)).toEqual({ ready: true });
  });
});
