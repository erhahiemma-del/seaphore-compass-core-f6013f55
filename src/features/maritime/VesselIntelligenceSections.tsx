/**
 * The panels behind the six tabs, and the shared primitives they use.
 *
 * Two of the six — People and Ownership — have no connected source at
 * all, and they are built anyway. An empty tab is not a placeholder
 * here: it tells an officer what Seaphore would know if a provider were
 * attached, which is operationally different from a tab that does not
 * exist. The trap is that such a panel drifts toward looking populated,
 * so the rule is narrow: name the missing connection, never the missing
 * record, and never render a row shaped like a person or a company.
 */
import type { LucideIcon } from "lucide-react";
import { Anchor, Building2, Route, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Vessel } from "@/services/geospatial";

import { RiskGauge } from "./RiskGauge";
import { VesselIntelligenceView } from "./VesselIntelligenceView";
import type { MapSelection } from "@/services/geospatial";
import type { MarineWeatherState } from "./use-marine-weather";
import { vesselDocuments } from "@/services/geospatial/vessel-documents";
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";
import {
  departurePortTarget,
  destinationPortTarget,
} from "@/services/geospatial/voyage-port-target";

import type { ActivityEvent, Datum, VesselPresentation } from "./vessel-presentation";
import {
  presentDeclaredVoyage,
  presentMarineConditions,
  presentEnrichmentSource,
  presentParticulars,
  presentPortContext,
  presentUnservedCapabilities,
} from "./vessel-presentation";
import { operationalStateLabel } from "./vessel-panel-state";
import { useNpaContext } from "./use-npa-context";
import {
  npaCargoRows,
  npaCorrelationRows,
  npaHistoryLines,
  npaOperationalRows,
  npaScheduleRows,
} from "./npa-presentation";

/* ── Primitives ──────────────────────────────────────────────────────── */

export function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card/60 p-3", className)}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * One fact and its qualifier.
 *
 * The qualifier is not optional decoration: an absent value prints the
 * reason it is absent in the same slot a provenance note would occupy,
 * so no row can reach the screen saying nothing.
 */
export function DatumRow({ datum }: { datum: Datum }) {
  const has = datum.availability === "AVAILABLE";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] text-muted-foreground">{datum.label}</span>
      <span className="min-w-0 text-right">
        <span
          className={cn(
            "block truncate text-[12px] font-medium",
            has ? "text-foreground" : "text-muted-foreground italic",
            datum.mono && has ? "font-mono" : undefined,
          )}
        >
          {has ? datum.value : "Not available"}
        </span>
        {(has ? datum.provenance : datum.reason) ? (
          <span className="block text-[10px] leading-tight text-muted-foreground/80">
            {has ? datum.provenance : datum.reason}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A section whose source is not connected.
 *
 * Deliberately not a row list: rows imply records were looked up and
 * found empty. The icon, the sentence and the disabled affordance
 * together say the opposite — nothing was looked up, because there is
 * nowhere to look.
 */
export function NotConnected({
  icon: Icon,
  title,
  explanation,
  fields,
}: {
  icon: LucideIcon;
  title: string;
  explanation: string;
  /** What would appear here once a source is connected. */
  fields: readonly string[];
}) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-muted/60">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-[38ch] text-[11.5px] leading-relaxed text-muted-foreground">
        {explanation}
      </p>
      {/*
        Naming the fields is the useful part of an empty state: it tells
        the officer what connecting a provider would buy, without
        drawing a single row that could be mistaken for a record.
      */}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {fields.map((field) => (
          <span
            key={field}
            className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/80"
          >
            {field}
          </span>
        ))}
      </div>
      {/*
        Disabled, and saying why. An enabled button here would be a
        request with nowhere to go.
      */}
      <Button
        variant="outline"
        size="sm"
        disabled
        title="No source is connected to request this from"
        className="mt-3 h-7 text-[11px]"
      >
        Request intelligence
      </Button>
    </div>
  );
}

/* ── Tab panels ──────────────────────────────────────────────────────── */

/**
 * What the Nigerian Ports Authority says about this vessel.
 *
 * Its own card, above identity, because it answers the question an
 * officer opens the drawer with — what is this ship doing here — and
 * because it must never be mistaken for the AIS observation directly
 * beneath it. Every row states its source.
 *
 * Renders nothing when NPA holds no record. A vessel in transit is
 * expected to be absent from a Nigerian port schedule, and an empty
 * "NPA" card on every passing hull would train officers to ignore the
 * one place the operational state actually appears.
 */
export function NpaOperationalPanel({ vessel }: { vessel: Vessel }) {
  const { vessel: unified, pending } = useNpaContext(vessel.identity.imo || null);

  if (pending) {
    return (
      <Card title="Port authority">
        <p className="py-1.5 text-[11px] italic text-muted-foreground">
          Reading the NPA operational schedule&hellip;
        </p>
      </Card>
    );
  }

  if (!unified || !unified.currentPortCall) {
    /*
     * Stated rather than omitted. "No NPA record" is a fact about the
     * schedule, and leaving the space blank would read as "not loaded" —
     * the same confusion this drawer works hard to keep out everywhere
     * else.
     */
    return (
      <Card title="Port authority">
        <DatumRow
          datum={{
            label: "NPA record",
            availability: "UNAVAILABLE",
            reason:
              "No record in the NPA daily shipping schedule. The workbook covers Nigerian port operations, so a vessel calling elsewhere is expected to be absent from it.",
          }}
        />
      </Card>
    );
  }

  const call = unified.currentPortCall;
  const history = npaHistoryLines(unified);

  return (
    <>
      <Card title="Port authority · operational">
        {npaOperationalRows(call).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      <Card title="Port authority · schedule">
        {npaScheduleRows(call).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      <Card title="NPA cargo evidence">
        {npaCargoRows(call).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
        {/*
          Named evidence, never a manifest, and the CTA routes to the
          existing Manifest & Cargo workspace rather than a second one.
        */}
        <p className="mt-2 text-[10px] leading-tight text-muted-foreground/80">
          Reported to the port authority. This is not a filed manifest.
        </p>
        <a
          href="/manifest"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          View Manifest &amp; Cargo &rarr;
        </a>
      </Card>

      <Card title="Source agreement">
        {npaCorrelationRows(unified).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      {history.length > 1 ? (
        <Card title="NPA port calls">
          {/*
            Every call NPA holds for this hull. Ordered by how present the
            vessel is rather than by date, so a current berthing leads a
            later-typed departure — and historical calls are never
            presented as current activity.
          */}
          <ul className="space-y-1">
            {history.map((line, index) => (
              <li
                key={line + String(index)}
                className="border-b border-border/40 py-1 text-[11px] last:border-0 text-muted-foreground"
              >
                {line}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

export function OverviewPanel({
  vessel,
  presentation,
}: {
  vessel: Vessel;
  presentation: VesselPresentation;
}) {
  return (
    <div className="space-y-2.5 p-3">
      {/*
        The alert strip stays. There is no alert model yet, so the honest
        answer is that nothing is outstanding — stated rather than left
        blank, because a blank space where an alert would go reads as
        "not loaded" and this reads as "checked, nothing there".
      */}
      <div
        data-testid="vessel-operational-state"
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
        <span className="text-[11.5px] font-medium">{operationalStateLabel()}</span>
      </div>

      {/* What the port authority reports, before what AIS observed. */}
      <NpaOperationalPanel vessel={vessel} />

      <Card title="Identity">
        {presentation.identity.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      <Card title="Risk & attention">
        <AssessmentBody vessel={vessel} presentation={presentation} />
      </Card>
    </div>
  );
}

/**
 * Risk, attention and confidence side by side.
 *
 * Three axes, three answers — how dangerous, how urgent, how sure. A
 * single badge answering all three is how an unassessed vessel ends up
 * looking safe, so they are never merged.
 */
function AssessmentBody({
  vessel,
  presentation,
}: {
  vessel: Vessel;
  presentation: VesselPresentation;
}) {
  const { risk, attention, confidence } = presentation.assessment;
  return (
    <div className="space-y-2">
      <RiskGauge vessel={vessel} reason={risk.reason} className="py-1" />
      <div>
        <DatumRow datum={attention} />
        <DatumRow datum={confidence} />
      </div>
    </div>
  );
}

/**
 * Findings, brief and evidence — the existing intelligence view.
 *
 * Kept whole rather than replaced. It runs `aggregateFindings()` over
 * the registered risk modules and carries provenance through to the
 * evidence, which is real infrastructure; swapping it for a summary card
 * would have quietly deleted the only working intelligence surface in
 * the drawer.
 */
export function IntelligencePanel({ vessel }: { vessel: Vessel }) {
  return <VesselIntelligenceView vessel={vessel} />;
}

export function VesselVoyagePanel({
  presentation,
  onReplay,
  supersededLabels,
}: {
  presentation: VesselPresentation;
  onReplay?: () => void;
  /**
   * Rows a provider panel below answers authoritatively.
   *
   * Without this the two panels contradict each other: this one reports
   * "ETA — not reported by the source" from the map-level snapshot while
   * the declared-voyage panel immediately below shows the ETA the source
   * did report. An officer reading top to bottom would see the absence
   * first, and a stated absence is believed.
   */
  supersededLabels?: ReadonlySet<string>;
}) {
  const rows = supersededLabels
    ? presentation.voyage.filter((datum) => !supersededLabels.has(datum.label))
    : presentation.voyage;

  return (
    <div className="space-y-2.5 p-3">
      <Card title="Voyage">
        {rows.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>
      {onReplay ? (
        <Button variant="outline" size="sm" onClick={onReplay} className="h-8 w-full text-[11.5px]">
          <Route className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          View movement history
        </Button>
      ) : null}
    </div>
  );
}

export function PeoplePanel() {
  return (
    <NotConnected
      icon={Users}
      title="No crew intelligence available"
      explanation="No crew intelligence source is connected to this deployment. Seaphore holds no master, officer or crew records for any vessel on this map."
      fields={["Master", "Chief officer", "Crew on board", "Nationality", "Certification"]}
    />
  );
}

export function OwnershipPanel() {
  return (
    <NotConnected
      icon={Building2}
      title="No ownership intelligence available"
      explanation="No entity intelligence source is connected to this deployment. Registered owner, operator and beneficial ownership cannot be resolved for any vessel on this map."
      fields={["Registered owner", "Operator", "Manager", "Beneficial owner", "Flag registry"]}
    />
  );
}

export function ActivityPanel({ events }: { events: readonly ActivityEvent[] }) {
  return (
    <div className="p-3">
      <Card title="Activity">
        {events.length === 0 ? (
          <p className="py-1 text-[11.5px] text-muted-foreground">
            No recorded operational activity for this vessel.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-2.5">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-foreground">{event.summary}</div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {formatWhen(event.at)} · {event.provenance}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {/*
        The list holds the position report and nothing else. Selections,
        intelligence requests and case events are not recorded anywhere,
        and inventing them would be fabricated history.
      */}
      <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-muted-foreground/80">
        Only events Seaphore actually recorded appear here. Case history and intelligence requests
        are not tracked in this deployment.
      </p>
    </div>
  );
}

function formatWhen(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "Time not readable";
}

/**
 * Particulars, voyage and provenance from the deep Datalastic loads.
 *
 * These panels exist because the data did: `vessel_info` and `vessel_pro`
 * return roughly forty fields that used to be parsed and discarded. Nothing
 * here is computed — every value is what the provider stated, and every
 * absence carries the reason it is absent.
 */
export function ParticularsPanel({
  enrichment,
  loading,
  failed,
  weather,
}: {
  enrichment: VesselEnrichment | null;
  loading: boolean;
  failed: boolean;
  /** Sea state for this vessel's position. Absent renders as not loaded. */
  weather?: MarineWeatherState;
}) {
  /*
   * A provider failure is not an empty vessel. Rendering the rows with
   * their "no record" wording would state that Datalastic answered and had
   * nothing, when in fact it never answered.
   */
  if (failed) {
    return (
      <div className="p-3">
        <Card title="Vessel particulars">
          <p className="py-1 text-[11.5px] text-muted-foreground">
            Datalastic could not be reached for this vessel. Nothing here reflects the vessel — it
            reflects a collection failure.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <Card title={loading ? "Vessel particulars · loading" : "Vessel particulars"}>
        {presentParticulars(enrichment).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      <Card title="Source & freshness">
        {presentEnrichmentSource(enrichment).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      {/*
        Sea state where this vessel is. Loaded for the selected vessel
        only, on a coarse grid, so an anchorage of hundreds costs one
        request rather than one each.
      */}
      <Card title="Conditions">
        {presentMarineConditions(weather?.conditions ?? null, {
          loading: weather?.loading,
          failed: weather?.failed,
        }).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      {/*
        Documentary record. Almost entirely absences today, and each one
        names what is missing — the source, the link, or the record — so
        none of them reads as a claim that nothing was ever filed.
      */}
      <Card title="Trade & documents">
        {vesselDocuments().entries.map((entry) => (
          <DatumRow
            key={entry.kind}
            datum={{
              label: entry.kind,
              availability: entry.availability === "AVAILABLE" ? "AVAILABLE" : "NOT_CONNECTED",
              ...(entry.availability === "AVAILABLE"
                ? { value: entry.recordId ?? "Available" }
                : { reason: entry.note }),
            }}
          />
        ))}
      </Card>

      {/*
        Named rather than omitted. An officer looking for ownership finds a
        reason here instead of silence — the endpoints are sold and answer
        404, which is a fact about the API, not about the ship.
      */}
      <Card title="Not served by this provider">
        {presentUnservedCapabilities().map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>
    </div>
  );
}

/**
 * The voyage the vessel is declaring, and where it resolved to.
 *
 * Kept beside the registered-voyage panel rather than merged into it: one
 * is Seaphore's own record and the other is a provider's momentary account,
 * and an officer needs to see which is which.
 */
export function DeclaredVoyagePanel({
  enrichment,
  failed,
  onOpenPort,
}: {
  enrichment: VesselEnrichment | null;
  failed: boolean;
  /** Follow the destination to its port. Absent hides the action entirely. */
  onOpenPort?: (selection: MapSelection) => void;
}) {
  const target = destinationPortTarget(enrichment?.voyage ?? null);
  const origin = departurePortTarget(enrichment?.voyage ?? null);
  if (failed) {
    return (
      <Card title="Declared voyage">
        <p className="py-1 text-[11.5px] text-muted-foreground">
          Datalastic could not be reached. No voyage has been declared as far as Seaphore knows —
          which is not the same as the vessel declaring none.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title="Declared voyage · Datalastic">
        {presentDeclaredVoyage(enrichment).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>
      <Card title="Port context">
        {presentPortContext(enrichment).map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
        {/*
          Offered only when a port was resolved on an identifier and this
          deployment holds it. Every other state already explains itself in
          the rows above, and a button that cannot act is worse than none:
          it reads as broken software rather than absent data.
        */}
        {onOpenPort && target.state === "AVAILABLE" && target.selection ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenPort(target.selection!)}
            className="mt-2 h-8 w-full text-[11.5px]"
          >
            <Anchor className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Open {target.port?.shortName ?? target.port?.name ?? "destination port"}
          </Button>
        ) : null}
        {/*
          Both ends of the voyage are navigable on the same terms. A vessel
          out of Kamsar has a valid UNLOCODE this register does not hold, so
          that end offers nothing — for the same reason, stated the same way.
        */}
        {onOpenPort && origin.state === "AVAILABLE" && origin.selection ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenPort(origin.selection!)}
            className="mt-2 h-8 w-full text-[11.5px]"
          >
            <Anchor className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Open {origin.port?.shortName ?? origin.port?.name ?? "departure port"}
          </Button>
        ) : null}
      </Card>
    </>
  );
}
