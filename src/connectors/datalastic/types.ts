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

/**
 * Static vessel particulars, from `vessel_info`.
 *
 * Deliberately separate from `DatalasticVesselRecord` rather than folded
 * into it. The record is what every vessel on the map carries, and the map
 * may hold hundreds; this is bought once for the one vessel an officer
 * selected. Merging them would either make the map pay for particulars it
 * never shows, or leave the same interface half-populated in most of its
 * uses, so that a null could mean either "not loaded yet" or "the provider
 * has no value" — the ambiguity provenance exists to prevent.
 *
 * These change on the scale of a refit, so they cache for a day.
 */
export interface DatalasticVesselIdentity {
  readonly uuid: string | null;
  readonly imo: string | null;
  readonly mmsi: string | null;
  readonly name: string | null;
  /** The name transmitted over AIS, which can differ from the registered one. */
  readonly nameAis: string | null;
  readonly callSign: string | null;
  readonly flag: string | null;
  readonly flagName: string | null;
  readonly type: string | null;
  readonly typeSpecific: string | null;
  readonly grossTonnage: number | null;
  readonly deadweight: number | null;
  /** Container capacity, where the vessel carries containers. */
  readonly teu: number | null;
  readonly liquidGas: number | null;
  /** Metres. */
  readonly length: number | null;
  /** Metres. */
  readonly breadth: number | null;
  readonly draughtAvg: number | null;
  readonly draughtMax: number | null;
  /** Knots, provider-observed averages rather than design figures. */
  readonly speedAvg: number | null;
  readonly speedMax: number | null;
  readonly yearBuilt: number | null;
  readonly homePort: string | null;
  /** True for a navigation aid rather than a ship. */
  readonly isNavaid: boolean | null;
}

/**
 * Live voyage context, from `vessel_pro`.
 *
 * The provider's own account of where this vessel came from, where it says
 * it is going, and how it is loaded. Everything here is declared by the
 * vessel or resolved by the provider — none of it is inferred by Seaphore,
 * and the distinction has to survive into the drawer.
 */
export interface DatalasticVesselVoyage {
  readonly uuid: string | null;
  readonly imo: string | null;
  readonly mmsi: string | null;
  /**
   * Metres of draught right now.
   *
   * Operationally the most informative number here: a draught well below
   * the vessel's maximum means it is riding light, and a change across two
   * observations at a berth is loading or discharging.
   */
  readonly currentDraught: number | null;
  readonly navigationStatus: string | null;
  /** Free-text destination as broadcast — often abbreviated or stale. */
  readonly destination: string | null;
  /** Provider-resolved destination port, which the free text may not match. */
  readonly destinationPort: string | null;
  readonly destinationPortUnlocode: string | null;
  /** Provider port id, the join key to `port_find`. */
  readonly destinationPortUuid: string | null;
  readonly departurePort: string | null;
  readonly departurePortUnlocode: string | null;
  readonly departurePortUuid: string | null;
  /** Actual time of departure, provider-reported ISO-8601. */
  readonly departedAt: string | null;
  readonly eta: string | null;
  readonly observedAt: string | null;
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

/**
 * Marine conditions at a point, from `/weather`.
 *
 * Sea state rather than a forecast: wave height, period and direction are
 * what decide whether a small craft can work an anchorage, and they are
 * the reason this is worth a request at all. Air temperature is included
 * because the provider returns it, not because it drives anything.
 *
 * Every field is optional because the provider omits what it has no
 * reading for, and an omitted swell must not arrive as a calm sea.
 */
export interface DatalasticMarineConditions {
  /** The point the provider actually answered for, which it may round. */
  readonly lat: number | null;
  readonly lon: number | null;
  /** Provider's own observation time, ISO-8601. Never substituted. */
  readonly observedAt: string | null;
  readonly temperatureC: number | null;
  readonly windSpeedKph: number | null;
  readonly windDirectionDeg: number | null;
  readonly windGustsKph: number | null;
  /** Metres. */
  readonly waveHeightM: number | null;
  readonly waveDirectionDeg: number | null;
  /** Seconds. */
  readonly wavePeriodS: number | null;
  /** Metres. Visibility as reported; the provider gives metres, not miles. */
  readonly visibilityM: number | null;
  /** Hectopascals at mean sea level. */
  readonly pressureHpa: number | null;
  /** Percentage. */
  readonly cloudCoverPct: number | null;
  readonly humidityPct: number | null;
}
