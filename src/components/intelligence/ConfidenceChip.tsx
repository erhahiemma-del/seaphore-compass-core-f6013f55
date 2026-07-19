import { cn } from "@/lib/utils";

/**
 * OC-001 Confidence Ladder — REQUIRED on every figure.
 *
 * Every number, count, aggregate, signal, and status renders this chip.
 * A bare number is a build defect.
 */
export type ConfidenceTier = "verified" | "observed" | "inferred" | "unconfirmed";

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

/** Build Bible spec: uppercase level labels. */
export type ConfidenceLevel = "VERIFIED" | "OBSERVED" | "INFERRED" | "UNCONFIRMED";

const LEVEL_TO_TIER: Record<ConfidenceLevel, ConfidenceTier> = {
  VERIFIED: "verified",
  OBSERVED: "observed",
  INFERRED: "inferred",
  UNCONFIRMED: "unconfirmed",
};

export interface ConfidenceChipProps {
  /**
   * Build Bible prop — uppercase level. Prefer this in new code.
   * One of `level` or `tier` must be supplied.
   */
  level?: ConfidenceLevel;
  /** @deprecated Legacy lowercase tier. Use `level` in new features. */
  tier?: ConfidenceTier;
  /**
   * Build Bible sizes ("sm" | "md") or legacy numeric (9 | 11).
   * "md" ≡ 11 (default), "sm" ≡ 9 (compact briefings strip).
   */
  size?: "sm" | "md" | 11 | 9;
  className?: string;
}

export function ConfidenceChip({ level, tier, size = "md", className }: ConfidenceChipProps) {
  const resolvedTier: ConfidenceTier = tier ?? (level ? LEVEL_TO_TIER[level] : "observed");
  const hex = HEX[resolvedTier];
  const compact = size === "sm" || size === 9;
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
      title={CONFIDENCE_DESCRIPTIONS[resolvedTier]}
    >
      <span
        aria-hidden
        className={cn("rounded-full", compact ? "h-1.5 w-1.5" : "h-2 w-2")}
        style={{ backgroundColor: hex }}
      />
      {CONFIDENCE_LABELS[resolvedTier]}
    </span>
  );
}
