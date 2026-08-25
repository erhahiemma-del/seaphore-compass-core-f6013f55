/**
 * Understanding what the officer typed.
 *
 * The first half of the command pipeline: normalise, classify, and say
 * plainly whether this is an identifier lookup or a name search. Pure —
 * no network, no store, no React.
 *
 * ## It reuses the existing detector rather than adding a second one
 *
 * `detectEntityType` in `lib/command-dispatch` already recognises IMO,
 * container, bill-of-lading and voyage tokens, and has its own tests.
 * Rewriting those patterns here would create two classifiers that
 * disagree the first time either is edited, so this delegates to it and
 * only adds what it genuinely lacks:
 *
 *   - MMSI, which nothing detected before. Nine digits, and distinct
 *     from IMO's seven — the pair are easy to confuse and mean different
 *     things, so they are classified separately rather than lumped as
 *     "some vessel number".
 *   - The free-text case. `detectEntityType` answers "which centre does
 *     this route to" and so falls back to `vessel` for everything
 *     unmatched. That is right for routing and wrong for search: "Apapa"
 *     is not a vessel identifier, and treating it as one would send a
 *     port name to an exact-match lookup that must fail.
 *
 * ## Prefixes are stripped, not required
 *
 * An officer may type `IMO 9328374` or `9328374`. Both mean the same
 * thing, so the prefix is removed before classification rather than
 * being made part of the grammar.
 */
import { detectEntityType, type EntityType } from "@/lib/command-dispatch";

/**
 * What kind of thing the query is.
 *
 * Deliberately not `EntityType`. That type answers "where does this
 * route", and its members are destinations. This answers "what did the
 * officer give us", where the important distinction is between an
 * identifier that should resolve to exactly one entity and a name that
 * should return ranked candidates.
 */
export type CommandQueryKind =
  | "imo"
  | "mmsi"
  | "container"
  | "bol"
  | "voyage"
  | "free-text"
  | "empty";

/** True when the query names one specific object rather than describing one. */
export function isIdentifier(kind: CommandQueryKind): boolean {
  return kind === "imo" || kind === "mmsi" || kind === "container" || kind === "bol";
}

export interface CommandQuery {
  /** Exactly what the officer typed, untouched. */
  readonly raw: string;
  /** Trimmed, collapsed whitespace, prefix removed. What gets searched. */
  readonly normalized: string;
  readonly kind: CommandQueryKind;
  /**
   * The entity type this query would route to, from the existing
   * dispatcher. Carried so a handoff does not re-derive it.
   */
  readonly routeType: EntityType;
}

/** Nine digits. Distinct from IMO's seven, and frequently confused with it. */
const MMSI_RE = /^\d{9}$/;

/**
 * Leading words an officer may type to name the identifier they are
 * about to give. Stripped so `IMO 9328374` and `9328374` behave the same.
 */
const PREFIX_RE = /^(imo|mmsi|bol|bl|voyage|vessel|ship|container|port|company)\s*[:\-\s]\s*/i;

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(PREFIX_RE, "").trim();
}

/**
 * Classify a query.
 *
 * Identifier patterns are tested through the existing detector first;
 * anything it does not recognise is an MMSI or a name.
 */
export function detectQueryKind(normalized: string): CommandQueryKind {
  if (!normalized) return "empty";

  // `detectEntityType` returns `vessel` for everything it did not match,
  // so a non-vessel answer means one of its patterns genuinely hit.
  const detected = detectEntityType(normalized);
  if (detected === "imo") return "imo";
  if (detected === "container") return "container";
  if (detected === "bol") return "bol";
  if (detected === "voyage") return "voyage";

  if (MMSI_RE.test(normalized)) return "mmsi";
  return "free-text";
}

/**
 * Parse raw input into the query the rest of the pipeline works with.
 *
 * The whole of "query processing" that can be done without asking a
 * provider anything. Identity resolution, candidate search and ranking
 * all happen downstream against real data.
 */
export function parseCommandQuery(raw: string): CommandQuery {
  const normalized = normalizeQuery(raw);
  const kind = detectQueryKind(normalized);
  return {
    raw,
    normalized,
    kind,
    // MMSI has no route of its own; it is a vessel identifier, and the
    // dispatcher's vessel destination is the correct handoff for it.
    routeType: normalized ? detectEntityType(normalized) : "vessel",
  };
}
