import { ArrowRight, Check } from "lucide-react";

import type { ChecklistStep } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

/**
 * INV-3 / DS-3 case progress checklist.
 */
export function CaseProgressChecklist({
  steps,
  className,
  showWorkflowLink = true,
}: {
  steps: ChecklistStep[];
  className?: string;
  showWorkflowLink?: boolean;
}) {
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <div className={cn("rounded-lg border border-line bg-card p-3 shadow-card", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="type-h2 text-foreground">Case Progress</span>
        <span className="type-mono text-[11px] font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-[color:var(--color-teal)]" style={{ width: `${pct}%` }} />
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[12px]">
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                s.done
                  ? "bg-[color:var(--color-green)] text-white"
                  : "border border-line bg-surface",
              )}
            >
              {s.done && <Check className="h-2.5 w-2.5" />}
            </span>
            <span
              className={cn(
                s.done ? "text-foreground/85" : "text-foreground font-semibold",
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      {showWorkflowLink && (
        <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
          View Workflow <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
