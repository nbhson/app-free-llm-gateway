import { describe, it, expect, afterEach } from "vitest";
import {
  createVirtualKey,
  deleteVirtualKey,
  findByKey,
  isValidVirtualKeyLive,
  listVirtualKeys,
} from "./virtual-keys.js";
import { config } from "../config.js";

function cleanupTestKeys(): void {
  for (const k of listVirtualKeys()) {
    if (k.name?.startsWith("ut-")) {
      try { deleteVirtualKey(k.id); } catch { /* ignore */ }
    }
  }
}

describe("virtual-keys lifecycle", () => {
  afterEach(() => {
    cleanupTestKeys();
  });
  it("master key validates as admin without touching store", () => {
    const vk = isValidVirtualKeyLive(config.masterKey);
    expect(vk?.role).toBe("admin");
    expect(vk?.id).toBe("vk-master");
  });

  it("unknown key returns null", () => {
    expect(isValidVirtualKeyLive("fgk-unknown-xyz-123456789")).toBeNull();
    expect(findByKey("fgk-unknown-xyz-123456789")).toBeNull();
  });

  it("create -> find -> live-validate -> delete", () => {
    const created = createVirtualKey({ name: `ut-${Date.now()}`, scopes: { models: ["groq/x"], providers: ["groq"] }, rpmLimit: 5 });
    try {
      expect(created.key.startsWith("fgk-")).toBe(true);
      // raw key never persisted — only hash lookup works
      const found = findByKey(created.key);
      expect(found?.id).toBe(created.id);
      const live = isValidVirtualKeyLive(created.key);
      expect(live?.name).toBe(created.name);
      expect(live?.rpmLimit).toBe(5);
    } finally {
      expect(deleteVirtualKey(created.id)).toBe(true);
    }
    expect(findByKey(created.key)).toBeNull();
  });

  it("delete unknown id returns false", () => {
    expect(deleteVirtualKey("vk-does-not-exist")).toBe(false);
  });

  it("defaults scopes to wildcard, role to user", () => {
    const created = createVirtualKey({ name: `ut-default-${Date.now()}` });
    try {
      expect(created.scopes).toMatchObject({ models: ["*"], providers: ["*"] });
      expect(created.role).toBe("user");
      expect(created.rpmLimit).toBe(60);
    } finally {
      deleteVirtualKey(created.id);
    }
  });
});
