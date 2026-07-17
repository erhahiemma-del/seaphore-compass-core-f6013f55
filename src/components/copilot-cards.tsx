import { ArrowRight, Sparkles } from "lucide-react";

import { ConfidenceChip } from "@/components/confidence-chip";
import type { CopilotCard } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

/**
 * DET-9 AI Signal Summary (Copilot Insights).
 * Each card = title · one-sentence OBSERVED-language observation · view link.
 */
export function CopilotCards({
  cards,
  className,
}: {
  cards: CopilotCard[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {cards.map((c) => (
        <div
          key={c.title}
          className="flex flex-col justify-between rounded-lg border border-line bg-card p-3 shadow-card"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-purple)]/10 text-[color:var(--color-purple)]">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="type-label text-slate">Copilot Insight</span>
            </div>
            <div className="mt-1.5 text-[13px] font-semibold text-foreground">
              {c.title}
            </div>
            <p className="mt-1 text-[12px] text-foreground/75">{c.observation}</p>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <ConfidenceChip tier={c.confidence} size={9} />
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline"
            >
              View Insight <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
