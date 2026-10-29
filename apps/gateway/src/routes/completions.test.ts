import { resJson } from "../lib/types.js";
import { describe, it, expect, afterEach } from "vitest";
import { completionsRoute } from "./v1/completions.js";
import { providers } from "../providers/registry.js";

function okChat(content = "legacy-text") {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-c1",
      object: "chat.completion",
      created: 1,
      model: "x",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("legacy /v1/completions", () => {
  const origPollinations = providers["pollinations"];
  afterEach(() => {
    providers["pollinations"] = origPollinations;
  });

  it("rejects missing prompt with 400", async () => {
    const res = await completionsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects stream=true with 400 and a clear message", async () => {
    const res = await completionsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", prompt: "hi", stream: true }),
    });
    expect(res.status).toBe(400);
    const data = await resJson<{ error?: { type?: string; message?: string } }>(res);
    expect(data.error?.type).toBe("invalid_request_error");
    expect(data.error?.message).toContain("/v1/chat/completions");
  });

  it("translates prompt → chat and returns legacy text_completion shape", async () => {
    const seen: Array<{ model?: string; messages?: Array<{ role?: string; content?: unknown }> }> = [];
    providers["pollinations"] = {
      ...origPollinations,
      chat: async (req: { model?: string; messages?: Array<{ role?: string; content?: unknown }> }) => {
        seen.push(req);
        return okChat("hello-legacy");
      },
    } as any;
    const res = await completionsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", prompt: "Say hi in one word", max_tokens: 8 }),
    });
    expect(res.status).toBe(200);
    expect(seen[0]?.messages?.[0]?.role).toBe("user");
    expect(seen[0]?.messages?.[0]?.content).toBe("Say hi in one word");
    const data = await resJson<{
      object?: string;
      choices?: Array<{ text?: string; finish_reason?: string; logprobs?: unknown }>;
      usage?: { total_tokens?: number };
      _provider?: string;
    }>(res);
    expect(data.object).toBe("text_completion");
    expect(data.choices?.[0]?.text).toBe("hello-legacy");
    expect(data.choices?.[0]?.finish_reason).toBe("stop");
    expect(data.usage?.total_tokens).toBe(8);
    expect(data._provider).toBe("pollinations");
  });

  it("returns 502 when upstream yields no text", async () => {
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => new Response(JSON.stringify({ choices: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    } as any;
    const res = await completionsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", prompt: "hi" }),
    });
    expect(res.status).toBe(502);
  });
});
