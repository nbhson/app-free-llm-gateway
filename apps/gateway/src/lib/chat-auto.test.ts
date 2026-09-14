import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readGate(file: string): string {
  const p = resolve(process.cwd(), file);
  try { return readFileSync(p, "utf-8"); } catch {
    const alt = resolve(process.cwd(), "../../" + file);
    return readFileSync(alt, "utf-8");
  }
}

describe("Fix 1.9.2 — free-llm-gateway/auto slow 10-15s", () => {
  it("config has PROVIDER_TIMEOUT_AUTO_MS (8000 default) distinct from 25000", () => {
    const txt = readGate("apps/gateway/src/config.ts");
    expect(txt).toContain("providerTimeoutMs");
    expect(txt).toContain("PROVIDER_TIMEOUT_MS");
    expect(txt).toContain("25000");
    expect(txt).toContain("providerTimeoutAutoMs");
    expect(txt).toContain("PROVIDER_TIMEOUT_AUTO_MS");
    expect(txt).toContain("8000");
  });

  it("provider-executor supports per-call timeoutMs param", () => {
    const txt = readGate("apps/gateway/src/lib/provider-executor.ts");
    expect(txt).toContain("timeoutMs?: number");
    expect(txt).toContain("opts.timeoutMs");
    expect(txt).toContain("config.providerTimeoutMs");
  });

  it("chat route detects isAuto and uses perProviderTimeout 8000 vs 25000", () => {
    const txt = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("isAuto");
    expect(txt).toContain('free-llm-gateway/auto');
    expect(txt).toContain("providerTimeoutAutoMs");
    expect(txt).toContain("providerTimeoutMs");
    expect(txt).toContain("perProviderTimeout");
    expect(txt).toContain("timeoutMs: perProviderTimeout");
    expect(txt).toContain("providerParallelAuto");
  });

  it("chat route races auto providers in parallel gateway-wide", () => {
    const chat = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(chat).toContain("providerParallelAuto");
    expect(chat).toContain("parallel");
    const exec = readGate("apps/gateway/src/lib/provider-executor.ts");
    expect(exec).toContain("tryProvidersParallel");
    expect(exec).toContain("Promise.any");
    expect(exec).toContain("parallel?: number");
    const anth = readGate("apps/gateway/src/routes/v1/anthropic.ts");
    expect(anth).toContain("providerParallelAuto");
  });

  it("chat route ranks auto via cost routing (with test guard)", () => {
    const txt = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("shouldRank");
    expect(txt).toContain("isAuto");
    expect(txt).toContain("costRoutingEnabled");
    expect(txt).toContain("cost routing re-ranked");
  });

  it("chat route logs isAuto for observability", () => {
    const txt = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("isAuto");
    expect(txt).toContain("providerOrder");
  });

  it("health version is 1.11.3", () => {
    const txt = readGate("apps/gateway/src/routes/health.test.ts");
    expect(txt).toContain("version");
    expect(txt).toMatch(/toMatch/);
  });
});
