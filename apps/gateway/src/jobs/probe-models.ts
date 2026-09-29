import { providers } from "../providers/registry.js";
import { config } from "../config.js";
import { errMessage } from "../lib/types.js";
import type { Provider } from "../providers/base.js";

export type ModelHealth = {
  id: string; // e.g. nvidia-nim/z-ai/glm-5.2
  provider: string;
  model: string; // raw after slash
  status: "usable" | "unusable" | "no-key" | "error" | "timeout";
  latency_ms?: number;
  error?: string;
  http_status?: number;
};

/**
 * Heuristic: image-only models must be probed via /v1/images/generations,
 * NOT /v1/chat/completions. Agnes returns 400:
 * "Model agnes-image-2.x-flash is an image model. Use /v1/images/generations."
 * Probing them via chat incorrectly marks them "unusable".
 */
export function isImageModelId(fullModelId: string): boolean {
  const low = fullModelId.toLowerCase();
  return (
    low.includes("image") ||
    low.includes("imagen") ||
    low.includes("dall-e") ||
    low.includes("dalle") ||
    low.includes("flux") ||
    low.includes("sdxl") ||
    low.includes("diffusion") ||
    low.includes("midjourney") ||
    low.includes("gpt-image") ||
    low.includes("diffusiongemma")
  );
}

function isVideoModelId(fullModelId: string): boolean {
  return fullModelId.toLowerCase().includes("video");
}

function isAudioModelId(fullModelId: string): boolean {
  const low = fullModelId.toLowerCase();
  return low.includes("tts") || low.includes("whisper") || low.includes("speech") || low.includes("audio");
}

function isEmbeddingModelId(fullModelId: string): boolean {
  const low = fullModelId.toLowerCase();
  return low.includes("embed") || low.includes("rerank");
}

/** Upstream says the model exists but needs another endpoint (not chat). */
function isWrongEndpointError(text: string): boolean {
  return /is an? (image|video|audio) model|use \/v1\/images\/generations|image model/i.test(text);
}

function isModelNotFoundError(text: string, status: number): boolean {
  if (status === 404 || status === 410) return true;
  return /model_not_found|no such model|unknown model|invalid model|does not exist|not found/i.test(text);
}

async function probeViaImages(
  provider: Provider,
  fullModelId: string,
  key: string,
  timeoutMs: number,
  start: number,
  providerId: string
): Promise<ModelHealth | null> {
  const p = provider as { images?: (req: { model: string; prompt: string }, key: string) => Promise<Response> };
  if (!p.images) return null;
  try {
    const res = await Promise.race([
      p.images({ model: fullModelId, prompt: "a small red square" }, key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    const latency = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (isModelNotFoundError(text, res.status)) {
        return { id: fullModelId, provider: providerId, model: fullModelId, status: "unusable", latency_ms: latency, error: text.slice(0, 600), http_status: res.status };
      }
      // Other 4xx (quota, validation, moderation) means the model endpoint
      // exists and auth works — don't mark unusable for transient/config errors.
      return {
        id: fullModelId,
        provider: providerId,
        model: fullModelId,
        status: "error",
        latency_ms: latency,
        error: text.slice(0, 600),
        http_status: res.status,
      };
    }
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { text }; }
    const rec = data as { data?: unknown; url?: unknown; b64_json?: unknown };
    const ok = (Array.isArray(rec.data) && rec.data.length > 0) || rec.url || rec.b64_json;
    return {
      id: fullModelId,
      provider: providerId,
      model: fullModelId,
      status: ok ? "usable" : "unusable",
      latency_ms: latency,
      http_status: res.status,
    };
  } catch (e) {
    const msg = errMessage(e);
    return {
      id: fullModelId,
      provider: providerId,
      model: fullModelId,
      status: msg === "timeout" ? "timeout" : "error",
      latency_ms: Date.now() - start,
      error: msg,
    };
  }
}

// Type-only indirection to avoid circular import at module load (registry imports nothing from here)
export async function probeModel(providerId: string, fullModelId: string, timeoutMs = 8000): Promise<ModelHealth> {
  const provider = providers[providerId];
  if (!provider) return { id: fullModelId, provider: providerId, model: fullModelId, status: "error", error: "unknown provider" };

  const keys = config.providerKeys[providerId] || [];
  const isPublic = ["pollinations", "llm7-io", "ollama-cloud", "glhf-chat", "glhf"].includes(providerId);
  if (keys.length === 0 && !isPublic) {
    return { id: fullModelId, provider: providerId, model: fullModelId, status: "no-key", error: "no API key configured" };
  }
  // Don't probe upstream with placeholder keys (xxx/change-me): report no-key locally
  // instead of leaking placeholder upstream and getting misleading usable/401.
  const realKey = keys.find((k) => {
    const t = (k || "").trim();
    if (!t || t.length <= 20) return false;
    const low = t.toLowerCase();
    return !low.includes("xxx") && !low.includes("change-me") && !low.includes("please-generate");
  });
  if (!realKey && !isPublic) {
    return { id: fullModelId, provider: providerId, model: fullModelId, status: "no-key", error: "placeholder key (set a real API key in .env)" };
  }
  const key = realKey || keys[0] || "";

  const start = Date.now();

  // Image-only models (e.g. agnes-ai/agnes-image-2.0-flash, agnes-image-2.1-flash)
  // must be probed via /v1/images/generations — chat returns 400 "is an image model".
  if (isImageModelId(fullModelId)) {
    const viaImages = await probeViaImages(provider, fullModelId, key, timeoutMs, start, providerId);
    if (viaImages) return viaImages;
    // Provider has no images() method: fall through to chat probe, whose
    // wrong-endpoint error below will still surface a usable signal.
  } else if (isVideoModelId(fullModelId) || isAudioModelId(fullModelId) || isEmbeddingModelId(fullModelId)) {
    // No dedicated probe endpoint on Provider interface for video/tts/embedding —
    // skip chat probe (would false-negative as "unusable") and check existence via /models.
    try {
      const models = await Promise.race([
        provider.models(key),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);
      const low = fullModelId.toLowerCase();
      const short = (fullModelId.split("/").pop() || "").toLowerCase();
      const found = models.some((m) => m.id.toLowerCase() === low || (m.id.split("/").pop() || "").toLowerCase() === short);
      if (found) {
        return { id: fullModelId, provider: providerId, model: fullModelId, status: "usable", latency_ms: Date.now() - start, http_status: 200, error: "non-chat model: verified via /models listing (chat probe skipped)" };
      }
    } catch { /* fall through to chat probe as last resort */ }
  }

  // Extract model after provider prefix for providers that need it, but keep full for gateway routing
  // For probe, we pass fullModelId (gateway will handle prefix stripping in openai-compatible)
  try {
    const res = await Promise.race([
      provider.chat(
        {
          model: fullModelId,
          messages: [{ role: "user" as const, content: "Hi" }],
          max_tokens: 5,
          temperature: 0,
          stream: false,
        },
        key
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);

    const latency = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Upstream confirms the model EXISTS but requires another endpoint
      // (e.g. Agnes: "Model agnes-image-2.0-flash is an image model.
      // Use /v1/images/generations."). This is NOT "unusable" — retry via
      // images endpoint when available, else mark usable with guidance.
      if (isWrongEndpointError(text)) {
        const viaImages = await probeViaImages(provider, fullModelId, key, timeoutMs, start, providerId);
        if (viaImages) return viaImages;
        return {
          id: fullModelId,
          provider: providerId,
          model: fullModelId,
          status: "usable",
          latency_ms: latency,
          error: `${text.slice(0, 300)} (hint: use /v1/images/generations for this model)`,
          http_status: res.status,
        };
      }
      const isRateLimit = res.status === 429;
      return {
        id: fullModelId,
        provider: providerId,
        model: fullModelId,
        status: isRateLimit ? "error" : "unusable",
        latency_ms: latency,
        error: text.slice(0, 600),
        http_status: res.status,
      };
    }
    // Try to parse as OpenAI shape
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { text }; }
    const rec = data as { choices?: unknown; candidates?: unknown; text?: unknown; content?: unknown };
    const ok = rec.choices || rec.candidates || rec.text || rec.content;
    return {
      id: fullModelId,
      provider: providerId,
      model: fullModelId,
      status: ok ? "usable" : "unusable",
      latency_ms: latency,
      http_status: res.status,
    };
  } catch (e) {
    const msg = errMessage(e);
    return {
      id: fullModelId,
      provider: providerId,
      model: fullModelId,
      status: msg === "timeout" ? "timeout" : "error",
      latency_ms: Date.now() - start,
      error: msg,
    };
  }
}

export async function probeModels(modelIds: string[], opts?: { timeoutMs?: number; concurrency?: number }): Promise<ModelHealth[]> {
  const concurrency = opts?.concurrency ?? 5;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const results: ModelHealth[] = [];
  // Chunked concurrency
  for (let i = 0; i < modelIds.length; i += concurrency) {
    const chunk = modelIds.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((fullId) => {
        const providerId = fullId.split("/")[0];
        return probeModel(providerId, fullId, timeoutMs);
      })
    );
    results.push(...chunkResults);
    // Small delay to avoid rate limit burst
    if (i + concurrency < modelIds.length) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}
