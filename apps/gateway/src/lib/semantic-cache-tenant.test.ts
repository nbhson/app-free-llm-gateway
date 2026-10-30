import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { config } from "../config.js";
import { SemanticCache } from "./semantic-cache.js";

// Deterministic embedding so every entry lands at cosine similarity 1.0 —
// the exact match will miss (different query), forcing the cosine scan path.
vi.mock("./embeddings.js", () => ({
  embedWithFallback: async () => ({ embedding: [1, 0, 0], model: "mock" }),
  cosineSimilarity: (a: number[], b: number[]) => a[0] * b[0] + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0),
}));

describe("semantic-cache cosine scan — tenant isolation (M13 fix)", () => {
  let cache: SemanticCache;
  let prevEnabled: boolean;
  beforeEach(() => {
    cache = new SemanticCache(60);
    prevEnabled = config.semanticCacheEnabled;
    (config as unknown as { semanticCacheEnabled: boolean }).semanticCacheEnabled = true;
  });
  afterEach(() => {
    (config as unknown as { semanticCacheEnabled: boolean }).semanticCacheEnabled = prevEnabled;
  });

  const settle = () => new Promise((r) => setTimeout(r, 30));

  it("anonymous caller must NOT cosine-hit a tenant's entry", async () => {
    await cache.setWithOpts({ model: "m-iso", query: "tenant query", vkId: "tenant-1" }, "tenant-secret");
    await settle(); // background embedding attached
    // different query → exact-hash miss → cosine scan; must stay a miss
    const hit = await cache.get("another query", "m-iso");
    expect(hit).toBeNull();
  });

  it("tenant-1 caller must NOT cosine-hit tenant-2's entry", async () => {
    await cache.setWithOpts({ model: "m-iso2", query: "t2 query", vkId: "tenant-2" }, "t2-secret");
    await settle();
    const hit = await cache.get("any query", "m-iso2", { vkId: "tenant-1" });
    expect(hit).toBeNull();
  });

  it("tenant caller DOES cosine-hit their own entry (similar query)", async () => {
    await cache.setWithOpts({ model: "m-iso3", query: "how to sort an array in js", vkId: "tenant-9" }, "own-answer");
    await settle();
    const hit = await cache.get("sort an array in js how", "m-iso3", { vkId: "tenant-9" });
    expect(hit).toBe("own-answer");
  });

  it("anonymous caller DOES cosine-hit an anonymous entry", async () => {
    await cache.setWithOpts({ model: "m-iso4", query: "capital of france question", vkId: "anon" }, "paris");
    await settle();
    const hit = await cache.get("question capital of france", "m-iso4");
    expect(hit).toBe("paris");
  });
});
