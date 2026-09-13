import { describe, it, expect } from "vitest";
import { isOpen, recordSuccess, recordFailure, recordFailureIfRetryable, getState } from "./circuit-breaker.js";

describe("circuit-breaker", () => {
  const pid = `test-provider-${Date.now()}`;

  it("starts closed", () => {
    expect(isOpen(pid)).toBe(false);
    expect(getState(pid).state).toBe("closed");
  });

  it("opens after threshold failures", async () => {
    const p2 = `${pid}-open`;
    for (let i = 0; i < 5; i++) recordFailure(p2);
    expect(isOpen(p2)).toBe(true);
    expect(getState(p2).state).toBe("open");
  });

  it("success resets failures", () => {
    const p3 = `${pid}-reset`;
    recordFailure(p3);
    recordSuccess(p3);
    expect(getState(p3).failures).toBe(0);
    expect(isOpen(p3)).toBe(false);
  });

  it("400 does not trip breaker, 402/403 budget and 5xx do", () => {
    const p400 = `${pid}-400`;
    const before = getState(p400).failures;
    recordFailureIfRetryable(p400, 400);
    expect(getState(p400).failures).toBe(before);

    const p402 = `${pid}-402`;
    recordFailureIfRetryable(p402, 402);
    expect(getState(p402).failures).toBe(1);

    const p403 = `${pid}-403`;
    recordFailureIfRetryable(p403, 403);
    expect(getState(p403).failures).toBe(1);

    const p500 = `${pid}-500`;
    recordFailureIfRetryable(p500, 500);
    expect(getState(p500).failures).toBe(1);

    const p429 = `${pid}-429`;
    recordFailureIfRetryable(p429, 429);
    expect(getState(p429).failures).toBe(1);
  });
});
