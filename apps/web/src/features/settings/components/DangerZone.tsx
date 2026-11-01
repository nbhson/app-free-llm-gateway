import { AlertTriangle, Trash2, RotateCcw } from "lucide-react";

type DangerZoneProps = {
  clearingCache: boolean;
  onClearCache: () => void;
  onModelHealthClear: () => void;
  onReset: () => void;
};

export function DangerZone({ clearingCache, onClearCache, onModelHealthClear, onReset }: DangerZoneProps) {
  return (
    <div className="bg-rose-soft rounded-xl border border-rose-line p-4">
      <h3 className="text-sm font-bold text-rose-ink flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> Danger Zone
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-2">
        <button type="button" onClick={onClearCache} disabled={clearingCache} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface border border-rose-line hover:bg-rose-soft text-sm font-semibold text-rose-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <span className="flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Clear Semantic Cache
          </span>
          <span className="text-xs font-normal text-rose-500">DELETE /api/cache</span>
        </button>
        <button type="button" onClick={onModelHealthClear} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface border border-rose-line hover:bg-rose-soft text-sm font-semibold text-rose-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <span className="flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Clear Model Health
          </span>
          <span className="text-xs font-normal text-rose-500">DELETE /api/models/health/persisted</span>
        </button>
        <button type="button" onClick={() => { if (!confirm("Reset all Settings to .env defaults and clear localStorage? This cannot be undone.")) return; onReset(); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface border border-rose-line hover:bg-rose-soft text-sm font-semibold text-rose-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <span className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Reset localStorage
          </span>
          <span className="text-xs font-normal text-rose-500">Remove gatewaySettings</span>
        </button>
      </div>
    </div>
  );
}
