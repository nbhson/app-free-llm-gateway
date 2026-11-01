import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

type SectionProps = {
  id: string;
  title: string;
  icon: ReactNode;
  desc?: string;
  keywords?: string;
  search: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  onResetSection?: () => void;
  children: ReactNode;
};

export function Section({ id, title, icon, desc, keywords, search, collapsed, onToggle, onResetSection, children }: SectionProps) {
  // Search: filter sections
  if (search) {
    const q = search.toLowerCase();
    if (!`${title} ${desc || ""} ${keywords || ""} ${id}`.toLowerCase().includes(q)) return null;
  }
  const isCollapsed = !!collapsed[id];
  return (
    <div className="bg-surface rounded-xl border border-line overflow-visible">
      <div className="w-full flex items-center justify-between px-5 py-3.5 bg-raised/70 border-b border-linesoft">
        <button
          type="button"
          onClick={() => onToggle(id)}
          className="flex items-center gap-2.5 flex-1 text-left"
          aria-expanded={!isCollapsed}
          aria-controls={`section-${id}`}
        >
          <span className="w-7 h-7 rounded-lg bg-surface border border-line flex items-center justify-center text-body">{icon}</span>
          <div>
            <div className="text-sm font-bold text-heading">{title}</div>
            {desc && <div className="text-xs text-mutedtxt">{desc}</div>}
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          {onResetSection && (
            <button type="button" onClick={onResetSection} className="px-2 py-1 rounded-lg text-xs font-semibold border border-line bg-surface hover:bg-raised text-secondary" title="Reset this section to .env">
              <RotateCcw className="w-3 h-3 inline mr-1" />Reset
            </button>
          )}
          <button type="button" onClick={() => onToggle(id)} className="p-1.5 hover:bg-surface rounded-lg border border-transparent hover:border-line" aria-label={isCollapsed ? "Expand" : "Collapse"}>
            {isCollapsed ? <ChevronDown className="w-4 h-4 text-mutedtxt" /> : <ChevronUp className="w-4 h-4 text-mutedtxt" />}
          </button>
        </div>
      </div>
      {!isCollapsed && <div id={`section-${id}`} className="p-5 space-y-4">{children}</div>}
    </div>
  );
}
