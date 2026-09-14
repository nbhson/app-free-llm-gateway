/**
 * Integration tests — full app pipeline via createApp().
 * Covers: middleware chain (secureHeaders → CORS → bodyLimit → logger → rateLimit),
 * auth (master key + virtual keys), routing, fallback, headers, error shapes.
 * No network — provider calls are mocked at the registry level.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../app.js";
import { providers } from "../providers/registry.js";
import { config } from "../config.js";

const app = createApp();

function okChat(content: string, model = "test") {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-int",
      object: "chat.completion",
      created: 1,
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function errRes(status: number, msg: string) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain" } });
}

const authHeaders = { Authorization: `Bearer ${config.masterKey}`, "Content-Type": "application/json" };

describe("integration: public endpoints (no auth)", () => {
  it("GET / returns service info", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string; health: string; models: string };
    expect(data.name).toBe("app-auto-llm-free");
    expect(data.health).toBe("/v1/health");
  });

  it("GET /v1/health works without auth", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; providers: number };
    expect(data.status).toBe("ok");
    expect(data.providers).toBeGreaterThan(40);
  });

  it("GET /health + /health/ready are LB probes without auth", async () => {
    const live = await app.request("/health");
    expect(live.status).toBe(200);
    expect((await live.json() as { status: string }).status).toBe("ok");
    const ready = await app.request("/health/ready");
    expect(ready.status).toBe(200);
    expect((await ready.json() as { ready: boolean }).ready).toBe(true);
  });

  it("GET /v1/models without auth -> 401", async () => {
    const res = await app.request("/v1/models");
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_api_key");
  });

  it("GET /v1/models with bad key -> 401", async () => {
    const res = await app.request("/v1/models", { headers: { Authorization: "Bearer fgk-invalid" } });
    expect(res.status).toBe(401);
  });

  it("unknown path -> 404 with OpenAI-style error", async () => {
    const res = await app.request("/v1/does-not-exist", { headers: authHeaders });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { type: string; message: string } };
    expect(data.error.type).toBe("not_found");
    expect(data.error.message).toContain("/v1/does-not-exist");
  });
});

describe("integration: full chat pipeline (auth → route → provider → normalize)", () => {
  const origPollinations = providers["pollinations"];
  const origLlm7 = providers["llm7-io"];
  const origKiraai = providers["kiraai"];

  afterEach(() => {
    providers["pollinations"] = origPollinations;
    providers["llm7-io"] = origLlm7;
    providers["kiraai"] = origKiraai;
  });

  it("auth + routing + provider response + X-Provider header", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => okChat("integration-ok") } as unknown as typeof origPollinations;
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "pollinations/openai", messages: [{ role: "user", content: "hi" }], stream: false }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("pollinations");
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    expect(data.choices[0].message.content).toBe("integration-ok");
  });

  it("fallback across providers surfaces the winning provider", async () => {
    providers["kiraai"] = { ...origKiraai, chat: async () => errRes(500, "int-fail-kiraai") } as unknown as typeof origKiraai;
    providers["pollinations"] = { ...origPollinations, chat: async () => errRes(500, "int-fail-1") } as unknown as typeof origPollinations;
    providers["llm7-io"] = { ...origLlm7, chat: async () => okChat("fallback-wins") } as unknown as typeof origLlm7;
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }], stream: false }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("llm7-io");
  });

  it("invalid body -> 400 through full middleware chain", async () => {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "auto" }),
    });
    expect(res.status).toBe(400);
  });

  it("x-api-key (Anthropic style) also authenticates", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => okChat("x-api-key-ok") } as unknown as typeof origPollinations;
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "x-api-key": config.masterKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", messages: [{ role: "user", content: "hi" }], stream: false }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    expect(data.choices[0].message.content).toBe("x-api-key-ok");
  });

  it("secure headers are applied (X-Content-Type-Options etc.)", async () => {
    const res = await app.request("/");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("integration: admin API with master key", () => {
  it("GET /api/providers requires auth", async () => {
    const noAuth = await app.request("/api/providers");
    expect(noAuth.status).toBe(401);
    const withAuth = await app.request("/api/providers", { headers: authHeaders });
    expect(withAuth.status).toBe(200);
    const data = (await withAuth.json()) as { providers: string[]; count: number };
    expect(data.count).toBe(data.providers.length);
  });

  it("virtual key lifecycle: create via /api/keys → use on /v1/models → delete", async () => {
    const name = `integration-${Date.now()}`;
    const createdRes = await app.request("/api/keys", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name, scopes: { models: ["*"], providers: ["*"] }, role: "user" }),
    });
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as { id: string; key: string };

    const vkRes = await app.request("/v1/models?limit=25", {
      headers: { Authorization: `Bearer ${created.key}` },
    });
    expect(vkRes.status).toBe(200);

    const delRes = await app.request(`/api/keys/${created.id}`, { method: "DELETE", headers: authHeaders });
    expect(delRes.status).toBe(200);

    const afterDel = await app.request("/v1/models?limit=25", {
      headers: { Authorization: `Bearer ${created.key}` },
    });
    expect(afterDel.status).toBe(401);
  });

  it("virtual key with scoped provider rejects x-router pin outside scope", async () => {
    const name = `integration-scope-${Date.now()}`;
    const createdRes = await app.request("/api/keys", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name, scopes: { models: ["*"], providers: ["groq"] }, role: "user" }),
    });
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as { id: string; key: string };

    const pinned = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { ...authHeaders, Authorization: `Bearer ${created.key}`, "x-router": "pollinations" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(pinned.status).toBe(403);
    const pinData = (await pinned.json()) as { error: { type: string } };
    expect(pinData.error.type).toBe("insufficient_scope");

    await app.request(`/api/keys/${created.id}`, { method: "DELETE", headers: authHeaders });
  });
});
