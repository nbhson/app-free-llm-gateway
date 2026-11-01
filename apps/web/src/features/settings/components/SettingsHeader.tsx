import type React from "react";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Check,
  Search,
  Download,
  Upload,
  Zap,
  RefreshCw,
  X,
} from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";

type SettingsHeaderProps = {
  source: ".env" | "localStorage";
  lastSaved: string | null;
  diffCount: number;
  search: string;
  onSearchChange: (v: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPreset: (name: string) => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPickFile: () => void;
  onReset: () => void;
  onSave: () => void;
  isDirty: boolean;
  saved: boolean;
  validationErrors: string[];
  applying: boolean;
  onApplyToServer: () => void;
  applyMsg: string | null;
};

export function SettingsHeader({
  source,
  lastSaved,
  diffCount,
  search,
  onSearchChange,
  fileInputRef,
  onPreset,
  onExportJson,
  onImportJson,
  onPickFile,
  onReset,
  onSave,
  isDirty,
  saved,
  validationErrors,
  applying,
  onApplyToServer,
  applyMsg,
}: SettingsHeaderProps) {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-bold text-heading flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-body" /> {t("settings.title") || "Settings"}
          </h1>
          <p className="text-sm text-mutedtxt mt-1">{t("settings.subtitle") || "Gateway runtime flags. Defaults from .env, overrides stored in localStorage."}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${source === "localStorage" ? "bg-amber-soft text-amber-ink border-amber-line" : "bg-muted text-secondary border-line"}`}>
              {source === "localStorage" ? "localStorage" : ".env"} {source === "localStorage" ? t("settings.overridden") : t("settings.default")}
            </span>
            <span className="text-mutedtxt hidden sm:inline">{t("settings.hint")}</span>
            {lastSaved && <span className="text-mutedtxt">• saved {new Date(lastSaved).toLocaleString()}</span>}
            {diffCount > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-wash text-amber-ink border border-amber-line font-semibold">{diffCount} modified</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-mutedtxt" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("settings.searchPlaceholder") || "Filter settings... (e.g. cache, timeout, web)"}
              aria-label="Filter settings"
              className="pl-8 pr-8 py-1.5 rounded-lg text-xs border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-amber-500 w-44"
            />
            {search && (
              <button type="button" onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded" aria-label="Clear filter">
                <X className="w-3 h-3 text-mutedtxt" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select onChange={(e) => onPreset(e.target.value)} defaultValue="" className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line bg-surface hover:bg-raised text-body" aria-label="Presets">
              <option value="" disabled>{t("settings.preset") || "Preset..."}</option>
              <option value="balanced">{t("settings.presetBalanced") || "Balanced"}</option>
              <option value="cheapest">{t("settings.presetCheapest") || "Cheapest"}</option>
              <option value="fastest">{t("settings.presetFastest") || "Fastest"}</option>
              <option value="performance">{t("settings.presetPerformance") || "Performance"}</option>
            </select>
            <button onClick={onExportJson} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line bg-surface hover:bg-raised text-body" title={t("settings.export") || "Export JSON"}>
              <Download className="w-3.5 h-3.5" /> {t("settings.export") || "Export"}
            </button>
            <button onClick={onPickFile} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-line bg-surface hover:bg-raised text-body" title={t("settings.import") || "Import JSON"}>
              <Upload className="w-3.5 h-3.5" /> {t("settings.import") || "Import"}
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportJson} aria-hidden />
          </div>
          <button onClick={onReset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line bg-surface hover:bg-raised text-body">
            <RotateCcw className="w-3.5 h-3.5" /> {t("settings.reset") || "Reset to .env"}
          </button>
          <button onClick={onSave} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold border shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isDirty ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600" : "bg-surface text-mutedtxt border-line"} ${validationErrors.length > 0 ? "opacity-70" : ""}`} aria-disabled={validationErrors.length > 0} title={validationErrors.length ? validationErrors.join(", ") : undefined}>
            {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? (t("settings.saved") || "Saved") : (t("settings.save") || "Save to localStorage")}
          </button>
          <button onClick={onApplyToServer} disabled={applying || validationErrors.length > 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 border border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" title={validationErrors.length ? validationErrors.join(", ") : (t("settings.applyToServer") + " — PUT /api/config hot-reload, no restart")}>
            {applying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} {applying ? (t("settings.applying") || "Applying...") : (t("settings.applyToServer") || "Apply to server")}
          </button>
        </div>
        <p className="w-full text-xs text-amber-ink" role="note">{t("settings.hotReloadWarning") || "⚠️ Hot-reload is in-memory only: changes apply immediately but are lost on gateway restart. Copy the snippet into .env to persist."}</p>
      </div>
      {validationErrors.length > 0 && (
        <div className="text-xs px-3 py-2 rounded-lg border bg-rose-soft border-rose-line text-rose-ink" role="alert">
          <span className="font-bold">Validation:</span> {validationErrors.join(" • ")}
        </div>
      )}
      {applyMsg && <div className="text-xs px-3 py-2 rounded-lg border bg-raised border-line font-mono" role="status" aria-live="polite">{applyMsg}</div>}
    </div>
  );
}
