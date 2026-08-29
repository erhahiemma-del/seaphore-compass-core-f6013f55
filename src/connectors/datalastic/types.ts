/**
 * Datalastic — connector types.
 *
 * Shared between the server-side client and the browser-side vessel
 * source. Deliberately provider-shaped on the way in and canonical on
 * the way out: nothing in this file is rendered directly.
 *
 * ## Why the status vocabulary is this wide
 *
 * A commercial AIS provider fails in ways a free one does not, and each
 * failure means something different operationally:
 *
 * - `unauthorized` — the key is wrong. Seaphore's problem.
 * - `subscription-inactive` — the key is valid but the plan does not
 *   cover this endpoint (Datalastic answers HTTP 402). Nothing about the
 *   sea, nothing about the code: a commercial entitlement.
 * - `rate-limited` — too many requests. Transient, retry later.
 * - `unavailable` — provider 5xx, timeout, or network failure.
 * - `empty` — the request was valid and the provider holds no record.
 *
 * Collapsing any of these into "no vessels" would present a billing or
 * network condition as an empty sea, which is the single most dangerous
 * mistake this integration could make.
 */

/** Outcome of one Datalastic request. */
export type DatalasticStatus =
  | "ok"
  | "empty"
  | "credentials-missing"
  | "unauthorized"
  | "subscription-inactive"
  | "rate-limited"
  /**
   * The provider answered and refused the request.
   *
   * Distinct from `unavailable`, which means it never answered. A
   * rejected request is Seaphore's defect to fix; an unreachable
   * provider is not, and one reported as the other sends the wrong
   * person looking in the wrong place.
   */
  | "request-rejected"
  | "unavailable";

/** Provider-reported position, already flattened from the upstream row. */
export interface DatalasticVesselRecord {
  readonly uuid: string | null;
  readonly imo: string | null;
  readonly mmsi: string | null;
  readonly name: string | null;
  readonly callSign: string | null;
  readonly flag: string | null;
  /** Provider vessel type string, e.g. `"Cargo"`. Not yet canonical. */
  readonly type: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  /** Speed over ground, knots. */
  readonly speed: number | null;
  /** Course over ground, degrees. Null when the provider reported none. */
  readonly course: number | null;
  /** Heading, degrees. Null when the provider reported none. */
  readonly heading: number | null;
  readonly destination: string | null;
  /** ISO-8601 as reported by the provider, or null. */
  readonly eta: string | null;
  /**
   * Provider's own timestamp for the position.
   *
   * Never replaced with "now". A null here means the provider gave no
   * time, which makes the position unusable rather than current.
   */
  readonly observedAt: string | null;
  readonly navigationStatus: string | null;
}

/** One historical position. */
export interface DatalasticHistoryPoint {
  readonly lat: number;
  readonly lon: number;
  readonly speed: number | null;
  readonly course: number | null;
  readonly heading: number | null;
  readonly observedAt: string;
}

/** Envelope every Datalastic call resolves with. Never throws upward. */
export interface DatalasticResult<T> {
  readonly status: DatalasticStatus;
  readonly data: T | null;
  /** Officer-facing sentence. Never contains the credential or a URL key. */
  readonly message: string | null;
  /** Endpoint path, for diagnostics. Contains no credential. */
  readonly endpoint: string;
  readonly httpStatus: number | null;
  readonly latencyMs: number;
  /** When Seaphore retrieved it. */
  readonly retrievedAt: string;
  /** Seconds the provider asked us to wait, when it said so. */
  readonly retryAfterSeconds: number | null;
  /** Whether this answer came from the server-side cache. */
  readonly cached: boolean;
}

/** Account posture, from the free `/stat` endpoint. */
export interface DatalasticAccount {
  readonly keyStatus: string;
  readonly requestsMade: number | null;
  readonly requestsRemaining: number | null;
  /** Whether paid add-ons (ownership, inspections, …) are on the account. */
  readonly addonsAvailable: boolean;
}

/** Area query, expressed the way Datalastic bills it: centre plus radius. */
export interface DatalasticAreaQuery {
  readonly lat: number;
  readonly lon: number;
  /** Kilometres. Clamped server-side — Location Traffic bills per vessel. */
  readonly radiusKm: number;
  readonly limit?: number;
}

/** Vessel lookup. Exactly one identifier is honoured, IMO first. */
export interface DatalasticVesselQuery {
  readonly imo?: string;
  readonly mmsi?: string;
  readonly uuid?: string;
}

/** Search query. At least one field required. */
export interface DatalasticFindQuery {
  readonly name?: string;
  readonly imo?: string;
  readonly mmsi?: string;
  readonly callSign?: string;
  readonly countryIso?: string;
  readonly limit?: number;
}

/** History query. Datalastic bills per calendar date returned. */
export interface DatalasticHistoryQuery extends DatalasticVesselQuery {
  /** Calendar days back. Clamped to keep credit cost predictable. */
  readonly days: number;
}
