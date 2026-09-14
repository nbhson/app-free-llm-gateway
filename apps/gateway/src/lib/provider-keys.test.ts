import { describe, it, expect } from "vitest";
import { isPublicProvider, isRealKey, isPlaceholderKey, hasRealKey } from "./provider-keys.js";

describe("provider-keys", () => {
  it("isPublicProvider single source", () => {
    expect(isPublicProvider("pollinations")).toBe(true);
    expect(isPublicProvider("llm7-io")).toBe(true);
    expect(isPublicProvider("ollama-cloud")).toBe(true);
    expect(isPublicProvider("groq")).toBe(false);
    expect(isPublicProvider("openrouter")).toBe(false);
  });

  it("detects placeholder keys", () => {
    expect(isPlaceholderKey(undefined)).toBe(true);
    expect(isPlaceholderKey("")).toBe(true);
    expect(isPlaceholderKey("sk-or-xxx")).toBe(true);
    expect(isPlaceholderKey("gsk_xxx")).toBe(true);
    expect(isPlaceholderKey("fgk-master-change-me-please")).toBe(true);
    expect(isPlaceholderKey("short")).toBe(true);
  });

  it("detects real keys", () => {
    // Synthetic keys only — never real provider secrets (push protection).
    expect(isRealKey("test-valid-key-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
    expect(isRealKey("test-valid-key-ABCDEFGHIJKLMNOPQRSTUVWXYZ987654")).toBe(true);
  });

  it("hasRealKey checks config pool", () => {
    // pollinations has no real key requirement — function should not throw
    expect(typeof hasRealKey("pollinations")).toBe("boolean");
    expect(typeof hasRealKey("groq")).toBe("boolean");
    expect(typeof hasRealKey("b-ai")).toBe("boolean");
    expect(typeof hasRealKey("tokenharbor")).toBe("boolean");
  });

  it("B.AI and TokenHarbor are not public providers", () => {
    expect(isPublicProvider("b-ai")).toBe(false);
    expect(isPublicProvider("tokenharbor")).toBe(false);
    expect(isPublicProvider("bai")).toBe(false);
  });

  it("hasRealKey resolves alias to canonical", async () => {
    const { PROVIDER_ALIASES } = await import("../providers/registry.js");
    expect(PROVIDER_ALIASES["bai"]).toBe("b-ai");
    // hasRealKey for alias should not throw and should delegate to canonical
    expect(typeof hasRealKey("bai")).toBe("boolean");
    expect(typeof hasRealKey("chat-b-ai")).toBe("boolean");
    expect(typeof hasRealKey("nvidia")).toBe("boolean");
    expect(hasRealKey("bai")).toBe(hasRealKey("b-ai"));
    expect(hasRealKey("nvidia")).toBe(hasRealKey("nvidia-nim"));
  });
});
