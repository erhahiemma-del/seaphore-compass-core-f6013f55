import { cn } from "@/lib/utils";

/**
 * OC-001 Confidence Ladder
 *
 * Every number in Seaphore wears a confidence chip. This primitive is the
 * single source of truth — never render a value without one.
 *
 * Tiers:
 *   verified    — Confirmed by authoritative source
 *   observed    — Directly observed / measured
 *   inferred    — Derived from multiple sources
 *   unconfirmed — Insufficient evidence
 */
export type ConfidenceTier =
  | "verified"
  | "observed"
  | "inferred"
  | "unconfirmed";

export const CONFIDENCE_LABELS: Record<ConfidenceTier, string> = {
  verified: "Verified",
  observed: "Observed",
  inferred: "Inferred",
  unconfirmed: "Unconfirmed",
};

export const CONFIDENCE_DESCRIPTIONS: Record<ConfidenceTier, string> = {
  verified: "Confirmed by authoritative source",
  observed: "Directly observed / measured",
  inferred: "Derived from multiple sources",
  unconfirmed: "Insufficient evidence",
};

const TIER_CLASSES: Record<ConfidenceTier, string> = {
  verified:
    "bg-verified/12 text-verified border-verified/30",
  observed:
    "bg-observed/12 text-observed border-observed/30",
  inferred:
    "bg-inferred/15 text-inferred-foreground border-inferred/40",
  unconfirmed:
    "bg-unconfirmed/15 text-unconfirmed-foreground border-unconfirmed/40",
};

export interface ConfidenceChipProps {
  tier: ConfidenceTier;
  className?: string;
  showDot?: boolean;
}

export function ConfidenceChip({
  tier,
  className,
  showDot = true,
}: ConfidenceChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-[10px] font-semibold uppercase tracking-wider",
        TIER_CLASSES[tier],
        className,
      )}
      title={CONFIDENCE_DESCRIPTIONS[tier]}
    >
      {showDot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tier === "verified" && "bg-verified",
            tier === "observed" && "bg-observed",
            tier === "inferred" && "bg-inferred",
            tier === "unconfirmed" && "bg-unconfirmed",
          )}
        />
      )}
      {CONFIDENCE_LABELS[tier]}
    </span>
  );
}
