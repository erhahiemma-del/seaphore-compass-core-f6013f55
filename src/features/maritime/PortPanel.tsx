/**
 * Port intelligence panel.
 *
 * What is known about one port: who it is, where it is if anyone
 * published that, and which voyages in the loaded register name it.
 *
 * ## What is deliberately absent
 *
 * No congestion index. No arrivals or departures. No berth occupancy or
 * availability. No throughput, capacity, waiting time or dwell time. No
 * schedule and no live status.
 *
 * None of that is coyness — Seaphore holds no source for any of it, and
 * a panel is the easiest place in the system for an invented number to
 * look authoritative. The empty space is stated once, in words, rather
 * than filled with tiles that would each need their own disclaimer.
 *
 * ## Relationships are named for the columns, not for events
 *
 * `origin_port_id` and `destination_port_id` record what a voyage
 * *names*. They do not record that a vessel arrived, departed, berthed
 * or called. So the section says "voyages recording this port as
 * origin" and never "arrivals" — the shorter word would be a claim the
 * data cannot support.
 */
import { Anchor, MapPin, Ship } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Port, PortVoyageRelationships, Voyage } from "@/services/geospatial";

const IDENTITY_SOURCE_LABELS: Readonly<Record<Port["identitySource"], string>> = {
  nimasa: "NIMASA reference",
  "un-locode": "UN/LOCODE gazetteer",
  database: "Port record",
  unresolved: "Unresolved",
};

export interface PortPanelProps {
  readonly port: Port | null;
  readonly relationships: PortVoyageRelationships | null;
  /** Called when the officer opens one of the related voyages. */
  readonly onSelectVoyage?: (voyage: Voyage) => void;
  readonly loading?: boolean;
  readonly className?: string;
}

export function PortPanel({
  port,
  relationships,
  onSelectVoyage,
  loading = false,
  className,
}: PortPanelProps) {
  if (loading) return <Placeholder>Loading port…</Placeholder>;
  if (!port) {
    return (
      <Placeholder>
        This port is not held by any connected source. That reflects Seaphore&rsquo;s collection,
        not the absence of a port.
      </Placeholder>
    );
  }

  return (
    <div
      data-testid="port-panel"
      data-identity-source={port.identitySource}
      className={cn("space-y-3 p-3", className)}
    >
      {/* ── Identity ── */}
      <header>
        <div className="text-[15px] font-semibold text-foreground">
          {port.identity.name ?? port.identity.id}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          {port.identity.country ? <span>{port.identity.country}</span> : null}
          {port.identity.unlocode ? (
            <span className="font-mono">{port.identity.unlocode}</span>
          ) : (
            <span data-testid="port-no-unlocode">No UN/LOCODE recorded</span>
          )}
          <span>· {IDENTITY_SOURCE_LABELS[port.identitySource]}</span>
        </div>
      </header>

      {/*
        Conflicting identifiers. Shown before the location, because it
        is the reason the location is missing.
      */}
      {port.ambiguity ? (
        <p
          data-testid="port-ambiguity"
          className="rounded-md border border-[color:var(--color-amber,#D4890A)]/40 bg-[#D4890A]/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground"
        >
          {port.ambiguity.reason} Record says {port.ambiguity.declaredCountry}; gazetteer says{" "}
          {port.ambiguity.resolvedCountry}.
        </p>
      ) : null}

      {/* ── Location ── */}
      <section data-testid="port-location">
        <SectionTitle>Location</SectionTitle>
        <PortLocation port={port} />
      </section>

      {/* ── Related voyages ── */}
      <section data-testid="port-voyages">
        <SectionTitle>Related voyages</SectionTitle>
        <PortRelationships relationships={relationships} onSelectVoyage={onSelectVoyage} />
      </section>

      {/* ── Reference figures, NIMASA only ── */}
      {port.reference ? (
        <section data-testid="port-reference">
          <SectionTitle>Port reference</SectionTitle>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Row label="Berths" value={String(port.reference.berths)} />
            <Row label="Anchorage radius" value={`${port.reference.anchorageRadiusKm} km`} />
          </dl>
          <p
            data-testid="port-reference-caveat"
            className="mt-1 text-[10px] leading-relaxed text-muted-foreground"
          >
            Reference figures describing the estate. Berth count is not capacity, occupancy or
            throughput; anchorage radius is an indicative display reference, not a surveyed limit.
          </p>
        </section>
      ) : null}

      {/* ── The honest empty space ── */}
      <p
        data-testid="port-operations-unavailable"
        className="border-t border-border/60 pt-2 text-[10.5px] leading-relaxed text-muted-foreground"
      >
        Live port operations unavailable. No connected source publishes berth state, congestion,
        arrivals, departures or throughput for this port.
      </p>
    </div>
  );
}

/**
 * Where the port is, or why that is not known.
 *
 * Three outcomes, reusing the gazetteer's own vocabulary and its own
 * sentences rather than paraphrasing them into something softer.
 */
function PortLocation({ port }: { port: Port }) {
  const resolution = port.resolution;

  if (port.position && resolution?.status === "resolved") {
    const [lon, lat] = port.position;
    return (
      <div className="text-[11.5px]">
        <div className="font-mono text-foreground">
          {lat.toFixed(3)}, {lon.toFixed(3)}
        </div>
        <div data-testid="port-precision" className="text-[10px] text-muted-foreground">
          {resolution.precision === "surveyed"
            ? `Operator reference position · ${resolution.source}`
            : `Degree-and-minute centroid, about ±1 km · ${resolution.source}`}
        </div>
      </div>
    );
  }

  if (resolution?.status === "position-unavailable") {
    return (
      <div
        data-testid="port-position-unavailable"
        className="flex items-start gap-1 text-[11px] text-muted-foreground"
      >
        <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden />
        <span>{resolution.reason} This port is not drawn on the map.</span>
      </div>
    );
  }

  return (
    <div data-testid="port-position-unknown" className="text-[11px] text-muted-foreground">
      {/*
        Reached either because the identifiers conflict — in which case
        the gazetteer did resolve, and we are withholding — or because
        nothing recognised the port. `ResolvedPort` carries no `reason`,
        which is why the ambiguity case is handled first.
      */}
      {port.ambiguity
        ? "Position withheld because the identifiers disagree."
        : resolution?.status === "unknown"
          ? resolution.reason
          : "Not resolved."}{" "}
      No coordinates are shown, and none have been inferred.
    </div>
  );
}

function PortRelationships({
  relationships,
  onSelectVoyage,
}: {
  relationships: PortVoyageRelationships | null;
  onSelectVoyage?: (voyage: Voyage) => void;
}) {
  if (!relationships || relationships.state === "unavailable") {
    return (
      <p
        data-testid="port-voyages-unavailable"
        className="text-[11px] leading-relaxed text-muted-foreground"
      >
        {relationships?.reason ?? "Voyage relationships cannot be determined."}
      </p>
    );
  }

  if (relationships.state === "none") {
    return (
      <p
        data-testid="port-voyages-none"
        className="text-[11px] leading-relaxed text-muted-foreground"
      >
        {relationships.reason}
      </p>
    );
  }

  return (
    <div data-testid="port-voyages-known" className="space-y-1.5">
      <VoyageGroup
        label="Recorded as origin"
        voyages={relationships.asOrigin}
        onSelectVoyage={onSelectVoyage}
      />
      <VoyageGroup
        label="Recorded as destination"
        voyages={relationships.asDestination}
        onSelectVoyage={onSelectVoyage}
      />
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        A voyage naming this port is a record, not an observation. It does not establish that a
        vessel arrived, departed or berthed here.
      </p>
    </div>
  );
}

function VoyageGroup({
  label,
  voyages,
  onSelectVoyage,
}: {
  label: string;
  voyages: readonly Voyage[];
  onSelectVoyage?: (voyage: Voyage) => void;
}) {
  if (voyages.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Ship className="h-3 w-3" aria-hidden />
        {label} ({voyages.length})
      </div>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {voyages.map((voyage) => (
          <li key={voyage.id}>
            <button
              type="button"
              onClick={() => onSelectVoyage?.(voyage)}
              className="w-full truncate rounded px-1 py-0.5 text-left text-[11.5px] text-foreground hover:bg-surface-2/50"
            >
              {voyage.voyageNumber ?? voyage.id}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Anchor className="h-3 w-3" aria-hidden />
        {label}
      </dt>
      <dd className="text-[11.5px] text-foreground">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
      {children}
    </p>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="port-panel"
      className="p-3 text-[11.5px] leading-relaxed text-muted-foreground"
    >
      {children}
    </div>
  );
}
