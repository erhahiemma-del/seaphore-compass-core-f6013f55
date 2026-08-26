/**
 * Nigeria's port estate — one canonical identity per port.
 *
 * Before this module the same seven facilities were described by three
 * disagreeing systems: `NIMASA_PORTS` keyed by seven-character internal
 * codes, `nimasa-ports.geojson` keyed the same way, and the Port
 * Locations cards keyed by three-letter codes of their own (`APP`,
 * `TCT`, `PHC`) that nothing else recognised. A card and a map marker
 * for the same quay could not be matched except by display name, which
 * is why selecting one never selected the other.
 *
 * UN/LOCODE is the identity here, because it is the only namespace the
 * voyage records, the global gazetteer and the reference collection all
 * already speak. Everything else — the card codes, the internal
 * seven-character keys — becomes an alias resolved through
 * {@link canonicalPortId}.
 *
 * ## Position status is three-way, and reuses the gazetteer's vocabulary
 *
 * Deliberately *not* a new `verified | approximate | unavailable` enum.
 * `port-gazetteer.ts` already draws exactly this distinction —
 * `resolved` / `position-unavailable` / `unknown`, with a separate
 * `PositionPrecision` axis — and a second vocabulary for the same idea
 * is how two parts of a codebase start disagreeing about what
 * "approximate" means. This module carries the gazetteer's types.
 *
 * The three-way split is load-bearing rather than tidy:
 *
 *   Rivers Port Complex (NGPHC) is a real, operating port. UN/LOCODE
 *   lists it and publishes **no coordinate**, and no other source in
 *   this repository holds one. It is therefore
 *   `position-unavailable`: present in the intelligence model,
 *   selectable, named — and never drawn, because the only way to draw
 *   it would be to invent where it is.
 *
 *   Lekki (NGLKK) has a UN/LOCODE degree-and-minute centroid, good to
 *   roughly a kilometre. That is enough to mark and not enough to
 *   survey, so it carries `degree-minute` precision and renders in the
 *   hollow treatment the voyage endpoints already use for the same
 *   claim.
 *
 * Collapsing either into "we have a position" would put a plausible dot
 * on screen that an officer could not tell from an operator-published
 * one — the same failure as drawing an unreported heading as due north.
 */
import { NIMASA_PORTS } from "./constants";
import { normalizePortCode, type PositionPrecision } from "./port-gazetteer";
import type { LonLat } from "./types";

/**
 * Where a port's geographic reference stands.
 *
 * Mirrors `PortResolution["status"]` minus `unknown`, which cannot occur
 * here: every entry in this module is a port we know exists.
 */
export type PortPositionStatus = "resolved" | "position-unavailable";

/** Where a coordinate came from, and how far it may be trusted. */
export interface PortProvenance {
  /** Officer-facing source name. */
  readonly source: string;
  /** Why this is the position of record, or why there is none. */
  readonly note: string;
}

export interface CanonicalPort {
  /** UN/LOCODE, or the repository key where UN/LOCODE has no entry. */
  readonly locode: string;
  /** Officer-facing name, as the estate is actually referred to. */
  readonly name: string;
  /** Short form for dense labels. */
  readonly shortName: string;
  /**
   * Other identifiers that resolve to this port.
   *
   * Card codes, internal seven-character keys, and UN/LOCODE spellings
   * all live here so no consumer has to match on a display name.
   */
  readonly aliases: readonly string[];
  readonly positionStatus: PortPositionStatus;
  /** Absent when `positionStatus` is `position-unavailable`. */
  readonly position?: LonLat;
  /** Absent when there is no position to qualify. */
  readonly precision?: PositionPrecision;
  readonly provenance: PortProvenance;
  /**
   * Label priority, lower sorts first.
   *
   * Drives MapLibre's `symbol-sort-key` so that when Lagos-area labels
   * collide the same one wins every time. Before this the survivor was
   * whichever the collision engine reached first, which changed with
   * viewport and read as flicker.
   */
  readonly labelPriority: number;
}

/**
 * Operator-reference provenance, shared by the five NIMASA positions.
 *
 * These coordinates are the repository's own, carried in `constants.ts`
 * since M1 — not derived from the global dataset, which publishes no
 * position for four of them.
 */
const NIMASA_PROVENANCE: PortProvenance = {
  source: "NIMASA operator reference (repository, since M1)",
  note: "Operator-published reference position, not a surveyed berth coordinate.",
};

/**
 * Nigeria's port estate, keyed by canonical identifier.
 *
 * Positions are *referenced* from `NIMASA_PORTS` rather than copied, so
 * there remains exactly one place a NIMASA coordinate is written down.
 */
export const NIGERIAN_PORTS: Readonly<Record<string, CanonicalPort>> = {
  NGAPAPA: {
    locode: "NGAPAPA",
    name: "Lagos Port Complex (Apapa)",
    shortName: "APA",
    aliases: ["NGAPP", "NGLOS", "APP", "APA"],
    positionStatus: "resolved",
    position: [NIMASA_PORTS.NGAPAPA.lon, NIMASA_PORTS.NGAPAPA.lat],
    precision: "surveyed",
    provenance: NIMASA_PROVENANCE,
    // Nigeria's principal gateway; it wins every Lagos-area collision.
    labelPriority: 1,
  },
  NGTIN: {
    locode: "NGTIN",
    name: "Tin Can Island Port",
    shortName: "TIN CAN",
    aliases: ["TCT", "TIN", "TINCAN", "TIN CAN"],
    positionStatus: "resolved",
    position: [NIMASA_PORTS.NGTIN.lon, NIMASA_PORTS.NGTIN.lat],
    precision: "surveyed",
    provenance: {
      source: "Nigerian Ports Authority handbook — Tin-Can Island Port Complex",
      note: "NPA-published position, 06°25.7'N 003°20.530'E. Complex reference, not a berth coordinate.",
    },
    /*
     * Second only to Apapa, and the gap matters.
     *
     * The two sit 8.8 km apart on the same harbour approach — about 7px
     * at the opening zoom — so they contend for the same pixels at every
     * strategic zoom. Priority alone cannot settle that: it decides who
     * wins, and what was needed was for both to be placed. See the
     * variable anchoring on the label layer.
     */
    labelPriority: 2,
  },
  NGLKK: {
    locode: "NGLKK",
    name: "Lekki Deep Sea Port",
    shortName: "LEK",
    /*
     * `NGLEK` is the key `constants.ts` uses for the same port.
     *
     * Without it here the canonical lookup missed, and the feature
     * pipeline fell through to its fail-open branch — Lekki stayed on the
     * map, but carrying none of the canonical model's properties. Two
     * keys for one quay is exactly the drift this module exists to end,
     * so the internal key becomes an alias rather than a second port.
     */
    aliases: ["NGLEK", "LKK", "LEK", "IBEJU-LEKKI"],
    positionStatus: "resolved",
    /*
     * UN/LOCODE's own centroid for "Ibeju - Lekki", to the minute.
     * Written out rather than read from the 869 KB gazetteer at module
     * scope: this file is imported by the renderer, and the map must
     * not wait on a dataset load to know where its own estate is. The
     * value is transcribed exactly, and `precision` says what it is.
     */
    position: [4.0, 6.4333],
    precision: "degree-minute",
    provenance: {
      source: "UN/LOCODE 2501 (NGLKK, 'Ibeju - Lekki'), via public/gazetteer",
      note: "Degree-and-minute centroid, roughly ±1 km. Not an operator berth position.",
    },
    labelPriority: 3,
  },
  NGONNE: {
    locode: "NGONNE",
    name: "Onne Port Complex",
    shortName: "ONN",
    aliases: ["NGONN", "ONN"],
    positionStatus: "resolved",
    position: [NIMASA_PORTS.NGONNE.lon, NIMASA_PORTS.NGONNE.lat],
    precision: "surveyed",
    provenance: NIMASA_PROVENANCE,
    labelPriority: 2,
  },
  NGPHC: {
    locode: "NGPHC",
    name: "Rivers Port Complex (Port Harcourt)",
    shortName: "PHC",
    aliases: ["PHC", "NGPH"],
    /*
     * No coordinate exists for this port in this repository.
     *
     * UN/LOCODE lists NGPHC and publishes no position for it. The Port
     * Locations card carries a lat/lng, but that file states its
     * coordinates are "used for SVG projection, not navigation" and the
     * surface it feeds is labelled simulated — promoting it here would
     * make a demo value indistinguishable from an operator reference.
     *
     * Substituting Onne was considered and rejected: Onne and Rivers
     * are distinct facilities roughly 20 km apart, and conflating them
     * would misstate the estate rather than approximate it.
     */
    positionStatus: "position-unavailable",
    provenance: {
      source: "UN/LOCODE 2501 (NGPHC, 'Port Harcourt')",
      note: "No coordinate published. Awaiting an authoritative NPA or NIMASA reference position.",
    },
    labelPriority: 2,
  },
  NGWARR: {
    locode: "NGWARR",
    name: "Delta Port Complex (Warri)",
    shortName: "WAR",
    aliases: ["NGWAR", "WAR", "DEL"],
    positionStatus: "resolved",
    position: [NIMASA_PORTS.NGWARR.lon, NIMASA_PORTS.NGWARR.lat],
    precision: "surveyed",
    provenance: NIMASA_PROVENANCE,
    labelPriority: 2,
  },
  NGCBQ: {
    locode: "NGCBQ",
    name: "Calabar Port",
    shortName: "CAL",
    aliases: ["CAL"],
    positionStatus: "resolved",
    position: [NIMASA_PORTS.NGCBQ.lon, NIMASA_PORTS.NGCBQ.lat],
    precision: "surveyed",
    provenance: NIMASA_PROVENANCE,
    labelPriority: 2,
  },
} as const;

/** Every canonical port, in label-priority then name order. */
export const NIGERIAN_PORT_LIST: readonly CanonicalPort[] = Object.values(NIGERIAN_PORTS).sort(
  (a, b) => a.labelPriority - b.labelPriority || a.name.localeCompare(b.name),
);

/**
 * Alias → canonical id, built once from the table above.
 *
 * Includes each port's own id so a canonical lookup is the same call as
 * an alias lookup and no caller has to know which it holds.
 */
const ALIAS_INDEX: Readonly<Record<string, string>> = Object.freeze(
  Object.values(NIGERIAN_PORTS).reduce<Record<string, string>>((index, port) => {
    index[port.locode] = port.locode;
    for (const alias of port.aliases) index[normalizePortCode(alias)] = port.locode;
    return index;
  }, {}),
);

/**
 * Resolve any known spelling of a Nigerian port to its canonical id.
 *
 * Returns null rather than guessing. A caller holding an identifier this
 * does not recognise has something that is not one of these seven ports,
 * and coercing it to the nearest match is how a Lagos click ends up
 * selecting Calabar.
 */
export function canonicalPortId(code: string | null | undefined): string | null {
  if (!code) return null;
  return ALIAS_INDEX[normalizePortCode(code)] ?? null;
}

/** Look a port up by any known spelling. Null when unrecognised. */
export function findNigerianPort(code: string | null | undefined): CanonicalPort | null {
  const id = canonicalPortId(code);
  return id ? NIGERIAN_PORTS[id] : null;
}

/** True when this port has a position the map may draw. */
export function hasDrawablePosition(
  port: CanonicalPort | null | undefined,
): port is CanonicalPort & { position: LonLat } {
  return port?.positionStatus === "resolved" && Array.isArray(port.position);
}

/**
 * Officer-facing sentence for a port with no position.
 *
 * Held here so the map, the cards and the drawer all say the same thing
 * about the same absence rather than each inventing a phrasing.
 */
export function positionUnavailableReason(port: CanonicalPort): string {
  return `${port.name} has no published coordinate. ${port.provenance.note}`;
}
