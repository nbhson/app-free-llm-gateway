import { describe, it, expect, beforeEach } from "vitest";
import {
  isDemoted,
  partitionByPairHealth,
  recordModelFailure,
  recordPairSuccess,
  getPairState,
  getAllPairStates,
  isModelShapedFailure,
  MODEL_FAIL_THRESHOLD,
  MODEL_DEMOTE_TTL_MS,
  _resetPairHealth,
  pairKey,
} from "./pair-health.js";

describe("pair-health", () => {
  beforeEach(() => _resetPairHealth());

  it("isModelShapedFailure only for 400/404/422", () => {
    expect(isModelShapedFailure(400)).toBe(true);
    expect(isModelShapedFailure(404)).toBe(true);
    expect(isModelShapedFailure(422)).toBe(true);
    expect(isModelShapedFailure(401)).toBe(false);
    expect(isModelShapedFailure(429)).toBe(false);
    expect(isModelShapedFailure(500)).toBe(false);
    expect(isModelShapedFailure(402)).toBe(false);
  });

  it("does not demote before threshold", () => {
    recordModelFailure("p1", "model-x", "model not found");
    expect(isDemoted("p1", "model-x")).toBe(false);
    expect(MODEL_FAIL_THRESHOLD).toBeGreaterThanOrEqual(2);
  });

  it("demotes after consecutive failures and recovers after TTL", () => {
    recordModelFailure("p1", "model-x", "model not found");
    recordModelFailure("p1", "model-x", "model not found");
    expect(isDemoted("p1", "model-x")).toBe(true);
    // different model on same provider is unaffected
    expect(isDemoted("p1", "model-y")).toBe(false);
    // different provider with same model is unaffected
    expect(isDemoted("p2", "model-x")).toBe(false);
    // force expire
    const st = getPairState("p1", "model-x")!;
    st.demotedUntil = Date.now() - 1;
    expect(isDemoted("p1", "model-x")).toBe(false);
    expect(MODEL_DEMOTE_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("success on the pair clears failure memory", () => {
    recordModelFailure("p1", "model-x", "bad model");
    recordModelFailure("p1", "model-x", "bad model");
    expect(isDemoted("p1", "model-x")).toBe(true);
    recordPairSuccess("p1", "model-x");
    expect(getPairState("p1", "model-x")!.consecutive).toBe(0);
    expect(isDemoted("p1", "model-x")).toBe(false);
  });

  it("success on a healthy pair is a no-op (no state created)", () => {
    recordPairSuccess("p1", "model-x");
    expect(getPairState("p1", "model-x")).toBeUndefined();
  });

  it("partitionByPairHealth moves demoted pairs to the back, keeps order stable", () => {
    recordModelFailure("b", "m", "nf");
    recordModelFailure("b", "m", "nf");
    const order = [{ pid: "a", model: "m" }, { pid: "b", model: "m" }, { pid: "c", model: "m" }];
    const { healthy, demoted } = partitionByPairHealth(order);
    expect(healthy.map((x) => x.pid)).toEqual(["a", "c"]);
    expect(demoted.map((x) => x.pid)).toEqual(["b"]);
    // joined: healthy first, demoted last
    expect([...healthy, ...demoted].map((x) => x.pid)).toEqual(["a", "c", "b"]);
  });

  it("partitionByPairHealth without model keeps everything healthy", () => {
    recordModelFailure("b", "m", "nf");
    recordModelFailure("b", "m", "nf");
    const order = [{ pid: "a" }, { pid: "b" }];
    const { healthy, demoted } = partitionByPairHealth(order);
    expect(healthy).toHaveLength(2);
    expect(demoted).toHaveLength(0);
  });

  it("getAllPairStates exposes state for observability", () => {
    recordModelFailure("p9", "m1", "err text");
    const all = getAllPairStates();
    expect(all[pairKey("p9", "m1")]).toMatchObject({ consecutive: 1 });
  });
});
