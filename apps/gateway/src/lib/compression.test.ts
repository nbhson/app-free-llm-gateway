import { describe, it, expect } from "vitest";
import {
  toolsMinify,
  historySummarize,
  historyCondense,
  historySummarizeLLM,
  codeDedup,
  normalizeCodeBlock,
  relevanceScore,
  relevanceKeep,
  compressMessages,
  compressMessagesAsync,
  compressWithMetrics,
  compressWithMetricsAsync,
} from "./compression.js";
import { _clearSummaryCache } from "./summarizer.js";

describe("compression toolsMinify", () => {
  it("truncates long tool descriptions, keeps required/enum", () => {
    const msgs = [
      {
        role: "user",
        content: "hi",
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "x".repeat(200),
              parameters: { type: "object", properties: { city: { type: "string", enum: ["HN", "HCM"] } }, required: ["city"] },
            },
          },
        ],
      },
    ];
    const out = toolsMinify(msgs);
    const fn = (out[0] as any).tools[0].function;
    expect(fn.description.length).toBeLessThanOrEqual(101);
    expect(fn.parameters.required).toEqual(["city"]);
    expect(fn.parameters.properties.city.enum).toEqual(["HN", "HCM"]);
  });

  it("leaves messages without tools untouched (same ref content)", () => {
    const msgs = [{ role: "user", content: "hello" }];
    const out = toolsMinify(msgs);
    expect(out[0]).toBe(msgs[0]);
  });
});

describe("compression historySummarize", () => {
  it("keeps short history as-is", () => {
    const msgs = Array.from({ length: 6 }, (_, i) => ({ role: "user", content: `m${i}` }));
    expect(historySummarize(msgs)).toHaveLength(6);
  });

  it("keeps last 6 + system prompt, no duplicate system", () => {
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `m${i}` })),
    ];
    const out = historySummarize(msgs);
    expect(out).toHaveLength(7);
    expect(out[0]).toMatchObject({ role: "system" });
    expect(out.slice(1)).toHaveLength(6);
  });

  it("does not duplicate system when already in last 6", () => {
    const msgs = [
      ...Array.from({ length: 5 }, (_, i) => ({ role: "user", content: `m${i}` })),
      { role: "system", content: "sys" },
      { role: "user", content: "last" },
    ];
    const out = historySummarize(msgs);
    const sysCount = out.filter((m: any) => m.role === "system").length;
    expect(sysCount).toBe(1);
  });
});

describe("compression codeDedup", () => {
  it("removes duplicate code blocks, keeps first occurrence", () => {
    const block = "```js\nconst a = 1;\n```";
    const msgs = [
      { role: "user", content: `${block} hello` },
      { role: "user", content: `again ${block} world` },
    ];
    const out = codeDedup(msgs);
    expect(out[0].content).toContain("const a = 1");
    expect(out[1].content).not.toContain("const a = 1");
    expect(out[1].content).toContain("world");
  });

  it("leaves messages without code blocks untouched", () => {
    const msgs = [{ role: "user", content: "plain text" }];
    const out = codeDedup(msgs);
    expect(out[0]).toBe(msgs[0]);
  });
});

describe("compression normalizeCodeBlock", () => {
  it("treats re-indented copies as duplicates", () => {
    const a = "```js\nconst x = 1;\n```";
    const b = "```js\n    const  x   =  1;\n```";
    expect(normalizeCodeBlock(a)).toBe(normalizeCodeBlock(b));
    const out = codeDedup([
      { role: "user", content: `${a} first` },
      { role: "user", content: `again ${b} second` },
    ]);
    expect(out[1].content).not.toContain("const");
    expect(out[1].content).toContain("second");
  });
});

describe("compression relevanceKeep", () => {
  const history = [
    { role: "system", content: "sys" },
    { role: "user", content: "my deploy token is ABC123, keep it secret" },
    { role: "assistant", content: "noted" },
    { role: "user", content: "what is the weather today" },
    { role: "assistant", content: "sunny" },
    { role: "user", content: "tell me a joke about cats" },
    { role: "assistant", content: "haha" },
    { role: "user", content: "what time is it" },
    { role: "assistant", content: "noon" },
    { role: "user", content: "remind me what my deploy token was" },
  ];

  it("scores query-relevant messages higher", () => {
    const q = new Set(["remind", "deploy", "token"]);
    const rel = relevanceScore("my deploy token is ABC123, keep it secret", q);
    const irr = relevanceScore("tell me a joke about cats", q);
    expect(rel).toBeGreaterThan(irr);
    expect(relevanceScore("anything", new Set())).toBe(0);
  });

  it("keeps system + recent + relevant, drops irrelevant middle", () => {
    const out = relevanceKeep(history);
    expect(out[0]).toMatchObject({ role: "system" });
    // deploy-token message survives (relevant to final query)
    expect(out.some((m) => typeof m.content === "string" && m.content.includes("ABC123"))).toBe(true);
    // final query always kept
    expect(out[out.length - 1]).toMatchObject({ role: "user" });
    expect(out.length).toBeLessThan(history.length);
    // chronological order preserved
    const texts = out.map((m) => String(m.content));
    expect(texts.indexOf("sys")).toBe(0);
  });

  it("passes short history through untouched", () => {
    const short = history.slice(0, 5);
    expect(relevanceKeep(short)).toHaveLength(5);
  });
});

describe("compression historyCondense (extractive, no deletion)", () => {
  it("keeps short history as-is", () => {
    const msgs = Array.from({ length: 6 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const r = historyCondense(msgs);
    expect(r.messages).toHaveLength(6);
    expect(r.summary).toBeNull();
  });

  it("folds older messages into a labeled summary, keeps last 6 + system verbatim", () => {
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `important-fact-${i} `.repeat(10) })),
    ];
    const r = historyCondense(msgs);
    // system + summary + last 6
    expect(r.messages).toHaveLength(8);
    expect(r.messages[0]).toMatchObject({ role: "system", content: "sys" });
    expect(r.droppedCount).toBe(4);
    expect(r.summary).toContain("4 older messages");
    // dropped content survives as excerpts (not deleted)
    const summaryText = String(r.messages[1].content);
    expect(summaryText).toContain("important-fact-0");
    // recent kept verbatim
    expect(String(r.messages[r.messages.length - 1].content)).toContain("important-fact-9");
  });
});

describe("compression historySummarizeLLM", () => {
  it("keeps everything verbatim when under budget (no LLM call)", async () => {
    let called = 0;
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `m${i}` })),
    ];
    const r = await historySummarizeLLM(msgs, {
      maxTokens: 100000,
      summarize: async () => { called++; return { text: "SHOULD NOT HAPPEN", via: "llm" as const }; },
    });
    expect(called).toBe(0);
    expect(r.messages).toHaveLength(msgs.length);
    expect(r.summary).toBeNull();
  });

  it("summarizes older messages via injected summarizer when over budget", async () => {
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `deploy token ABC${i} `.repeat(50) })),
    ];
    const r = await historySummarizeLLM(msgs, {
      maxTokens: 100,
      summarize: async (dropped) => ({ text: `condensed ${dropped.length} msgs, token ABC0 inside`, via: "llm" as const }),
    });
    expect(r.droppedCount).toBe(4);
    expect(r.via).toBe("llm");
    // system + summary + last 6
    expect(r.messages).toHaveLength(8);
    expect(String(r.messages[1].content)).toContain("condensed 4 msgs");
  });

  it("mode=off keeps history untouched", async () => {
    const msgs = Array.from({ length: 12 }, (_, i) => ({ role: "user", content: `m${i} `.repeat(100) }));
    const r = await historySummarizeLLM(msgs, { maxTokens: 10, mode: "off" });
    expect(r.messages).toHaveLength(12);
    expect(r.summary).toBeNull();
  });
});

describe("compression compressMessagesAsync", () => {
  it("no longer silently deletes: older content survives as summary", async () => {
    _clearSummaryCache();
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `message ${i} `.repeat(20) })),
    ];
    const res = await compressMessagesAsync(msgs, {
      mode: "extractive",
      summarize: async () => { throw new Error("must not be called in extractive mode"); },
    });
    expect(res.summarized).toBe(true);
    expect(res.droppedMessages).toBeGreaterThan(0);
    const all = res.messages.map((m) => String(m.content)).join("\n");
    expect(all).toContain("message 0"); // oldest still present via summary
    expect(all).toContain("message 19"); // newest verbatim
  });

  it("falls back to extractive when LLM summarizer throws", async () => {
    _clearSummaryCache();
    const msgs = Array.from({ length: 12 }, (_, i) => ({ role: "user", content: `fallback-check-${i} `.repeat(40) }));
    const res = await compressMessagesAsync(msgs, {
      maxTokens: 200,
      summarize: async () => { throw new Error("provider down"); },
    });
    expect(res.summarized).toBe(true);
    expect(res.summaryVia).toBe("extractive");
    expect(res.messages.map((m) => String(m.content)).join("\n")).toContain("fallback-check-0");
  });

  it("budget loop protects the summary message", async () => {
    _clearSummaryCache();
    const msgs = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `x`.repeat(500) + i }));
    const res = await compressMessagesAsync(msgs, { maxTokens: 100, mode: "extractive" });
    const all = res.messages.map((m) => String(m.content)).join("\n");
    expect(all).toContain("older messages");
  });

  it("compressWithMetricsAsync reports summarized + via", async () => {
    _clearSummaryCache();
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `message ${i} `.repeat(20) })),
    ];
    const res = await compressWithMetricsAsync(msgs, { mode: "extractive" });
    expect(res.metrics.stage).toBe("compression");
    expect(res.summarized).toBe(true);
    expect(res.summaryVia).toBe("extractive");
  });
});
describe("compression compressMessages / compressWithMetrics", () => {
  it("compresses long history (ratio < 1, savedTokens > 0)", () => {
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `message ${i} `.repeat(20) })),
    ];
    const res = compressMessages(msgs);
    expect(res.ratio).toBeLessThan(1);
    expect(res.savedTokens).toBeGreaterThan(0);
    expect(res.messages.length).toBeLessThan(msgs.length);
  });

  it("respects maxTokens budget", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `x`.repeat(500) + i }));
    const res = compressMessages(msgs, { maxTokens: 100 });
    expect(res.messages.length).toBeLessThan(msgs.length);
  });

  it("compressWithMetrics reports applied + durationMs", () => {
    const msgs = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `message ${i} `.repeat(60) })),
    ];
    const res = compressWithMetrics(msgs);
    expect(res.metrics.stage).toBe("compression");
    expect(res.metrics.applied).toBe(true);
    expect(res.summarized).toBe(true);
    expect(res.summaryVia).toBe("extractive");
    expect(res.metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(res.metrics.originalTokens).toBeGreaterThan(res.metrics.compressedTokens);
  });

  it("short input is not marked applied", () => {
    const msgs = [{ role: "user", content: "hi" }];
    const res = compressWithMetrics(msgs);
    expect(res.metrics.applied).toBe(false);
  });
});
