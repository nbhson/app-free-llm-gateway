import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readRepo(file: string): string {
  const candidates = [
    resolve(process.cwd(), file), // repo root
    resolve(process.cwd(), "../../" + file), // apps/gateway
  ];
  for (const p of candidates) {
    try { return readFileSync(p, "utf-8"); } catch { /* ignore */ }
  }
  throw new Error(`not found: ${file}`);
}

describe("Chat 1.7.0 architecture — componentized, throttled, memoized, abort-safe, a11y", () => {
  it("splits Chat into features/chat/{types,lib,hooks,components}", () => {
    const types = readRepo("apps/web/src/features/chat/types.ts");
    const token = readRepo("apps/web/src/features/chat/lib/token.ts");
    const parser = readRepo("apps/web/src/features/chat/lib/sse-parser.ts");
    const storage = readRepo("apps/web/src/features/chat/lib/storage.ts");
    const hook = readRepo("apps/web/src/features/chat/hooks/useChatStream.ts");
    const attach = readRepo("apps/web/src/features/chat/hooks/useChatAttachments.ts");
    expect(types).toContain("ALLOWED_CHAT_MODELS");
    expect(token).toContain("estimateTokens");
    expect(token).toContain("CHAT_CONSTANTS");
    expect(parser).toContain("extractDelta");
    expect(parser).toContain("parseSseStream");
    expect(storage).toContain("persistMessages");
    expect(storage).toContain("getMasterKey");
    expect(hook).toContain("useChatStream");
    expect(attach).toContain("useChatAttachments");
  });

  it("Chat.tsx is componentized (<360 LOC) into Header/List/Composer/ContextPanel — favorites extends allowed list", () => {
    const txt = readRepo("apps/web/src/pages/Chat.tsx");
    const lines = txt.split("\n").length;
    expect(lines).toBeLessThan(360);
    expect(txt).toContain('from "../features/chat/components/ChatHeader"');
    expect(txt).toContain('from "../features/chat/components/MessageList"');
    expect(txt).toContain('from "../features/chat/components/Composer"');
    expect(txt).toContain('from "../features/chat/components/ContextPanel"');
    expect(txt).toContain('from "../features/chat/hooks/useChatStream"');
    const header = readRepo("apps/web/src/features/chat/components/ChatHeader.tsx");
    const list = readRepo("apps/web/src/features/chat/components/MessageList.tsx");
    const composer = readRepo("apps/web/src/features/chat/components/Composer.tsx");
    const panel = readRepo("apps/web/src/features/chat/components/ContextPanel.tsx");
    expect(header).toContain("React.memo");
    expect(list).toContain("React.memo");
    expect(composer).toContain("React.memo");
    expect(panel).toContain("React.memo");
  });

  it("useChatStream reuses shared parseSseStream (DRY, no duplicate SSE loop)", () => {
    const hook = readRepo("apps/web/src/features/chat/hooks/useChatStream.ts");
    expect(hook).toContain("parseSseStream");
    expect(hook).not.toMatch(/const reader = res\.body\.getReader\(\)/);
    expect(hook).toContain("requestAnimationFrame");
    expect(hook).toContain("throttleRef");
    expect(hook).toContain("scheduleFlush");
  });

  it("uses AbortController with cleanup on unmount + fallback has own controller", () => {
    const hook = readRepo("apps/web/src/features/chat/hooks/useChatStream.ts");
    expect(hook).toContain("AbortController");
    expect(hook).toContain("abortRef");
    expect(hook).toMatch(/useEffect\(\(\) => \{\s*return \(\) =>/s);
    expect(hook).toContain("fallbackController");
  });

  it("a11y: aria-labels, role=log, aria-live, ErrorBoundary, confirm on refresh", () => {
    const list = readRepo("apps/web/src/features/chat/components/MessageList.tsx");
    expect(list).toContain('role="log"');
    expect(list).toContain('aria-live="polite"');
    const composer = readRepo("apps/web/src/features/chat/components/Composer.tsx");
    expect(composer).toContain('aria-label="Send message"');
    expect(composer).toContain('aria-label="Stop generation"');
    const chat = readRepo("apps/web/src/pages/Chat.tsx");
    expect(chat).toContain("window.confirm");
    const eb = readRepo("apps/web/src/features/chat/components/ErrorBoundary.tsx");
    expect(eb).toContain("getDerivedStateFromError");
    const listE = readRepo("apps/web/src/features/chat/components/MessageList.tsx");
    expect(listE).toContain("ErrorBoundary");
  });

  it("auto-scroll uses RAF throttling, not interval; scroll constants centralized", () => {
    const txt = readRepo("apps/web/src/pages/Chat.tsx");
    const token = readRepo("apps/web/src/features/chat/lib/token.ts");
    expect(txt).toContain("requestAnimationFrame");
    expect(txt).not.toContain("setInterval(() => scrollToBottom");
    expect(txt).toContain("CHAT_CONSTANTS.SCROLL_THROTTLE_MS");
    expect(txt).toContain("CHAT_CONSTANTS.MODELS_FETCH_TIMEOUT_MS");
    expect(token).toContain("SCROLL_THROTTLE_MS");
  });

  it("persistence debounced, strips heavy dataUrl from attachments", () => {
    const chat = readRepo("apps/web/src/pages/Chat.tsx");
    const storage = readRepo("apps/web/src/features/chat/lib/storage.ts");
    expect(chat).toContain("setTimeout(() => persistMessages");
    expect(storage).toContain("dataUrl: undefined");
    expect(storage).toContain("prefs");
  });

  it("removes hardcoded fgk-master-dev-key fallback from storage", () => {
    const storage = readRepo("apps/web/src/features/chat/lib/storage.ts");
    expect(storage).not.toContain('return localStorage.getItem("masterKey") || "fgk-master-dev-key"');
    expect(storage).toContain("getMasterKey");
  });

  it("backend chat route uses strict Zod schemas (no z.any)", () => {
    const txt = readRepo("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("contentPartSchema");
    expect(txt).toContain("toolCallSchema");
    expect(txt).toContain("toolSchema");
    expect(txt).not.toMatch(/z\.array\(z\.any\(\)\)/);
    expect(txt).not.toMatch(/tool_choice: z\.any\(\)/);
  });

  it("vite manualChunks splits vendor bundles (react/markdown/charts)", () => {
    const vite = readRepo("apps/web/vite.config.ts");
    expect(vite).toContain("manualChunks");
    expect(vite).toContain('"vendor-react"');
    expect(vite).toContain('"vendor-markdown"');
    expect(vite).toContain('"vendor-charts"');
  });
});
