import { resJson } from "../lib/types.js";
import { describe, it, expect, afterEach } from "vitest";
import { responsesRoute } from "./v1/responses.js";
import { providers } from "../providers/registry.js";

function okChat(content = "resp-text") {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-r1",
      object: "chat.completion",
      created: 1,
      model: "x",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("responses route", () => {
  const origPollinations = providers["pollinations"];
  afterEach(() => {
    providers["pollinations"] = origPollinations;
  });

  it("rejects missing input with 400", async () => {
    const res = await responsesRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto" }),
    });
    expect(res.status).toBe(400);
  });

  it("translates chat upstream to response object", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => okChat("hello-resp") } as any;
    const res = await responsesRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", input: "Say hi", instructions: "be brief" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("pollinations");
    const data = await resJson<{
      object?: string;
      status?: string;
      id?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    }>(res);
    expect(data.object).toBe("response");
    expect(data.status).toBe("completed");
    expect(data.output?.[0]?.content?.[0]).toMatchObject({ type: "output_text", text: "hello-resp" });
    expect(data.id?.startsWith("resp_")).toBe(true);
  });

  it("passes through native responses upstream", async () => {
    const native = { id: "resp_native_1", object: "response", status: "completed", output: [] };
    providers["pollinations"] = {
      ...origPollinations,
      responses: async () => new Response(JSON.stringify(native), { status: 200 }),
    } as any;
    const res = await responsesRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", input: "hi" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "resp_native_1", object: "response" });
  });

  it("streams chat SSE converted to responses events", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"tok"}}]}\n\n'));
        c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    } as any;
    const res = await responsesRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", input: "hi", stream: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("response.output_text.delta");
    expect(text).toContain("[DONE]");
  });

  it("GET /:id returns 404 in test env", async () => {
    const res = await responsesRoute.request("/resp_abc123");
    expect(res.status).toBe(404);
  });

  it("all-fail returns 502 provider_error", async () => {
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => new Response("down", { status: 500 }),
    } as any;
    const res = await responsesRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // prefix routing constrains to pollinations only -> fast deterministic 502
      body: JSON.stringify({ model: "pollinations/openai", input: "hi" }),
    });
    expect(res.status).toBe(502);
    const data = await resJson<{ error?: { type?: string } }>(res);
    expect(data.error?.type).toBe("provider_error");
  });
});
