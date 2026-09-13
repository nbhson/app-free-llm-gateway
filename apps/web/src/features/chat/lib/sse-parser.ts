/**
 * Robust SSE delta extraction — shared between Chat page and unit tests.
 * Handles providers that emit content as string / array / text / reasoning variants.
 */
export function extractDelta(json: unknown): { content: string; reasoning: string } {
  if (!json || typeof json !== "object") return { content: "", reasoning: "" };
  const j = json as Record<string, unknown>;
  if (j.error && typeof j.error === "object") {
    const err = j.error as Record<string, unknown>;
    const msg = (err.message as string) || (err.error as string) || JSON.stringify(err);
    return { content: "", reasoning: `__ERROR__:${msg}` };
  }
  const choices = (j.choices as unknown[]) ?? null;
  if (Array.isArray(choices) && choices.length > 0) {
    const c = choices[0] as Record<string, unknown>;
    const d = (c.delta ?? c.message ?? {}) as Record<string, unknown> | string;
    let content = "";
    let reasoning = "";
    if (typeof d === "string") {
      content = d;
    } else {
      const dObj = d as Record<string, unknown>;
      if (Array.isArray(dObj.content)) {
        content = (dObj.content as Array<Record<string, unknown>>)
          .map((p) => (p.text as string) || (p.content as string) || (p.output_text as string) || "")
          .join("");
      } else {
        content =
          (dObj.content as string) ??
          (dObj.text as string) ??
          (dObj.output_text as string) ??
          (c.text as string) ??
          (j.content as string) ??
          (j.text as string) ??
          "";
      }
      reasoning =
        (dObj.reasoning_content as string) ??
        (dObj.reasoning as string) ??
        (dObj.thinking as string) ??
        (c.reasoning_content as string) ??
        (c.reasoning as string) ??
        (j.reasoning_content as string) ??
        (j.reasoning as string) ??
        "";
      if (!content && Array.isArray(c.content)) {
        content = (c.content as Array<Record<string, unknown>>).map((p) => (p.text as string) || "").join("");
      }
    }
    if (!content && typeof c.text === "string") content = c.text;
    return { content: content || "", reasoning: reasoning || "" };
  }
  const top =
    (j.content as string) ??
    (j.text as string) ??
    (j.output_text as string) ??
    ((j.delta as Record<string, unknown>)?.content as string) ??
    ((j.delta as Record<string, unknown>)?.text as string) ??
    "";
  return {
    content: typeof top === "string" ? top : "",
    reasoning: (j.reasoning_content as string) || (j.reasoning as string) || "",
  };
}

export type SseCallbacks = {
  onDelta?: (content: string, reasoning: string) => void;
  onUsage?: (usage: unknown) => void;
  onError?: (msg: string) => void;
};

export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: SseCallbacks,
  signal?: AbortSignal,
): Promise<{ full: string; reasoningFull: string; error: string | null; finishReason: string | null }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let reasoningFull = "";
  let streamError: string | null = null;
  let finishReason: string | null = null;

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("event:")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) continue;
        if (dataStr === "[DONE]") {
          buffer = "";
          break;
        }
        try {
          const json = JSON.parse(dataStr);
          if ((json as Record<string, unknown>).error) {
            const e = (json as Record<string, unknown>).error as Record<string, unknown>;
            streamError = (e.message as string) || (e.error as string) || JSON.stringify(e);
            callbacks.onError?.(streamError);
            continue;
          }
          if ((json as Record<string, unknown>).usage) callbacks.onUsage?.((json as Record<string, unknown>).usage);
          // capture finish_reason for truncation detection (stop/length/tool_calls)
          const ch = (json as Record<string, unknown>).choices as Array<Record<string, unknown>> | undefined;
          const fr = ch?.[0]?.finish_reason as string | null | undefined;
          if (fr) finishReason = fr;
          else if ((json as Record<string, unknown>).finish_reason) finishReason = (json as Record<string, unknown>).finish_reason as string;
          const { content: deltaContent, reasoning } = extractDelta(json);
          if (reasoning && reasoning.startsWith("__ERROR__:")) {
            streamError = reasoning.slice("__ERROR__:".length);
            callbacks.onError?.(streamError);
            continue;
          }
          if (reasoning) reasoningFull += reasoning;
          if (deltaContent) {
            full += deltaContent;
            callbacks.onDelta?.(deltaContent, reasoning);
          }
          if ((json as Record<string, unknown>).usage) callbacks.onUsage?.((json as Record<string, unknown>).usage);
        } catch {
          // ignore incomplete json
        }
      }
      if (streamError) break;
    }
    // flush leftover buffer (single data line without trailing newline)
    if (!streamError && buffer.trim().startsWith("data:")) {
      const dataStr = buffer.trim().slice(5).trim();
      if (dataStr && dataStr !== "[DONE]") {
        try {
          const json = JSON.parse(dataStr);
          const ch2 = (json as Record<string, unknown>).choices as Array<Record<string, unknown>> | undefined;
          const fr2 = ch2?.[0]?.finish_reason as string | null | undefined;
          if (fr2) finishReason = fr2;
          const { content: deltaContent, reasoning } = extractDelta(json);
          if (reasoning) reasoningFull += reasoning;
          if (deltaContent) {
            full += deltaContent;
            callbacks.onDelta?.(deltaContent, reasoning);
          }
        } catch { /* ignore */ }
      }
    }
    if (!full.trim() && reasoningFull.trim()) full = reasoningFull;
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  return { full, reasoningFull, error: streamError, finishReason };
}
