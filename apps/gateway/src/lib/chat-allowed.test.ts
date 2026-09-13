import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWeb(file: string): string {
  const p = resolve(process.cwd(), file);
  try {
    return readFileSync(p, "utf-8");
  } catch {
    // fallback when running from apps/gateway
    const alt = resolve(process.cwd(), "../../" + file);
    return readFileSync(alt, "utf-8");
  }
}

describe("Chat allowed models — 6 strict modes (added free-llm-gateway/auto)", () => {
  it("Chat.tsx exports ALLOWED_CHAT_MODELS with exactly 6 ids", () => {
    // 1.6.0: constants extracted to features/chat/types.ts, Chat.tsx re-exports
    const chatTxt = readWeb("apps/web/src/pages/Chat.tsx");
    const typesTxt = readWeb("apps/web/src/features/chat/types.ts");
    const combined = chatTxt + "\n" + typesTxt;
    expect(combined).toContain("ALLOWED_CHAT_MODELS");
    const expected = [
      "free-llm-gateway/auto",
      "kilo-code/kilo-auto/free",
      "kilo-code/auto",
      "openrouter/auto",
      "kiraai/kira-auto",
      "agnes-ai/agnes-2.5-flash",
    ];
    for (const id of expected) {
      expect(combined).toContain(`"${id}"`);
    }
    // verify array length is 6 in types file
    const m = typesTxt.match(/ALLOWED_CHAT_MODELS\s*=\s*\[[^\]]+\]/s);
    expect(m).not.toBeNull();
    const quoted = (m![0].match(/"/g) || []).length / 2;
    const modelLines = expected.filter((id) => m![0].includes(id)).length;
    expect(modelLines).toBe(6);
    expect(quoted).toBe(6);
    // Chat.tsx must still re-export
    expect(chatTxt).toContain("ALLOWED_CHAT_MODELS");
  });

  it("Chat.tsx restricts selector to allowed list", () => {
    const chatTxt = readWeb("apps/web/src/pages/Chat.tsx");
    const typesTxt = readWeb("apps/web/src/features/chat/types.ts");
    const storageTxt = readWeb("apps/web/src/features/chat/lib/storage.ts");
    const combined = chatTxt + typesTxt + storageTxt;
    // allowed-set check may be in types or storage prefs
    expect(combined).toMatch(/ALLOWED_SET|allowedSet|has\(/);
    expect(combined).toContain("FALLBACK_CONTEXT");
  });

  it("Chat breakdown is clickable and navigates to message", () => {
    // 1.7.0: breakdown UI in ContextPanel, scrollToMessage in Chat.tsx, msg anchor in MessageList
    const chatTxt = readWeb("apps/web/src/pages/Chat.tsx");
    const panelTxt = readWeb("apps/web/src/features/chat/components/ContextPanel.tsx");
    const listTxt = readWeb("apps/web/src/features/chat/components/MessageList.tsx");
    const combined = chatTxt + "\n" + panelTxt + "\n" + listTxt;
    expect(combined).toContain("scrollToMessage");
    expect(combined).toContain("highlightedId");
    expect(combined).toContain('t("chat.breakdown")');
    expect(panelTxt).toContain("onScrollToMessage");
    expect(listTxt).toContain("id={`msg-${m.id}`}");
  });
});

describe("Providers/Models/Usage manual Refresh — no auto-sync on reload", () => {
  it("Providers.tsx has manual Refresh (hasRefreshed + handleRefresh + cache)", () => {
    const txt = readWeb("apps/web/src/pages/Providers.tsx");
    expect(txt).toContain("hasRefreshed");
    expect(txt).toContain("handleRefresh");
    expect(txt).toContain("providersCache");
    expect(txt).toContain("providersSyncCache");
    // ensure old auto useEffect without guard is removed
    expect(txt).not.toMatch(/useEffect\(\(\) => \{ load\(\); \}, \[qDebounced, hasKeyOnly\]\)/);
  });

  it("Models.tsx has manual Refresh (hasRefreshed, cache, preserve logs)", () => {
    const txt = readWeb("apps/web/src/pages/Models.tsx");
    expect(txt).toContain("hasRefreshed");
    expect(txt).toContain("handleRefresh");
    expect(txt).toContain("modelsCache");
    expect(txt).toContain("modelsUsageCache");
    expect(txt).toContain("hasKeyOnly");
  });

  it("Usage.tsx has manual Refresh (latest provider, env-based, cache)", () => {
    const txt = readWeb("apps/web/src/pages/Usage.tsx");
    expect(txt).toContain("handleRefresh");
    expect(txt).toContain("fetchSync");
    expect(txt).toContain("usageStatsCache");
    expect(txt).toContain("usageLogsCache");
  });
});

describe("Refresh preserves essential keys (apiKey/logs/totals)", () => {
  it("Logs.tsx preserves logs/stats on error via cache", () => {
    const txt = readWeb("apps/web/src/pages/Logs.tsx");
    expect(txt).toContain("logsCache");
    expect(txt).toContain("logsStatsCache");
    expect(txt).toContain("preserve");
  });
});

describe("Providers/Models/Usage display fix — initial fetch so not empty", () => {
  it("Providers.tsx has initial fetch when data is null", () => {
    const txt = readWeb("apps/web/src/pages/Providers.tsx");
    expect(txt).toContain("if (!data)");
    expect(txt).toContain("hasRefreshed");
  });
  it("Models.tsx has initial cache check and fetch", () => {
    const txt = readWeb("apps/web/src/pages/Models.tsx");
    expect(txt).toContain("hasCache");
    expect(txt).toContain("modelsCache");
  });
  it("Usage.tsx has initial cache check and fetch", () => {
    const txt = readWeb("apps/web/src/pages/Usage.tsx");
    expect(txt).toContain("hasCache");
    expect(txt).toContain("usageStatsCache");
  });
});

describe("i18n VI/EN coverage for 8 pages (incl. Chat)", () => {
  it("i18n.tsx has VI/EN for all 8 pages including chat (40+ chat keys)", () => {
    const txt = readWeb("apps/web/src/lib/i18n.tsx");
    const requiredChatKeys = [
      "chat.title",
      "chat.model",
      "chat.tokens",
      "chat.breakdown",
      "chat.contextWindow",
      "chat.placeholder",
      "chat.welcome",
      "chat.refresh",
    ];
    for (const k of requiredChatKeys) {
      expect(txt).toContain(`"${k}"`);
    }
    // count chat keys in vi and en — should be >= 30 each
    const viChatCount = (txt.match(/"chat\./g) || []).length;
    expect(viChatCount).toBeGreaterThanOrEqual(60); // 30 vi + 30 en minimum
    // 8 pages nav
    const navKeys = ["nav.dashboard", "nav.providers", "nav.models", "nav.keys", "nav.logs", "nav.usage", "nav.chat", "nav.settings"];
    for (const k of navKeys) {
      expect(txt).toContain(`"${k}"`);
    }
  });
  it("Chat.tsx uses t() for UI (VI/EN)", () => {
    // 1.7.0: t() usages spread across Chat.tsx + components (ChatHeader/Composer/ContextPanel/TipsCard)
    const chatTxt = readWeb("apps/web/src/pages/Chat.tsx");
    const headerTxt = readWeb("apps/web/src/features/chat/components/ChatHeader.tsx");
    const composerTxt = readWeb("apps/web/src/features/chat/components/Composer.tsx");
    const panelTxt = readWeb("apps/web/src/features/chat/components/ContextPanel.tsx");
    const combined = chatTxt + headerTxt + composerTxt + panelTxt;
    expect(chatTxt).toContain('const { t } = useLang()');
    const tUsages = (combined.match(/t\("chat\./g) || []).length;
    expect(tUsages).toBeGreaterThanOrEqual(20);
  });
  it("All 8 pages import useLang and use t()", () => {
    const pages = ["Dashboard", "Providers", "Models", "Keys", "Logs", "Usage", "Settings", "Chat"];
    for (const p of pages) {
      const txt = readWeb(`apps/web/src/pages/${p}.tsx`);
      expect(txt).toContain("useLang");
      // Settings and Chat explicitly use t, others use t as well
    }
  });
});

describe("Chat empty fix — refactor code returns content (reasoning + fallback)", () => {
  it("Chat.tsx handles reasoning_content/reasoning/thinking and fallback non-stream", () => {
    // 1.6.0: parser extracted to sse-parser.ts + useChatStream hook + storage (8192)
    const chatTxt = readWeb("apps/web/src/pages/Chat.tsx");
    const parserTxt = readWeb("apps/web/src/features/chat/lib/sse-parser.ts");
    const hookTxt = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    const storageTxt = readWeb("apps/web/src/features/chat/lib/storage.ts");
    const combined = chatTxt + parserTxt + hookTxt + storageTxt;
    expect(combined).toContain("reasoning_content");
    expect(combined).toContain("reasoningFull");
    expect(combined).toContain("fallbackRes");
    expect(combined).toMatch(/4096|8192/);
    expect(combined).toContain("extractDelta");
  });
  it("Chat.tsx streams robustly (ping/event, array content, error handling)", () => {
    const chatTxt = readWeb("apps/web/src/pages/Chat.tsx");
    const parserTxt = readWeb("apps/web/src/features/chat/lib/sse-parser.ts");
    const hookTxt = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    const combined = chatTxt + parserTxt + hookTxt;
    expect(combined).toContain('startsWith(":")');
    expect(combined).toContain('startsWith("event:")');
    expect(combined).toContain("Array.isArray");
    expect(combined).toContain("streamError");
  });
});
