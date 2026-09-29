import { describe, it, expect, vi, afterEach } from "vitest";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";

const chatReq: any = (model: string, extra: Record<string, unknown> = {}) => ({
  model,
  messages: [{ role: "user", content: "hi" }],
  stream: false,
  ...extra,
});

describe("openai-compatible provider", () => {
  const calls: { url: string; init: any }[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
  });

  function stub(ok = true, json: unknown = { ok: true }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(json), { status: ok ? 200 : 500 });
      })
    );
  }

  it("strips provider prefix and posts to /chat/completions", async () => {
    stub();
    const p = createOpenAICompatibleProvider({ id: "nvidia-nim", baseUrl: "https://x.test/v1" });
    const res = await p.chat(chatReq("nvidia-nim/z-ai/glm-5.2"), "k");
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe("https://x.test/v1/chat/completions");
    expect(JSON.parse(calls[0].init.body).model).toBe("z-ai/glm-5.2");
    expect(calls[0].init.headers.Authorization).toBe("Bearer k");
  });

  it("maps auto/gpt aliases to provider default", async () => {
    stub();
    const groq = createOpenAICompatibleProvider({ id: "groq", baseUrl: "https://g.test/v1" });
    await groq.chat(chatReq("auto"), "k");
    expect(JSON.parse(calls[0].init.body).model).toBe("llama-3.3-70b-versatile");
    await groq.chat(chatReq("gpt-4"), "k");
    expect(JSON.parse(calls[1].init.body).model).toBe("llama-3.3-70b-versatile");
  });

  it("sanitizes freellms names with spaces/parens", async () => {
    stub();
    const p = createOpenAICompatibleProvider({ id: "nvidia-nim", baseUrl: "https://x.test/v1" });
    await p.chat(chatReq("nvidia-nim/some model (free)"), "k");
    const model = JSON.parse(calls[0].init.body).model;
    expect(model).not.toMatch(/[\s()]/);
  });

  it("omits auth header without key, filters undefined fields", async () => {
    stub();
    const p = createOpenAICompatibleProvider({ id: "groq", baseUrl: "https://g.test/v1" });
    await p.chat(chatReq("groq/m", { temperature: undefined, max_tokens: undefined }), "");
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    const body = JSON.parse(calls[0].init.body);
    expect("temperature" in body).toBe(false);
    expect("max_tokens" in body).toBe(false);
  });

  it("forwards temperature/tools when set", async () => {
    stub();
    const p = createOpenAICompatibleProvider({ id: "groq", baseUrl: "https://g.test/v1" });
    const tools = [{ type: "function", function: { name: "f" } }];
    await p.chat(chatReq("groq/m", { temperature: 0.3, tools }), "k");
    const body = JSON.parse(calls[0].init.body);
    expect(body.temperature).toBe(0.3);
    expect(body.tools).toEqual(tools);
  });

  it("embeddings strips prefix, images strips prefix, transcriptions appends file", async () => {
    stub(true, { data: [{ embedding: [1] }] });
    const p = createOpenAICompatibleProvider({ id: "cohere", baseUrl: "https://c.test/v1" });
    await p.embeddings!({ model: "cohere/embed-x", input: "hi" }, "k");
    expect(JSON.parse(calls[0].init.body).model).toBe("embed-x");

    await p.images!({ model: "agnes-ai/img", prompt: "cat" }, "k");
    expect(calls[1].url).toBe("https://c.test/v1/images/generations");
    expect(JSON.parse(calls[1].init.body).model).toBe("img");

    await p.transcriptions!({ file: new Blob(["a"]), filename: "a.wav", model: "w" }, "k");
    expect(calls[2].url).toBe("https://c.test/v1/audio/transcriptions");
    expect((calls[2].init.body as FormData).get("model")).toBe("w");
  });

  it("agnes-ai images fans out n>1 into n=1 calls (upstream only accepts n=1)", async () => {
    const seen: unknown[] = [];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        seen.push(JSON.parse(init.body));
        i++;
        return new Response(JSON.stringify({ created: 7, data: [{ url: `https://img/${i}.png` }] }), { status: 200 });
      })
    );
    const p = createOpenAICompatibleProvider({ id: "agnes-ai", baseUrl: "https://a.test/v1" });
    const res = await p.images!({ model: "agnes-ai/agnes-image-2.1-flash", prompt: "cat", n: 2 }, "k");
    expect(res.ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ model: "agnes-image-2.1-flash", n: 1 });
    expect(seen[1]).toMatchObject({ n: 1 });
    const data = await res.json() as { data?: Array<{ url?: string }> };
    expect(data.data).toHaveLength(2);
    expect(data.data?.[0]?.url).toBe("https://img/1.png");
  });

  it("agnes-ai images defaults to single n=1 call, other providers forward n as-is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        calls.push({ url: String(_url), init });
        return new Response(JSON.stringify({ created: 1, data: [{ url: "https://img/1.png" }] }), { status: 200 });
      })
    );
    const agnes = createOpenAICompatibleProvider({ id: "agnes-ai", baseUrl: "https://a.test/v1" });
    await agnes.images!({ model: "agnes-ai/agnes-image-2.0-flash", prompt: "dog" }, "k");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body).n).toBe(1);

    calls.length = 0;
    const other = createOpenAICompatibleProvider({ id: "openrouter", baseUrl: "https://o.test/v1" });
    await other.images!({ model: "openrouter/m", prompt: "dog", n: 3 }, "k");
    expect(JSON.parse(calls[0].init.body).n).toBe(3);
  });

  it("speech strips prefix, models() prefixes ids, health false on throw", async () => {
    stub();
    const p = createOpenAICompatibleProvider({ id: "groq", baseUrl: "https://g.test/v1" });
    await p.speech!({ model: "groq/tts", input: "hi" }, "k");
    expect(JSON.parse(calls[0].init.body).model).toBe("tts");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200 })));
    const models = await p.models!("k");
    expect(models).toEqual([{ id: "groq/m1", provider: "groq", displayName: "m1", ownedBy: "groq" }]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    expect(await p.models!()).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    expect(await p.health("k")).toBe(false);
  });

  it("responses tries native then falls back to chat", async () => {
    // native 500 -> fallback chat
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        seen.push(String(url));
        if (String(url).endsWith("/responses")) return new Response("e", { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    const p = createOpenAICompatibleProvider({ id: "groq", baseUrl: "https://g.test/v1" });
    const res = await p.responses!({ model: "groq/m", input: "hi" }, "k");
    expect(res.ok).toBe(true);
    expect(seen).toEqual(["https://g.test/v1/responses", "https://g.test/v1/chat/completions"]);

    // native ok -> no fallback
    seen.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "r1" }), { status: 200 })));
    const res2 = await p.responses!({ model: "m", input: "hi" }, "k");
    expect(res2.ok).toBe(true);
  });

  it("retries opencode 401 with session header", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        n++;
        if (n === 1) return new Response("Unauthorized", { status: 401 });
        calls.push({ url: "retry", init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    const p = createOpenAICompatibleProvider({ id: "opencode", baseUrl: "https://o.test/v1" });
    const res = await p.chat(chatReq("opencode/mimo-v2.5-free"), "k");
    expect(res.ok).toBe(true);
    expect(n).toBe(2);
    expect(calls[0].init.headers["X-Session-ID"]).toMatch(/^ses_/);
  });
});
