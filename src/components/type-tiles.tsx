import {
  AlertTriangle,
  ArrowLeftRight,
  Copy,
  GitBranch,
  ScanSearch,
  MinusSquare,
  type LucideIcon,
} from "lucide-react";

import { ConfidenceChip } from "@/components/confidence-chip";
import type { SignalType } from "@/lib/lifecycle-data";
import type { ConfidenceTier } from "@/components/confidence-chip";
import { cn } from "@/lib/utils";

const ICONS: Record<SignalType, LucideIcon> = {
  Anomalies: AlertTriangle,
  Discrepancies: ArrowLeftRight,
  Duplicates: Copy,
  Changes: GitBranch,
  Gaps: MinusSquare,
  Matches: ScanSearch,
};

/**
 * DET-6 signals-by-type icon tiles.
 */
export function TypeTiles({
  items,
  className,
}: {
  items: Array<{ type: SignalType; count: number; confidence: ConfidenceTier }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {items.map((it) => {
        const Icon = ICONS[it.type];
        return (
          <div
            key={it.type}
            className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="type-label text-slate">{it.type}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-[20px] font-extrabold text-foreground">
                {it.count}
              </span>
              <ConfidenceChip tier={it.confidence} size={9} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
