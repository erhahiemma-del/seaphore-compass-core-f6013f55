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
import { Building2, Route, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Vessel } from "@/services/geospatial";

import { RiskGauge } from "./RiskGauge";
import { VesselIntelligenceView } from "./VesselIntelligenceView";
import type { ActivityEvent, Datum, VesselPresentation } from "./vessel-presentation";
import { operationalStateLabel } from "./vessel-panel-state";

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
}: {
  presentation: VesselPresentation;
  onReplay?: () => void;
}) {
  return (
    <div className="space-y-2.5 p-3">
      <Card title="Voyage">
        {presentation.voyage.map((datum) => (
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
