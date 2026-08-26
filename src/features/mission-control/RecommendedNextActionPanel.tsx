/**
 * The single next action.
 *
 * One place on the page that answers "what should happen next", derived
 * by `deriveRecommendedAction` from state the system can observe. This
 * component renders that decision and makes none of its own.
 *
 * Emphasis follows urgency and is carried by more than colour: the
 * priority badge, the icon and the Status column all say the same thing
 * in words, so the distinction survives greyscale and colour-blindness.
 * When there is nothing to do, the banner says so and offers no button —
 * a disabled call to action would imply work exists that does not.
 *
 * ## Four regions the data cannot yet fill
 *
 * The approved composition asks for impact, evidence counts, an owner
 * and a deadline. `deriveRecommendedAction` reads coverage state, which
 * quantifies none of them, and this application has no assignment model
 * and no SLA clock. Each of those regions is therefore rendered with an
 * em dash and a short line saying what is missing.
 *
 * They are rendered rather than dropped on purpose: the composition is
 * then already correct for the day the data exists, and the gap is
 * visible in the product instead of only in a backlog. A naira figure or
 * a countdown invented to fill the space is the kind of number an
 * officer would plan a shift around.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";

import { deriveRecommendedAction, type ActionUrgency } from "./recommended-action";
import type { MissionMode } from "./modes";

/**
 * How the action presents itself.
 *
 * `badge` is the word beside the title; `status` is what the Status
 * column reports. They differ on purpose — one is urgency, the other is
 * the state of the work — and both are derived, never chosen for effect.
 */
const URGENCY_TONE: Readonly<
  Record<ActionUrgency, { badge: string | null; badgeTone: string; status: string }>
> = {
  blocked: {
    badge: "High priority",
    badgeTone: "bg-[color:var(--status-critical)] text-white",
    status: "Dependency blocked",
  },
  routine: {
    badge: "Recommended",
    badgeTone: "bg-white/15 text-white",
    status: "Ready to action",
  },
  none: { badge: null, badgeTone: "", status: "Nothing outstanding" },
};

/** What an officer sees where the application holds no fact. */
const UNAVAILABLE = "—";

function BannerField({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-5 py-4", className)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/55">{label}</p>
      <div className="mt-1.5 min-w-0">{children}</div>
    </div>
  );
}

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
      aria-label="Next best action"
      className={cn(
        "grid overflow-hidden rounded-lg bg-[color:var(--color-navy)] text-white elev-2",
        "grid-cols-1 divide-y divide-white/10",
        "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_auto_auto]",
        "lg:divide-x lg:divide-y-0",
        className,
      )}
    >
      {/* ── The action itself ── */}
      <div className="flex min-w-0 items-start gap-3 px-5 py-4">
        <div
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10"
        >
          <ClipboardCheck className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/55">
              Next best action
            </p>
            {tone.badge && (
              <span
                data-testid="action-priority-badge"
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]",
                  tone.badgeTone,
                )}
              >
                {tone.badge}
              </span>
            )}
          </div>
          <h2 data-testid="action-headline" className="mt-1 text-[15px] font-semibold text-white">
            {action.headline}
          </h2>
          <p
            data-testid="action-reason"
            className="mt-1 text-[11.5px] leading-relaxed text-white/70"
          >
            {action.reason}
          </p>
          {action.href && action.actionLabel ? (
            <Link
              to={action.href}
              data-testid="action-cta"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-blue)] px-3 py-1.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {action.actionLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── Why this matters ── */}
      <BannerField label="Why this matters">
        <p data-testid="action-impact" className="text-[11.5px] leading-relaxed text-white/80">
          {action.reason}
        </p>
        <p
          data-testid="action-impact-value"
          className="mt-1.5 text-[13px] font-semibold text-white/45"
        >
          {UNAVAILABLE}
          <span className="ml-1.5 text-[10.5px] font-normal">impact not quantified</span>
        </p>
      </BannerField>

      {/* ── Evidence summary ── */}
      <BannerField label="Evidence summary">
        <div data-testid="action-evidence" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {["Records", "Sources", "Conflicts"].map((field) => (
            <span key={field} className="text-[11.5px] text-white/80">
              <span className="font-semibold text-white/45">{UNAVAILABLE}</span> {field}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] text-white/45">
          No evidence package linked to this recommendation
        </p>
      </BannerField>

      {/* ── Status ── */}
      <BannerField label="Status">
        <p
          data-testid="action-status"
          className="flex items-center gap-1.5 text-[12px] font-semibold text-white"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
          {tone.status}
        </p>
      </BannerField>

      {/* ── Assigned to ── */}
      <BannerField label="Assigned to" className="lg:whitespace-nowrap">
        <p
          data-testid="action-owner"
          className="flex items-center gap-1.5 text-[12px] text-white/80"
        >
          <UserRound className="h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden />
          <span className="text-white/45">Unassigned</span>
        </p>
      </BannerField>

      {/* ── Due in ── */}
      <BannerField label="Due in" className="lg:whitespace-nowrap">
        <p data-testid="action-due" className="flex items-center gap-1.5 text-[12px] text-white/80">
          <Clock className="h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden />
          <span className="text-white/45">{UNAVAILABLE}</span>
        </p>
      </BannerField>
    </section>
  );
}
