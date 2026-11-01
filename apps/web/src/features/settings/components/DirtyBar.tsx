import { X } from "lucide-react";

type DirtyBarProps = {
  diffCount: number;
  invalidCount: number;
  applying: boolean;
  onSave: () => void;
  onApply: () => void;
  onDismiss: () => void;
};

export function DirtyBar({ diffCount, invalidCount, applying, onSave, onApply, onDismiss }: DirtyBarProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-ink px-4 py-2.5 rounded-full shadow-xl border border-linestrong flex items-center gap-3 text-sm" role="status" aria-live="polite">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden />
      <span className="font-semibold">Unsaved changes • {diffCount} fields</span>
      {invalidCount > 0 && <span className="text-rose-300 text-xs">• {invalidCount} invalid</span>}
      <button type="button" onClick={onSave} disabled={invalidCount > 0} className="ml-2 px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50">Save</button>
      <button type="button" onClick={onApply} disabled={applying || invalidCount > 0} className="px-3 py-1 rounded-full bg-surface text-heading hover:bg-muted text-xs font-bold disabled:opacity-50">Apply</button>
      <button type="button" onClick={onDismiss} className="p-1 hover:bg-white/10 rounded-full" aria-label="Dismiss">
        <X className="w-4 h-4 text-mutedtxt" />
      </button>
    </div>
  );
}
