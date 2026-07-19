import { Sparkles } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { cn } from "@/lib/utils";

/**
 * DS-4 System-generated recommendation panel.
 * Always labelled "System Generated". Officer accountability preserved.
 */
export function RecommendationPanel({
  action,
  confidencePct,
  evidenceCount,
  rulesCount,
  sourcesCount,
  rationale,
  className,
}: {
  action: string;
  confidencePct: number;
  evidenceCount: number;
  rulesCount: number;
  sourcesCount: number;
  rationale: string;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-line bg-card p-4 shadow-card", className)}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-purple)]/10 text-[color:var(--color-purple)]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="type-label text-slate">Recommendation (System Generated)</div>
          <div className="text-[12px] text-slate">
            Based on analysis of available evidence and rules.
          </div>
        </div>
        <span
          className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#7C3AED", backgroundColor: "#7C3AED14" }}
        >
          Recommended
        </span>
      </header>

      <div className="mt-4 rounded-md border border-[color:var(--color-teal)]/20 bg-[color:var(--color-teal)]/5 px-4 py-3">
        <div className="type-label text-slate">Recommended Action</div>
        <div className="mt-0.5 text-[22px] font-extrabold text-[color:var(--color-navy)]">
          {action}
        </div>
        <p className="mt-1 text-[13px] text-foreground/80">{rationale}</p>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="type-label text-slate">Confidence in Recommendation</span>
          <div className="flex items-center gap-2">
            <ConfidenceChip tier="observed" size={9} />
            <span className="text-[13px] font-bold text-foreground">{confidencePct}%</span>
          </div>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-[color:var(--color-teal)]"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Evidence Items" value={evidenceCount} />
        <Stat label="Rules Triggered" value={rulesCount} />
        <Stat label="Data Sources" value={sourcesCount} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-surface-2/60 py-2">
      <div className="text-[18px] font-extrabold text-foreground">{value}</div>
      <div className="type-label text-slate">{label}</div>
    </div>
  );
}
