/**
 * What is happening at a port, assembled from the records that say so.
 *
 * The port panel was a `PendingPanel` listing what Seaphore could not
 * show. Every one of those things now exists in the ingested workbook —
 * berths, terminals, occupancy, the four operational states — so this
 * assembles them into one view of a port.
 *
 * ## Geometry is a state, not a coordinate
 *
 * NPA names terminals and berths and publishes no position for either,
 * and the provider's terminal endpoint is unavailable on this account. So
 * every facility here carries a {@link GeometryState} saying what is
 * known about where it is, and the only honest answer today is
 * `PORT_ANCHORED` — we know which port it belongs to and nothing finer.
 *
 * The state exists rather than a boolean because the three cases need
 * different handling on a map: one can be drawn, one must be listed
 * without being drawn, and one is not even attributed to a port yet.
 * A boolean would collapse the last two, and a facility with no port
 * would end up pinned to a port it was never attributed to.
 *
 * ## Counts describe records, not the sea
 *
 * "11 vessels at berth" means eleven rows in a daily schedule said so. It
 * does not mean eleven hulls are alongside right now, and the panel is
 * expected to attribute it to NPA rather than present it as observation.
 */
import {
  canonicalPortId,
  findNigerianPort,
  type CanonicalPort,
} from "@/services/geospatial/nigerian-ports";

import type {
  NpaBerthRecord,
  NpaOperationalDataset,
  NpaPortCall,
  NpaTerminalRecord,
} from "./workbook-ingest";

/** How well Seaphore knows where a facility physically is. */
export type GeometryState =
  /** A published coordinate. Drawable, selectable on the map. */
  | "VERIFIED_GEOMETRY"
  /**
   * Attributed to a port, with no position of its own.
   *
   * The map must not draw this at the port's coordinate as though it
   * were the facility's location. It is listed in the port's panel and
   * reachable from search, and says its location is not yet verified.
   */
  | "PORT_ANCHORED"
  /**
   * Named by a record, attributed to no port Seaphore recognises.
   *
   * Still reachable in panels and search — the record exists and an
   * officer may need it — but nothing about where it is can be claimed.
   */
  | "GEOMETRY_PENDING";

export interface TerminalView {
  readonly id: string;
  readonly code: string;
  readonly portLocode: string | null;
  readonly geometry: GeometryState;
  /** Sentence explaining the geometry state, for the panel. */
  readonly geometryNote: string;
  readonly berthCount: number;
  readonly occupiedBerths: number;
  readonly vacantBerths: number;
  /**
   * Nothing but the code is claimed.
   *
   * NPA publishes the prefix and no more — no operator, no concession,
   * no capacity, no cargo capability. Those are absent here rather than
   * filled from a plausible-looking source.
   */
  readonly operator: null;
}

export interface BerthView {
  readonly id: string;
  readonly name: string;
  readonly raw: string;
  readonly terminalCode: string | null;
  readonly status: "OCCUPIED" | "VACANT";
  readonly geometry: GeometryState;
  readonly geometryNote: string;
  /** The call occupying it, when occupied. */
  readonly portCallId: string | null;
  readonly vesselName: string | null;
  readonly vesselImo: string | null;
}

/** One vessel's presence at this port, as NPA records it. */
export interface PortVesselView {
  readonly portCallId: string;
  readonly name: string;
  readonly imo: string | null;
  readonly status: NpaPortCall["status"];
  readonly terminalCode: string | null;
  readonly berth: string | null;
  readonly eta: string | null;
  readonly etd: string | null;
  readonly observedAt: string | null;
  readonly agent: string | null;
  readonly cargo: string | null;
  readonly cargoQuantity: string | null;
}

export interface PortActivity {
  readonly atBerth: readonly PortVesselView[];
  readonly awaitingBerth: readonly PortVesselView[];
  readonly expected: readonly PortVesselView[];
  readonly departed: readonly PortVesselView[];
}

export interface PortIntelligence {
  readonly locode: string | null;
  readonly name: string;
  /** The canonical register entry, when the port is one Seaphore holds. */
  readonly canonical: CanonicalPort | null;
  /** NPA's own spelling, kept because it is what the source said. */
  readonly npaLabels: readonly string[];

  readonly activity: PortActivity;
  readonly terminals: readonly TerminalView[];
  readonly berths: readonly BerthView[];

  readonly berthCount: number;
  readonly occupiedBerths: number;
  readonly vacantBerths: number;
  /** Occupied ÷ total, or null when no berths are recorded. */
  readonly occupancy: number | null;

  /** The newest NPA observation for this port. Null when none carried one. */
  readonly observedAt: string | null;
  readonly sourceFile: string | null;
  readonly ingestedAt: string | null;
}

const GEOMETRY_NOTES: Readonly<Record<GeometryState, string>> = {
  VERIFIED_GEOMETRY: "Position published by a connected source.",
  PORT_ANCHORED:
    "Terminal location not yet verified. NPA names this facility but publishes no coordinate, and no connected source serves terminal geometry — so it is listed here rather than drawn on the map.",
  GEOMETRY_PENDING:
    "Named by an NPA record that Seaphore could not attribute to a port in its register. Nothing about its location is claimed.",
};

/**
 * Decide a facility's geometry state.
 *
 * Kept as one function so the three cases cannot drift apart between
 * terminals and berths — they are the same question about two record
 * types, and answering it twice is how they end up disagreeing.
 */
export function geometryStateFor(portLocode: string | null): GeometryState {
  /*
   * No coordinate branch exists yet, deliberately. Nothing in the
   * ingested workbook or in any connected provider publishes terminal or
   * berth positions, so `VERIFIED_GEOMETRY` is unreachable today. The
   * state is declared rather than omitted so the map and the panel
   * already agree on the word for when a source does supply one.
   */
  return portLocode ? "PORT_ANCHORED" : "GEOMETRY_PENDING";
}

function toVesselView(call: NpaPortCall): PortVesselView {
  return {
    portCallId: call.id,
    name: call.vesselName,
    imo: call.imo,
    status: call.status,
    terminalCode: call.terminalCode,
    berth: call.berthRaw,
    eta: call.eta,
    etd: call.etd,
    observedAt: call.observedAt,
    agent: call.agent,
    cargo: call.cargo?.raw ?? null,
    cargoQuantity: call.cargo?.quantity?.raw ?? null,
  };
}

/** Newest observation first; undated records sort last rather than first. */
function byNewest(left: PortVesselView, right: PortVesselView): number {
  const l = left.observedAt ? Date.parse(left.observedAt) : Number.NEGATIVE_INFINITY;
  const r = right.observedAt ? Date.parse(right.observedAt) : Number.NEGATIVE_INFINITY;
  return r - l;
}

/**
 * Whether an NPA port code and a canonical LOCODE name the same port.
 *
 * The two registers spell some ports differently — NPA's sheets resolve
 * to `NGAPP` where the canonical register calls it `NGAPAPA` — so both
 * sides go through `canonicalPortId`, which knows the aliases. Comparing
 * the raw strings would silently return an empty port for Apapa, Warri
 * and Onne, which is three of the seven.
 */
function sameCanonicalPort(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const a = canonicalPortId(left);
  const b = canonicalPortId(right);
  return a !== null && a === b;
}

/**
 * Assemble everything known about one port.
 *
 * `locode` may be either register's spelling. Returns a view even when
 * NPA holds nothing for the port — an empty activity list for a port
 * Seaphore recognises is a true statement, and different from the port
 * not existing.
 */
export function portIntelligence(
  locode: string,
  dataset: NpaOperationalDataset | null,
): PortIntelligence {
  const canonicalId = canonicalPortId(locode);
  const canonical = canonicalId ? findNigerianPort(canonicalId) : null;

  const calls = (dataset?.portCalls ?? []).filter((call) =>
    sameCanonicalPort(call.portLocode, locode),
  );
  const berthRecords = (dataset?.berths ?? []).filter((berth) =>
    sameCanonicalPort(berth.portLocode, locode),
  );
  const terminalRecords = (dataset?.terminals ?? []).filter((terminal) =>
    sameCanonicalPort(terminal.portLocode, locode),
  );

  const callsById = new Map(calls.map((call) => [call.id, call]));

  const berths: BerthView[] = berthRecords.map((berth) => {
    const call = berth.portCallId ? callsById.get(berth.portCallId) : undefined;
    return {
      id: berth.id,
      name: berth.name,
      raw: berth.raw,
      terminalCode: berth.terminalCode,
      status: berth.status,
      geometry: geometryStateFor(berth.portLocode),
      geometryNote: GEOMETRY_NOTES[geometryStateFor(berth.portLocode)],
      portCallId: berth.portCallId,
      /*
       * A vacant berth carries no vessel, and this is where that has to
       * hold: the panel renders straight from these fields, so a name
       * leaking onto a vacant berth here would put a ship in an empty
       * berth on screen.
       */
      vesselName: call?.vesselName ?? null,
      vesselImo: call?.imo ?? null,
    };
  });

  const terminals: TerminalView[] = terminalRecords.map((terminal) => {
    const own = berths.filter((berth) => matchesTerminal(berth, terminal));
    const geometry = geometryStateFor(terminal.portLocode);
    return {
      id: terminal.id,
      code: terminal.code,
      portLocode: terminal.portLocode,
      geometry,
      geometryNote: GEOMETRY_NOTES[geometry],
      berthCount: own.length,
      occupiedBerths: own.filter((berth) => berth.status === "OCCUPIED").length,
      vacantBerths: own.filter((berth) => berth.status === "VACANT").length,
      operator: null,
    };
  });

  const views = calls.map(toVesselView);
  const of = (status: NpaPortCall["status"]) =>
    views.filter((view) => view.status === status).sort(byNewest);

  const occupied = berths.filter((berth) => berth.status === "OCCUPIED").length;
  const vacant = berths.filter((berth) => berth.status === "VACANT").length;

  const observedTimes = calls
    .map((call) => call.observedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  return {
    locode: canonicalId,
    name: canonical?.name ?? calls[0]?.portLabel ?? locode,
    canonical,
    npaLabels: [...new Set(calls.map((call) => call.portLabel).filter(Boolean))] as string[],
    activity: {
      atBerth: of("AT_BERTH"),
      awaitingBerth: of("AWAITING_BERTH"),
      expected: of("EXPECTED"),
      departed: of("DEPARTED"),
    },
    terminals,
    berths,
    berthCount: berths.length,
    occupiedBerths: occupied,
    vacantBerths: vacant,
    // Null rather than zero when there are no berths: "0% occupied" and
    // "no berths recorded" are different statements about a port.
    occupancy: berths.length > 0 ? occupied / berths.length : null,
    observedAt:
      observedTimes.length > 0 ? new Date(Math.max(...observedTimes)).toISOString() : null,
    sourceFile: dataset?.sourceFile ?? null,
    ingestedAt: dataset?.ingestedAt ?? null,
  };
}

/**
 * Whether a berth belongs to a terminal.
 *
 * Matched on the code NPA wrote, case-insensitively, and never on a
 * prefix: `Terminal A` and `Terminal A1` are two facilities, and a
 * `startsWith` here would fold one into the other's berth count.
 */
function matchesTerminal(berth: BerthView, terminal: NpaTerminalRecord): boolean {
  if (!berth.terminalCode) return false;
  return berth.terminalCode.toUpperCase() === terminal.code.toUpperCase();
}

/** Every port NPA holds records for, for listings and search. */
export function portsInDataset(dataset: NpaOperationalDataset | null): readonly string[] {
  const codes = new Set<string>();
  for (const record of dataset?.ports ?? []) {
    const id = record.locode ? canonicalPortId(record.locode) : null;
    if (id) codes.add(id);
  }
  return [...codes];
}

/** Berths belonging to one terminal, for the terminal panel. */
export function berthsForTerminal(
  intelligence: PortIntelligence,
  terminalCode: string,
): readonly BerthView[] {
  return intelligence.berths.filter(
    (berth) => berth.terminalCode?.toUpperCase() === terminalCode.toUpperCase(),
  );
}

/** Vessels NPA attributes to one terminal, across all four states. */
export function vesselsForTerminal(
  intelligence: PortIntelligence,
  terminalCode: string,
): readonly PortVesselView[] {
  const code = terminalCode.toUpperCase();
  const { atBerth, awaitingBerth, expected, departed } = intelligence.activity;
  return [...atBerth, ...awaitingBerth, ...expected, ...departed].filter(
    (vessel) => vessel.terminalCode?.toUpperCase() === code,
  );
}

export { GEOMETRY_NOTES };
