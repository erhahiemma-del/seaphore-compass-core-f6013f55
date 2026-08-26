/**
 * A Mission Control KPI card.
 *
 * Six of these, equal, above the officer's own work. Each answers one
 * standing question — how much revenue is exposed, how many vessels are
 * at sea — and answers it in the same shape every time.
 *
 * ## Why this is not `KpiCoverageCard`
 *
 * `KpiCoverageCard` is a *provider-readiness* card, and a good one: it
 * names the coverage state, the root cause, the percentage and a
 * "Coverage details" disclosure. That belongs on Data Sources and
 * Provider Health, where an officer is asking why a feed is quiet.
 *
 * On Mission Control it answered a question nobody asked. The six cards
 * read "Awaiting credentials for Nigeria Customs Service — Declarations,
 * Goods", "PROVIDER OFFLINE", "Coverage 33%" — provider diagnostics
 * where the national picture should be. An officer opening this page
 * wants the number; if there is no number they want to see that plainly
 * and move on, not read a credentials backlog six times over.
 *
 * That card is untouched and still used where it belongs. This one
 * renders the same `KpiCoverage` object — same source, same binding, no
 * second data path — and shows only what the ribbon is for.
 *
 * ## Geometry is constant
 *
 * Icon, title, metric, delta and sparkline always render. Missing data
 * changes what a slot *says*, never whether it exists: an officer
 * scanning the ribbon finds the same six shapes in the same six places
 * whether or not a provider is connected. A card that collapses when its
 * feed is quiet teaches officers the ribbon is decorative.
 *
 * Unavailable renders as `0` for the metric and `—` for the delta, which
 * are different claims on purpose: zero is a count, an em dash is the
 * absence of a comparison. The sparkline draws a flat baseline rather
 * than disappearing — the chart's presence is part of the card's shape,
 * and an empty chart is honest about having nothing to plot.
 */
import type { LucideIcon } from "lucide-react";

import type { KpiCoverage } from "@/lib/intelligence/coverage-model";
import { cn } from "@/lib/utils";

/**
 * The semantic palette, stated once.
 *
 *   red    critical risk, loss, failure
 *   amber  verification or attention required
 *   blue   information, evidence, assignment
 *   green  healthy, active, verified
 *
 * A KPI's colour comes from what it measures, not from its position in
 * the row, so the same domain reads the same way wherever it appears.
 */
export const KPI_TONE = {
  critical: { fg: "#DC3545", bg: "rgba(220,53,69,0.10)" },
  attention: { fg: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  information: { fg: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  healthy: { fg: "#0E7C7B", bg: "rgba(14,124,123,0.10)" },
} as const;

export type KpiToneKey = keyof typeof KPI_TONE;

/**
 * A flat baseline, drawn when there is no series to plot.
 *
 * Present rather than absent: the chart is part of the card's geometry,
 * and a straight line at rest says "nothing measured" more clearly than
 * a gap where a chart should be.
 */
function Sparkline({
  points,
  tone,
}: {
  readonly points: readonly number[];
  readonly tone: string;
}) {
  const width = 120;
  const height = 26;

  const path = (() => {
    if (points.length < 2) return `M 0 ${height / 2} L ${width} ${height / 2}`;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    return points
      .map((value, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - ((value - min) / span) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="mt-2 h-[26px] w-full"
      role="presentation"
      aria-hidden
      data-testid="kpi-sparkline"
      data-empty={points.length < 2}
    >
      <path
        d={path}
        fill="none"
        stroke={tone}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={points.length < 2 ? 0.35 : 1}
      />
    </svg>
  );
}

export interface MissionKpiCardProps {
  /** The approved ribbon title — not the coverage model's domain name. */
  readonly title: string;
  readonly icon: LucideIcon;
  readonly tone: KpiToneKey;
  /** The measure, when a provider reported one. */
  readonly coverage: KpiCoverage | undefined;
  readonly onOpen?: () => void;
}

export function MissionKpiCard({ title, icon, tone, coverage, onOpen }: MissionKpiCardProps) {
  const Icon = icon;
  const palette = KPI_TONE[tone];

  // A measured value, or zero. `null` means no provider reported, which
  // is a count of nothing rather than an unknown quantity.
  const hasValue = coverage?.value !== null && coverage?.value !== undefined;
  const metric = hasValue ? coverage.display : "0";

  /*
   * There is no trend model. `KpiCoverage` carries a value, a state and
   * a root cause — nothing historical — so no card can honestly show
   * "18% vs yesterday", and none does.
   *
   * The delta reads "—" and the sparkline draws a flat baseline. Both
   * slots exist so the composition is already correct when a series
   * arrives; neither is filled with a plausible curve in the meantime.
   * A trend line an officer reads as measured is worse than a straight
   * one they read as empty.
   */
  const series: readonly number[] = [];
  const delta = "—";

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`mission-kpi-${tone}`}
      className={cn(
        "flex w-full flex-col rounded-lg border border-line bg-surface p-3 text-left",
        "elev-1 motion-fast hover:border-[color:var(--color-blue)]/50 hover:shadow-pop",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: palette.bg, color: palette.fg }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="type-label truncate text-slate">{title}</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          data-testid="kpi-metric"
          className="type-mono text-[22px] font-bold tabular-nums"
          style={{ color: hasValue ? palette.fg : "var(--foreground)" }}
        >
          {metric}
        </span>
        {/*
          The delta is a separate claim from the metric. "0" is a count;
          "—" is the absence of a comparison, and conflating them would
          report a flat trend nobody measured.
        */}
        <span
          data-testid="kpi-delta"
          className="text-[11.5px] font-semibold tabular-nums text-slate"
        >
          {delta}
        </span>
      </div>

      <Sparkline points={series} tone={palette.fg} />
    </button>
  );
}
