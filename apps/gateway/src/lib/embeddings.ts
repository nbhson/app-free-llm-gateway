import { config } from "../config.js";
import { providers } from "../providers/registry.js";
import { getNextKeyManaged } from "./key-manager.js";
import { isOpen, recordSuccess, recordFailure } from "./circuit-breaker.js";
import { logger } from "../middleware/logger.js";
import { errMessage } from "./types.js";

// Default fallback chain if EMBEDDING_FALLBACKS not set or primary fails.
// Order: Cohere primary (env), then nvidia-nim, cloudflare, then hash fallback (no embedding)
const DEFAULT_FALLBACKS = ["nvidia-nim/nvidia/nv-embed-v1", "cloudflare-workers-ai/@cf/baai/bge-large-en-v1.5"];

function getEmbeddingModels(): string[] {
  const primary = config.embeddingModels.length > 0 ? config.embeddingModels : [config.embeddingModel];
  const fallbacks = config.embeddingFallbacks.length > 0 ? config.embeddingFallbacks : DEFAULT_FALLBACKS;
  const list = [...primary, ...fallbacks];
  // dedup preserve order
  return [...new Set(list)];
}

async function tryEmbedWithModel(text: string, model: string, timeoutMs = 4000): Promise<number[] | null> {
  const providerId = model.includes("/") ? model.split("/")[0] : "cohere";
  const provider = providers[providerId];
  if (!provider?.embeddings) {
    logger.warn({ provider: providerId, model }, "[embeddings] provider has no embeddings support, skipping");
    return null;
  }
  if (isOpen(providerId)) {
    logger.warn({ provider: providerId }, "[embeddings] circuit open, skipping");
    return null;
  }
  const key = getNextKeyManaged(providerId);
  if (key === null) {
    logger.warn({ provider: providerId }, "[embeddings] no key configured, skipping");
    return null;
  }
  // allow public fallback with empty key
  const trimmedModel = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  try {
    const res = await Promise.race([
      provider.embeddings({ model: trimmedModel, input: text }, key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("embed timeout")), timeoutMs)),
    ]) as Response;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      logger.warn({ provider: providerId, model, status: res.status, body: t.slice(0, 300) }, "[embeddings] non-ok");
      recordFailure(providerId);
      return null;
    }
    recordSuccess(providerId);
    const data = (await res.json().catch(async () => ({ text: await res.text() }))) as {
      data?: unknown;
      embedding?: unknown;
    };
    // OpenAI shape: { data: [{ embedding: [...] }], model }
    const first = Array.isArray(data.data) ? data.data[0] : undefined;
    const firstEmbedding = first && typeof first === "object" ? (first as { embedding?: unknown }).embedding : undefined;
    const emb = asNumberArray(firstEmbedding) ?? asNumberArray(data.embedding) ?? asNumberArray(first);
    if (emb) return emb;
    logger.warn({ provider: providerId, model, data: JSON.stringify(data).slice(0, 300) }, "[embeddings] unexpected shape");
    return null;
  } catch (e) {
    logger.warn({ provider: providerId, model, err: errMessage(e) }, "[embeddings] failed, will try fallback");
    recordFailure(providerId);
    return null;
  }
}

function asNumberArray(v: unknown): number[] | null {
  return Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number") ? (v as number[]) : null;
}

/**
 * Embed text with automatic fallback chain.
 * All candidates fire in parallel; the first success in priority order wins
 * (serial chain would stack timeouts: 3 models x timeoutMs worst case).
 * If all fail, returns null so caller can fallback to hash exact match.
 */
export async function embedWithFallback(text: string, timeoutMs = 2000): Promise<{ embedding: number[]; model: string } | null> {
  if (!text) return null;
  const models = getEmbeddingModels();
  const pending = models.map((m) => tryEmbedWithModel(text, m, timeoutMs));
  for (let i = 0; i < models.length; i++) {
    const emb = await pending[i];
    if (emb) {
      logger.info({ model: models[i], dim: emb.length }, "[embeddings] success");
      return { embedding: emb, model: models[i] };
    }
  }
  // P8: local embedding fallback (hash or transformers) before giving up
  try {
    const { localEmbed } = await import("./local-embedding.js");
    const local = await localEmbed(text);
    if (local) {
      logger.info({ dim: local.length }, "[embeddings] local fallback success");
      return { embedding: local, model: `local/${config.localEmbeddingModel}` };
    }
  } catch { /* ignore */ }
  logger.warn({ models }, "[embeddings] all fallbacks failed, will use hash fallback");
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function getFallbackModels(): string[] {
  return getEmbeddingModels();
}
