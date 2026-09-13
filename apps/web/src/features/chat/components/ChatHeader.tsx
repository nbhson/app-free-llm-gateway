import React, { useMemo, useState } from "react";
import { Cpu, ChevronDown, BarChart3, Settings2, RotateCcw, MessageSquare, Globe, Star } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import type { ModelEntry } from "../types";

type Props = {
  models: ModelEntry[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  effectiveContext: number;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  onConfirmRefresh: () => void;
  webToolsEnabled: boolean;
  onToggleWebTools: () => void;
  favoriteSet?: Set<string>;
};

export const ChatHeader = React.memo(function ChatHeader({
  models,
  selectedModel,
  onSelectModel,
  effectiveContext,
  drawerOpen,
  onToggleDrawer,
  showSettings,
  onToggleSettings,
  onConfirmRefresh,
  webToolsEnabled,
  onToggleWebTools,
  favoriteSet,
}: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredModels = useMemo(
    () =>
      models
        .filter((m) => !filter || m.id.toLowerCase().includes(filter.toLowerCase()) || m.owned_by.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => {
          const aFav = favoriteSet?.has(a.id) ? 0 : 1;
          const bFav = favoriteSet?.has(b.id) ? 0 : 1;
          if (aFav !== bFav) return aFav - bFav;
          return 0;
        })
        .slice(0, 150),
    [models, filter, favoriteSet],
  );
  const favoritesInView = useMemo(() => filteredModels.filter((m) => favoriteSet?.has(m.id)), [filteredModels, favoriteSet]);
  const nonFavoritesInView = useMemo(() => filteredModels.filter((m) => !favoriteSet?.has(m.id)), [filteredModels, favoriteSet]);

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
          <MessageSquare className="w-4 h-4" />
        </div>
        <div className="hidden sm:block">
          <div className="text-sm font-bold text-slate-900 leading-none">{t("chat.title")}</div>
          <div className="text-xs text-slate-500">{models.length} {t("chat.model").toLowerCase()}s • gateway proxy</div>
        </div>
      </div>

      <div className="relative flex-1 max-w-[420px] ml-2">
        <button
          aria-label="Select model"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium hover:bg-slate-50 text-left"
        >
          <Cpu className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="truncate font-mono text-xs flex-1">{selectedModel}</span>
          {favoriteSet?.has(selectedModel) && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />}
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-mono">
            {effectiveContext >= 1000000 ? `${Math.round(effectiveContext / 1000000)}M` : `${Math.round(effectiveContext / 1000)}K`}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 z-30 overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                aria-label="Filter models"
                placeholder={t("chat.filterModel")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="max-h-[380px] overflow-y-auto" role="listbox" aria-label="Models">
              {favoritesInView.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-amber-50/80 border-b border-amber-100 flex items-center gap-1.5 text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> {t("chat.favorites")} ({favoritesInView.length})
                  </div>
                  {favoritesInView.map((m) => (
                    <button
                      key={`fav-${m.id}`}
                      role="option"
                      aria-selected={m.id === selectedModel}
                      onClick={() => {
                        onSelectModel(m.id);
                        setOpen(false);
                        setFilter("");
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center gap-2 border-b border-slate-50 last:border-0 ${m.id === selectedModel ? "bg-slate-900 text-white hover:bg-slate-800" : ""}`}
                    >
                      <Star className={`w-3.5 h-3.5 shrink-0 ${m.id === selectedModel ? "fill-amber-400 text-amber-400" : "fill-amber-400 text-amber-500"}`} />
                      <span className="font-mono text-xs flex-1 truncate">{m.id}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${m.id === selectedModel ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                        {m.context_length ? (m.context_length >= 1000000 ? `${m.context_length / 1000000}M` : `${Math.round(m.context_length / 1000)}K`) : "—"}
                      </span>
                    </button>
                  ))}
                  {filteredModels.length > favoritesInView.length && (
                    <div className="px-3 py-1.5 bg-slate-50 border-y border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <Cpu className="w-3 h-3" /> {t("chat.default_models")} ({nonFavoritesInView.length})
                    </div>
                  )}
                </>
              )}
              {(favoritesInView.length === 0 ? filteredModels : nonFavoritesInView).map((m) => (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={m.id === selectedModel}
                  onClick={() => {
                    onSelectModel(m.id);
                    setOpen(false);
                    setFilter("");
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0 ${m.id === selectedModel ? "bg-slate-900 text-white hover:bg-slate-800" : ""}`}
                >
                  <span className="font-mono text-xs flex-1 truncate">{m.id}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${m.id === selectedModel ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                    {m.context_length ? (m.context_length >= 1000000 ? `${m.context_length / 1000000}M` : `${Math.round(m.context_length / 1000)}K`) : "—"}
                  </span>
                </button>
              ))}
              {filteredModels.length === 0 && <div className="p-4 text-center text-sm text-slate-400">{favoriteSet && favoriteSet.size === 0 && !filter ? t("chat.no_favorites") : t("chat.noMatch")}</div>}
              {filteredModels.length > 0 && favoriteSet && favoriteSet.size === 0 && !filter && favoritesInView.length === 0 && (
                <div className="px-3 py-2 bg-amber-50/50 border-t border-amber-100 text-[11px] text-amber-700 text-center">{t("chat.favorites_hint")}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          aria-label="Toggle web search"
          aria-pressed={webToolsEnabled}
          onClick={onToggleWebTools}
          className={`p-2 rounded-lg border ${webToolsEnabled ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"}`}
          title={webToolsEnabled ? "Web search: ON — LLM can search/browse" : "Web search: OFF"}
        >
          <Globe className="w-4 h-4" />
        </button>
        <button
          aria-label="Toggle context panel"
          aria-expanded={drawerOpen}
          onClick={onToggleDrawer}
          className="lg:hidden p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
          title="Context window"
        >
          <BarChart3 className="w-4 h-4 text-slate-600" />
        </button>
        <button
          aria-label="Toggle settings"
          aria-expanded={showSettings}
          onClick={onToggleSettings}
          className={`p-2 rounded-lg border ${showSettings ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"}`}
          title="Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
        <button
          aria-label="Refresh conversation"
          onClick={onConfirmRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
          title="Refresh conversation"
        >
          <RotateCcw className="w-4 h-4" /> <span className="hidden sm:inline">{t("chat.refresh")}</span>
        </button>
      </div>
    </div>
  );
});
