/**
 * One fleet from two sources that disagree about what a vessel is.
 *
 * Datalastic reports where a hull is right now. NPA reports what the port
 * authority expects, has berthed, or has released. Neither is the fleet:
 * a map showing only Datalastic omits every vessel the port is waiting
 * for, and a map showing only NPA omits every ship in the water without a
 * schedule entry. The operational picture is the union — and the union is
 * only meaningful once the two sources have been resolved to canonical
 * identities, or the same ship appears twice under two spellings.
 *
 * ## The union is not the intersection
 *
 * 52 of 237 NPA identifiers currently match a tracked hull. It is
 * tempting to treat 52 as the answer, and it is the one number that is
 * definitely wrong: it is the count of vessels both sources happen to
 * know about, which is a fact about coverage overlap rather than about
 * how many ships are operationally relevant. Every NPA-only and every
 * Datalastic-only vessel stays.
 *
 * ## What is missing gets a state, not a silence
 *
 * An NPA vessel with no AIS observation is not absent and is not lost —
 * it is `NOT_CURRENTLY_VISIBLE`, which is a statement about Seaphore's
 * coverage, not about the ship. Dropping it would let a gap in one
 * provider read as an empty berth.
 *
 * ## Nothing here invents a coordinate
 *
 * Where a vessel has no live position, it is placed by the most specific
 * geography NPA actually established, and the placement carries its own
 * precision. A vessel shown at its port's coordinate is not being claimed
 * to be at that coordinate — see {@link PositionPrecision}, which exists
 * so the interface can never present the two as the same thing.
 */
import { canonicalPortId, findNigerianPort } from "@/services/geospatial/nigerian-ports";
import type { Vessel } from "@/services/geospatial/vessel";

import type { NpaOperationalDataset, NpaPortCall, NpaVesselRecord } from "./workbook-ingest";

/** How an entity resolved across the two sources. */
export type CorrelationState =
  /** Both sources identify the same hull, by identifier. */
  | "MATCHED"
  /** NPA holds a record; no tracked hull carries the identifier. */
  | "NPA_ONLY"
  /** Tracked live; NPA holds no schedule record. */
  | "DATALASTIC_ONLY"
  /**
   * Identifiers matched but the particulars conflict.
   *
   * Reported rather than resolved. A rename, a transcription slip and a
   * reused identifier all look like this, and they need different
   * responses from an officer.
   */
  | "AMBIGUOUS";

/**
 * Why a vessel has the coordinate it has.
 *
 * The single most dangerous confusion this module can produce is a
 * port-level placement read as a position report, so precision travels
 * with every placement and the renderer is expected to draw them
 * differently.
 */
export type PositionPrecision =
  /** A live AIS report. The only kind that is a position. */
  | "OBSERVED"
  /**
   * The vessel is somewhere in this port, per NPA. Not a position.
   *
   * The workbook names a berth and a terminal but publishes no geometry
   * for either, and no connected provider serves berth coordinates, so
   * the port centroid is the most specific verified point available.
   */
  | "PORT_APPROXIMATE"
  /** NPA placed it at a port Seaphore holds no coordinate for. */
  | "NO_POSITION";

export interface UnifiedPosition {
  readonly lon: number;
  readonly lat: number;
  readonly precision: PositionPrecision;
  /** Officer-facing sentence. Always set, including for a live report. */
  readonly basis: string;
}

/** A vessel in the operational picture, from either source or both. */
export interface UnifiedVessel {
  /** Canonical key: `imo:<imo>` when identified, else `name:<hash>`. */
  readonly key: string;
  readonly name: string;
  /** Null when no valid IMO was reported. Never an MMSI. */
  readonly imo: string | null;
  readonly mmsi: string | null;
  readonly correlation: CorrelationState;
  /**
   * Whether AIS currently sees this hull.
   *
   * Separate from {@link correlation} because they answer different
   * questions: correlation is about which sources hold a record, this is
   * about whether one of them is reporting right now.
   */
  readonly aisVisible: boolean;
  /** Live observation, when tracked. */
  readonly live: Vessel | null;
  /** The NPA record, when scheduled. */
  readonly npa: NpaVesselRecord | null;
  /** The call this vessel is currently in, by NPA's account. */
  readonly currentPortCall: NpaPortCall | null;
  /** Every NPA call for this hull, most operationally relevant first. */
  readonly portCalls: readonly NpaPortCall[];
  /** Null when nothing establishes a place. */
  readonly position: UnifiedPosition | null;
  /** Why the vessel reads the way it does. Always set. */
  readonly note: string;
}

export interface UnifiedFleetSummary {
  readonly total: number;
  readonly matched: number;
  readonly npaOnly: number;
  readonly datalasticOnly: number;
  readonly ambiguous: number;
  readonly withoutPosition: number;
  readonly notCurrentlyVisible: number;
}

export interface UnifiedFleet {
  readonly vessels: readonly UnifiedVessel[];
  readonly summary: UnifiedFleetSummary;
}

/**
 * Which of a vessel's NPA calls describes it now.
 *
 * Ordered by how present the vessel is, not by date. A ship at a berth
 * today and departed last week is at a berth; ordering by timestamp would
 * make whichever row was typed last win, and NPA's departure sheets carry
 * later timestamps than its berth sheets as a matter of course.
 */
const STATUS_PRESENCE: Readonly<Record<string, number>> = {
  AT_BERTH: 0,
  AWAITING_BERTH: 1,
  EXPECTED: 2,
  DEPARTED: 3,
  UNKNOWN: 4,
};

export function orderPortCalls(calls: readonly NpaPortCall[]): readonly NpaPortCall[] {
  return [...calls].sort((left, right) => {
    const presence = (STATUS_PRESENCE[left.status] ?? 9) - (STATUS_PRESENCE[right.status] ?? 9);
    if (presence !== 0) return presence;
    // Within one state, the most recently observed call leads.
    const leftTime = left.observedAt ? Date.parse(left.observedAt) : 0;
    const rightTime = right.observedAt ? Date.parse(right.observedAt) : 0;
    return rightTime - leftTime;
  });
}

/**
 * Where to draw a vessel NPA knows about and AIS does not.
 *
 * Walks the hierarchy the brief sets out — berth, then terminal, then
 * port — and stops at the first level Seaphore holds verified geometry
 * for. Today that is the port and only the port: the workbook publishes
 * berth and terminal *names* but no coordinates, and the provider's
 * terminal endpoint is unavailable on this account. Rather than fabricate
 * the two finer levels, this returns the port centroid and labels it
 * approximate, or returns nothing at all.
 */
export function placeFromPortCall(call: NpaPortCall | null): UnifiedPosition | null {
  if (!call) return null;

  const locode = canonicalPortId(call.portLocode);
  const port = locode ? findNigerianPort(locode) : null;

  if (!port || port.positionStatus !== "resolved" || !port.position) {
    return null;
  }

  const where = call.berthRaw
    ? `berth ${call.berthRaw}`
    : call.terminalCode
      ? `terminal ${call.terminalCode}`
      : "the port";

  return {
    lon: port.position[0],
    lat: port.position[1],
    precision: "PORT_APPROXIMATE",
    /*
     * Worded to state the limit rather than imply a fix. An officer
     * reading this must not come away thinking the ship was observed
     * here — only that NPA placed it in this port.
     */
    basis: `NPA places this vessel at ${where} in ${port.name}. No berth or terminal coordinates are published, so the marker sits at the port centroid — this is the port, not the vessel's position.`,
  };
}

function livePosition(vessel: Vessel): UnifiedPosition {
  return {
    lon: vessel.position.lon,
    lat: vessel.position.lat,
    precision: "OBSERVED",
    basis: "Live AIS position report.",
  };
}

/**
 * Build the operational fleet from both sources.
 *
 * The tracked fleet is passed in rather than fetched: this is a pure
 * decision about two record sets, and a function that reached for a
 * provider could not be run over the whole workbook without buying a
 * request per row.
 */
export function unifyFleet(
  tracked: readonly Vessel[],
  dataset: NpaOperationalDataset | null,
): UnifiedFleet {
  const vessels: UnifiedVessel[] = [];
  const claimed = new Set<string>();

  const callsByVessel = new Map<string, NpaPortCall[]>();
  for (const call of dataset?.portCalls ?? []) {
    const list = callsByVessel.get(call.vesselKey);
    if (list) list.push(call);
    else callsByVessel.set(call.vesselKey, [call]);
  }

  /*
   * Index the live fleet by identifier only.
   *
   * Never by name. Names collide and are rewritten, and merging on one
   * would attribute a schedule entry — with its cargo and its agent — to
   * a different hull that happens to share a spelling.
   */
  const liveByImo = new Map<string, Vessel>();
  for (const vessel of tracked) {
    const imo = vessel.identity.imo;
    // An MMSI standing in for an IMO must not become a join key: 14% of
    // the tracked fleet reports no IMO, and those carry the MMSI in the
    // field. Joining on it would match a hull to a schedule row by a
    // number that means something else.
    if (imo && imo !== vessel.identity.mmsi) liveByImo.set(imo, vessel);
  }

  for (const record of dataset?.vessels ?? []) {
    const calls = orderPortCalls(callsByVessel.get(record.key) ?? []);
    const current = calls[0] ?? null;
    const live = record.imo ? (liveByImo.get(record.imo) ?? null) : null;

    if (live) claimed.add(record.imo!);

    const correlation: CorrelationState = live
      ? namesAgree(record.name, live.identity.name)
        ? "MATCHED"
        : "AMBIGUOUS"
      : "NPA_ONLY";

    const position = live ? livePosition(live) : placeFromPortCall(current);

    vessels.push({
      key: record.key,
      name: record.name,
      imo: record.imo,
      mmsi: live?.identity.mmsi ?? null,
      correlation,
      aisVisible: live !== null,
      live,
      npa: record,
      currentPortCall: current,
      portCalls: calls,
      position,
      note: noteFor(correlation, record, live, current, position),
    });
  }

  for (const vessel of tracked) {
    const imo = vessel.identity.imo;
    const identified = Boolean(imo) && imo !== vessel.identity.mmsi;
    if (identified && claimed.has(imo)) continue;

    vessels.push({
      key: identified ? `imo:${imo}` : `mmsi:${vessel.identity.mmsi ?? imo}`,
      name: vessel.identity.name,
      // Never surface an MMSI as an IMO. A hull reporting only an MMSI
      // has no IMO here, and the interface says so.
      imo: identified ? imo : null,
      mmsi: vessel.identity.mmsi ?? null,
      correlation: "DATALASTIC_ONLY",
      aisVisible: true,
      live: vessel,
      npa: null,
      currentPortCall: null,
      portCalls: [],
      position: livePosition(vessel),
      note: "Tracked live by AIS. NPA holds no schedule record for this vessel — the workbook covers Nigerian port operations, so a vessel in transit or calling elsewhere is expected to be absent from it.",
    });
  }

  return { vessels, summary: summarise(vessels) };
}

/**
 * Strip the differences that are not differences.
 *
 * Runs only after identifiers have matched, to judge whether the match
 * looks right. It never makes a match.
 */
function namesAgree(left: string, right: string): boolean {
  const normalise = (name: string) =>
    name
      .toUpperCase()
      .replace(/\b(M\/?V|M\/?T|MSV|MT|MV)\b/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  return normalise(left) === normalise(right);
}

function noteFor(
  correlation: CorrelationState,
  record: NpaVesselRecord,
  live: Vessel | null,
  call: NpaPortCall | null,
  position: UnifiedPosition | null,
): string {
  if (correlation === "AMBIGUOUS") {
    return `NPA records IMO ${record.imo} as "${record.name}"; the tracked vessel is "${live?.identity.name}". The identifier matches and the names do not — this may be a rename or a transcription error, and it is reported rather than resolved.`;
  }
  if (correlation === "MATCHED") {
    return `NPA and live AIS both identify this hull by IMO ${record.imo}. The map shows the live position; NPA supplies the operational state.`;
  }
  if (!call) {
    return "NPA holds a record for this vessel but no port call, so there is nothing to place it by.";
  }
  if (!position) {
    return `NPA places this vessel at ${call.portLabel ?? "an unrecognised port"}, which Seaphore holds no coordinate for. It is in the operational picture but cannot be drawn on the map.`;
  }
  return `Not currently visible to AIS. NPA reports it ${call.status.toLowerCase().replace(/_/g, " ")}${call.portLabel ? ` at ${call.portLabel}` : ""}.`;
}

function summarise(vessels: readonly UnifiedVessel[]): UnifiedFleetSummary {
  const count = (predicate: (vessel: UnifiedVessel) => boolean) => vessels.filter(predicate).length;
  return {
    total: vessels.length,
    matched: count((vessel) => vessel.correlation === "MATCHED"),
    npaOnly: count((vessel) => vessel.correlation === "NPA_ONLY"),
    datalasticOnly: count((vessel) => vessel.correlation === "DATALASTIC_ONLY"),
    ambiguous: count((vessel) => vessel.correlation === "AMBIGUOUS"),
    withoutPosition: count((vessel) => vessel.position === null),
    notCurrentlyVisible: count((vessel) => !vessel.aisVisible),
  };
}
