import { ChevronRight } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { RiskPill } from "@/components/intelligence/RiskPill";
import type { Signal } from "@/lib/lifecycle-data";
import { cn } from "@/lib/utils";

/**
 * DET-7 Top High-Risk Signals list. Each row hands off to Investigate
 * with the detecting signal pre-loaded as first evidence.
 */
export function SignalList({
  signals,
  onOpen,
  className,
}: {
  signals: Signal[];
  onOpen?: (s: Signal) => void;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {signals.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onOpen?.(s)}
            className="flex w-full items-center gap-3 px-1 py-2.5 text-left motion-fast hover:bg-surface-2/60"
          >
            <RiskPill level={s.risk} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-foreground">{s.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate">
                <span className="truncate">{s.detail}</span>
                <span>·</span>
                <span>{s.detectedLabel}</span>
                <span>·</span>
                <span>{s.domain}</span>
              </div>
            </div>
            <ConfidenceChip tier={s.confidence} size={9} />
            <ChevronRight className="h-4 w-4 shrink-0 text-slate" />
          </button>
        </li>
      ))}
    </ul>
  );
}
