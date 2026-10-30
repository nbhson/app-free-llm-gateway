import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  setByokKeys,
  getByokKeys,
  getByokForVk,
  getEffectiveKeys,
  listByokProviders,
  hasByok,
} from "./byok-store.js";
import { resolveDataPath } from "./paths.js";

// unique vk per run — the store file is shared across the suite
const vk = `vk-byok-test-${Math.random().toString(36).slice(2, 8)}`;

describe("byok-store", () => {
  it("stores and deletes per provider", () => {
    setByokKeys(vk, "groq", ["gsk_test_123", "gsk_test_456"]);
    expect(getByokKeys(vk, "groq")).toEqual(["gsk_test_123", "gsk_test_456"]);
    expect(hasByok(vk, "groq")).toBe(true);
    expect(listByokProviders(vk)).toContain("groq");
    expect(Object.keys(getByokForVk(vk))).toContain("groq");

    setByokKeys(vk, "groq", []);
    expect(getByokKeys(vk, "groq")).toEqual([]);
    expect(hasByok(vk, "groq")).toBe(false);
  });

  it("getEffectiveKeys overrides gateway keys only when BYOK is present", () => {
    const gw = ["gateway-key-1"];
    expect(getEffectiveKeys("gemini", vk, gw)).toEqual(gw); // no BYOK → fallback
    setByokKeys(vk, "gemini", ["user-key-1"]);
    expect(getEffectiveKeys("gemini", vk, gw)).toEqual(["user-key-1"]);
    setByokKeys(vk, "gemini", []);
    expect(getEffectiveKeys("gemini", vk, gw)).toEqual(gw);
    // no vkId at all → gateway keys
    expect(getEffectiveKeys("gemini", undefined, gw)).toEqual(gw);
  });

  it("isolates vkIds (no cross-tenant reads)", () => {
    setByokKeys(vk, "cohere", ["vk-only-key"]);
    expect(getByokKeys("vk-other-tenant", "cohere")).toEqual([]);
    setByokKeys(vk, "cohere", []);
  });

  it("encrypts at rest — plaintext keys never touch the store file", () => {
    const secret = "gsk-secret-plaintext-xyz";
    setByokKeys(vk, "groq", [secret]);
    const raw = fs.readFileSync(resolveDataPath("byok-store.json"), "utf-8");
    expect(raw).toContain("__enc");
    expect(raw).not.toContain(secret);
    // still readable through the API after decrypt
    expect(getByokKeys(vk, "groq")).toEqual([secret]);
    setByokKeys(vk, "groq", []);
  });
});
