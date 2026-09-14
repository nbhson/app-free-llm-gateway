import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import { virtualKeyRateLimit } from "./rate-limit.js";
import { createVirtualKey, deleteVirtualKey, listVirtualKeys } from "../lib/virtual-keys.js";

function cleanupTestKeys(): void {
  for (const k of listVirtualKeys()) {
    if (k.name?.startsWith("rl-")) {
      try { deleteVirtualKey(k.id); } catch { /* ignore */ }
    }
  }
}

function miniApp() {
  const app = new Hono();
  app.use("*", virtualKeyRateLimit);
  app.get("/ping", (c) => c.json({ ok: true }));
  app.get("/v1/models", (c) => c.json({ ok: true })); // list endpoint bucket
  return app;
}

describe("virtualKeyRateLimit", () => {
  afterEach(() => {
    cleanupTestKeys();
  });
  it("passes under limit with x-ratelimit headers, 429s over limit", async () => {
    const created = createVirtualKey({ name: `rl-${Date.now()}`, rpmLimit: 2 });
    try {
      const app = miniApp();
      const h = { Authorization: `Bearer ${created.key}` };
      const r1 = await app.request("/ping", { headers: h });
      expect(r1.status).toBe(200);
      expect(r1.headers.get("x-ratelimit-limit-requests")).toBe("2");
      expect(r1.headers.get("x-ratelimit-remaining-requests")).toBe("1");
      expect((await app.request("/ping", { headers: h })).status).toBe(200);
      const r3 = await app.request("/ping", { headers: h });
      expect(r3.status).toBe(429);
      const body: any = await r3.json();
      expect(body.error.type).toBe("rate_limit_exceeded");
      expect(body.error.retryAfter).toBeGreaterThan(0);
    } finally {
      deleteVirtualKey(created.id);
    }
  });

  it("list endpoints use the higher burst bucket independently", async () => {
    const created = createVirtualKey({ name: `rl-list-${Date.now()}`, rpmLimit: 2 });
    try {
      const app = miniApp();
      const h = { Authorization: `Bearer ${created.key}` };
      // default bucket untouched by list traffic: 2 pings still pass after list hits
      expect((await app.request("/v1/models", { headers: h })).status).toBe(200);
      expect((await app.request("/ping", { headers: h })).status).toBe(200);
      expect((await app.request("/ping", { headers: h })).status).toBe(200);
    } finally {
      deleteVirtualKey(created.id);
    }
  });

  it("no key and invalid key pass through (401 handled later)", async () => {
    const app = miniApp();
    expect((await app.request("/ping")).status).toBe(200);
    expect((await app.request("/ping", { headers: { Authorization: "Bearer fgk-nope" } })).status).toBe(200);
  });
});
