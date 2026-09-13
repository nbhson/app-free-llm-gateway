import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Import the REAL parser from web feature (single source of truth) — no mirror drift
function findParserPath(): string {
  const candidates = [
    resolve(process.cwd(), "apps/web/src/features/chat/lib/sse-parser.ts"), // repo root
    resolve(process.cwd(), "../web/src/features/chat/lib/sse-parser.ts"), // apps/gateway
    resolve(process.cwd(), "../../apps/web/src/features/chat/lib/sse-parser.ts"), // apps/gateway via ../../
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch { /* ignore */ }
  }
  throw new Error(`sse-parser.ts not found: ${candidates.join(", ")}`);
}

const parserPath = findParserPath();
const parserCode = readFileSync(parserPath, "utf-8");

// Node >= 22.18 (default) / >= 23: native TS type stripping — import .ts directly
const modUrl = pathToFileURL(parserPath).href;
const imported = await import(modUrl);
const extractDelta = imported.extractDelta as (json: unknown) => { content: string; reasoning: string };
const parseSseStream = imported.parseSseStream as (
  stream: ReadableStream<Uint8Array>,
  cb: { onDelta?: (c: string, r: string) => void; onUsage?: (u: unknown) => void; onError?: (m: string) => void },
  signal?: AbortSignal,
) => Promise<{ full: string; reasoningFull: string; error: string | null }>;

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[i++]));
    },
  });
}

describe("chat stream parser — real web module (robust delta extraction)", () => {
  it("module exports match expected API", () => {
    expect(parserCode).toContain("export function extractDelta");
    expect(parserCode).toContain("export async function parseSseStream");
  });

  it("extracts standard delta.content", () => {
    expect(extractDelta({ choices: [{ delta: { content: "hello " } }] }).content).toBe("hello ");
  });

  it("extracts delta.text fallback (some providers use text)", () => {
    expect(extractDelta({ choices: [{ delta: { text: "hello text" } }] }).content).toBe("hello text");
  });

  it("extracts output_text variant", () => {
    expect(extractDelta({ choices: [{ delta: { output_text: "out" } }] }).content).toBe("out");
  });

  it("extracts reasoning_content separately (kilo/kira thinking)", () => {
    const { content, reasoning } = extractDelta({ choices: [{ delta: { reasoning_content: "thinking...", content: "" } }] });
    expect(content).toBe("");
    expect(reasoning).toBe("thinking...");
  });

  it("extracts reasoning and thinking variants", () => {
    expect(extractDelta({ choices: [{ delta: { reasoning: "r1" } }] }).reasoning).toBe("r1");
    expect(extractDelta({ choices: [{ delta: { thinking: "t1" } }] }).reasoning).toBe("t1");
  });

  it("handles array content (multi-part) -> joins text", () => {
    expect(extractDelta({ choices: [{ delta: { content: [{ text: "part1 " }, { text: "part2" }] } }] }).content).toBe("part1 part2");
  });

  it("handles string delta (rare providers)", () => {
    expect(extractDelta({ choices: [{ delta: "raw string" }] }).content).toBe("raw string");
  });

  it("handles top-level content fallback (non-OpenAI SSE)", () => {
    expect(extractDelta({ content: "top level" }).content).toBe("top level");
  });

  it("detects error object", () => {
    expect(extractDelta({ error: { message: "quota exceeded" } }).reasoning).toContain("__ERROR__:quota exceeded");
  });

  it("full SSE via parseSseStream: ping/event ignored, content + reasoning aggregated, [DONE] handled", async () => {
    const chunks = [
      ": ping\n\n",
      "event: delta\n",
      'data: {"choices":[{"delta":{"reasoning_content":"thinking 1 "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"thinking 2 "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"refactored code: "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"function foo() {}"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const { full, reasoningFull } = await parseSseStream(toStream(chunks), {});
    expect(reasoningFull).toBe("thinking 1 thinking 2 ");
    expect(full).toBe("refactored code: function foo() {}");
  });

  it("fallback to reasoning when content empty (model only returned thinking)", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"only reasoning"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const { full, reasoningFull } = await parseSseStream(toStream(chunks), {});
    expect(reasoningFull).toBe("only reasoning");
    expect(full).toBe("only reasoning");
  });

  it("handles leftover buffer without trailing newline (flush)", async () => {
    const chunks = ['data: {"choices":[{"delta":{"content":"hello"}}]}'];
    const { full } = await parseSseStream(toStream(chunks), {});
    expect(full).toBe("hello");
  });

  it("aggregates split JSON across chunks (incomplete line buffering)", async () => {
    const part1 = 'data: {"choices":[{"delta":{"content":"hel';
    const part2 = 'lo world"}}]}\n\n';
    const { full } = await parseSseStream(toStream([part1, part2]), {});
    expect(full).toBe("hello world");
  });

  it("handles stream error inside data", async () => {
    const chunks = ['data: {"error":{"message":"rate limited"}}\n\n'];
    const { error } = await parseSseStream(toStream(chunks), {});
    expect(error).toContain("rate limited");
  });

  it("onDelta callback receives each delta (throttle hook point)", async () => {
    const got: string[] = [];
    const chunks = ['data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"b"}}]}\n\n', "data: [DONE]\n\n"];
    await parseSseStream(toStream(chunks), { onDelta: (c) => got.push(c) });
    expect(got).toEqual(["a", "b"]);
  });

  it("onUsage callback receives usage object", async () => {
    const usages: unknown[] = [];
    const chunks = ['data: {"choices":[{"delta":{"content":"x"}}],"usage":{"total_tokens":42}}\n\n', "data: [DONE]\n\n"];
    await parseSseStream(toStream(chunks), { onUsage: (u) => usages.push(u) });
    expect(usages.length).toBeGreaterThan(0);
    expect((usages[0] as Record<string, unknown>).total_tokens).toBe(42);
  });

  it("aborts via signal (Stop button path) — throws AbortError", async () => {
    const ac = new AbortController();
    ac.abort();
    const chunks = ['data: {"choices":[{"delta":{"content":"never"}}]}\n\n'];
    await expect(parseSseStream(toStream(chunks), {}, ac.signal)).rejects.toThrow("Aborted");
  });
});
