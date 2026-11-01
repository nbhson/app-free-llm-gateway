import { Layers, ListOrdered, FileJson, Plus, Check, RotateCcw } from "lucide-react";
import { useLang } from "../../../../lib/i18n.tsx";
import { HelpTip } from "../HelpTip";
import { Section } from "../Section";
import { PUBLIC_PROVIDERS_UI, DEFAULT_TIER_JSON } from "../../lib/constants";
import { normalizeTiersString } from "../../lib/helpers";
import type { SettingsState } from "../../types";

type TiersSectionProps = {
  update: (patch: Partial<SettingsState>) => void;
  isModified: (key: keyof SettingsState) => boolean;
  onResetSection: () => void;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  tiersText: string;
  setTiersText: (v: string) => void;
  tiersError: string | null;
  setTiersError: (v: string | null) => void;
  newProvider: string;
  setNewProvider: (v: string) => void;
  onTiersSave: () => void;
  onTiersAddProvider: () => void;
};

export function TiersSection({ update, isModified, onResetSection, search, collapsed, onToggle, tiersText, setTiersText, tiersError, setTiersError, newProvider, setNewProvider, onTiersSave, onTiersAddProvider }: TiersSectionProps) {
  const { t } = useLang();
  return (
    <Section id="tiers" title="Fallback Tiers" icon={<Layers className="w-4 h-4" />} desc="FALLBACK_TIERS JSON — tier order defines routing priority (max 8 tiers, 200 providers)" keywords="fallback tiers providers routing" search={search} collapsed={collapsed} onToggle={onToggle} onResetSection={onResetSection}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-body"><ListOrdered className="w-3.5 h-3.5 text-mutedtxt" /> Add provider <HelpTip text={t("settings.fallbackAddTip")} /></div>
          <input type="text" value={newProvider} onChange={(e) => setNewProvider(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onTiersAddProvider(); } }} placeholder="Add provider id (e.g. groq)" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-mono" aria-label="New provider id" />
          <button type="button" onClick={onTiersAddProvider} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-ink hover:bg-primary-hover flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add to tier 1</button>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-body"><FileJson className="w-3.5 h-3.5 text-mutedtxt" /> FALLBACK_TIERS JSON <HelpTip text={t("settings.fallbackJsonTip")} /></div>
        <textarea value={tiersText} onChange={(e) => setTiersText(e.target.value)} rows={6} className={`w-full rounded-lg border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 ${tiersError ? "border-red-line ring-red-500 bg-red-soft/30" : isModified("FALLBACK_TIERS") ? "border-amber-line focus:ring-amber-500 bg-amber-soft/20" : "border-line focus:ring-amber-500"}`} placeholder={DEFAULT_TIER_JSON} aria-label="FALLBACK_TIERS JSON" aria-invalid={!!tiersError} />
        {tiersError && <p className="text-xs text-red-ink" role="alert">{tiersError}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onTiersSave} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-ink hover:bg-primary-hover flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Validate & Stage</button>
          <button type="button" onClick={() => { const norm = normalizeTiersString(DEFAULT_TIER_JSON); setTiersText(norm); update({ FALLBACK_TIERS: norm }); setTiersError(null); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line bg-surface hover:bg-raised flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Reset default</button>
          <span className="text-xs text-mutedtxt">JSON array of arrays • deduped, max 60/tier</span>
        </div>
        <div className="flex flex-wrap gap-1.5 p-2 bg-raised rounded-lg border border-line max-h-32 overflow-y-auto" role="list" aria-label="Tiers preview">
          {(() => {
            try {
              const tiers: string[][] = JSON.parse(tiersText);
              const flat = tiers.flat();
              return flat.map((p: string, idx: number) => {
                const isPublic = PUBLIC_PROVIDERS_UI.has(p);
                return (
                  <span key={`${p}-${idx}`} className={`px-2 py-0.5 rounded-full text-xs font-mono border ${isPublic ? "bg-blue-soft border-blue-line text-blue-ink" : "bg-surface border-line text-body"}`} title={isPublic ? "public (no key, free fallback)" : "requires API key"} role="listitem">
                    {p} {isPublic ? "• public" : ""}
                  </span>
                );
              });
            } catch {
              return <span className="text-xs text-mutedtxt">Invalid JSON</span>;
            }
          })()}
        </div>
        {(() => {
          try {
            const tiers: string[][] = JSON.parse(tiersText);
            const flat = tiers.flat();
            const publicCount = flat.filter((p) => PUBLIC_PROVIDERS_UI.has(p)).length;
            const total = flat.length;
            if (total < 4) return <p className="text-xs text-amber-ink bg-amber-soft border border-amber-line rounded px-2 py-1">⚠️ Pool quá nhỏ ({total} providers) — dễ 502 khi 1 provider timeout. Khuyến nghị ≥6 với ít nhất 2 public (pollinations, llm7-io).</p>;
            if (publicCount === 0) return <p className="text-xs text-blue-ink bg-blue-soft border border-blue-line rounded px-2 py-1">💡 Chưa có public fallback (pollinations/llm7-io). Thêm pollinations để không 502 khi hết key.</p>;
            return <p className="text-xs text-mutedtxt">{total} providers • {publicCount} public • sẽ filter theo hasRealKey (đã config) khi chạy.</p>;
          } catch { return null; }
        })()}
        <p className="text-xs text-mutedtxt">Chips xanh = public (giữ lại khi filter), trắng = cần key. Router mới chỉ fallback vào provider đã config + public.</p>
      </div>
    </Section>
  );
}
