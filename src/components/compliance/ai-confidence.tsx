import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * HR-12 — an AI confidence percentage is *always* one click away from its
 * basis. A bare "82% confidence" without decomposition is a build defect.
 *
 * `basis` is the ordered list of contributing factors and their weights;
 * the sum should ~match the surfaced percentage. The popover renders it.
 */
export interface AiConfidenceBasisItem {
  factor: string;
  contribution: number; // percentage points
  note?: string;
}

export interface AiConfidenceProps {
  percent: number;
  basis: readonly AiConfidenceBasisItem[];
  className?: string;
  context?: string;
}

export function AiConfidence({
  percent,
  basis,
  className,
  context = "AiConfidence",
}: AiConfidenceProps) {
  const [open, setOpen] = useState(false);
  if (!basis || basis.length === 0) {
    throw new Error(
      `[HR-12] ${context}: AiConfidence requires a non-empty basis. ` +
        `A bare percentage is not permitted.`,
    );
  }
  const rounded = Math.round(percent);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5",
            "text-[11px] font-mono tabular-nums hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40",
            className,
          )}
          aria-label={`AI confidence ${rounded}% — click for basis`}
        >
          <span className="font-bold">{rounded}%</span>
          <span className="type-small text-slate">confidence</span>
          <span aria-hidden className="text-slate">
            ⓘ
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="mb-2">
          <div className="type-label text-slate">AI confidence basis</div>
          <div className="type-h3 font-mono tabular-nums">{rounded}%</div>
        </div>
        <ul className="space-y-1.5">
          {basis.map((b, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="type-body">{b.factor}</div>
                {b.note && <div className="type-small text-slate">{b.note}</div>}
              </div>
              <span className="type-small font-mono tabular-nums text-foreground/80">
                {b.contribution >= 0 ? "+" : ""}
                {b.contribution.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
        <p className="type-small text-slate mt-3">
          Decomposition shown per HR-12. Officer decides.
        </p>
      </PopoverContent>
    </Popover>
  );
}
