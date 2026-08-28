/**
 * The vessel's identity card, and the four numbers an officer checks first.
 *
 * The old header stacked a picture, then a name, then a table — three
 * full-width blocks that pushed everything operational below the fold.
 * Here the image sits beside the metrics, which is the single change
 * that buys back the most vertical space in the drawer.
 *
 * ## Two provenances, never merged
 *
 * The picture and the position are separate claims from separate
 * sources, and the reference design collapsed them: a photograph
 * credited to an imagery provider sat directly above a position labelled
 * simulated, which reads as a photograph of a vessel that does not
 * exist. `VesselImageHeader` states what the picture is entitled to
 * claim; the status strip states what the position is. They are never
 * printed as one line.
 *
 * ## The status strip reports state, not vintage
 *
 * The reference showed a green "POSITION REPORTED" chip beside "LAST AIS
 * 127 DAYS AGO". A chip asserting the present tense over a four-month-old
 * report is the same falsehood as calling an estimate an observation, so
 * freshness colours the chip: a stale position cannot show as current.
 */
import { cn } from "@/lib/utils";
import type { Vessel } from "@/services/geospatial";
import { freshnessBandForTimestamp } from "@/services/geospatial/freshness";
import type { VesselImagerySource } from "@/services/geospatial/vessel-imagery";

import { VesselImageHeader } from "./VesselImageHeader";
import type { Datum } from "./vessel-presentation";
import { positionFreshnessLabel, positionProvenanceLabel } from "./vessel-panel-state";

export interface VesselHeroProps {
  readonly vessel: Vessel;
  readonly snapshot: readonly Datum[];
  readonly imagery?: VesselImagerySource;
  readonly className?: string;
}

export function VesselHero({ vessel, snapshot, imagery, className }: VesselHeroProps) {
  const { identity } = vessel;
  const stale = isStalePosition(vessel);

  return (
    <div className={cn("border-b border-border px-4 pb-3 pt-3", className)}>
      {/*
        Name first and largest. Everything that identifies the hull sits
        on one subordinate line beneath it rather than in a field table,
        because an officer reads a name and scans numbers.
      */}
      <h2 className="truncate text-[19px] font-semibold leading-tight tracking-tight text-foreground">
        {identity.name}
      </h2>
      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
        {[
          identity.type,
          `IMO ${identity.imo}`,
          identity.mmsi ? `MMSI ${identity.mmsi}` : null,
          identity.callSign,
          identity.flag,
        ]
          .filter(Boolean)
          .join("  ·  ")}
      </p>

      {/*
        State chips. Provenance says how the coordinate was arrived at;
        freshness says how much it is still worth. Both, always, because
        either alone can flatter the other.
      */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip
          tone={stale ? "stale" : "current"}
          label={positionProvenanceLabel(vessel)}
          testid="vessel-position-provenance"
        />
        <Chip tone="neutral" label={positionFreshnessLabel(vessel)} testid="vessel-freshness" />
      </div>

      <div className="mt-3 flex gap-3">
        <div className="w-[38%] shrink-0">
          <VesselImageHeader identity={identity} imagery={imagery} />
        </div>

        {/*
          The metrics an officer reads without scrolling. Provenance rides
          under the value it qualifies rather than in a separate section,
          because a coordinate without it is a number nobody can weigh.
        */}
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
          {snapshot.map((datum) => (
            <Metric key={datum.label} datum={datum} />
          ))}
        </dl>
      </div>
    </div>
  );
}

function Metric({ datum }: { datum: Datum }) {
  const has = datum.availability === "AVAILABLE";
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {datum.label}
      </dt>
      <dd
        className={cn(
          "truncate text-[13px] font-medium leading-tight",
          has ? "text-foreground" : "text-muted-foreground",
          datum.mono && has ? "font-mono text-[12px]" : undefined,
        )}
        title={has ? datum.value : datum.reason}
      >
        {has ? datum.value : "Not available"}
      </dd>
      {/*
        The qualifier: where an available value came from, or why an
        unavailable one is missing. Never blank — a field with neither a
        value nor a reason reads as "not loaded".
      */}
      <div className="truncate text-[9.5px] leading-tight text-muted-foreground/80">
        {has ? datum.provenance : datum.reason}
      </div>
    </div>
  );
}

function Chip({
  label,
  tone,
  testid,
}: {
  label: string;
  tone: "current" | "stale" | "neutral";
  testid: string;
}) {
  return (
    <span
      data-testid={testid}
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone === "current" && "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
        tone === "stale" && "border-amber-600/30 bg-amber-600/10 text-amber-700",
        tone === "neutral" && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {tone !== "neutral" ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "current" ? "bg-emerald-600" : "bg-amber-600",
          )}
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}

/**
 * Whether the position is too old to be spoken of in the present tense.
 *
 * Reads the band the map already fades vessels by, rather than defining
 * a second staleness threshold here or — worse — pattern-matching the
 * display label, which would silently start reporting everything as
 * stale the day that wording changed.
 */
function isStalePosition(vessel: Vessel): boolean {
  const band = freshnessBandForTimestamp(vessel.position.timestamp);
  return band !== "fresh" && band !== "recent";
}
