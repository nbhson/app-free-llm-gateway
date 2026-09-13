import { config } from "../config.js";
import { logger } from "../middleware/logger.js";

/**
 * Local embedding fallback — hash-based deterministic embedding when no upstream.
 * If Xenova/transformers is available, use it; otherwise use stable hash embedding.
 * Keeps gateway 100% offline-capable for semantic cache without Cohere/NVIDIA keys.
 */

function hashEmbedding(text: string, dim = 384): number[] {
  // Simple deterministic char-n-gram hash -> normalized vector, cosine-ready
  const vec = new Array(dim).fill(0);
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const idx = (code * 31 + i * 7) % dim;
    vec[idx] += Math.sin(code + i) + 1;
    const idx2 = (code * 17 + i * 13) % dim;
    vec[idx2] += Math.cos(code * 2 + i) * 0.5;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((a,b)=> a + b*b, 0)) || 1;
  return vec.map(v=> v / norm);
}

let pipelinePromise: Promise<((text:string)=>Promise<number[]>) | null> | null = null;

async function tryLoadTransformers(): Promise<((text:string)=>Promise<number[]>) | null> {
  if (!config.localEmbeddingEnabled) return null;
  try {
    // dynamic import optional dep — if not installed, fall back to hash
    const mod = await import("@huggingface/transformers" as unknown as string).catch(()=> null) as unknown as { pipeline?: (task:string, model:string)=>Promise<(t:string)=>Promise<{data:number[] }>> } | null;
    if (!mod || !("pipeline" in mod) || !mod.pipeline) return null;
    const pipe = await mod.pipeline("feature-extraction", config.localEmbeddingModel);
    return async (text:string) => {
      const out = await (pipe as unknown as (t:string, opts:{pooling:string,normalize:boolean})=>Promise<{data:number[]}>)(text, { pooling: "mean", normalize: true });
      return Array.from(out.data as unknown as number[]);
    };
  } catch (e) { logger.warn({ err: (e as Error).message }, "[local-embedding] transformers load failed, using hash"); return null; }
}

export async function localEmbed(text: string): Promise<number[] | null> {
  if (!config.localEmbeddingEnabled) return hashEmbedding(text);
  try {
    if (!pipelinePromise) pipelinePromise = tryLoadTransformers();
    const fn = await pipelinePromise;
    if (fn) {
      const v = await fn(text);
      if (v && v.length>0) return v;
    }
  } catch { /* ignore */ }
  // fallback hash always succeeds
  return hashEmbedding(text);
}

export function localEmbeddingAvailable(): boolean {
  return true; // hash always available; transformers optional
}
