/**
 * The single next action.
 *
 * One place on the page that answers "what should happen next", derived
 * by `deriveRecommendedAction` from state the system can observe. This
 * component renders that decision and makes none of its own.
 *
 * Emphasis follows urgency and is carried by more than colour: a
 * blocked dependency gets a left rule and a state word, so the
 * distinction survives greyscale and colour-blindness. When there is
 * nothing to do, the panel says so plainly and offers no button —
 * a disabled call to action would imply work exists that does not.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";

import { deriveRecommendedAction, type ActionUrgency } from "./recommended-action";
import type { MissionMode } from "./modes";

const URGENCY_TONE: Readonly<Record<ActionUrgency, { rule: string; word: string | null }>> = {
  blocked: { rule: "var(--state-attention)", word: "Dependency blocked" },
  routine: { rule: "var(--state-active)", word: "Recommended" },
  none: { rule: "var(--state-neutral)", word: null },
};

export function RecommendedNextActionPanel({
  mode,
  kpis,
  className,
}: {
  readonly mode: MissionMode;
  readonly kpis: readonly KpiCoverage[] | undefined;
  readonly className?: string;
}) {
  const action = deriveRecommendedAction(mode, kpis);
  const tone = URGENCY_TONE[action.urgency];

  return (
    <section
      data-testid="recommended-next-action"
      data-urgency={action.urgency}
      aria-label="Recommended next action"
      className={cn(
        "flex items-start gap-3 rounded-md border border-line bg-surface py-3 pl-3 pr-4",
        className,
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: tone.rule }}
    >
      <div className="min-w-0 flex-1">
        {tone.word ? <p className="type-label mb-0.5 text-slate">{tone.word}</p> : null}
        <h2 data-testid="action-headline" className="text-[13.5px] font-semibold text-foreground">
          {action.headline}
        </h2>
        <p data-testid="action-reason" className="mt-0.5 text-[11.5px] leading-relaxed text-slate">
          {action.reason}
        </p>
      </div>

      {/*
        No button when there is nothing to do. A greyed-out control would
        suggest an action exists and is merely unavailable, which is a
        different and untrue claim.
      */}
      {action.href && action.actionLabel ? (
        <Link
          to={action.href}
          data-testid="action-cta"
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition-colors hover:border-slate/40"
        >
          {action.actionLabel}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
