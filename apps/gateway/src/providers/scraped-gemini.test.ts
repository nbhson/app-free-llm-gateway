import { resJson } from "../lib/types.js";
import { describe, it, expect, vi, afterEach } from "vitest";
import { pollinationsProvider } from "./pollinations.js";
import { geminiProvider } from "./gemini.js";

describe("pollinations provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts OpenAI shape with alias mapping", async () => {
    const seen: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any, init: any) => {
        seen.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
        return new Response("{}", { status: 200 });
      })
    );
    await pollinationsProvider.chat({ model: "auto", messages: [{ role: "user", content: "hi" }] } as any, "");
    expect(seen[0].url).toBe("https://text.pollinations.ai/openai");
    expect(seen[0].body.model).toBe("openai");
    await pollinationsProvider.chat({ model: "pollinations/mistral", messages: [] } as any, "");
    expect(seen[1].body.model).toBe("mistral");
  });

  it("sends Authorization when apiKey present, omits when blank", async () => {
    const seen: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        seen.push({ headers: init.headers });
        return new Response("{}", { status: 200 });
      })
    );
    await pollinationsProvider.chat({ model: "auto", messages: [{ role: "user", content: "hi" }] } as any, "sk_test_123");
    expect(seen[0].headers.Authorization).toBe("Bearer sk_test_123");
    await pollinationsProvider.chat({ model: "auto", messages: [{ role: "user", content: "hi" }] } as any, "");
    expect(seen[1].headers.Authorization).toBeUndefined();
  });

  it("models() returns static list, health reflects ok/throw", async () => {
    const models = await pollinationsProvider.models();
    expect(models.map((m) => m.id)).toEqual(["pollinations/openai", "pollinations/mistral"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await pollinationsProvider.health("")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    expect(await pollinationsProvider.health("")).toBe(false);
  });
});

describe("gemini provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps freellms names to real ids and translates response", async () => {
    const seen: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any, init: any) => {
        seen.push({ url: String(url), body: JSON.parse(init.body) });
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "gem-hi" }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
          }),
          { status: 200 }
        );
      })
    );
    const res = await geminiProvider.chat(
      { model: "google-gemini/gemini 3.6 flash", messages: [{ role: "user", content: "hi" }] } as any,
      "APIKEY"
    );
    expect(seen[0].url).toContain("gemini-3.6-flash:generateContent");
    expect(seen[0].url).toContain("key=APIKEY");
    const data = await resJson<{ choices?: Array<{ message?: { content?: string } }> }>(res);
    expect(data.choices?.[0]?.message?.content).toBe("gem-hi");
  });

  it("passes non-ok upstream through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    const res = await geminiProvider.chat({ model: "gemini-flash", messages: [] } as any, "k");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("fail-fast 404 on unknown model without network call", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await geminiProvider.chat({ model: "llama-3.3-70b", messages: [] } as any, "k");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    const data = await resJson<{ error?: { type?: string } }>(res);
    expect(data.error?.type).toBe("model_not_found");
  });

  it("models() without key returns default, health catches errors", async () => {
    expect(await geminiProvider.models()).toEqual([
      { id: "gemini/gemini-3.6-flash", provider: "gemini", contextLength: 1_000_000 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    expect(await geminiProvider.health("k")).toBe(false);
  });
});
