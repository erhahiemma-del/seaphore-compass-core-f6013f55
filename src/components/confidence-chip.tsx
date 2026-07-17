import { cn } from "@/lib/utils";

/**
 * OC-001 Confidence Ladder — REQUIRED on every figure.
 *
 * Every number, count, aggregate, signal, and status renders this chip.
 * A bare number is a build defect.
 */
export type ConfidenceTier =
  | "verified"
  | "observed"
  | "inferred"
  | "unconfirmed";

export const CONFIDENCE_LABELS: Record<ConfidenceTier, string> = {
  verified: "VERIFIED",
  observed: "OBSERVED",
  inferred: "INFERRED",
  unconfirmed: "UNCONFIRMED",
};

export const CONFIDENCE_DESCRIPTIONS: Record<ConfidenceTier, string> = {
  verified: "Confirmed by authoritative source",
  observed: "Directly observed / measured",
  inferred: "Derived from multiple sources",
  unconfirmed: "Insufficient evidence",
};

/**
 * Confidence hex values are pinned per the token reference.
 * The chip tint is the same colour at 8% alpha — spec exact.
 */
const HEX: Record<ConfidenceTier, string> = {
  verified: "#1E6B3A",
  observed: "#2563EB",
  inferred: "#B06A00",
  unconfirmed: "#8A98A6",
};

export interface ConfidenceChipProps {
  tier: ConfidenceTier;
  /** 11 = default; 9 = compact (briefings strip). */
  size?: 11 | 9;
  className?: string;
}

export function ConfidenceChip({
  tier,
  size = 11,
  className,
}: ConfidenceChipProps) {
  const hex = HEX[tier];
  const compact = size === 9;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm font-bold uppercase tracking-[0.04em] whitespace-nowrap",
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[11px]",
        className,
      )}
      style={{
        color: hex,
        backgroundColor: `${hex}14`, // 8% alpha (0x14 ≈ 20/255)
      }}
      title={CONFIDENCE_DESCRIPTIONS[tier]}
    >
      <span
        aria-hidden
        className={cn("rounded-full", compact ? "h-1.5 w-1.5" : "h-2 w-2")}
        style={{ backgroundColor: hex }}
      />
      {CONFIDENCE_LABELS[tier]}
    </span>
  );
}
