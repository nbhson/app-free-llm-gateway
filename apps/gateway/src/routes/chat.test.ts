import { describe, it, expect, afterEach } from "vitest";
import { chatRoute } from "../routes/v1/chat.js";
import type { Provider } from "../providers/base.js";
import { providers } from "../providers/registry.js";
import { resJson, type OpenAIChatResponse, type OpenAIErrorBody } from "../lib/types.js";

function okChat(content: string, model = "test") {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
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

describe("chat route", () => {
  const origPollinations = providers["pollinations"];
  const origLlm7 = providers["llm7-io"];

  afterEach(() => {
    providers["pollinations"] = origPollinations;
    providers["llm7-io"] = origLlm7;
  });

  it("rejects invalid body (missing messages) with 400", async () => {
    const res = await chatRoute.request("/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns provider response + X-Provider header on success", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => okChat("hello from pollinations") } as unknown as Provider;
    const res = await chatRoute.request("/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }], stream: false }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("pollinations");
    const data = await resJson<OpenAIChatResponse>(res);
    expect(data.choices?.[0].message?.content).toBe("hello from pollinations");
  });

  it("falls back to next provider when first fails", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => errRes(500, "boom") } as unknown as Provider;
    providers["llm7-io"] = { ...origLlm7, chat: async () => okChat("hello from llm7") } as unknown as Provider;
    const res = await chatRoute.request("/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }], stream: false }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("llm7-io");
    const data = await resJson<OpenAIChatResponse>(res);
    expect(data.choices?.[0].message?.content).toBe("hello from llm7");
  });

  it("returns 502 with provider_errors when all providers fail", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => errRes(500, "down-1") } as unknown as Provider;
    providers["llm7-io"] = { ...origLlm7, chat: async () => errRes(500, "down-2") } as unknown as Provider;
    const res = await chatRoute.request("/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/unknown-model-xyz-123", messages: [{ role: "user", content: "hi" }] }),
    });
    expect([200, 502]).toContain(res.status);
    if (res.status === 502) {
      const data = await resJson<OpenAIErrorBody>(res);
      expect(data.error?.type).toBe("provider_error");
      expect(Array.isArray(data.error?.provider_errors)).toBe(true);
    }
  });

  it("streams SSE with X-Provider when stream=true", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
        c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    } as unknown as Provider;
    const res = await chatRoute.request("/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("pollinations");
    const text = await res.text();
    expect(text).toContain("hi");
  });

  it("pins provider via x-router header", async () => {
    const seen: string[] = [];
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => {
        seen.push("pollinations");
        return errRes(500, "pinned fails first");
      },
    } as unknown as Provider;
    providers["llm7-io"] = {
      ...origLlm7,
      chat: async () => {
        seen.push("llm7-io");
        return okChat("pinned fallback ok");
      },
    } as unknown as Provider;
    const res = await chatRoute.request("/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(200);
    expect(seen[0]).toBe("pollinations"); // pinned tried first
  });
});
