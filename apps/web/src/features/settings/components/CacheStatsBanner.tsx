import { Sparkles, Trash2, RefreshCw } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import { HelpTip } from "./HelpTip";
import type { CacheStats } from "../types";

type CacheStatsBannerProps = {
  cacheStats: CacheStats | null;
  cacheLoading: boolean;
  cacheError: string | null;
  clearingCache: boolean;
  onRefresh: () => void;
  onClear: () => void;
};

export function CacheStatsBanner({ cacheStats, cacheLoading, cacheError, clearingCache, onRefresh, onClear }: CacheStatsBannerProps) {
  const { t } = useLang();
  return (
    <div className="bg-codesurface rounded-xl p-4 border border-codeline flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-[220px]">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white flex items-center gap-2">
            {t("settings.cacheLive") || "Cache Live"} <HelpTip text={t("settings.cacheLiveDesc") || "Live semantic cache status — requires admin MASTER_KEY"} /> <span className={`w-2 h-2 rounded-full ${cacheStats?.enabled ? "bg-emerald-400 animate-pulse" : "bg-codetextfaint"}`} aria-label={cacheStats?.enabled ? "enabled" : "disabled"} />
            {cacheError && <span className="text-xs font-normal text-rose-300">• {cacheError}</span>}
          </div>
          <div className="text-xs text-codetextdim flex flex-wrap gap-2 mt-0.5">
            {cacheLoading ? <span className="text-mutedtxt">loading...</span> : cacheStats ? (
              <>
                <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded" title={t("settings.cacheHits") || "hits"}>{cacheStats.hits ?? 0} {t("settings.cacheHits") || "hits"}</span>
                <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded" title={t("settings.cacheMisses") || "misses"}>{cacheStats.misses ?? 0} {t("settings.cacheMisses") || "misses"}</span>
                <span className="font-mono bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded border border-emerald-500/30" title={t("settings.cacheHitRate") || "hit rate"}>{typeof cacheStats.hitRate === "number" ? `${(cacheStats.hitRate * 100).toFixed(1)}%` : "—"} {t("settings.cacheHitRate") || "hit rate"}</span>
                <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded" title={t("settings.cacheSize") || "entries"}>{cacheStats.size ?? 0} {t("settings.cacheSize") || "entries"}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${cacheStats.enabled ? "bg-emerald-500 text-white" : "bg-strong text-secondary"}`}>{cacheStats.enabled ? "enabled" : "disabled"}</span>
              </>
            ) : <span className="text-mutedtxt">No stats yet — call /api/cache/stats</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onRefresh} disabled={cacheLoading} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface text-title hover:bg-muted border flex items-center gap-1.5 disabled:opacity-50" title="GET /api/cache/stats — requires admin">
          <RefreshCw className={`w-3.5 h-3.5 ${cacheLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={onClear} disabled={clearingCache} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 border border-rose-700 flex items-center gap-1.5 disabled:opacity-50" title={t("settings.clearCacheConfirm") || "Clear semantic cache"}>
          <Trash2 className="w-3.5 h-3.5" /> {clearingCache ? "Clearing..." : (t("settings.clearCache") || "Clear Cache")}
        </button>
      </div>
    </div>
  );
}
