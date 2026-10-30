import { describe, it, expect, beforeEach } from "vitest";
import { config } from "../config.js";
import {
  recordFailure,
  recordSuccess,
  recordFailureIfRetryable,
  isOpen,
  getState,
  resetBreakersForTest,
} from "./circuit-breaker.js";

const THRESHOLD = config.circuitBreakerThreshold ?? 8;
const COOLDOWN_MS = config.circuitBreakerCooldownMs ?? 15000;

function backdateOpen(pid: string) {
  // getState returns a live reference — backdate openedAt to simulate cooldown expiry
  const w = getState(pid) as { openedAt: number };
  w.openedAt = Date.now() - COOLDOWN_MS - 1;
}

describe("circuit-breaker half-open lifecycle", () => {
  beforeEach(() => {
    resetBreakersForTest();
  });

  it("opens after threshold, half-opens after cooldown, closes after 2 successes", () => {
    const pid = `halfopen-lifecycle-${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < THRESHOLD; i++) recordFailure(pid);
    expect(getState(pid).state).toBe("open");
    expect(isOpen(pid)).toBe(true);

    backdateOpen(pid);
    // cooldown expired → half-open allows a trial request
    expect(isOpen(pid)).toBe(false);
    expect(getState(pid).state).toBe("half-open");

    // one success is not enough to close
    recordSuccess(pid);
    expect(getState(pid).state).toBe("half-open");
    expect(isOpen(pid)).toBe(false);

    // second success closes it
    recordSuccess(pid);
    expect(getState(pid).state).toBe("closed");
    expect(isOpen(pid)).toBe(false);
  });

  it("a failure during half-open re-opens the breaker", () => {
    const pid = `halfopen-refail-${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < THRESHOLD; i++) recordFailure(pid);
    expect(isOpen(pid)).toBe(true);

    backdateOpen(pid);
    expect(isOpen(pid)).toBe(false);
    expect(getState(pid).state).toBe("half-open");

    recordFailure(pid);
    expect(getState(pid).state).toBe("open");
    expect(isOpen(pid)).toBe(true);
  });

  it("4xx client errors never trip the breaker via recordFailureIfRetryable", () => {
    const pid = `halfopen-4xx-${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < THRESHOLD + 5; i++) recordFailureIfRetryable(pid, 400);
    expect(isOpen(pid)).toBe(false);
    // but 429 does
    for (let i = 0; i < THRESHOLD; i++) recordFailureIfRetryable(pid, 429);
    expect(isOpen(pid)).toBe(true);
  });
});
