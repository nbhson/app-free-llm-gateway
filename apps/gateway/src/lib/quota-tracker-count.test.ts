import { describe, it, expect } from "vitest";
import { checkQuota, recordUsage } from "./quota-tracker.js";

// unique key prefix per test to isolate the in-memory windows
function uniqKey(): string {
  return Math.random().toString(36).slice(2, 10) + "-count-test-key";
}

describe("recordUsage countRequest option (H2 fix — no double quota count)", () => {
  it("countRequest:false does NOT consume an RPM slot (route delta top-up)", () => {
    // kilo-code rpm=3
    const key = uniqKey();
    // executor pre-commit: 2 requests
    recordUsage("kilo-code", key, 10);
    recordUsage("kilo-code", key, 10);
    // route actual-usage top-ups must not count as extra requests
    for (let i = 0; i < 5; i++) {
      recordUsage("kilo-code", key, 5, undefined, { countRequest: false });
    }
    // 3rd request slot must still be free
    expect(checkQuota("kilo-code", key, 10).allowed).toBe(true);
    // consuming it hits the limit
    recordUsage("kilo-code", key, 10);
    expect(checkQuota("kilo-code", key, 10).allowed).toBe(false);
  });

  it("countRequest:false still adds tokens to the TPM window", () => {
    // cerebras tpm=30000
    const key = uniqKey();
    recordUsage("cerebras", key, 100); // executor estimate
    // actual usage is much higher — top up token-only
    recordUsage("cerebras", key, 29_950, undefined, { countRequest: false });
    const blocked = checkQuota("cerebras", key, 100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/TPM/);
  });

  it("full usage (default) still counts a request — executor path unchanged", () => {
    const key = uniqKey();
    recordUsage("kilo-code", key, 10);
    recordUsage("kilo-code", key, 10);
    recordUsage("kilo-code", key, 10);
    expect(checkQuota("kilo-code", key, 10).allowed).toBe(false);
  });
});
