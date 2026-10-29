import React from "react";
import { Send, StopCircle, Paperclip, Image as ImageIcon, FileText, Trash2, X, Sparkles } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import type { Attachment } from "../types";

type Props = {
  input: string;
  setInput: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  pendingAttachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
  onFiles: (files: FileList | File[]) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  totalPromptTokens: number;
  effectiveContext: number;
};

export const Composer = React.memo(function Composer({
  input,
  setInput,
  onKeyDown,
  onPaste,
  onSend,
  onStop,
  isStreaming,
  pendingAttachments,
  onRemoveAttachment,
  onClearAttachments,
  onFiles,
  textareaRef,
  totalPromptTokens,
  effectiveContext,
}: Props) {
  const { t } = useLang();
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="p-3 border-t border-line bg-surface shrink-0">
      {pendingAttachments.length > 0 && (
        <div className="pb-2 mb-2 border-b border-linesoft flex flex-wrap gap-2">
          {pendingAttachments.map((a) => (
            <div key={a.id} className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-muted border border-line text-xs font-medium">
              {a.type === "image" ? <ImageIcon className="w-3.5 h-3.5 text-blue-ink" /> : <FileText className="w-3.5 h-3.5 text-amber-ink" />}
              <span className="truncate max-w-[120px]">{a.name}</span>
              <span className="text-[11px] text-mutedtxt">{(a.size / 1024).toFixed(0)}KB</span>
              {a.type === "image" && a.preview && <img src={a.preview} alt={a.name} className="w-6 h-6 rounded object-cover border border-line" />}
              <button aria-label={`Remove ${a.name}`} onClick={() => onRemoveAttachment(a.id)} className="p-1 rounded-full hover:bg-strong">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button onClick={onClearAttachments} className="ml-auto text-xs text-mutedtxt hover:text-body inline-flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> {t("chat.clear")}
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <button
            aria-label="Upload image"
            onClick={() => imageInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-muted hover:bg-strong border border-line text-body"
            title="Upload image"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            aria-label="Upload document"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-muted hover:bg-strong border border-line text-body"
            title="Upload md/txt"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
          <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown,text/markdown,text/plain" multiple className="hidden" onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            aria-label="Chat message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={t("chat.placeholder")}
            rows={1}
            className="w-full min-h-[44px] max-h-[120px] px-3 py-3 pr-10 rounded-xl border border-line bg-raised focus:bg-surface focus:outline-none focus:ring-2 focus:ring-heading/10 resize-none text-sm leading-6 placeholder:text-slate-400"
            style={{ height: "44px" }}
            onInput={(e) => {
              const ta = e.target as HTMLTextAreaElement;
              ta.style.height = "44px";
              ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
            }}
          />
          <span className="absolute right-3 bottom-3 text-[11px] text-slate-400 pointer-events-none hidden sm:block">{t("chat.sendHint")}</span>
        </div>
        {isStreaming ? (
          <button aria-label="Stop generation" onClick={onStop} className="p-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm">
            <StopCircle className="w-5 h-5" />
          </button>
        ) : (
          <button
            aria-label="Send message"
            onClick={onSend}
            disabled={!input.trim() && pendingAttachments.length === 0}
            className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-strong disabled:cursor-not-allowed text-white shadow-sm transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-mutedtxt">
        <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
        <span className="truncate">{t("chat.gatewayFallback")}</span>
        <span className="ml-auto hidden sm:inline shrink-0">Context {totalPromptTokens.toLocaleString()} / {effectiveContext.toLocaleString()} tokens</span>
      </div>
    </div>
  );
});
