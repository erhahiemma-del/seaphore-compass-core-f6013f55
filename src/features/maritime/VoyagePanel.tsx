/**
 * Voyage intelligence panel.
 *
 * What is recorded about one voyage: the vessel, the two ports, the four
 * timestamps, the linked manifests and documents — and, given at least
 * as much prominence as any of those, what is *not* recorded.
 *
 * ## The banner is the point of this component
 *
 * A voyage row says a vessel went from A to B. It says nothing about the
 * route. An officer reading a panel full of confident schedule data will
 * reasonably assume the map beside it shows where the vessel went, so
 * the journey-intelligence state is stated first, in full, before any of
 * the detail — not tucked into a footnote after the reader has already
 * formed that impression.
 *
 * The two states use deliberately non-interchangeable wording:
 *
 *   VOYAGE RELATIONSHIP  origin and destination only
 *   OBSERVED TRACK       real positions from AIS history
 *
 * Nothing in this repository can currently produce the second. It is
 * rendered here anyway so the vocabulary exists before the capability
 * does, and so the difference is visible rather than theoretical.
 */
import { AlertTriangle, MapPin, Route, Ship } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  JOURNEY_INTELLIGENCE_LABELS,
  JOURNEY_INTELLIGENCE_NOTES,
  arrivalState,
  departureState,
  journeyIntelligence,
  PORT_LINK_NOTES,
  type MilestoneState,
  type PortResolution,
  type Voyage,
  type VoyageEndpoint,
} from "@/services/geospatial";

const STATUS_LABELS: Readonly<Record<string, string>> = {
  planned: "Planned",
  in_transit: "In transit",
  arrived: "Arrived",
  cancelled: "Cancelled",
  unknown: "Status not recorded",
};

export interface VoyagePanelProps {
  readonly voyage: Voyage | null;
  /** True while the voyage is being resolved. */
  readonly loading?: boolean;
  readonly className?: string;
}

export function VoyagePanel({ voyage, loading = false, className }: VoyagePanelProps) {
  if (loading) {
    return <Placeholder>Loading voyage…</Placeholder>;
  }
  if (!voyage) {
    return (
      <Placeholder>
        This voyage is not held by any connected source. That reflects Seaphore&rsquo;s collection,
        not the absence of a voyage.
      </Placeholder>
    );
  }

  const intelligence = journeyIntelligence(voyage);
  const isObserved = intelligence === "OBSERVED_TRACK";

  return (
    <div
      data-testid="voyage-panel"
      data-journey-intelligence={intelligence}
      className={cn("space-y-3 p-3", className)}
    >
      {/* ── Journey intelligence state, stated before any detail ── */}
      <section
        data-testid="journey-intelligence-banner"
        className={cn(
          "rounded-md border px-2.5 py-2",
          isObserved
            ? "border-[color:var(--color-teal)]/40 bg-[color:var(--color-teal)]/10"
            : "border-[#8B6FC7]/40 bg-[#8B6FC7]/10",
        )}
      >
        <div className="flex items-center gap-1.5">
          {isObserved ? (
            <Route className="h-3.5 w-3.5 text-[color:var(--color-teal)]" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-[#8B6FC7]" aria-hidden />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground">
            {JOURNEY_INTELLIGENCE_LABELS[intelligence]}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {JOURNEY_INTELLIGENCE_NOTES[intelligence]}
        </p>
        {!isObserved ? (
          <p
            data-testid="no-observed-track-note"
            className="mt-1.5 border-t border-border/50 pt-1.5 text-[10.5px] leading-relaxed text-muted-foreground"
          >
            No observed track is available. Seaphore has no AIS history provider connected, so where
            this vessel actually sailed is not known.
          </p>
        ) : null}
      </section>

      <Field label="Vessel" icon={<Ship className="h-3 w-3" aria-hidden />}>
        {voyage.imo ? `IMO ${voyage.imo}` : (voyage.vesselId ?? "Not linked to a vessel record")}
      </Field>
      <Field label="Voyage number">{voyage.voyageNumber ?? "Not recorded"}</Field>
      <Field label="Status">{STATUS_LABELS[voyage.status] ?? STATUS_LABELS.unknown}</Field>

      <Endpoint title="Origin" endpoint={voyage.origin} />
      <Endpoint title="Destination" endpoint={voyage.destination} />

      {/* ── Schedule ── */}
      <section>
        <SectionTitle>Schedule</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Milestone label="ETD" value={voyage.schedule.etd} kind="estimated" />
          <Milestone label="ATD" value={voyage.schedule.atd} kind="actual" />
          <Milestone label="ETA" value={voyage.schedule.eta} kind="estimated" />
          <Milestone label="ATA" value={voyage.schedule.ata} kind="actual" />
        </dl>
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Departure {milestoneWord(departureState(voyage))} · arrival{" "}
          {milestoneWord(arrivalState(voyage))}. An estimate is a claim about the future; an actual
          time is a record of what happened.
        </p>
      </section>

      {/* ── Linked records ── */}
      <section>
        <SectionTitle>Linked records</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Row label="Manifests" value={String(voyage.links.manifestIds.length)} />
          <Row label="Documents" value={String(voyage.links.documentIds.length)} />
          <Row
            label="Cargo lines"
            value={
              voyage.links.cargoItemCount == null
                ? "Not loaded"
                : String(voyage.links.cargoItemCount)
            }
          />
        </dl>
      </section>
    </div>
  );
}

function milestoneWord(state: MilestoneState): string {
  if (state === "actual") return "observed";
  if (state === "estimated") return "estimated only";
  return "not recorded";
}

/**
 * One voyage endpoint, including the three-way resolution state.
 *
 * An unresolved endpoint is shown as unresolved. There is no fallback
 * coordinate, no country centroid, and no "approximately" — the port is
 * named if we know its name, and the position is reported as absent if
 * it is absent.
 */
function Endpoint({ title, endpoint }: { title: string; endpoint: VoyageEndpoint }) {
  return (
    <section data-testid={`voyage-endpoint-${title.toLowerCase()}`}>
      <SectionTitle>{title}</SectionTitle>
      {endpoint.link.state !== "identified" || endpoint.code == null ? (
        /*
         * The database side failed, and says which way.
         *
         * "The voyage names no port", "the port record could not be
         * retrieved" and "the port record has no UN/LOCODE" are three
         * different problems with three different remedies, and none of
         * them is "this port has no published coordinates" — which is
         * what the gazetteer reports and what the officer would
         * otherwise assume.
         */
        <p
          data-testid={`endpoint-link-${endpoint.link.state}`}
          className="text-[11.5px] text-muted-foreground"
        >
          {PORT_LINK_NOTES[endpoint.link.state] ?? "Not resolved."}
          {endpoint.link.country ? ` Country: ${endpoint.link.country}.` : ""}
        </p>
      ) : (
        <EndpointResolution code={endpoint.code} resolution={endpoint.resolution} />
      )}
    </section>
  );
}

function EndpointResolution({
  code,
  resolution,
}: {
  code: string;
  resolution: PortResolution | null;
}) {
  if (!resolution || resolution.status === "unknown") {
    return (
      <div className="text-[11.5px]">
        <div className="font-medium text-foreground">{code}</div>
        <div data-testid="endpoint-unresolved" className="text-[10.5px] text-muted-foreground">
          {resolution?.reason ?? "Not resolved."} No position is shown, and none has been inferred.
        </div>
      </div>
    );
  }

  if (resolution.status === "position-unavailable") {
    return (
      <div className="text-[11.5px]">
        <div className="font-medium text-foreground">
          {resolution.name}
          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
            {resolution.code}
          </span>
        </div>
        <div
          data-testid="endpoint-position-unavailable"
          className="flex items-start gap-1 text-[10.5px] text-muted-foreground"
        >
          <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden />
          <span>{resolution.reason} This endpoint is not drawn on the map.</span>
        </div>
      </div>
    );
  }

  const [lon, lat] = resolution.position;
  return (
    <div className="text-[11.5px]">
      <div className="font-medium text-foreground">
        {resolution.name}
        <span className="ml-1 font-mono text-[10px] text-muted-foreground">{resolution.code}</span>
      </div>
      <div className="font-mono text-[10.5px] text-muted-foreground">
        {lat.toFixed(3)}, {lon.toFixed(3)}
      </div>
      <div data-testid="endpoint-precision" className="text-[10px] text-muted-foreground">
        {resolution.precision === "surveyed"
          ? `Operator reference position · ${resolution.source}`
          : `Degree-and-minute centroid, about ±1 km · ${resolution.source}`}
      </div>
    </div>
  );
}

function Milestone({
  label,
  value,
  kind,
}: {
  label: string;
  value: string | null;
  kind: "estimated" | "actual";
}) {
  return (
    <div className="contents">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        <span className="ml-1 normal-case tracking-normal opacity-70">
          {kind === "actual" ? "(actual)" : "(est.)"}
        </span>
      </dt>
      <dd className={cn("text-[11.5px]", value ? "text-foreground" : "text-muted-foreground")}>
        {value ? formatTimestamp(value) : "Not recorded"}
      </dd>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-[11.5px] text-foreground">{value}</dd>
    </div>
  );
}

function Field({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-[12px] text-foreground">{children}</div>
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
      data-testid="voyage-panel"
      className="p-3 text-[11.5px] leading-relaxed text-muted-foreground"
    >
      {children}
    </div>
  );
}
