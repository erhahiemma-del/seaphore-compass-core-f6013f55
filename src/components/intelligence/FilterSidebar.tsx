import type { ReactNode } from "react";

/**
 * FilterSidebar — reusable left-rail filter panel for lists and centres.
 * Owns layout only; caller supplies the filter controls.
 */
export function FilterSidebar({ title = "Filters", children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="w-[220px] shrink-0 space-y-3 rounded-md border border-line bg-surface-1 p-3">
      <div className="type-label text-slate">{title}</div>
      <div className="space-y-3 text-[12px] text-foreground">{children}</div>
    </aside>
  );
}
