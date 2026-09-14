import { resJson } from "../lib/types.js";
import { describe, it, expect, afterEach } from "vitest";
import { anthropicRoute } from "./v1/anthropic.js";
import { providers } from "../providers/registry.js";

function okChat(content = "claude-text") {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-a1",
      object: "chat.completion",
      created: 1,
      model: "x",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

const baseBody = (extra: Record<string, unknown> = {}) => ({
  model: "auto",
  messages: [{ role: "user", content: "Hello" }],
  ...extra,
});

describe("anthropic route", () => {
  const origPollinations = providers["pollinations"];
  const origLlm7 = providers["llm7-io"];
  const origKiraai = providers["kiraai"];
  afterEach(() => {
    providers["pollinations"] = origPollinations;
    providers["llm7-io"] = origLlm7;
    providers["kiraai"] = origKiraai;
  });

  it("rejects missing messages with 400", async () => {
    const res = await anthropicRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto" }),
    });
    expect(res.status).toBe(400);
  });

  it("translates OpenAI chat upstream to Anthropic message", async () => {
    // pollinations has no .anthropic() -> chat branch -> OpenAI->Anthropic translation
    providers["pollinations"] = { ...origPollinations, chat: async () => okChat("hi-anthropic") } as any;
    const res = await anthropicRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify(baseBody({ model: "pollinations/openai", system: "be brief", max_tokens: 64 })),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("pollinations");
    const data = await resJson<{
      type?: string;
      role?: string;
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>(res);
    expect(data.type).toBe("message");
    expect(data.role).toBe("assistant");
    expect(data.content).toEqual([{ type: "text", text: "hi-anthropic" }]);
    expect(data.stop_reason).toBe("end_turn");
    expect(data.usage?.input_tokens ?? 0).toBeGreaterThan(0);
  });

  it("accepts array system + system-role messages, passes native anthropic upstream through", async () => {
    const native = {
      id: "msg_native_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "native-hi" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 3, output_tokens: 3 },
    };
    providers["pollinations"] = {
      ...origPollinations,
      anthropic: async () => new Response(JSON.stringify(native), { status: 200 }),
    } as any;
    const res = await anthropicRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify(
        baseBody({
          model: "pollinations/openai",
          system: [{ type: "text", text: "sys-arr" }],
          messages: [
            { role: "system", content: "extract-me" },
            { role: "user", content: "hi" },
          ],
        })
      ),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "msg_native_1", type: "message" });
  });

  it("falls back when first provider fails", async () => {
    providers["kiraai"] = { ...origKiraai, chat: async () => new Response("down", { status: 500 }) } as any;
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => new Response("down", { status: 500 }),
    } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => okChat("fallback-anth") } as any;
    const res = await anthropicRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseBody()),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("llm7-io");
  });

  it("converts OpenAI SSE to Anthropic events on stream", async () => {
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
    const res = await anthropicRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-router": "pollinations" },
      body: JSON.stringify(baseBody({ model: "pollinations/openai", stream: true })),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("content_block_delta");
    expect(text).toContain("message_stop");
  });

  it("POST /count_tokens estimates input tokens", async () => {
    const res = await anthropicRoute.request("/count_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello world, this is a test" }],
        system: "sys",
        tools: [{ name: "t" }],
      }),
    });
    expect(res.status).toBe(200);
    const data = await resJson<{ input_tokens?: number; usage?: { input_tokens?: number } }>(res);
    expect(data.input_tokens ?? data.usage?.input_tokens ?? 0).toBeGreaterThan(10);
  });
});
