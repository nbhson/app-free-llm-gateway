import React from "react";
import { Bot, User, Copy, FileText, Clock } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ChatMessage } from "../types";

type Props = {
  messages: ChatMessage[];
  isStreaming: boolean;
  highlightedId: string | null;
  bottomRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<HTMLDivElement>;
  onDismissDropdown: () => void;
  onContinue?: () => void;
};

export const MessageList = React.memo(function MessageList({ messages, isStreaming, highlightedId, bottomRef, listRef, onDismissDropdown, onContinue }: Props) {
  const lastId = messages[messages.length - 1]?.id;
  return (
    <div ref={listRef} role="log" aria-live="polite" aria-label="Chat messages" className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4 bg-raised/30" onClick={onDismissDropdown}>
      {messages.map((m) => (
        <div key={m.id} id={`msg-${m.id}`} className={`flex gap-3 scroll-mt-4 transition-all duration-300 ${m.role === "user" ? "justify-end" : "justify-start"} ${highlightedId === m.id ? "ring-2 ring-amber-400 rounded-2xl" : ""}`}>
          {m.role !== "user" && (
            <div className="w-7 h-7 rounded-full bg-primary text-primary-ink flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4" />
            </div>
          )}
          <div className={`max-w-[92%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === "user" ? "bg-primary text-primary-ink rounded-br-md" : "bg-surface border border-line shadow-sm rounded-bl-md"} ${m.error ? "border-rose-line bg-rose-soft" : ""}`}>
            {m.attachments && m.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {m.attachments.map((a) => (
                  <div key={a.id} className={`${m.role === "user" ? "bg-primary-ink/10 border-primary-ink/20 text-primary-ink" : "bg-raised border-line"} border rounded-lg overflow-hidden`}>
                    {a.type === "image" && a.preview ? (
                      <div className="p-1">
                        <img src={a.preview} alt={a.name} className="max-h-40 rounded-lg border border-line" />
                        <div className="text-[11px] font-mono px-1 pt-1 truncate max-w-[160px]">{a.name}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[140px]">{a.name}</span>
                        <span className="text-[11px] opacity-70">{(a.size / 1024).toFixed(1)}KB</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {m.role === "assistant" ? (
              m.content ? (
                <ErrorBoundary><MarkdownContent content={m.content} /></ErrorBoundary>
              ) : isStreaming && m.id === lastId ? (
                <span className="inline-flex items-center gap-1.5 text-mutedtxt" role="status" aria-live="polite">
                  <span className="w-2 h-2 rounded-full bg-strong animate-pulse" /> thinking...
                </span>
              ) : null
            ) : (
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            )}
            <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${m.role === "user" ? "text-mutedtxt justify-end" : "text-mutedtxt"}`}>
              <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
              {m.provider && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted border border-line text-secondary font-mono">{m.provider}</span>}
              {m.latencyMs && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{m.latencyMs}ms</span>}
              {m.role === "assistant" && m.content && (
                <button
                  aria-label="Copy message"
                  onClick={() => navigator.clipboard.writeText(m.content).catch(() => {})}
                  className="ml-auto p-1 rounded hover:bg-muted text-mutedtxt hover:text-secondary"
                  title="Copy"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {m.truncated && onContinue && !isStreaming && m.id === lastId && (
              <div className="mt-2">
                <button
                  onClick={onContinue}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600"
                >
                  ▶ Tiếp tục
                </button>
              </div>
            )}
          </div>
          {m.role === "user" && (
            <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-4 h-4" />
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
});
