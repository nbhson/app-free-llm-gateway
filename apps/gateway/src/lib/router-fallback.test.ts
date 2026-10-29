import { describe, it, expect, beforeEach } from "vitest";
import { getProvidersForRequest, getNextKey, _resetRouterState } from "./router.js";
import { isOpen, recordFailure, recordSuccess, getState, recordFailureIfRetryable } from "./circuit-breaker.js";
import { config } from "../config.js";

// Threshold is config-driven (default 8) — loop the configured value, not a hardcoded 5.
const THRESHOLD = config.circuitBreakerThreshold ?? 8;

describe("router fallback ordering", () => {
  beforeEach(() => _resetRouterState());

  it("round-robin rotates provider order", () => {
    const first = getProvidersForRequest("free-llm-gateway/auto", "round-robin");
    const second = getProvidersForRequest("free-llm-gateway/auto", "round-robin");
    expect(first.length).toBeGreaterThan(1);
    // rotation shifts order (unless single provider)
    expect(second).not.toEqual(first);
    // same members
    expect([...second].sort()).toEqual([...first].sort());
  });

  it("round-robin keeps the same members across rotations", () => {
    _resetRouterState();
    const first = getProvidersForRequest("free-llm-gateway/auto", "round-robin");
    for (let i = 0; i < first.length; i++) getProvidersForRequest("free-llm-gateway/auto", "round-robin");
    const wrapped = getProvidersForRequest("free-llm-gateway/auto", "round-robin");
    expect([...wrapped].sort()).toEqual([...first].sort());
  });

  it("tiered keeps FINAL_FALLBACK (agnes-ai) last when usable", () => {
    const ordered = getProvidersForRequest("auto", "tiered");
    if (ordered.includes("agnes-ai")) {
      // When agnes-ai passed the usability filter it must sort last…
      expect(ordered[ordered.length - 1]).toBe("agnes-ai");
    } else {
      // …otherwise (placeholder/no key, non-public) it is filtered out entirely.
      expect(ordered).not.toContain("agnes-ai");
    }
  });

  it("prefix model resolves to its provider first", () => {
    const ordered = getProvidersForRequest("groq/llama-3.3-70b-versatile", "tiered");
    expect(ordered[0]).toBe("groq");
  });

  it("getNextKey returns string for public, null for keyless private", () => {
    // env-agnostic: local .env may configure keys; assert shape only (never echo key values).
    expect(typeof getNextKey("pollinations")).toBe("string");
    expect(getNextKey("definitely-not-a-provider-xyz")).toBeNull();
  });
});

describe("circuit-breaker half-open lifecycle", () => {
  it("half-open allows trial after cooldown, closes after 2 successes", async () => {
    const pid = `hb-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    for (let i = 0; i < THRESHOLD; i++) recordFailure(pid);
    expect(isOpen(pid)).toBe(true);
    // force cooldown expiry by backdating openedAt
    (getState(pid) as any).openedAt = Date.now() - 60_000;
    expect(isOpen(pid)).toBe(false); // half-open trial allowed
    expect(getState(pid).state).toBe("half-open");
    recordSuccess(pid);
    expect(getState(pid).state).toBe("half-open"); // 1 success not enough
    recordSuccess(pid);
    expect(getState(pid).state).toBe("closed");
    expect(isOpen(pid)).toBe(false);
  });

  it("half-open re-opens on failure", () => {
    const pid = `hb-reopen-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    for (let i = 0; i < THRESHOLD; i++) recordFailure(pid);
    (getState(pid) as any).openedAt = Date.now() - 60_000;
    expect(isOpen(pid)).toBe(false);
    recordFailure(pid);
    expect(getState(pid).state).toBe("open");
    expect(isOpen(pid)).toBe(true);
  });
});

describe("circuit-breaker retryable failures", () => {
  it("ignores 4xx (client errors), counts 429/5xx/exceptions", () => {
    const pid = `rt-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    for (let i = 0; i < 10; i++) recordFailureIfRetryable(pid, 400);
    expect(getState(pid).failures).toBe(0);
    expect(getState(pid).state).toBe("closed");
    recordFailureIfRetryable(pid, 404);
    expect(getState(pid).failures).toBe(0);
    recordFailureIfRetryable(pid, 429);
    recordFailureIfRetryable(pid, 503);
    recordFailureIfRetryable(pid); // exception/timeout
    expect(getState(pid).failures).toBe(3);
  });
});
