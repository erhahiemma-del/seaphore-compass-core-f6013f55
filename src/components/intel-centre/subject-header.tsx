import type { ReactNode } from "react";
import { X } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import type { ConfidenceTier } from "@/types/confidence.types";
import type { FocusSubjectKind } from "@/stores/focus-subject.store";
import { cn } from "@/lib/utils";

/**
 * Canonical subject title block for every Intelligence Centre.
 *
 * PRESENTATION ONLY. It renders facts the centre has already projected —
 * it never acquires, scores or asserts freshness of its own.
 *
 * Vessel, Port and Cargo centres all use this so the officer reads the
 * same hierarchy everywhere: kind → title → descriptor → evidence chips,
 * with one consistent dismiss affordance.
 */

const KIND_LABEL: Record<FocusSubjectKind, string> = {
  vessel: "Vessel",
  port: "Port",
  cargo: "Cargo",
  company: "Company",
  "risk-event": "Risk Event",
};

export interface EvidenceChip {
  label: string;
  value: string;
  /** Confidence already computed upstream — never invented here. */
  confidence?: ConfidenceTier;
}

export interface SubjectHeaderProps {
  kind: FocusSubjectKind;
  title: string;
  descriptor?: string;
  /** Headline confidence tier for the subject as a whole. */
  confidence?: ConfidenceTier;
  /** Restrained evidence chips: counts, freshness, source coverage. */
  evidence?: EvidenceChip[];
  /** Officer dismiss — clears the focused subject for this centre. */
  onDismiss?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function SubjectHeader({
  kind,
  title,
  descriptor,
  confidence,
  evidence = [],
  onDismiss,
  actions,
  className,
}: SubjectHeaderProps) {
  return (
    <section
      aria-label={`${KIND_LABEL[kind]} in focus`}
      className={cn(
        "is-focused rail-in flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line/60 bg-surface/70 px-4 py-3 elev-2",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
          {KIND_LABEL[kind]} in focus
        </div>
        <h2 className="mt-0.5 truncate text-[16px] font-semibold text-foreground">{title}</h2>
        {descriptor && <div className="truncate text-[11.5px] text-slate">{descriptor}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {confidence && <ConfidenceChip tier={confidence} size={9} />}
        {evidence.map((c) => (
          <EvidenceChipPill key={c.label} chip={c} />
        ))}
        {actions}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss ${title}`}
            title="Dismiss (Esc)"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-slate motion-fast hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

/** Single restrained evidence chip: label · value (+ optional confidence). */
export function EvidenceChipPill({ chip }: { chip: EvidenceChip }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-line/60 bg-surface-2/40 px-2 py-0.5 text-[10.5px] text-slate">
      <span className="uppercase tracking-[0.06em]">{chip.label}</span>
      <span className="font-semibold text-foreground/90">{chip.value}</span>
      {chip.confidence && <ConfidenceChip tier={chip.confidence} size={9} />}
    </span>
  );
}

/** Row of evidence chips reusable inside sections. */
export function EvidenceChipRow({
  chips,
  className,
}: {
  chips: EvidenceChip[];
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((c) => (
        <EvidenceChipPill key={c.label} chip={c} />
      ))}
    </div>
  );
}
