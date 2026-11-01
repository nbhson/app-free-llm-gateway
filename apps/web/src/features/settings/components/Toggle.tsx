export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || "toggle"}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); }
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${disabled ? "opacity-50 cursor-not-allowed bg-strong" : checked ? "bg-amber-500" : "bg-strong"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );
}
