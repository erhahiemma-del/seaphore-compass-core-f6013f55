import { CONFIDENCE_LABELS, type ConfidenceTier } from "@/components/confidence-chip";
import { cn } from "@/lib/utils";

const HEX: Record<ConfidenceTier, string> = {
  verified: "#1E6B3A",
  observed: "#2563EB",
  inferred: "#B06A00",
  unconfirmed: "#8A98A6",
};

const ORDER: ConfidenceTier[] = ["verified", "observed", "inferred", "unconfirmed"];

export interface ConfidenceLegendProps {
  className?: string;
  align?: "left" | "center" | "right";
}

/**
 * OC-001 Confidence Ladder — legend row.
 * Ships directly below the ribbon on Mission Control (MC-RB-3) and in
 * the global footer strip on every Intelligence Centre.
 */
export function ConfidenceLegend({ className, align = "left" }: ConfidenceLegendProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 type-small text-slate",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        className,
      )}
    >
      <span className="type-label text-slate">Confidence Ladder</span>
      {ORDER.map((tier) => (
        <span key={tier} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: HEX[tier] }}
          />
          <span className="text-[11px] font-semibold tracking-[0.04em] text-foreground/75">
            {CONFIDENCE_LABELS[tier]}
          </span>
        </span>
      ))}
    </div>
  );
}
