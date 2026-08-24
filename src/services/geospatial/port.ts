/**
 * Port domain model.
 *
 * A port is an identity and, when a source publishes one, a position.
 * It is not an operational picture. Nothing in this repository knows how
 * busy a port is, which berths are occupied, what is waiting outside it
 * or what moved through it, and this module is built so that no amount
 * of later plumbing can quietly start implying otherwise.
 *
 * ## Two stages, reusing M2's vocabulary
 *
 * Identity resolution and position resolution are separate, exactly as
 * they are for voyage endpoints:
 *
 *   identity   who this port is — a NIMASA reference, a UN/LOCODE, a
 *              database row, or nothing we recognise
 *   position   where it is — delegated wholly to `PortGazetteer`, whose
 *              three outcomes (`resolved` / `position-unavailable` /
 *              `unknown`) are reused verbatim rather than restated
 *
 * There is no second gazetteer and no second registry. This module
 * decides *what to ask*; `port-gazetteer.ts` answers.
 *
 * ## Ambiguity is preserved, never resolved by preference
 *
 * When two identifiers disagree — a row declaring one country whose
 * UN/LOCODE belongs to another — the position is withheld and the
 * conflict is carried on the model. Picking the "more likely" one would
 * place a port somewhere no source put it.
 */
import { NIMASA_PORTS } from "./constants";
import {
  NIMASA_ALIASES,
  normalizePortCode,
  type PortGazetteer,
  type PortResolution,
} from "./port-gazetteer";
import type { LonLat } from "./types";
import type { Voyage } from "./voyage";

/** Where a port's identity came from. */
export type PortIdentitySource =
  /** One of the five NIMASA ports, from `constants.ts`. */
  | "nimasa"
  /** Matched in the UN/LOCODE gazetteer. */
  | "un-locode"
  /** Carried on a `ports` row but matched by no gazetteer. */
  | "database"
  /** Nothing recognised it. */
  | "unresolved";

export interface PortIdentity {
  /**
   * Selection key.
   *
   * For NIMASA ports this is the repository locode (`NGAPAPA`), because
   * `MaritimeCommand` narrows the fleet in PORT mode by looking the
   * selection id up in `NIMASA_PORTS`. Changing it to the real
   * UN/LOCODE would silently break that scoping.
   */
  readonly id: string;
  readonly name: string | null;
  /** ISO 3166-1 alpha-2 where a source carries one. */
  readonly country: string | null;
  /** The real UN/LOCODE, when one is known. Never the repository key. */
  readonly unlocode: string | null;
}

/**
 * Static reference figures for a NIMASA port.
 *
 * Present only for the five Nigerian ports, because only they have
 * them. These describe the estate, not its use: a berth count is like a
 * runway count, and says nothing whatsoever about occupancy.
 */
export interface PortReference {
  readonly berths: number;
  readonly anchorageRadiusKm: number;
}

/** Two identifiers that disagree. Recorded, not adjudicated. */
export interface PortAmbiguity {
  readonly reason: string;
  readonly declaredCountry: string;
  readonly resolvedCountry: string;
}

export interface Port {
  readonly identity: PortIdentity;
  readonly identitySource: PortIdentitySource;
  /** Gazetteer answer. Null when there was no identifier to ask about. */
  readonly resolution: PortResolution | null;
  /**
   * Position, only when genuinely resolved and unambiguous.
   *
   * Never a fallback, never a country centroid, and never `[0, 0]` —
   * the origin is a real place in the Gulf of Guinea, roughly 600 km
   * from Lagos, and a port drawn there would look plausible.
   */
  readonly position: LonLat | null;
  readonly reference: PortReference | null;
  readonly ambiguity: PortAmbiguity | null;
}

/** What a caller knows about a port before resolution. */
export interface PortInput {
  /** Selection key — a NIMASA locode or a UN/LOCODE. */
  readonly id: string;
  /** Country from a `ports` row, when one was read. */
  readonly country?: string | null;
  /** UN/LOCODE from a `ports` row, when one was read. */
  readonly unlocode?: string | null;
  /** Name from a non-gazetteer source, e.g. the NIMASA geojson. */
  readonly name?: string | null;
}

/**
 * Every code that identifies the same port.
 *
 * `NGAPAPA` and `NGAPP` are the same place in two namespaces — the
 * repository's own key and the real UN/LOCODE. Matching on one alone
 * would make a voyage to Apapa fail to associate with the port called
 * Apapa. Derived from the gazetteer's alias table rather than a second
 * copy of it.
 */
export function portCodeAliases(code: string): ReadonlySet<string> {
  const normalized = normalizePortCode(code);
  const codes = new Set<string>([normalized]);
  // Forward: UN/LOCODE -> repository key.
  const forward = NIMASA_ALIASES[normalized];
  if (forward) codes.add(forward);
  // Reverse: repository key -> UN/LOCODE.
  for (const [unlocode, repoKey] of Object.entries(NIMASA_ALIASES)) {
    if (repoKey === normalized) codes.add(unlocode);
  }
  return codes;
}

/** The real UN/LOCODE for a NIMASA repository key, or null. */
function unlocodeForNimasaKey(repoKey: string): string | null {
  for (const [unlocode, key] of Object.entries(NIMASA_ALIASES)) {
    if (key === repoKey) return unlocode;
  }
  return null;
}

/**
 * Resolve a port's identity and position.
 *
 * Hierarchy, in order:
 *
 *   1. NIMASA reference identity. First because UN/LOCODE publishes no
 *      position for Apapa, Tin Can, Warri or Calabar — for four of
 *      Nigeria's five ports it is the only source of one.
 *   2. Exact UN/LOCODE gazetteer match, normalised only for case and
 *      whitespace.
 *   3. Database identity — the row exists, no gazetteer knows it.
 *   4. Unresolved.
 *
 * There is no fuzzy matching, no name matching and no nearest-neighbour
 * step. A near-miss silently attaching the wrong port is worse than an
 * honest unresolved state, because it is invisible.
 */
export function resolvePort(input: PortInput, gazetteer: PortGazetteer): Port {
  const id = normalizePortCode(input.id);
  const declaredCountry = input.country?.trim() || null;
  const declaredUnlocode = input.unlocode ? normalizePortCode(input.unlocode) : null;

  // ── 1. NIMASA reference identity ──
  const nimasa = NIMASA_PORTS[id];
  if (nimasa) {
    const resolution = gazetteer.resolve(id);
    return {
      identity: {
        id,
        name: nimasa.name,
        country: "NG",
        unlocode: declaredUnlocode ?? unlocodeForNimasaKey(id),
      },
      identitySource: "nimasa",
      resolution,
      position: resolution.status === "resolved" ? resolution.position : null,
      reference: { berths: nimasa.berths, anchorageRadiusKm: nimasa.anchorageRadius },
      ambiguity: null,
    };
  }

  // ── 2. Gazetteer, by the row's UN/LOCODE if it has one, else by id ──
  const lookup = declaredUnlocode ?? id;
  const resolution = gazetteer.resolve(lookup);

  if (resolution.status === "unknown") {
    // ── 3/4. Known to the database, or to nobody ──
    const known = declaredCountry != null || declaredUnlocode != null;
    return {
      identity: {
        id,
        name: input.name?.trim() || null,
        country: declaredCountry,
        unlocode: declaredUnlocode,
      },
      identitySource: known ? "database" : "unresolved",
      resolution,
      position: null,
      reference: null,
      ambiguity: null,
    };
  }

  /*
   * Identifiers that disagree.
   *
   * A row saying "Nigeria" whose UN/LOCODE resolves to the Netherlands
   * is a data conflict, not a lookup to complete. Preferring either
   * side would place the port somewhere no source actually put it, so
   * the position is withheld and both values are carried.
   */
  const resolvedCountry = resolution.country;
  if (declaredCountry && resolvedCountry && declaredCountry.toUpperCase() !== resolvedCountry) {
    return {
      identity: {
        id,
        name: resolution.name,
        country: declaredCountry,
        unlocode: declaredUnlocode,
      },
      identitySource: "database",
      resolution,
      position: null,
      ambiguity: {
        reason:
          "The port record and the UN/LOCODE gazetteer disagree about this port's country, so its position has been withheld.",
        declaredCountry: declaredCountry.toUpperCase(),
        resolvedCountry,
      },
      reference: null,
    };
  }

  return {
    identity: {
      // `unknown` returned above, so both remaining variants carry a name.
      id,
      name: resolution.name,
      country: resolvedCountry,
      unlocode: declaredUnlocode ?? resolution.code,
    },
    identitySource: "un-locode",
    resolution,
    position: resolution.status === "resolved" ? resolution.position : null,
    reference: null,
    ambiguity: null,
  };
}

/* ── Voyage relationships ─────────────────────────────────────── */

/**
 * What can truthfully be said about voyages referencing this port.
 *
 * The gap between `none` and `unavailable` is the point of this type.
 * "No voyage in the register names this port" is an answer; "we could
 * not read the register" is the absence of one, and an officer who
 * cannot tell them apart will read the second as the first.
 */
export type PortVoyageLinkState =
  /** Voyages in the loaded set reference this port. */
  | "known"
  /** The set was readable and genuinely contains none. */
  | "none"
  /** We cannot determine — unreadable feed, or nothing to match on. */
  | "unavailable";

/**
 * Voyages referencing a port, split by the role the row records.
 *
 * Deliberately named for the columns — `origin_port_id` and
 * `destination_port_id` — and never as arrivals, departures, calls or
 * traffic. Those words assert that something happened; a voyage row
 * asserts only that a voyage names this port at one end.
 */
export interface PortVoyageRelationships {
  readonly state: PortVoyageLinkState;
  readonly asOrigin: readonly Voyage[];
  readonly asDestination: readonly Voyage[];
  /** Officer-facing sentence. Null only when `state` is `known`. */
  readonly reason: string | null;
}

/** Status of the voyage feed the relationships are derived from. */
export type VoyageFeedStatusLike = "loading" | "unavailable" | "empty" | "ready";

const NO_RELATIONSHIPS: readonly Voyage[] = [];

export function portVoyageRelationships(
  port: Port,
  voyages: readonly Voyage[],
  feedStatus: VoyageFeedStatusLike,
): PortVoyageRelationships {
  const unavailable = (reason: string): PortVoyageRelationships => ({
    state: "unavailable",
    asOrigin: NO_RELATIONSHIPS,
    asDestination: NO_RELATIONSHIPS,
    reason,
  });

  if (feedStatus === "loading") return unavailable("Voyage records are still loading.");
  if (feedStatus === "unavailable") {
    return unavailable(
      "Voyage records could not be read, so relationships to this port cannot be determined. This is not the same as there being none.",
    );
  }

  /*
   * Nothing to match on.
   *
   * A port with no UN/LOCODE cannot be compared against voyage
   * endpoints, which are identified by UN/LOCODE. Reporting `none`
   * here would claim the register was searched when it could not be.
   */
  const codes = new Set<string>();
  for (const candidate of [port.identity.unlocode, port.identity.id]) {
    if (!candidate) continue;
    for (const alias of portCodeAliases(candidate)) codes.add(alias);
  }
  if (codes.size === 0) {
    return unavailable(
      "This port carries no UN/LOCODE, so it cannot be matched against voyage records.",
    );
  }

  const asOrigin: Voyage[] = [];
  const asDestination: Voyage[] = [];
  for (const voyage of voyages) {
    const origin = voyage.origin.code ? normalizePortCode(voyage.origin.code) : null;
    const destination = voyage.destination.code ? normalizePortCode(voyage.destination.code) : null;
    if (origin && codes.has(origin)) asOrigin.push(voyage);
    if (destination && codes.has(destination)) asDestination.push(voyage);
  }

  if (asOrigin.length === 0 && asDestination.length === 0) {
    return {
      state: "none",
      asOrigin: NO_RELATIONSHIPS,
      asDestination: NO_RELATIONSHIPS,
      reason: "No voyage in the loaded records names this port.",
    };
  }

  return { state: "known", asOrigin, asDestination, reason: null };
}
