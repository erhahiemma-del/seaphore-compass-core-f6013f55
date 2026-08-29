/**
 * The subtle vessel sanctions indicator.
 *
 * Deliberately quiet: a small chip, never a banner and never a red hull.
 * A provider candidate is similarity evidence, and drawing it loudly
 * would let an officer read "screening returned something" as "this ship
 * is sanctioned". The word "sanctioned" never appears.
 *
 * Clicking opens the canonical vessel intelligence context — the same one
 * every other surface opens. There is no separate sanctions screen.
 */
import { cn } from "@/lib/utils";
import {
  SANCTIONS_INDICATOR_CAVEAT,
  SANCTIONS_INDICATOR_LABEL,
  type SanctionsIndicatorState,
} from "@/lib/sanctions/indicator";

/** Colour is one channel; the label always carries the meaning. */
const STYLE: Record<SanctionsIndicatorState, string> = {
  NOT_SCREENED: "border-line/60 text-slate",
  REVIEW_REQUIRED: "border-[#FB923C]/50 text-[#B06A00] bg-[#FB923C]/10",
  MATCH_CONFIRMED: "border-[#C0392B]/50 text-[#C0392B] bg-[#C0392B]/10",
  DISMISSED: "border-line/60 text-slate",
  NO_MATCH: "border-line/60 text-slate",
  SCREENING_UNAVAILABLE: "border-line/60 text-slate",
};

export interface SanctionsIndicatorProps {
  readonly state: SanctionsIndicatorState;
  /** Opens the canonical vessel/intelligence context. */
  readonly onOpen?: () => void;
  readonly className?: string;
}

export function SanctionsIndicator({ state, onOpen, className }: SanctionsIndicatorProps) {
  const label = SANCTIONS_INDICATOR_LABEL[state];
  const caveat = SANCTIONS_INDICATOR_CAVEAT[state];

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5",
        "text-[10px] font-medium uppercase tracking-[0.06em]",
        STYLE[state],
        className,
      )}
    >
      Sanctions · {label}
    </span>
  );

  if (!onOpen) {
    return (
      <span data-testid="sanctions-indicator" title={caveat} aria-label={`Sanctions: ${caveat}`}>
        {chip}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="sanctions-indicator"
      onClick={onOpen}
      title={caveat}
      aria-label={`Sanctions: ${caveat} Open vessel intelligence.`}
      className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      {chip}
    </button>
  );
}
