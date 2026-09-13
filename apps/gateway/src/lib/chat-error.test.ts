import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWeb(file: string): string {
  const p = resolve(process.cwd(), file);
  try { return readFileSync(p, "utf-8"); } catch {
    const alt = resolve(process.cwd(), "../../" + file);
    return readFileSync(alt, "utf-8");
  }
}
function readGate(file: string): string {
  const p = resolve(process.cwd(), file);
  try { return readFileSync(p, "utf-8"); } catch {
    const alt = resolve(process.cwd(), "../../" + file);
    try { return readFileSync(alt, "utf-8"); } catch {
      const alt2 = resolve(process.cwd(), file.replace("apps/gateway/", ""));
      return readFileSync(alt2, "utf-8");
    }
  }
}

describe("Fix 1.9.1 — frequent All providers failed", () => {
  it("config has PROVIDER_TIMEOUT_MS (default 25000)", () => {
    const txt = readGate("apps/gateway/src/config.ts");
    expect(txt).toContain("providerTimeoutMs");
    expect(txt).toContain("PROVIDER_TIMEOUT_MS");
    expect(txt).toContain("25000");
  });

  it("provider-executor uses config.providerTimeoutMs not hardcoded 12000", () => {
    const txt = readGate("apps/gateway/src/lib/provider-executor.ts");
    expect(txt).toContain("config.providerTimeoutMs");
    expect(txt).toContain("provider timeout after");
    expect(txt).not.toMatch(/const timeoutMs = 12000;/);
  });

  it("chat route retries without web tools when all fail with tool errors", () => {
    const txt = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("webToolsForRequest");
    expect(txt).toContain("retrying without web tools");
    expect(txt).toContain("seemsToolRelated");
    expect(txt).toContain("callProvider(messagesToSend as unknown[], body.stream, undefined, undefined)");
  });

  it("chat route returns hint + detailedMessage with suggestion", () => {
    const txt = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("detailedMessage");
    expect(txt).toContain("hint");
    expect(txt).toContain("Gợi ý");
    expect(txt.toLowerCase()).toContain("web tools");
    expect(txt).toContain("provider_errors");
    expect(txt).toContain("All providers failed");
  });

  it("chat route logs detailed providerOrder + errors", () => {
    const txt = readGate("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("all providers failed for chat");
    expect(txt).toContain("providerOrder");
  });

  it("useChatStream parses hint/provider_errors and shows friendly message", () => {
    const txt = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    expect(txt).toContain("provider_errors");
    expect(txt).toContain("providerErrors");
    expect(txt).toContain("hint");
    expect(txt).toContain("Gợi ý");
    expect(txt.toLowerCase()).toContain("web tools");
    expect(txt).toContain("All providers failed");
  });

  it("useChatStream fallback also parses hint", () => {
    const txt = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    expect(txt).toContain("fbMsg");
    expect(txt).toContain("j.error?.hint");
  });

  it("Chat.tsx error banner shows whitespace-pre-wrap, no per-chat Web Tools toggle (controlled from Settings)", () => {
    const txt = readWeb("apps/web/src/pages/Chat.tsx");
    expect(txt).toContain("whitespace-pre-wrap");
    expect(txt).not.toContain("Tắt Web Tools & thử lại");
    expect(txt).not.toContain("webToolsEnabled");
    expect(txt).toContain('role="alert"');
  });
});
