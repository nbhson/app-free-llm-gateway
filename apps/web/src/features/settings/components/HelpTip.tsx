import { useState } from "react";
import { Info } from "lucide-react";

export function HelpTip({ text, id }: { text: string; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      tabIndex={0}
      role="button"
      aria-label={text}
      aria-describedby={id}
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted group-hover:bg-strong border border-line cursor-help">
        <Info className="w-3 h-3 text-mutedtxt" />
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 max-w-[260px] z-50 px-3 py-2 rounded-lg bg-primary text-primary-ink text-xs leading-relaxed shadow-xl border border-linestrong whitespace-normal break-words"
        >
          {text}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-primary rotate-45 border-r border-b border-linestrong -mt-1" aria-hidden />
        </span>
      )}
    </span>
  );
}
