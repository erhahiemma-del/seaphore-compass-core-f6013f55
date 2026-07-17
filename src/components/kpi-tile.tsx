import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { ConfidenceChip, type ConfidenceTier } from "@/components/confidence-chip";
import { cn } from "@/lib/utils";

/**
 * KPI tile — the primitive for every signal ribbon, count, and stat card.
 * Value is prominent; confidence chip is mandatory (OC-001).
 */
export interface KpiTileProps {
  label: string;
  value: string | number;
  delta?: number;
  confidence: ConfidenceTier;
  icon?: LucideIcon;
  accentHex?: string;
  className?: string;
}

export function KpiTile({
  label,
  value,
  delta,
  confidence,
  icon: Icon,
  accentHex,
  className,
}: KpiTileProps) {
  const trendUp = (delta ?? 0) > 0;
  const trendFlat = (delta ?? 0) === 0;
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-card px-4 py-3 shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="type-label text-slate">{label}</span>
        {Icon && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              color: accentHex ?? "var(--color-teal)",
              backgroundColor: `${accentHex ?? "#0E7C7B"}14`,
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="text-[24px] font-extrabold tracking-tight text-foreground"
          style={accentHex ? { color: accentHex } : undefined}
        >
          {value}
        </span>
        {delta !== undefined && !trendFlat && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold",
              trendUp
                ? "text-[color:var(--color-red)]"
                : "text-[color:var(--color-green)]",
            )}
          >
            {trendUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <div className="mt-1.5">
        <ConfidenceChip tier={confidence} size={9} />
      </div>
    </div>
  );
}
