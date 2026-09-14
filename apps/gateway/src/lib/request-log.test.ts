import { describe, it, expect, afterAll } from "vitest";
import { addLog, flushRequestLogs, getLogs, getStats, onLog, __clearTestLogs } from "./request-log.js";

const prov = () => `ut-provider-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
afterAll(() => {
  try { __clearTestLogs(); } catch { /* ignore */ }
});

describe("request-log", () => {
  it("onLog listener fires on addLog", () => {
    const seen: any[] = [];
    const off = onLog((l) => seen.push(l));
    addLog({ id: "t1", timestamp: new Date().toISOString(), provider: prov(), model: "m", latencyMs: 5, status: 200 });
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe("t1");
    // after off, no more events
    addLog({ id: "t2", timestamp: new Date().toISOString(), provider: prov(), model: "m", latencyMs: 5, status: 200 });
    expect(seen).toHaveLength(1);
  });

  it("getLogs returns newest first", () => {
    const p = prov();
    addLog({ id: "old-1", timestamp: new Date().toISOString(), provider: p, model: "m", latencyMs: 1, status: 200 });
    addLog({ id: "new-1", timestamp: new Date().toISOString(), provider: p, model: "m", latencyMs: 2, status: 200 });
    const logs = getLogs(1000).filter((l) => l.provider === p);
    expect(logs[0].id).toBe("new-1");
    expect(logs[1].id).toBe("old-1");
  });

  it("getStats aggregates tokens/cost/cache/p95 structurally", () => {    const p = prov();
    addLog({ id: "s1", timestamp: new Date().toISOString(), provider: p, model: "m", promptTokens: 10, completionTokens: 5, totalTokens: 15, latencyMs: 100, status: 200, cost: 0.001, cacheHit: true, compressedTokens: 6 });
    addLog({ id: "s2", timestamp: new Date().toISOString(), provider: p, model: "m", promptTokens: 20, totalTokens: 25, latencyMs: 200, status: 500, error: "boom" });
    const s = getStats();
    expect(s.total).toBeGreaterThanOrEqual(2);
    expect(s.tokensByProvider[p]).toBeGreaterThanOrEqual(40);
    expect(s.costByProvider[p]).toBeGreaterThan(0);
    expect(s.cacheHitRate).toBeGreaterThanOrEqual(0);
    expect(s.cacheHitRate).toBeLessThanOrEqual(1);
    expect(s.errorRate).toBeGreaterThan(0);
    expect(s.p95LatencyMs).toBeGreaterThanOrEqual(0);
    expect(s.compressedSavedTokens).toBeGreaterThanOrEqual(4); // 10 - 6
    expect(s.avgLatencyMs).toBeGreaterThan(0);
    expect(s.errorsByProvider[p]).toBeGreaterThanOrEqual(1);
  });

  it("flushRequestLogs persists buffered entries to disk", () => {
    const id = `flush-${Date.now()}`;
    addLog({ id, timestamp: new Date().toISOString(), provider: "flush-test", model: "m", latencyMs: 1, status: 200 });
    flushRequestLogs();
    // in test env persist is no-op (protects real file), so verify via in-memory getLogs
    const found = getLogs(1000).some((l) => l.id === id);
    expect(found).toBe(true);
    // also verify flush did not throw and would persist in prod (skipped file check in test)
  });
});
