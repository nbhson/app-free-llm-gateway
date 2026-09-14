import { handleAll, ConsecutiveBreaker, circuitBreaker } from "cockatiel";
import type { CircuitBreakerPolicy } from "cockatiel";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";

// cockatiel-backed breaker + synchronous state for testability
// Threshold-based open is synchronous (failures counter), cockatiel provides
// half-open timing & observability via onBreak/onReset/onHalfOpen.

type Wrapped = { breaker: CircuitBreakerPolicy; failures: number; successes: number; state: "closed" | "open" | "half-open"; openedAt: number };
const breakers = new Map<string, Wrapped>();

function getWrapped(providerId: string): Wrapped {
  let w = breakers.get(providerId);
  if (!w) {
    const breaker = circuitBreaker(handleAll, { halfOpenAfter: config.circuitBreakerCooldownMs ?? 15000, breaker: new ConsecutiveBreaker(config.circuitBreakerThreshold ?? 3) });
    breaker.onBreak(() => logger.warn({ provider: providerId }, "circuit opened (cockatiel)"));
    breaker.onReset(() => logger.info({ provider: providerId }, "circuit closed (cockatiel)"));
    breaker.onHalfOpen(() => logger.info({ provider: providerId }, "circuit half-open (cockatiel)"));
    w = { breaker, failures: 0, successes: 0, state: "closed", openedAt: 0 };
    breakers.set(providerId, w);
  }
  return w;
}

export function recordSuccess(providerId: string) {
  const w = getWrapped(providerId);
  w.failures = 0;
  w.successes++;
  // if half-open, 2 successes close it
  if (w.state === "half-open" && w.successes >= 2) {
    w.state = "closed";
    w.successes = 0;
    try { w.breaker.execute(() => Promise.resolve()).catch(() => {}); } catch { /* ignore */ }
  } else if (w.state === "open") {
    w.state = "closed";
  } else {
    try { w.breaker.execute(() => Promise.resolve()).catch(() => {}); } catch { /* ignore */ }
  }
}

export function recordFailure(providerId: string) {
  const w = getWrapped(providerId);
  w.failures++;
  w.successes = 0;
  if (w.state === "closed" && w.failures >= (config.circuitBreakerThreshold ?? 3)) {
    w.state = "open";
    w.openedAt = Date.now();
  } else if (w.state === "half-open") {
    w.state = "open";
    w.openedAt = Date.now();
  }
  try { w.breaker.execute(() => Promise.reject(new Error("provider failure"))).catch(() => {}); } catch { /* ignore */ }
}

/**
 * Count a failure only when it indicates provider trouble: network exception
 * (status undefined), 429, 402/403 budget exhausted, or 5xx. Plain 4xx like
 * 400 invalid model means the request itself was bad.
 * Pollinations budget (402/403 "reached its budget") is retryable so the
 * gateway can fallback to next provider and open circuit after threshold.
 */
export function recordFailureIfRetryable(providerId: string, status?: number): void {
  if (status !== undefined && status !== 429 && status !== 402 && status !== 403 && status < 500) return;
  recordFailure(providerId);
}

export function isOpen(providerId: string): boolean {
  const w = breakers.get(providerId);
  if (!w) return false;
  if (w.state === "closed") return false;
  if (w.state === "open") {
    const elapsed = Date.now() - w.openedAt;
    if (elapsed >= (config.circuitBreakerCooldownMs ?? 15000)) {
      w.state = "half-open";
      w.successes = 0;
      logger.info({ provider: providerId }, "circuit half-open (cooldown expired)");
      return false;
    }
    return true;
  }
  return false; // half-open allows trial
}

export function getState(providerId: string) {
  const w = getWrapped(providerId);
  // Return live reference so tests can backdate openedAt (legacy behavior)
  // Add cockatielState for observability without breaking mutation
  (w as unknown as Record<string, unknown>).cockatielState = w.breaker.state as unknown as number;
  return w as unknown as ReturnType<typeof getWrapped> & { state: string; failures: number; successes: number; openedAt: number; cockatielState: number };
}

export function getAllStates() {
  const out: Record<string, unknown> = {};
  for (const k of breakers.keys()) out[k] = getState(k);
  return out;
}

export function syncBreakerConfig(): void {
  // Recreate breakers whose cockatiel threshold/cooldown diverged from config
  // cheapest is to clear and let getWrapped lazily recreate with new config
  // keep failure counts? For hot-reload UX, preserve failures but update inner breaker threshold
  for (const [id, w] of breakers.entries()) {
    try {
      const desiredThreshold = config.circuitBreakerThreshold ?? 5;
      const desiredCooldown = config.circuitBreakerCooldownMs ?? 15000;
      // cockatiel breaker is immutable — recreate with new params preserving state
      const newBreaker = circuitBreaker(handleAll, { halfOpenAfter: desiredCooldown, breaker: new ConsecutiveBreaker(desiredThreshold) });
      newBreaker.onBreak(() => logger.warn({ provider: id }, "circuit opened (cockatiel)"));
      newBreaker.onReset(() => logger.info({ provider: id }, "circuit closed (cockatiel)"));
      newBreaker.onHalfOpen(() => logger.info({ provider: id }, "circuit half-open (cockatiel)"));
      // preserve state: if was open/half-open keep openedAt, otherwise closed
      const prevState = w.state;
      const prevOpenedAt = w.openedAt;
      const prevFailures = w.failures;
      const prevSuccesses = w.successes;
      // replace inner breaker, keep failure counters
      (w as unknown as { breaker: CircuitBreakerPolicy }).breaker = newBreaker;
      w.state = prevState;
      w.openedAt = prevOpenedAt;
      w.failures = prevFailures;
      w.successes = prevSuccesses;
    } catch (err) {
      logger.warn({ provider: id, err: (err as Error).message }, "[circuit-breaker] sync failed");
    }
  }
  logger.info({ threshold: config.circuitBreakerThreshold, cooldown: config.circuitBreakerCooldownMs }, "[circuit-breaker] config synced");
}
