import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";
import {
  ALLOWED_CHAT_MODELS as _ALLOWED,
  ALLOWED_SET as _ALLOWED_SET,
  FALLBACK_CONTEXT as _FALLBACK,
} from "../features/chat/types";
import type { Attachment, ChatMessage, ModelEntry } from "../features/chat/types";
import { estimateTotalPromptTokens, CHAT_CONSTANTS } from "../features/chat/lib/token";
import { loadMessages, persistMessages, clearPersistedMessages, prefs, getMasterKey } from "../features/chat/lib/storage";
import { useChatStream } from "../features/chat/hooks/useChatStream";
import { useChatAttachments } from "../features/chat/hooks/useChatAttachments";
import { useFavoriteModels } from "../features/chat/hooks/useFavoriteModels.ts";
import { ChatHeader } from "../features/chat/components/ChatHeader";
import { MessageList } from "../features/chat/components/MessageList";
import { Composer } from "../features/chat/components/Composer";
import { ContextPanel, TipsCard } from "../features/chat/components/ContextPanel";
import { getFavoriteIds } from "../lib/favorites.ts";

// Re-export for backwards compat + tests that grep this file
export const ALLOWED_CHAT_MODELS = _ALLOWED;
export type AllowedChatModel = (typeof _ALLOWED)[number];
const ALLOWED_SET = _ALLOWED_SET;
const FALLBACK_CONTEXT = _FALLBACK;

export default function Chat() {
  const { t } = useLang();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadMessages({
      id: "welcome",
      role: "assistant",
      content: t("chat.welcome"),
      createdAt: new Date().toISOString(),
    }),
  );
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const { favoriteSet, combinedIds } = useFavoriteModels();
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const favs = getFavoriteIds();
      const extended = new Set<string>([...(_ALLOWED as unknown as string[]), ...favs]);
      return prefs.getModel(_ALLOWED[1], extended);
    } catch {
      return prefs.getModel(_ALLOWED[1], ALLOWED_SET);
    }
  });
  const [temperature, setTemperature] = useState(() => prefs.getTemp());
  const [maxTokens, setMaxTokens] = useState(() => prefs.getMaxTokens());
  const [streamEnabled, setStreamEnabled] = useState(() => prefs.getStream());
  const [systemPrompt, setSystemPrompt] = useState(() => prefs.getSystem());
  const [webToolsEnabled, setWebToolsEnabled] = useState(() => prefs.getWebTools());
  const [showSettings, setShowSettings] = useState(false);
  const [lastMeta, setLastMeta] = useState<{ provider?: string; model?: string; latencyMs?: number; usage?: unknown } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const scrollToMessage = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId((prev) => (prev === id ? null : prev)), 2000);
    }
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages (debounced)
  useEffect(() => {
    const id = setTimeout(() => persistMessages(messages), CHAT_CONSTANTS.PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [messages]);

  useEffect(() => prefs.setModel(selectedModel), [selectedModel]);
  useEffect(() => prefs.setTemp(temperature), [temperature]);
  useEffect(() => prefs.setMaxTokens(maxTokens), [maxTokens]);
  useEffect(() => prefs.setStream(streamEnabled), [streamEnabled]);
  useEffect(() => prefs.setSystem(systemPrompt), [systemPrompt]);
  useEffect(() => prefs.setWebTools(webToolsEnabled), [webToolsEnabled]);

  // Fetch models — ALLOWED + favorites, timeout-guarded
  useEffect(() => {
    const ids = combinedIds;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CHAT_CONSTANTS.MODELS_FETCH_TIMEOUT_MS);
    fetch(`/v1/models?limit=1000`, { headers: { Authorization: `Bearer ${getMasterKey()}` }, signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.data || []) as ModelEntry[];
        setModels(ids.map((id) => {
          const found = list.find((m) => m.id === id);
          return found || { id, owned_by: id.split("/")[0] || "unknown", context_length: FALLBACK_CONTEXT[id] || 128000, score: 70, live_status: favoriteSet.has(id) ? "favorite" : "alias" };
        }));
      })
      .catch(() => setModels(ids.map((id) => ({ id, owned_by: id.split("/")[0] || "unknown", context_length: FALLBACK_CONTEXT[id] || 128000, live_status: favoriteSet.has(id) ? "favorite" : "alias" }))))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ac.abort(); };
  }, [combinedIds, favoriteSet]);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, isStreaming, scrollToBottom]);

  // Throttled auto-scroll while streaming — RAF
  useEffect(() => {
    if (!isStreaming) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > CHAT_CONSTANTS.SCROLL_THROTTLE_MS) {
        scrollToBottom(true);
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isStreaming, scrollToBottom]);

  const selectedModelInfo = useMemo(() => models.find((m) => m.id === selectedModel), [models, selectedModel]);
  const effectiveContext = selectedModelInfo?.context_length || FALLBACK_CONTEXT[selectedModel] || 128000;
  const totalPromptTokens = useMemo(() => estimateTotalPromptTokens(messages, systemPrompt), [messages, systemPrompt]);
  const ctxPercent = useMemo(() => Math.min(100, Math.round((totalPromptTokens / effectiveContext) * 100)), [totalPromptTokens, effectiveContext]);
  const ctxColor = ctxPercent > 90 ? "bg-rose-500" : ctxPercent > 70 ? "bg-amber-500" : ctxPercent > 50 ? "bg-blue-500" : "bg-emerald-500";

  const { handleFiles, removeAttachment, clearAttachments } = useChatAttachments(setPendingAttachments, setError, t);

  const { handleSend: sendStream, handleStop, handleContinue } = useChatStream({
    selectedModel,
    systemPrompt,
    temperature,
    maxTokens,
    streamEnabled,
    webToolsEnabled,
    messages,
    setMessages,
    setLastMeta,
    setError,
    setIsStreaming,
  });

  const handleSend = useCallback(() => {
    sendStream(input, pendingAttachments, () => {
      setInput("");
      clearAttachments();
    });
  }, [sendStream, input, pendingAttachments, clearAttachments]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        handleFiles(files);
      }
    },
    [handleFiles],
  );

  const handleRefresh = useCallback(() => {
    if (isStreaming) handleStop();
    setMessages([
      { id: `welcome-${Date.now()}`, role: "assistant", content: t("chat.refreshed"), createdAt: new Date().toISOString() },
    ]);
    setLastMeta(null);
    setError(null);
    clearAttachments();
    setInput("");
    clearPersistedMessages();
  }, [isStreaming, handleStop, t, clearAttachments]);

  const confirmRefresh = useCallback(() => {
    if (messages.length > 1 && !window.confirm(t("chat.confirmRefresh"))) return;
    handleRefresh();
  }, [messages.length, t, handleRefresh]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)] lg:h-[calc(100vh-132px)]">
      <div
        className={`flex-1 flex flex-col min-w-0 bg-white rounded-xl border shadow-sm overflow-hidden ${isDragging ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50/20" : "border-slate-200"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <ChatHeader
          models={models}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          effectiveContext={effectiveContext}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onConfirmRefresh={confirmRefresh}
          webToolsEnabled={webToolsEnabled}
          onToggleWebTools={() => setWebToolsEnabled((v) => !v)}
          favoriteSet={favoriteSet}
        />

        {showSettings && (
          <div className="px-3 py-3 border-b border-slate-200 bg-amber-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">{t("chat.temperature")} {temperature}</span>
                <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-slate-900" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">{t("chat.maxTokens")}</span>
                <input type="number" min={64} max={16384} value={maxTokens} onChange={(e) => setMaxTokens(Math.min(16384, parseInt(e.target.value) || 1024))} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={streamEnabled} onChange={(e) => setStreamEnabled(e.target.checked)} className="w-4 h-4 accent-slate-900" />
                <span className="text-xs font-semibold text-slate-700">{t("chat.streaming")}</span>
                <span className="text-xs text-slate-500">(SSE)</span>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">{t("chat.systemPrompt")}</span>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder={t("chat.systemPromptPlaceholder")} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none" />
            </label>
          </div>
        )}

        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          highlightedId={highlightedId}
          listRef={listRef}
          bottomRef={bottomRef}
          onDismissDropdown={() => {}}
          onContinue={handleContinue}
        />

        {error && (
          <div role="alert" className="mx-3 mb-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-bold shrink-0">Error:</span>
              <span className="flex-1 break-words whitespace-pre-wrap">{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {error.includes("timeout") || error.includes("All providers failed") ? (
                <button onClick={() => setError(null)} className="px-2.5 py-1 rounded-full bg-white border border-rose-200 hover:bg-rose-100 font-semibold text-[11px]">Đã hiểu</button>
              ) : null}
              {webToolsEnabled && (
                <button onClick={() => setWebToolsEnabled(false)} className="px-2.5 py-1 rounded-full bg-amber-500 text-white hover:bg-amber-600 font-semibold text-[11px]">Tắt Web Tools & thử lại</button>
              )}
              {!webToolsEnabled && error.includes("Web Tools") && (
                <button onClick={() => setWebToolsEnabled(true)} className="px-2.5 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-[11px]">Bật Web Tools</button>
              )}
            </div>
          </div>
        )}

        <Composer
          input={input}
          setInput={setInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          pendingAttachments={pendingAttachments}
          onRemoveAttachment={removeAttachment}
          onClearAttachments={clearAttachments}
          onFiles={handleFiles}
          textareaRef={textareaRef}
          totalPromptTokens={totalPromptTokens}
          effectiveContext={effectiveContext}
        />
      </div>

      <div className={`${drawerOpen ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-[360px] shrink-0 gap-4 overflow-y-auto`}>
        <ContextPanel
          messages={messages}
          systemPrompt={systemPrompt}
          selectedModel={selectedModel}
          selectedModelInfo={selectedModelInfo}
          effectiveContext={effectiveContext}
          totalPromptTokens={totalPromptTokens}
          ctxPercent={ctxPercent}
          ctxColor={ctxColor}
          lastMeta={lastMeta}
          highlightedId={highlightedId}
          onScrollToMessage={scrollToMessage}
          onRefresh={confirmRefresh}
        />
        <TipsCard />
      </div>

      {drawerOpen && <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}
