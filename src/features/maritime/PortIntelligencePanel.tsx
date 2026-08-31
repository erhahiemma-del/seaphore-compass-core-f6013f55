/**
 * What is happening at a port.
 *
 * Replaces the `PendingPanel` that listed everything Seaphore could not
 * show. All of it now exists in the ingested NPA workbook, so this shows
 * it — and says, on every count, that it is the port authority's account
 * rather than an observation. "16 vessels at berth" means sixteen rows of
 * a daily schedule said so.
 *
 * Weather comes from the existing `useMarineWeather`, which is
 * entity-agnostic and already grid-deduped on both client and server.
 * Nothing here is a second weather path.
 */
import { useMemo, useState } from "react";
import { Anchor, Ship, Clock, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  hasDrawablePosition,
  positionUnavailableReason,
} from "@/services/geospatial/nigerian-ports";
import type { PortIntelligence, PortVesselView } from "@/services/government/npa/port-intelligence";

import { Card, DatumRow } from "./VesselIntelligenceSections";
import { NPA_STATUS_LABELS } from "./npa-presentation";
import { useMarineWeather } from "./use-marine-weather";
import { presentMarineConditions, type Datum } from "./vessel-presentation";

const available = (label: string, value: string, extra: Partial<Datum> = {}): Datum => ({
  label,
  value,
  availability: "AVAILABLE",
  ...extra,
});

const missing = (label: string, reason: string): Datum => ({
  label,
  availability: "UNAVAILABLE",
  reason,
});

function when(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

type ActivityKey = "atBerth" | "awaitingBerth" | "expected" | "departed";

const ACTIVITY_TABS: readonly {
  readonly key: ActivityKey;
  readonly label: string;
  readonly icon: typeof Ship;
}[] = [
  { key: "atBerth", label: "At berth", icon: Anchor },
  { key: "awaitingBerth", label: "Awaiting", icon: Clock },
  { key: "expected", label: "Expected", icon: Ship },
  { key: "departed", label: "Departed", icon: LogOut },
];

export interface PortIntelligencePanelProps {
  readonly intelligence: PortIntelligence;
  /** Opens a vessel by IMO. Absent when the host offers no navigation. */
  readonly onOpenVessel?: (imo: string) => void;
}

export function PortIntelligencePanel({ intelligence, onOpenVessel }: PortIntelligencePanelProps) {
  const [tab, setTab] = useState<ActivityKey>(() => firstPopulated(intelligence));

  const canonical = intelligence.canonical;
  const drawable = canonical ? hasDrawablePosition(canonical) : false;

  /*
   * Weather is asked for the port's own coordinate, and only when there
   * is one. A port with no position gets no weather query rather than a
   * query against a fallback point, which would report the sea state
   * somewhere the officer did not ask about.
   */
  const weather = useMarineWeather(
    drawable && canonical?.position
      ? { lat: canonical.position[1], lon: canonical.position[0] }
      : null,
  );

  const identity = useMemo<readonly Datum[]>(
    () => [
      available("Port", intelligence.name),
      intelligence.locode
        ? available("UN/LOCODE", intelligence.locode, { mono: true })
        : missing("UN/LOCODE", "This port is not in Seaphore's canonical register."),
      canonical && drawable && canonical.position
        ? available(
            "Coordinates",
            `${canonical.position[1].toFixed(4)}°, ${canonical.position[0].toFixed(4)}°`,
            { mono: true, provenance: "Canonical port register" },
          )
        : missing(
            "Coordinates",
            canonical
              ? positionUnavailableReason(canonical)
              : "No coordinate is held for this port.",
          ),
      intelligence.npaLabels.length > 0
        ? available("NPA name", intelligence.npaLabels.join(" · "), {
            provenance: "As written in the source workbook",
          })
        : missing("NPA name", "No NPA record names this port."),
      intelligence.observedAt
        ? available("Latest NPA observation", when(intelligence.observedAt)!, {
            mono: true,
            provenance: intelligence.sourceFile ?? undefined,
          })
        : missing("Latest NPA observation", "No NPA record for this port carried a time."),
    ],
    [intelligence, canonical, drawable],
  );

  const operations = useMemo<readonly Datum[]>(() => {
    const { activity } = intelligence;
    const count = (list: readonly PortVesselView[], label: string, absent: string) =>
      list.length > 0
        ? available(label, String(list.length), {
            mono: true,
            provenance: "NPA daily shipping schedule",
          })
        : missing(label, absent);

    return [
      count(activity.atBerth, "At berth", "No vessel is recorded at a berth here."),
      count(activity.awaitingBerth, "Awaiting berth", "No vessel is recorded awaiting a berth."),
      count(activity.expected, "Expected", "No vessel is recorded as expected."),
      count(activity.departed, "Recent departures", "No departure is recorded for this port."),
      intelligence.berthCount > 0
        ? available(
            "Berth occupancy",
            `${intelligence.occupiedBerths} of ${intelligence.berthCount} occupied`,
            {
              mono: true,
              provenance:
                intelligence.occupancy !== null
                  ? `${Math.round(intelligence.occupancy * 100)}% — as recorded by NPA, not observed`
                  : undefined,
            },
          )
        : missing("Berth occupancy", "No berths are recorded for this port."),
      intelligence.berthCount > 0
        ? available("Vacant berths", String(intelligence.vacantBerths), { mono: true })
        : missing("Vacant berths", "No berths are recorded for this port."),
      intelligence.terminals.length > 0
        ? available("Terminals", String(intelligence.terminals.length), { mono: true })
        : missing("Terminals", "No terminal is attributed to this port."),
    ];
  }, [intelligence]);

  const list = intelligence.activity[tab];

  return (
    <div className="space-y-2.5 p-3">
      <Card title="Port identity">
        {identity.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
      </Card>

      <Card title="Operations">
        {operations.map((datum) => (
          <DatumRow key={datum.label} datum={datum} />
        ))}
        <p className="mt-2 text-[10px] leading-tight text-muted-foreground/80">
          Counts are records in the NPA daily shipping schedule, not live observations.
        </p>
      </Card>

      <Card title="Vessel activity">
        <div className="mb-2 flex gap-1" role="tablist" aria-label="Port activity">
          {ACTIVITY_TABS.map(({ key, label, icon: Icon }) => {
            const size = intelligence.activity[key].length;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded border px-1.5 py-1 text-[10px] font-medium transition-colors",
                  tab === key
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                <span className="font-mono tabular-nums">{size}</span>
              </button>
            );
          })}
        </div>

        {list.length === 0 ? (
          /*
           * Says which list is empty and why it is a real answer. A blank
           * area here reads as "not loaded", and the whole point of the
           * NPA ingest is that this is now a checked, empty result.
           */
          <p className="py-2 text-[11px] italic text-muted-foreground">
            No vessel is recorded {tabPhrase(tab)} at this port in the NPA schedule.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {list.map((vessel) => (
              <li key={vessel.portCallId}>
                <PortVesselRow vessel={vessel} onOpen={onOpenVessel} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Terminals">
        {intelligence.terminals.length === 0 ? (
          <p className="py-2 text-[11px] italic text-muted-foreground">
            No terminal is attributed to this port in the NPA schedule.
          </p>
        ) : (
          <ul className="space-y-1">
            {intelligence.terminals.map((terminal) => (
              <li key={terminal.id} className="border-b border-border/40 py-1.5 last:border-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] font-medium">
                    {/*
                      The registry's fuller name where it matched, with
                      NPA's code beside it — an officer reading a berth
                      cell sees the code, and the panel has to be findable
                      from it.
                    */}
                    {terminal.registry ? terminal.registry.name : terminal.code}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {terminal.occupiedBerths}/{terminal.berthCount} berths
                  </span>
                </div>

                {terminal.registry ? (
                  <>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      {terminal.registry.operator ?? "Operator not recorded"}
                      {terminal.registry.primaryCargo ? ` · ${terminal.registry.primaryCargo}` : ""}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/80">
                      {[
                        `NPA code ${terminal.code}`,
                        terminal.registry.berthDesignations
                          ? `berths ${terminal.registry.berthDesignations}`
                          : null,
                        terminal.registry.maxDraftM !== null
                          ? `${terminal.registry.maxDraftM} m draft`
                          : null,
                        terminal.registry.concessionId
                          ? `concession ${terminal.registry.concessionId}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {/*
                      Geometry and confidence, in the registry's own
                      words. `PORT_ANCHORED` here means the coordinate on
                      file is the port's, which is the one thing about
                      this data that must never be misread.
                    */}
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/80">
                      {terminal.geometry === "VERIFIED_GEOMETRY"
                        ? "Facility position on file"
                        : "Terminal location not yet verified"}
                      {` · ${terminal.registry.dataState.replace(/_/g, " ").toLowerCase()}`}
                      {` · matched: ${terminal.registry.matchMethod.replace(/_/g, " ").toLowerCase()}`}
                    </p>
                  </>
                ) : (
                  /*
                    No registry match. NPA states the code and nothing
                    else, and nothing is inferred from it — `APMT` looks
                    like APM Terminals and the registry never says so.
                  */
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/80">
                    Terminal location not yet verified · No facility-registry match for this NPA
                    code, so no operator or concession is claimed
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Berths">
        <div className="flex items-baseline justify-between gap-2 pb-1.5 text-[11px]">
          <span className="text-muted-foreground">Recorded</span>
          <span className="font-mono tabular-nums">
            {intelligence.occupiedBerths} occupied · {intelligence.vacantBerths} vacant
          </span>
        </div>
        {intelligence.berthCount === 0 ? (
          <p className="py-1 text-[11px] italic text-muted-foreground">
            No berth is recorded for this port.
          </p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {intelligence.berths.map((berth) => (
              <li
                key={berth.id}
                className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1 text-[11px] last:border-0"
              >
                <span className="truncate font-mono">{berth.raw}</span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-medium uppercase tracking-wide",
                    berth.status === "VACANT" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {/*
                    A vacant berth names no vessel. This is the last place
                    that could put a ship in an empty berth, so the vessel
                    name is read only from an occupied one.
                  */}
                  {berth.status === "VACANT" ? "Vacant" : (berth.vesselName ?? "Occupied")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Sea state">
        {!drawable ? (
          <DatumRow
            datum={missing(
              "Marine conditions",
              "Weather is queried by coordinate, and Seaphore holds none for this port.",
            )}
          />
        ) : (
          /*
             The same renderer the vessel drawer uses. A second set of
             weather rows here would be a second place for the units to
             be wrong — visibility arrives in metres and is shown in
             kilometres, and that conversion should exist once.
          */
          presentMarineConditions(weather.conditions, {
            loading: weather.loading,
            failed: weather.failed,
          }).map((datum) => <DatumRow key={datum.label} datum={datum} />)
        )}
      </Card>
    </div>
  );
}

function PortVesselRow({
  vessel,
  onOpen,
}: {
  vessel: PortVesselView;
  onOpen?: (imo: string) => void;
}) {
  /*
   * Only an identified hull is clickable. A row with no IMO cannot open a
   * vessel — there is nothing canonical to open — and a dead button that
   * looks live is worse than a plain row.
   */
  const canOpen = Boolean(vessel.imo && onOpen);
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] font-medium">{vessel.name}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {vessel.imo ?? "No IMO"}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground/80">
        {[
          NPA_STATUS_LABELS[vessel.status] ?? vessel.status,
          vessel.berth ?? vessel.terminalCode,
          vessel.cargo,
          vessel.cargoQuantity,
          when(vessel.observedAt),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </>
  );

  return canOpen ? (
    <button
      type="button"
      onClick={() => onOpen!(vessel.imo!)}
      className="w-full rounded border-b border-border/40 px-1 py-1 text-left transition-colors last:border-0 hover:bg-muted/50"
    >
      {body}
    </button>
  ) : (
    <div className="border-b border-border/40 px-1 py-1 last:border-0">{body}</div>
  );
}

function firstPopulated(intelligence: PortIntelligence): ActivityKey {
  /*
   * Open on a tab that has something in it, preferring what is present
   * over what has left: a port whose only records are departures should
   * still open somewhere useful rather than on an empty "At berth".
   */
  for (const { key } of ACTIVITY_TABS) {
    if (intelligence.activity[key].length > 0) return key;
  }
  return "atBerth";
}

function tabPhrase(tab: ActivityKey): string {
  switch (tab) {
    case "atBerth":
      return "at a berth";
    case "awaitingBerth":
      return "awaiting a berth";
    case "expected":
      return "as expected";
    case "departed":
      return "as departed";
  }
}
