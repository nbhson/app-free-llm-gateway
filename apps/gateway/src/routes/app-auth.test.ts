import { resJson } from "../lib/types.js";
import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../app.js";
import { config } from "../config.js";
import { createVirtualKey, deleteVirtualKey } from "../lib/virtual-keys.js";
import { providers } from "../providers/registry.js";

describe("app auth middleware", () => {
  const app = createApp();
  const master = config.masterKey;

  it("rejects /v1/chat/completions without key (401)", async () => {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts x-api-key header (Claude Code style) for /v1/models", async () => {
    const res = await app.request("/v1/models", {
      headers: { "x-api-key": master },
    });
    expect(res.status).toBe(200);
  });

  it("rejects garbage key (401)", async () => {
    const res = await app.request("/v1/models", {
      headers: { Authorization: "Bearer fgk-invalid-xyz-123" },
    });
    expect(res.status).toBe(401);
  });

  it("scoped key: model outside scope -> 403, provider pin outside scope -> 403", async () => {
    const created = createVirtualKey({
      name: "scope-test-key",
      scopes: { models: ["groq/only-this-model"], providers: ["groq"] },
      role: "user",
    });
    try {
      // model not in scope
      const r1 = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${created.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openrouter/some-other-model", messages: [{ role: "user", content: "hi" }] }),
      });
      expect(r1.status).toBe(403);

      // provider pin not in scope
      const r2 = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${created.key}`,
          "Content-Type": "application/json",
          "x-router": "openrouter",
        },
        body: JSON.stringify({ model: "groq/only-this-model", messages: [{ role: "user", content: "hi" }] }),
      });
      expect(r2.status).toBe(403);
    } finally {
      deleteVirtualKey(created.id);
    }
  });

  it("admin required for POST /api/keys with non-admin key", async () => {
    const created = createVirtualKey({ name: "user-key", role: "user" });
    try {
      const res = await app.request("/api/keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${created.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(res.status).toBe(403);
    } finally {
      deleteVirtualKey(created.id);
    }
  });

  it("bootstrap disabled by default (403 unless EXPOSE_BOOTSTRAP=1)", async () => {
    // default test env has no EXPOSE_BOOTSTRAP=1
    if (process.env.EXPOSE_BOOTSTRAP === "1") return; // skip when explicitly enabled
    const res = await app.request("/api/bootstrap");
    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404 returns JSON not_found", async () => {
    const res = await app.request("/v1/nope-not-here", {
      headers: { Authorization: `Bearer ${master}` },
    });
    expect(res.status).toBe(404);
    const data = await resJson<{ error?: { message?: string; type?: string } }>(res);
    expect(data.error?.type).toBe("not_found");
  });
});

describe("app chat end-to-end via middleware (mocked provider)", () => {
  const origPollinations = providers["pollinations"];
  const origKiraai = providers["kiraai"];
  afterEach(() => {
    providers["pollinations"] = origPollinations;
    providers["kiraai"] = origKiraai;
  });

  it("master key reaches provider and returns X-Provider", async () => {
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "e2e-ok" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
    } as any;
    const app = createApp();
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.masterKey}`, "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify({ model: "pollinations/openai", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("pollinations");
  });
});
