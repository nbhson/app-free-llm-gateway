import type { Provider, ChatRequest, ModelInfo } from "./base.js";
import { translateOpenAIToGemini, translateGeminiToOpenAI } from "../lib/format-translator.js";
import { geminiToOpenAIStream } from "../lib/gemini-stream.js";

function sanitizeGeminiModel(raw: string): string {
  // raw like "gemini/gemini 3.6 flash" or "gemini-2.0-flash" or "auto"
  const base = raw.includes("/") ? raw.split("/").pop()! : raw;
  const cleaned = base.trim().toLowerCase();
  // Live / transcribe / native-audio — keep exact id (do not collapse to 3.6)
  if (cleaned.includes("transcribe-live") || cleaned.includes("transcribe live")) return "gemini-3.5-transcribe-live";
  if (cleaned.includes("live-translate") || cleaned.includes("live translate")) return "gemini-3.5-live-translate";
  if (cleaned.includes("native-audio") || cleaned.includes("native audio")) {
    if (cleaned.includes("dialog")) return "gemini-2.5-flash-native-audio-dialog";
    return "gemini-2.5-flash-native-audio-dialog";
  }
  if (cleaned.includes("flash-live") || cleaned.includes("flash live")) return "gemini-3-flash-live";
  // Gemma 4 — keep exact
  if (cleaned.includes("gemma-4-31") || cleaned.includes("gemma 4 31")) return "gemma-4-31b-it";
  if (cleaned.includes("gemma-4-26") || cleaned.includes("gemma 4 26")) return "gemma-4-26b-a4b-it";
  if (cleaned.includes("gemma")) return cleaned.replace(/\s+/g, "-");
  // Map freellms names with spaces to real Gemini ids (2026-09: 2.0 gone, use 3.6)
  if (cleaned.includes("3.6")) return "gemini-3.6-flash";
  if (cleaned.includes("3.5") && cleaned.includes("lite")) return "gemini-3.5-flash-lite";
  if (cleaned.includes("3.5")) return "gemini-3.6-flash";
  if (cleaned.includes("3.1") && cleaned.includes("lite")) return "gemini-3.6-flash";
  if (cleaned.includes("3.1")) return "gemini-3.6-flash";
  if (cleaned.includes("2.5")) return "gemini-2.5-flash";
  if (cleaned.includes("2.0")) return "gemini-3.6-flash";
  if (cleaned.includes("1.5")) return "gemini-1.5-flash";
  if (cleaned === "auto" || cleaned === "gemini" || cleaned === "gemini-flash" || cleaned === "gemini flash latest") return "gemini-3.6-flash";
  // Keep dash form if looks like gemini-* or gemma-*
  if (cleaned.startsWith("gemini-") || cleaned.startsWith("gemma-")) return cleaned.replace(/\s+/g, "-");
  return "gemini-3.6-flash";
}

/** Fail-fast guard: refuse unknown model ids locally instead of burning an upstream call. */
const KNOWN_GEMINI_PATTERNS = ["gemini", "gemma", "auto", "flash", "live", "transcribe", "native-audio"];

export function isKnownGeminiModel(raw: string): boolean {
  const base = raw.includes("/") ? raw.split("/").pop()! : raw;
  const cleaned = base.trim().toLowerCase();
  return KNOWN_GEMINI_PATTERNS.some((p) => cleaned.includes(p));
}

export const geminiProvider: Provider = {
  id: "gemini",
  type: "gemini",
  async chat(req: ChatRequest, apiKey: string): Promise<Response> {
    if (!isKnownGeminiModel(req.model)) {
      return new Response(JSON.stringify({ error: { message: `unknown gemini model: ${req.model}`, type: "model_not_found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const geminiModel = sanitizeGeminiModel(req.model);
    const isStream = req.stream ?? false;
    const endpoint = isStream ? "streamGenerateContent" : "generateContent";
    // alt=sse for true SSE from Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${endpoint}${isStream ? "?alt=sse" : ""}&key=${apiKey}`;

    const geminiBody = translateOpenAIToGemini(req);

    if (!isStream) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
      if (!res.ok) return res;
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> }; finishReason?: string }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };
      const openAI = translateGeminiToOpenAI(data, geminiModel, req.model);
      return new Response(JSON.stringify(openAI), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
    if (!res.ok) return res;
    const stream = res.body;
    if (!stream) return res;
    // Transform Gemini SSE JSON to OpenAI SSE
    const ct = res.headers.get("content-type") || "";
    // If Gemini already returns text/event-stream with JSON, transform; else wrap
    const transformed = ct.includes("text/event-stream") || ct.includes("application/json")
      ? geminiToOpenAIStream(stream, req.model)
      : stream;
    return new Response(transformed, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  },
  async models(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) return [{ id: "gemini/gemini-3.6-flash", provider: "gemini", contextLength: 1_000_000 }];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) return [{ id: "gemini/gemini-3.6-flash", provider: "gemini" }];
      const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string }> };
      return (data.models || []).map((m) => ({
        id: `gemini/${m.name.replace("models/", "")}`,
        provider: "gemini",
        displayName: m.displayName,
      }));
    } catch {
      return [{ id: "gemini/gemini-3.6-flash", provider: "gemini" }];
    }
  },
  async health(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  },
};
