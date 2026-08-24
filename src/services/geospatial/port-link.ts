/**
 * Turning a database port reference into a port identifier.
 *
 * `voyages.origin_port_id` and `destination_port_id` are UUID foreign
 * keys to `ports.id`. A UUID is not a place: it cannot be resolved to a
 * position, it means nothing outside this database, and handing one to
 * the gazetteer produces a confident `unknown` for every endpoint in the
 * system — a map that reports, wrongly, that it cannot locate any port
 * at all.
 *
 * This module is the translation. It takes the foreign key and the
 * joined `ports` row and yields a UN/LOCODE, or an explicit account of
 * why there isn't one.
 *
 * ## Why it lives in the geospatial domain
 *
 * "How well is this endpoint identified" is a domain question, and the
 * domain must not depend on the repository — the repository imports
 * *this*, not the other way round. Keeping the vocabulary here also
 * keeps this module free of every server dependency, so nothing in the
 * data-access chain is dragged into the map bundle.
 *
 * ## Two stages, not one
 *
 * This is the database stage and it stops at an identifier. Turning
 * that identifier into a position is the gazetteer's job, with its own
 * three outcomes. Keeping them apart is what stops "this voyage has no
 * port record" being reported to an officer as "this port has no
 * published coordinates" — different facts, different remedies.
 */

/** The joined `ports` row a voyage endpoint points at. */
export interface JoinedPortRow {
  readonly id?: string | null;
  /** Nullable in the schema: a port row may carry no UN/LOCODE. */
  readonly unlocode?: string | null;
  readonly country?: string | null;
}

/** How far a voyage endpoint got toward being identifiable. */
export type PortLinkState =
  /** The voyage row carries no port id at all. */
  | "not-recorded"
  /** A port id is present, but no `ports` row came back for it. */
  | "relationship-unavailable"
  /** The port row exists and its `unlocode` is null or blank. */
  | "identifier-unavailable"
  /** A usable UN/LOCODE was found. */
  | "identified";

/** One endpoint, translated out of database identifiers. */
export interface PortLink {
  readonly state: PortLinkState;
  /**
   * UN/LOCODE, and only ever a UN/LOCODE.
   *
   * Non-null exactly when `state` is `identified`. The UUID is
   * deliberately not carried here, so nothing downstream can reach for
   * it by mistake.
   */
  readonly unlocode: string | null;
  readonly country: string | null;
}

/** Officer-facing explanation for each non-identified state. */
export const PORT_LINK_NOTES: Readonly<Record<PortLinkState, string | null>> = {
  "not-recorded": "No port was recorded for this end of the voyage.",
  "relationship-unavailable":
    "The voyage names a port record that could not be retrieved, so no identifier is available.",
  "identifier-unavailable":
    "The port record carries no UN/LOCODE, so it cannot be looked up in the gazetteer.",
  identified: null,
};

/**
 * PostgREST returns an embedded to-one relationship as an object, but
 * some client and schema combinations surface it as a single-element
 * array. Accept both rather than silently losing the join.
 */
function firstPort(
  value: JoinedPortRow | readonly JoinedPortRow[] | null | undefined,
): JoinedPortRow | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : (value as JoinedPortRow);
}

/**
 * Translate a voyage's port foreign key into a port identifier.
 *
 * Each failure mode is reported as itself, so the drawer can say which
 * one happened rather than collapsing all three into "unresolved".
 */
export function toPortLink(
  portId: string | null | undefined,
  joined: JoinedPortRow | readonly JoinedPortRow[] | null | undefined,
): PortLink {
  if (portId == null || portId.trim() === "") {
    return { state: "not-recorded", unlocode: null, country: null };
  }
  const port = firstPort(joined);
  if (port == null) {
    return { state: "relationship-unavailable", unlocode: null, country: null };
  }
  const unlocode = port.unlocode?.trim();
  if (!unlocode) {
    return { state: "identifier-unavailable", unlocode: null, country: port.country ?? null };
  }
  return { state: "identified", unlocode, country: port.country ?? null };
}

/**
 * Anything shaped like a database primary key.
 *
 * A canonical UUID, or the 32-hex form some clients emit. Used only to
 * assert that one never arrives where a location code belongs.
 */
const UUID_SHAPED = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** True when a string is a database key rather than a place identifier. */
export function looksLikeDatabaseId(value: string): boolean {
  return UUID_SHAPED.test(value.trim());
}
