/**
 * National operating picture.
 *
 * Renders `buildNationalPicture()`. Its one job in the UI is to keep the
 * distinction the service draws:
 *
 *   "12"                    a count that was computed
 *   "Data source pending"   a question that could not be asked
 *
 * A pending metric is never styled like a zero, is never a large number,
 * and always carries its reason on hover. An officer who reads "0" where
 * the truth is "unknown" concludes the water is clear when nothing was
 * examined.
 */
import { cn } from "@/lib/utils";
import {
  describeMetric,
  metricFreshness,
  pictureCoverage,
  type Metric,
  type NationalPicture,
} from "@/services/geospatial";

export interface NationalPicturePanelProps {
  readonly picture: NationalPicture;
  /** Clicking a metric asks the map to show it. */
  readonly onSelectMetric?: (key: MetricKey) => void;
  readonly className?: string;
}

export type MetricKey =
  | "vessels"
  | "arrivals"
  | "departures"
  | "anchored"
  | "highRisk"
  | "aisGaps"
  | "sarObservations"
  | "environmentalEvents"
  | "activeInvestigations";

const LABELS: Readonly<Record<MetricKey, string>> = {
  vessels: "Vessels",
  arrivals: "Arrivals",
  departures: "Departures",
  anchored: "Anchored",
  highRisk: "High risk",
  aisGaps: "AIS gaps",
  sarObservations: "SAR",
  environmentalEvents: "Environment",
  activeInvestigations: "Investigations",
};

const ORDER: readonly MetricKey[] = [
  "vessels",
  "anchored",
  "arrivals",
  "departures",
  "highRisk",
  "aisGaps",
  "sarObservations",
  "environmentalEvents",
  "activeInvestigations",
];

export function NationalPicturePanel({
  picture,
  onSelectMetric,
  className,
}: NationalPicturePanelProps) {
  const coverage = pictureCoverage(picture);

  return (
    <section
      aria-label="National operating picture"
      data-testid="national-picture"
      className={cn("flex flex-col gap-2 p-3", className)}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nigerian waters
        </h2>
        {/* Coverage is stated up front: an officer should know how much of
            this picture Seaphore can actually answer before reading it. */}
        <span
          className="text-[10px] text-muted-foreground"
          title={`${coverage.pending} of ${coverage.total} metrics have no connected source.`}
        >
          {coverage.available}/{coverage.total} answerable
        </span>
      </header>

      <ul className="grid grid-cols-3 gap-1.5">
        {ORDER.map((key) => (
          <MetricTile key={key} metricKey={key} metric={picture[key]} onSelect={onSelectMetric} />
        ))}
      </ul>

      {picture.contributingSources.length > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          Sources: {picture.contributingSources.join(", ")}
        </p>
      ) : (
        <p className="text-[10px] text-amber-700">
          No source is contributing to this picture. Every metric below reflects Seaphore&apos;s
          collection, not the state of Nigerian waters.
        </p>
      )}
    </section>
  );
}

function MetricTile({
  metricKey,
  metric,
  onSelect,
}: {
  metricKey: MetricKey;
  metric: Metric;
  onSelect?: (key: MetricKey) => void;
}) {
  const pending = metric.kind === "pending";
  const freshness = metricFreshness(metric);

  return (
    <li>
      <button
        type="button"
        // A pending metric answers nothing, so there is nothing to show on
        // the map and the tile is not actionable.
        disabled={pending || !onSelect}
        onClick={() => onSelect?.(metricKey)}
        data-testid={`metric-${metricKey}`}
        data-pending={pending ? "true" : "false"}
        title={
          metric.kind === "pending"
            ? `${metric.reason} Requires: ${metric.requires}`
            : `From ${metric.sources.join(", ") || "unattributed"}`
        }
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-md border p-2 text-left transition-colors",
          pending
            ? "cursor-default border-dashed border-border/60 bg-muted/20"
            : "border-border/60 bg-background hover:bg-accent",
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {LABELS[metricKey]}
        </span>

        {pending ? (
          // Deliberately small and muted. Never the large numeral a real
          // count gets — the visual weight itself must not imply a value.
          <span className="text-[10.5px] leading-tight text-amber-700">Source pending</span>
        ) : (
          <span className="text-[18px] font-semibold leading-none text-foreground">
            {describeMetric(metric)}
          </span>
        )}

        {freshness ? (
          <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
            {freshness}
          </span>
        ) : null}
      </button>
    </li>
  );
}
