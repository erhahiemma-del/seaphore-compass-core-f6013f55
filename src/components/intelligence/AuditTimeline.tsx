import { useState } from "react";
import { Download } from "lucide-react";

import type { AuditEvent } from "@/lib/lifecycle-data";
import { AUDIT_FILTERS } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

/**
 * Shared audit timeline. Used by Investigate, Decision Support, Memory.
 * MEM-6: filterable + Export Audit Log button.
 */
export function AuditTimeline({
  events,
  className,
  showExport = true,
}: {
  events: AuditEvent[];
  className?: string;
  showExport?: boolean;
}) {
  const [filter, setFilter] = useState<(typeof AUDIT_FILTERS)[number]>("All Events");

  const filtered = events.filter((e) => {
    if (filter === "All Events") return true;
    if (filter === "Data Changes") return e.kind === "Data";
    if (filter === "Exports") return e.kind === "Export";
    if (filter === "Shares") return e.kind === "Share";
    return e.kind === filter;
  });

  return (
    <div className={cn("rounded-lg border border-line bg-card shadow-card", className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <span className="type-h2 text-foreground">Audit Trail</span>
        <div className="ml-2 flex flex-wrap gap-1">
          {AUDIT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-semibold motion-fast",
                filter === f
                  ? "bg-[color:var(--color-navy)] text-white"
                  : "text-slate hover:bg-surface-2",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        {showExport && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-surface-2"
          >
            <Download className="h-3 w-3" /> Export Audit Log
          </button>
        )}
      </div>
      <ol className="divide-y divide-line">
        {filtered.map((e) => (
          <li key={e.id} className="grid grid-cols-[110px_1fr_auto] items-start gap-3 px-3 py-2 text-[12px]">
            <span className="type-mono text-[11px] text-slate">{e.at}</span>
            <div className="min-w-0">
              <div className="truncate text-foreground">
                <b>{e.actor}</b> — {e.action}
              </div>
              <div className="truncate text-[11px] text-slate">{e.detail}</div>
            </div>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: KIND_COLOR[e.kind],
                backgroundColor: `${KIND_COLOR[e.kind]}14`,
              }}
            >
              {e.kind}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const KIND_COLOR: Record<AuditEvent["kind"], string> = {
  System: "#2563EB",
  Officer: "#0E7C7B",
  Data: "#B06A00",
  Export: "#7C3AED",
  Share: "#C0392B",
};
