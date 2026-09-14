import crypto from "node:crypto";
import type { LRUCache as LRUCacheType } from "lru-cache";
import * as LRUCacheMod from "lru-cache";
// Compat: lru-cache@10 ESM named export, CJS default via tsx interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LRUCacheImpl: any = (LRUCacheMod as any).LRUCache ?? (LRUCacheMod as any).default ?? LRUCacheMod;
import fs from "node:fs";
import path from "node:path";
import { getRedis } from "./redis.js";
import { logger } from "../middleware/logger.js";
import { config } from "../config.js";
import { resolveDataPath } from "./paths.js";

type CacheEntry = { value: string; expiresAt: number; embedding?: number[]; createdAt: number };

export interface SemanticCacheKeyOpts {
  model: string;
  query: string; // JSON.stringify(messages) normalized
  tools?: unknown;
  temperature?: number;
  vkId?: string; // tenant isolation (harness 01 retrieve - multi-tenancy)
}

const SEMANTIC_STATS_PATH = resolveDataPath("semantic-stats.json");
const isSemanticTestEnv = process.env.NODE_ENV === "test" || !!process.env.VITEST;

function loadSemanticStats(): { hits: number; misses: number } | null {
  if (isSemanticTestEnv) return null;
  try {
    if (!fs.existsSync(SEMANTIC_STATS_PATH)) return null;
    const j = JSON.parse(fs.readFileSync(SEMANTIC_STATS_PATH, "utf-8")) as { hits?: number; misses?: number };
    return { hits: j.hits ?? 0, misses: j.misses ?? 0 };
  } catch { return null; }
}

function persistSemanticStatsSync(hits: number, misses: number): void {
  if (isSemanticTestEnv) return;
  try {
    fs.mkdirSync(path.dirname(SEMANTIC_STATS_PATH), { recursive: true });
    const tmp = `${SEMANTIC_STATS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ hits, misses, updatedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, SEMANTIC_STATS_PATH);
  } catch { /* ignore */ }
}

export class SemanticCache {
  private mem: LRUCacheType<string, CacheEntry>;
  private hits = 0;
  private misses = 0;
  private customTtl?: number;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(defaultTtlSec?: number) {
    this.customTtl = defaultTtlSec;
    const ttl = defaultTtlSec ?? (typeof config.semanticCacheTtlSec === "number" && config.semanticCacheTtlSec > 0 ? config.semanticCacheTtlSec : 3600);
    const maxMemEntries = config.semanticCacheMaxMemEntries ?? 1000;
    this.mem = new (LRUCacheImpl as typeof LRUCacheType)<string, CacheEntry>({
      max: maxMemEntries,
      ttl: ttl * 1000,
      ttlAutopurge: true,
      updateAgeOnGet: true,
    });
    // restore hits/misses so /api/cache/stats survives restart
    const restored = loadSemanticStats();
    if (restored) {
      this.hits = restored.hits;
      this.misses = restored.misses;
    }
    // flush on shutdown
    if (!isSemanticTestEnv && typeof process !== "undefined" && typeof process.on === "function") {
      const flush = () => { try { persistSemanticStatsSync(this.hits, this.misses); } catch { /* ignore */ } };
      try { process.on("exit", flush); } catch { /* ignore */ }
      for (const sig of ["SIGTERM", "SIGINT", "SIGUSR2", "SIGHUP"] as const) {
        try { process.on(sig as NodeJS.Signals, () => { flush(); }); } catch { /* ignore */ }
      }
      try { process.on("beforeExit", flush); } catch { /* ignore */ }
    }
  }

  private scheduleStatsPersist(): void {
    if (isSemanticTestEnv) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      persistSemanticStatsSync(this.hits, this.misses);
    }, 800);
    this.persistTimer.unref?.();
  }

  // Live getters — read config each time so PUT /api/config hot-reload works without restart
  // If customTtl was passed via constructor (tests), respect it; otherwise follow config
  private get defaultTtl(): number {
    if (typeof this.customTtl === "number") return this.customTtl;
    return typeof config.semanticCacheTtlSec === "number" && config.semanticCacheTtlSec > 0 ? config.semanticCacheTtlSec : 3600;
  }
  private get scanCap(): number {
    return config.semanticCacheScanCap ?? 200;
  }

  /** Called after PUT /api/config mutates config — resizes LRU max in-place */
  syncConfig(): void {
    try {
      const newMax = config.semanticCacheMaxMemEntries ?? 1000;
      // lru-cache v10 supports live resize via .max setter
      (this.mem as unknown as { max: number }).max = newMax;
      logger.info({ max: newMax, ttl: this.defaultTtl, scanCap: this.scanCap }, "[semantic-cache] config synced");
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[semantic-cache] syncConfig failed");
    }
  }

  private hash(query: string): string {
    return crypto.createHash("sha256").update(query).digest("hex").slice(0, 32);
  }

  // harness 01: Hybrid key = model + tenant + tools + temperature (avoid poisoning)
  private buildKeyString(opts: SemanticCacheKeyOpts): string {
    const toolsHash = opts.tools ? this.hash(JSON.stringify(opts.tools)) : "no-tools";
    const temp = typeof opts.temperature === "number" ? String(opts.temperature) : "no-temp";
    const vk = opts.vkId || "anon";
    // keep backward compat: old key was semantic:${model}:${hash(query)} -> also check legacy on get
    const composite = JSON.stringify({
      m: opts.model,
      q: opts.query,
      t: toolsHash,
      tp: temp,
      vk,
    });
    return `semantic:${opts.model}:${vk}:${this.hash(composite)}`;
  }

  private legacyKey(query: string, model: string): string {
    return `semantic:${model}:${this.hash(query)}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }
  // lru-cache handles TTL automatically; isExpired kept for Redis fallback compat

  // Public helpers for callers (chat.ts / anthropic.ts)
  buildKey(opts: SemanticCacheKeyOpts): string {
    return this.buildKeyString(opts);
  }

  buildLegacyKey(query: string, model: string): string {
    return this.legacyKey(query, model);
  }

  async get(query: string, model: string, opts?: Partial<SemanticCacheKeyOpts> & { vkId?: string; tools?: unknown; temperature?: number }): Promise<string | null> {
    // if opts contains tenant/tools, use composite key
    const compositeKey = opts && (opts.vkId || opts.tools || typeof opts.temperature === "number")
      ? this.buildKeyString({ model, query, tools: opts.tools, temperature: opts.temperature, vkId: opts.vkId })
      : null;
    const keysToTry = compositeKey ? [compositeKey, this.legacyKey(query, model)] : [this.legacyKey(query, model)];

    // 1) exact hash fast path (Redis + mem) - try composite first then legacy for backward compat
    for (const k of keysToTry) {
      try {
        const r = getRedis();
        if (r) {
          const val = await r.get(k);
          if (val !== null) {
            this.hits++;
            // promote legacy hit to composite key on next set (no migration overhead now)
            return val;
          }
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[semantic-cache] redis get failed");
      }

      const entry = this.mem.get(k);
      if (entry) {
        if (this.isExpired(entry)) {
          this.mem.delete(k);
        } else {
          this.hits++;
          this.scheduleStatsPersist();
          // lru-cache updateAgeOnGet already promotes recency
          return entry.value;
        }
      }
    }

    // 2) semantic cosine fallback (harness 01: Hybrid Search -> vector + keyword)
    // Try to embed query and scan mem for nearest > threshold. Includes lightweight BM25-ish keyword boost.
    if (config.semanticCacheEnabled) {
      try {
        const { embedWithFallback, cosineSimilarity } = await import("./embeddings.js");
        // Add overall timeout 2000ms for embedding (harness 01: avoid 12s sequential fallback)
        const qEmb = await Promise.race([
          embedWithFallback(query),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        if (qEmb) {
          let best: { key: string; entry: CacheEntry; score: number } | null = null;
          let scanned = 0;
          const maxScan = this.scanCap;
          // LRU scan: most-recent-first (Map is insertion-order oldest-first, so reverse)
          const entries = Array.from(this.mem.entries()).reverse() as Array<[string, CacheEntry]>;
          for (const [memKey, memEntry] of entries) {
            if (this.isExpired(memEntry) || !memEntry.embedding) continue;
            // tenant/model isolation: composite keys contain vk, legacy keys contain model prefix
            if (compositeKey) {
              if (!memKey.startsWith(`semantic:${model}:`)) continue;
              // strict tenant isolation — skip cross-tenant to prevent poisoning
              if (opts?.vkId && memKey.includes(`:${opts.vkId}:`) === false) {
                continue;
              }
            } else {
              if (!memKey.startsWith(`semantic:${model}:`)) continue;
            }
            const sim = cosineSimilarity(qEmb.embedding, memEntry.embedding);
            if (sim >= config.semanticCacheThreshold && (!best || sim > best.score)) {
              best = { key: memKey, entry: memEntry, score: sim };
            }
            if (++scanned >= maxScan) break;
          }
          if (best) {
            logger.info({ score: best.score.toFixed(3), threshold: config.semanticCacheThreshold }, "[semantic-cache] cosine hit");
            this.hits++;
            this.scheduleStatsPersist();
            return best.entry.value;
          }
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[semantic-cache] cosine scan failed, fallback to miss");
      }
    }

    this.misses++;
    this.scheduleStatsPersist();
    return null;
  }

  // getWithOpts is alias for tenant-aware get
  async getWithOpts(opts: SemanticCacheKeyOpts): Promise<string | null> {
    return this.get(opts.query, opts.model, opts);
  }

  async set(query: string, model: string, response: string, ttl?: number): Promise<void> {
    // default: legacy behavior (for backward compat callers like chat.ts old signature)
    return this.setWithOpts({ model, query }, response, ttl);
  }

  async setWithOpts(opts: SemanticCacheKeyOpts, response: string, ttl?: number): Promise<void> {
    const k = this.buildKeyString(opts);
    const ttlSec = ttl ?? this.defaultTtl;
    const expiresAt = Date.now() + ttlSec * 1000;

    try {
      const r = getRedis();
      if (r) {
        await r.set(k, response, "EX", ttlSec);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[semantic-cache] redis set failed");
    }

    // background embedding: don't block caller (harness 01 RAG pipeline async store)
    let embedding: number[] | undefined;
    if (config.semanticCacheEnabled) {
      this.mem.set(k, { value: response, expiresAt, embedding: undefined, createdAt: Date.now() }, { ttl: ttlSec * 1000 });
      // enrich embedding in background
      void (async () => {
        try {
          const { embedWithFallback } = await import("./embeddings.js");
          const res = await Promise.race([
            embedWithFallback(opts.query),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
          ]);
          if (res?.embedding) {
            const entry = this.mem.get(k);
            if (entry && !this.isExpired(entry)) {
              entry.embedding = res.embedding;
            }
          }
        } catch { /* ignore */ }
      })();
      return;
    }

    this.mem.set(k, { value: response, expiresAt, embedding, createdAt: Date.now() }, { ttl: ttlSec * 1000 });
  }

  // fire-and-forget helper for callers that should not await (harness 10 Automation)
  setBackground(opts: SemanticCacheKeyOpts, response: string, ttl?: number): void {
    void this.setWithOpts(opts, response, ttl).catch(() => {});
  }

  async getStats(): Promise<{ hits: number; misses: number; hitRate: number; size: number }> {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(3)),
      size: this.mem.size,
    };
  }

  async clear(): Promise<void> {
    this.mem.clear();
    this.hits = 0;
    this.misses = 0;
    if (!isSemanticTestEnv) { try { fs.unlinkSync(SEMANTIC_STATS_PATH); } catch { /* ignore */ } }
    try {
      const r = getRedis();
      if (r) {
        let cursor = "0";
        do {
          const [next, keys] = await r.scan(cursor, "MATCH", "semantic:*", "COUNT", 100);
          cursor = next;
          if (keys.length > 0) await r.del(...keys);
        } while (cursor !== "0");
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[semantic-cache] clear redis failed");
    }
  }
}

// default export instance for convenience
export const semanticCache = new SemanticCache();
