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
import {
  ArrowRight,
  ClipboardCheck,
  Clock,
  Database,
  FileText,
  GitCompareArrows,
  ShieldAlert,
  UserRound,
} from "lucide-react";
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
  Record<
    ActionUrgency,
    {
      badge: string | null;
      badgeTone: string;
      badgeColor: string;
      status: string;
      consequence: string;
    }
  >
> = {
  blocked: {
    badge: "High priority",
    // Oxblood, from the reference — a deeper red than the critical
    // figure it sits beside, so the badge reads as a label and the
    // number reads as the alarm.
    badgeTone: "text-white",
    badgeColor: "#992D2D",
    status: "Verification Required",
    consequence:
      "Intelligence in this domain is incomplete while the dependency is unresolved, so any figure derived from it understates the real position.",
  },
  routine: {
    badge: "Recommended",
    badgeTone: "text-white",
    badgeColor: "rgba(255,255,255,0.15)",
    status: "Ready to action",
    consequence:
      "Standing work for this lens. Nothing is blocked; this is the next thing to pick up.",
  },
  none: {
    badge: null,
    badgeTone: "",
    badgeColor: "transparent",
    status: "Nothing outstanding",
    consequence: "No dependency is blocked and no queue is waiting on this officer.",
  },
};

/** What an officer sees where the application holds no fact. */
const UNAVAILABLE = "—";

/**
 * The banner's palette, from the approved reference.
 *
 *   red    critical risk, loss, failure
 *   amber  verification or attention required
 *   blue   information, evidence, assignment
 *
 * Literal values rather than tokens: these are the reference's exact
 * colours for this one surface, and routing them through the theme would
 * let a palette change silently redefine what "critical" looks like on
 * the page an officer reads first.
 */
const BANNER = {
  oxblood: "#992D2D",
  critical: "#DC3545",
  attention: "#F59E0B",
  information: "#2563EB",
  track: "#425269",
} as const;

/**
 * Evidence behind the recommendation.
 *
 * Always three counts, a verification state and a bar — even at zero,
 * and especially at zero.
 *
 * The counts render `0` rather than an em dash because they are counts:
 * no evidence package is linked to a coverage-derived recommendation, so
 * the true number of records, sources and conflicts is none. The bar
 * stays at 0% rather than collapsing, because an officer scanning for
 * verification progress must find the bar in the same place whether it
 * is empty or full. A bar that disappears when empty cannot be
 * distinguished from one that failed to render.
 *
 * `deriveRecommendedAction` reads coverage state and links no evidence,
 * so every value here is currently zero. They are wired as values rather
 * than hard-coded text so the day a recommendation carries an evidence
 * package, the region fills without a redesign.
 */
function EvidenceSummary({
  records,
  sources,
  conflicts,
  verifiedPct,
}: {
  readonly records: number;
  readonly sources: number;
  readonly conflicts: number;
  readonly verifiedPct: number;
}) {
  const counts = [
    { label: "Records", value: records, Icon: FileText },
    { label: "Sources", value: sources, Icon: Database },
    { label: "Conflicts", value: conflicts, Icon: GitCompareArrows },
  ];

  return (
    <div data-testid="action-evidence">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {counts.map(({ label, value, Icon }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11.5px] text-white/80">
            <Icon
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: BANNER.information }}
              aria-hidden
            />
            <span
              data-testid={`evidence-${label.toLowerCase()}`}
              className="font-semibold tabular-nums text-white"
            >
              {value}
            </span>
            {label}
          </span>
        ))}
      </div>

      <p
        data-testid="evidence-verification"
        className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold"
        style={{ color: BANNER.attention }}
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Verification Required
      </p>

      {/*
        Linear, horizontal, and always the same height. The track is
        drawn even at 0% so the row never changes shape.
      */}
      <div className="mt-1.5 flex items-center gap-2">
        <div
          data-testid="evidence-progress"
          role="progressbar"
          aria-valuenow={verifiedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Verification progress"
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: BANNER.track }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${verifiedPct}%`, backgroundColor: BANNER.attention }}
          />
        </div>
        <span
          data-testid="evidence-percent"
          className="shrink-0 text-[11px] font-semibold tabular-nums"
          style={{ color: BANNER.attention }}
        >
          {verifiedPct}%
        </span>
      </div>
    </div>
  );
}

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
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(245,158,11,0.15)" }}
        >
          <ClipboardCheck className="h-4 w-4" style={{ color: BANNER.attention }} />
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
                style={{ backgroundColor: tone.badgeColor }}
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
        {/*
          The consequence, not the reason again.
          
          This column repeated `action.reason` word for word, so the
          banner said the same sentence twice side by side and the second
          column earned none of its width. The reason explains what is
          wrong; this explains what it costs if nobody acts.
        */}
        <p data-testid="action-impact" className="text-[11.5px] leading-relaxed text-white/80">
          {tone.consequence}
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
        {/*
          Zero, not absent. `deriveRecommendedAction` reads coverage
          state and links no evidence package, so the true count of
          records, sources and conflicts is none — and none is a number.
        */}
        <EvidenceSummary records={0} sources={0} conflicts={0} verifiedPct={0} />
      </BannerField>

      {/* ── Status ── */}
      <BannerField label="Status">
        <p
          data-testid="action-status"
          className="flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: BANNER.attention }}
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {tone.status}
        </p>
      </BannerField>

      {/* ── Assigned to ── */}
      <BannerField label="Assigned to" className="lg:whitespace-nowrap">
        <p
          data-testid="action-owner"
          className="flex items-center gap-1.5 text-[12px] text-white/80"
        >
          <UserRound
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: BANNER.information }}
            aria-hidden
          />
          <span className="text-white/45">Unassigned</span>
        </p>
      </BannerField>

      {/* ── Due in ── */}
      <BannerField label="Due in" className="lg:whitespace-nowrap">
        <p data-testid="action-due" className="flex items-center gap-1.5 text-[12px] text-white/80">
          <Clock
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: BANNER.information }}
            aria-hidden
          />
          <span className="text-white/45">{UNAVAILABLE}</span>
        </p>
      </BannerField>
    </section>
  );
}
