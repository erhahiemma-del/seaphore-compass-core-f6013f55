/**
 * Operational orientation — where the officer is, in one quiet band.
 *
 * Answers "where am I" before the page answers anything else: the
 * active lens, what it is for, the subject in hand if there is one, and
 * how complete the intelligence behind it is.
 *
 * Deliberately restrained. The specification calls for a compact
 * context layer and explicitly not a hero section, so this is a single
 * row of small type on the page background rather than a card — the
 * emphasis budget belongs to Priority Intelligence below it.
 *
 * Every value is read from existing state: `useMissionMode`,
 * `focus-subject.store`, and the coverage readiness the KPI system
 * already computes. Nothing is derived here.
 */
import { cn } from "@/lib/utils";
import type { IntelligenceReadiness } from "@/lib/intelligence/coverage-model";
import { useFocusSubjectStore } from "@/stores/focus-subject.store";

import { MissionModeSelector } from "./MissionModeSelector";
import { useMissionMode } from "./useMissionMode";

/**
 * One line describing how much of the picture is actually reporting.
 *
 * Uses the readiness figure the coverage model already produces rather
 * than counting anything itself. Absent readiness renders as unknown,
 * not as zero — "we have not measured" and "nothing is available" are
 * different claims.
 */
function coverageLabel(readiness: IntelligenceReadiness | undefined): {
  label: string;
  tone: string;
} {
  if (!readiness) return { label: "Coverage unknown", tone: "var(--state-neutral)" };
  const { overallPct } = readiness;
  if (overallPct >= 80) return { label: "Full coverage", tone: "var(--state-verified)" };
  if (overallPct > 0) return { label: "Partial coverage", tone: "var(--state-attention)" };
  return { label: "No provider reporting", tone: "var(--state-unavailable)" };
}

export function OperationalOrientation({
  readiness,
  className,
}: {
  readonly readiness: IntelligenceReadiness | undefined;
  readonly className?: string;
}) {
  const { modeId, setModeId, mode } = useMissionMode();
  const subject = useFocusSubjectStore((s) => s.subject);
  const coverage = coverageLabel(readiness);

  return (
    <div data-testid="operational-orientation" className={cn("flex flex-col gap-2", className)}>
      <MissionModeSelector value={modeId} onChange={setModeId} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px]">
        <span data-testid="orientation-purpose" className="text-slate">
          {mode.purpose}
        </span>

        <span className="flex items-center gap-1.5">
          <span className="text-slate">Focus</span>
          {/*
            "None" stated rather than the row disappearing. An officer
            scanning for their subject should find the answer in the
            same place whether or not one is set.
          */}
          <span data-testid="orientation-focus" className="font-medium text-foreground">
            {subject ? subject.title : "None"}
          </span>
          {subject?.descriptor ? <span className="text-slate">· {subject.descriptor}</span> : null}
        </span>

        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: coverage.tone }}
          />
          {/*
            Colour carries the tone, the word carries the meaning.
            A dot alone would make the state unreadable in greyscale or
            to a colour-blind officer.
          */}
          <span data-testid="orientation-coverage" className="text-foreground">
            {coverage.label}
          </span>
        </span>
      </div>
    </div>
  );
}
