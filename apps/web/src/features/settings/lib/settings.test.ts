import { describe, it, expect } from "vitest";
import { normalizeTiersString, validateSettings } from "./helpers";
import { DEFAULTS } from "./constants";

describe("normalizeTiersString", () => {
  it("dedupes and trims provider ids within a tier", () => {
    expect(normalizeTiersString(JSON.stringify([["groq", " groq ", "pollinations"]]))).toBe(
      JSON.stringify([["groq", "pollinations"]])
    );
  });

  it("drops empty tiers and enforces the 60/tier cap", () => {
    const sixtyOne = Array.from({ length: 61 }, (_, i) => `p${i}`);
    const out = JSON.parse(normalizeTiersString(JSON.stringify([[], sixtyOne]))) as string[][];
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(60);
  });

  it("returns input unchanged for invalid JSON or non-arrays", () => {
    expect(normalizeTiersString("not-json")).toBe("not-json");
    expect(normalizeTiersString(JSON.stringify({ a: 1 }))).toBe(JSON.stringify({ a: 1 }));
  });
});

describe("validateSettings", () => {
  it("accepts defaults", () => {
    expect(validateSettings(DEFAULTS)).toEqual([]);
  });

  it("flags out-of-range numeric fields", () => {
    const errs = validateSettings({ ...DEFAULTS, SEMANTIC_THRESHOLD: 1.5, CACHE_TTL_S: 10 });
    expect(errs).toContain("SEMANTIC_THRESHOLD must be 0..1");
    expect(errs).toContain("CACHE_TTL_S must be 60..604800");
  });

  it("flags invalid fallback tiers JSON", () => {
    const errs = validateSettings({ ...DEFAULTS, FALLBACK_TIERS: "{oops" });
    expect(errs).toContain("FALLBACK_TIERS invalid JSON");
  });

  it("flags too many tiers / providers", () => {
    const nineTiers = Array.from({ length: 9 }, (_, i) => [`prov-${i}`]);
    expect(validateSettings({ ...DEFAULTS, FALLBACK_TIERS: JSON.stringify(nineTiers) })).toContain(
      "FALLBACK_TIERS must be 1..8 tiers"
    );
    const bigTier = Array.from({ length: 201 }, (_, i) => `p${i}`);
    expect(validateSettings({ ...DEFAULTS, FALLBACK_TIERS: JSON.stringify([bigTier]) })).toContain(
      "Total providers exceed 200"
    );
  });
});
