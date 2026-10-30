import React from "react";
import { BarChart3, RotateCcw, Cpu, Clock, Zap, FileText, Sparkles } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import { estimateMessageTokens, estimateTokens } from "../lib/token";
import type { ChatMessage, ModelEntry } from "../types";

type Props = {
  messages: ChatMessage[];
  systemPrompt: string;
  selectedModel: string;
  selectedModelInfo: ModelEntry | undefined;
  effectiveContext: number;
  totalPromptTokens: number;
  ctxPercent: number;
  ctxColor: string;
  lastMeta: { provider?: string; model?: string; latencyMs?: number; usage?: unknown } | null;
  highlightedId: string | null;
  onScrollToMessage: (id: string) => void;
  onRefresh: () => void;
};

export const ContextPanel = React.memo(function ContextPanel({
  messages,
  systemPrompt,
  selectedModel,
  selectedModelInfo,
  effectiveContext,
  totalPromptTokens,
  ctxPercent,
  ctxColor,
  lastMeta,
  highlightedId,
  onScrollToMessage,
  onRefresh,
}: Props) {
  const { t } = useLang();
  const usage = lastMeta?.usage as Record<string, unknown> | undefined;

  return (
    <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 className="text-sm font-bold text-heading flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-body" /> {t("chat.contextWindow")}
        </h2>
        <button aria-label="Refresh conversation" onClick={onRefresh} className="p-1.5 rounded-lg bg-muted hover:bg-strong border border-line" title="Refresh (clear chat)">
          <RotateCcw className="w-4 h-4 text-secondary" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-body flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> {t("chat.model")}
            </span>
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted border border-line">{selectedModelInfo?.live_status || "—"}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-raised border border-line font-mono text-xs truncate">{selectedModel}</div>
          <div className="flex items-center gap-2 text-xs text-secondary">
            <span>{t("chat.provider")}:</span>
            <span className="font-semibold text-title">{lastMeta?.provider || selectedModel.split("/")[0] || "auto"}</span>
            {lastMeta?.latencyMs && <span className="ml-auto inline-flex items-center gap-1"><Clock className="w-3 h-3" />{lastMeta.latencyMs}ms</span>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-body">{t("chat.tokens")}</span>
            <span className="font-mono text-secondary">
              {totalPromptTokens.toLocaleString()} / {effectiveContext.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-muted border border-line overflow-hidden p-0.5" role="progressbar" aria-valuenow={ctxPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Context usage">
            <div className={`h-full rounded-full transition-all duration-500 ${ctxColor}`} style={{ width: `${ctxPercent}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={`font-bold ${ctxPercent > 90 ? "text-rose-ink" : ctxPercent > 70 ? "text-amber-ink" : "text-emerald-ink"}`}>{ctxPercent}% {t("chat.used")}</span>
            <span className="text-mutedtxt">{effectiveContext - totalPromptTokens > 0 ? `${(effectiveContext - totalPromptTokens).toLocaleString()} ${t("chat.left")}` : t("chat.full")}</span>
          </div>
          {ctxPercent > 85 && <div className="text-xs text-amber-ink bg-amber-soft border border-amber-line rounded-lg px-2.5 py-1.5" role="warning">{t("chat.contextFullWarning")}</div>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-raised border border-line p-3">
            <div className="text-[11px] font-semibold text-mutedtxt uppercase tracking-wider">{t("chat.messages")}</div>
            <div className="text-lg font-bold text-heading">{messages.length}</div>
            <div className="text-xs text-mutedtxt">{messages.filter((m) => m.role === "user").length} user • {messages.filter((m) => m.role === "assistant").length} assistant</div>
          </div>
          <div className="rounded-xl bg-raised border border-line p-3">
            <div className="text-[11px] font-semibold text-mutedtxt uppercase tracking-wider">{t("chat.estTokens")}</div>
            <div className="text-lg font-bold text-heading">{totalPromptTokens.toLocaleString()}</div>
            <div className="text-xs text-mutedtxt">prompt + history</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-body flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {t("chat.breakdown")}
          </div>
          <div className="max-h-[160px] overflow-y-auto rounded-lg border border-line divide-y divide-divsoft">
            {messages.slice(-10).map((m) => (
              <div
                key={m.id}
                onClick={() => onScrollToMessage(m.id)}
                title={t("chat.breakdownHint")}
                className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-amber-soft transition-colors ${highlightedId === m.id ? "bg-amber-wash" : ""}`}
              >
                <span className={`w-16 shrink-0 font-semibold ${m.role === "user" ? "text-amber-ink" : m.role === "system" ? "text-blue-ink" : "text-body"}`}>{m.role}</span>
                <span className="flex-1 truncate text-secondary">{m.content.slice(0, 60) || "(empty)"}</span>
                <span className="font-mono text-mutedtxt">{estimateMessageTokens(m)}</span>
              </div>
            ))}
            {systemPrompt && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs bg-blue-soft/50">
                <span className="w-16 shrink-0 font-semibold text-blue-ink">system</span>
                <span className="flex-1 truncate text-secondary">{systemPrompt.slice(0, 60)}</span>
                <span className="font-mono text-mutedtxt">{estimateTokens(systemPrompt)}</span>
              </div>
            )}
          </div>
        </div>

        {lastMeta && (
          <div className="rounded-xl bg-codesurface text-codetextbright p-3 space-y-1.5">
            <div className="text-xs font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> {t("chat.lastResponse")}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <div className="text-codetextfaint">provider</div>
                <div className="font-semibold text-codetext truncate">{lastMeta.provider || "—"}</div>
              </div>
              <div>
                <div className="text-codetextfaint">latency</div>
                <div className="font-semibold text-codetextbright">{lastMeta.latencyMs ? `${lastMeta.latencyMs}ms` : "—"}</div>
              </div>
              {usage && (
                <>
                  <div>
                    <div className="text-codetextfaint">prompt</div>
                    <div className="text-emerald-300">{String(usage.prompt_tokens ?? usage.promptTokens ?? "—")}</div>
                  </div>
                  <div>
                    <div className="text-codetextfaint">completion</div>
                    <div className="text-amber-300">{String(usage.completion_tokens ?? usage.completionTokens ?? "—")}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line bg-raised p-3 space-y-2">
          <div className="text-xs font-bold text-body">{t("chat.openCodeWindow")}</div>
          <ul className="text-xs text-secondary space-y-1 list-disc pl-4">
            <li>{t("chat.openCodeDesc1")}</li>
            <li>{t("chat.openCodeDesc2")}</li>
            <li>{t("chat.openCodeDesc3")}</li>
            <li>{t("chat.openCodeDesc4")}</li>
          </ul>
        </div>

        <button
          onClick={onRefresh}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm"
        >
          <RotateCcw className="w-4 h-4" /> {t("chat.refreshFromStart")}
        </button>
        <p className="text-center text-[11px] text-codetextfaint">{t("chat.noMultiSession")}</p>
      </div>
    </div>
  );
});

export const TipsCard = React.memo(function TipsCard() {
  const { t } = useLang();
  return (
    <div className="bg-gradient-to-br from-amber-soft to-orange-soft rounded-xl border border-amber-line p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-amber-ink mt-0.5" />
        <div className="space-y-1">
          <div className="text-sm font-bold text-amber-ink">{t("chat.tipsTitle")}</div>
          <ul className="text-xs text-amber-ink space-y-1 list-disc pl-4">
            <li>{t("chat.tipsPaste")}</li>
            <li>{t("chat.tipsDrag")}</li>
            <li>{t("chat.tipsVision")}</li>
            <li>{t("chat.tipsAutoScroll")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
});
