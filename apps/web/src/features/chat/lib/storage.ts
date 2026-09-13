import type { ChatMessage } from "../types";

const MSG_KEY = "chatMessages";
const MSG_FULL_KEY = "chatMessages_full";
const MODEL_KEY = "chatSelectedModel";
const TEMP_KEY = "chatTemp";
const MAX_TOK_KEY = "chatMaxTokens";
const STREAM_KEY = "chatStream";
const SYSTEM_KEY = "chatSystemPrompt";
const WEB_TOOLS_KEY = "chatWebTools";

export function getMasterKey(): string {
  // No hard-coded fallback in JS bundle. Bootstrap via /api/bootstrap in Layout.
  // Keep dev fallback only if localStorage empty AND not in production build gate.
  const v = localStorage.getItem("masterKey");
  if (v && v.trim().length >= 8) return v;
  // Return placeholder that will trigger 401 with helpful message; Chat page shows empty-key hint.
  return v || "";
}

export function loadMessages(fallbackWelcome: ChatMessage): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MSG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as ChatMessage[];
    }
  } catch { /* ignore */ }
  return [fallbackWelcome];
}

export function persistMessages(messages: ChatMessage[]): void {
  try {
    // Store last 30 without heavy dataUrl (truncate to avoid quota)
    const toStore = messages.slice(-30).map((m) => ({
      ...m,
      attachments: m.attachments?.map((a) => ({ ...a, dataUrl: undefined, preview: undefined })),
    }));
    localStorage.setItem(MSG_KEY, JSON.stringify(toStore));
  } catch { /* ignore */ }
}

export function clearPersistedMessages(): void {
  try {
    localStorage.removeItem(MSG_KEY);
    localStorage.removeItem(MSG_FULL_KEY);
  } catch { /* ignore */ }
}

export const prefs = {
  getModel: (fallback: string, allowedSet: Set<string>) => {
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved && allowedSet.has(saved)) return saved;
    return fallback;
  },
  setModel: (v: string) => { try { localStorage.setItem(MODEL_KEY, v); } catch { /* ignore */ } },
  getTemp: () => parseFloat(localStorage.getItem(TEMP_KEY) || "0.7"),
  setTemp: (v: number) => { try { localStorage.setItem(TEMP_KEY, String(v)); } catch { /* ignore */ } },
  getMaxTokens: () => parseInt(localStorage.getItem(MAX_TOK_KEY) || "8192", 10),
  setMaxTokens: (v: number) => { try { localStorage.setItem(MAX_TOK_KEY, String(v)); } catch { /* ignore */ } },
  getStream: () => localStorage.getItem(STREAM_KEY) !== "0",
  setStream: (v: boolean) => { try { localStorage.setItem(STREAM_KEY, v ? "1" : "0"); } catch { /* ignore */ } },
  getSystem: () => localStorage.getItem(SYSTEM_KEY) || "",
  setSystem: (v: string) => { try { localStorage.setItem(SYSTEM_KEY, v); } catch { /* ignore */ } },
  getWebTools: () => localStorage.getItem(WEB_TOOLS_KEY) === "1",
  setWebTools: (v: boolean) => { try { localStorage.setItem(WEB_TOOLS_KEY, v ? "1" : "0"); } catch { /* ignore */ } },
};
