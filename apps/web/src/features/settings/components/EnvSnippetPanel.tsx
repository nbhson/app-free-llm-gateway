import { Check, Copy, Download } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";

type EnvSnippetPanelProps = {
  envSnippet: string;
  showSnippetDiffOnly: boolean;
  onToggleDiffOnly: (v: boolean) => void;
  diffCount: number;
  copiedEnv: boolean;
  copiedDiff: boolean;
  onCopyEnv: () => void;
  onCopyDiff: () => void;
  onDownload: () => void;
};

export function EnvSnippetPanel({ envSnippet, showSnippetDiffOnly, onToggleDiffOnly, diffCount, copiedEnv, copiedDiff, onCopyEnv, onCopyDiff, onDownload }: EnvSnippetPanelProps) {
  const { t } = useLang();
  return (
    <div className="bg-codesurface rounded-xl border border-codeline p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-codetext">{t("settings.envSnippet")} </div>
          <label className="flex items-center gap-1.5 text-xs text-mutedtxt cursor-pointer">
            <input type="checkbox" checked={showSnippetDiffOnly} onChange={(e) => onToggleDiffOnly(e.target.checked)} className="accent-amber-500" aria-label="Show diff only" /> diff only ({diffCount})
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCopyDiff} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-coderow text-codetext hover:bg-coderow/80 border border-codeline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            {copiedDiff ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedDiff ? (t("settings.copied") || "Copied") : "Copy diff"}
          </button>
          <button type="button" onClick={onCopyEnv} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface text-body hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-ink" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedEnv ? (t("settings.copied") || "Copied") : (t("settings.copy") || "Copy")}
          </button>
          <button type="button" onClick={onDownload} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>
      <pre className="text-xs font-mono text-emerald-200 whitespace-pre-wrap break-all bg-coderow rounded-lg p-3 border border-codeline max-h-64 overflow-y-auto" tabIndex={0} aria-label=".env snippet">{envSnippet}</pre>
    </div>
  );
}
