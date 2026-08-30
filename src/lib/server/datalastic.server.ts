/**
 * Datalastic — server-side API client. Blocked from client bundles by
 * the `.server.ts` filename, which is what keeps the credential out of
 * the browser: this is the only module in the repository that reads
 * `DATALASTIC_API_KEY`, and it never returns it.
 *
 * ## Authentication
 *
 * `x-api-key: <secret>` header. The `?api-key=` query form documented by
 * Datalastic is not used: query strings end up in access logs, proxy
 * caches, and error messages, and a credential that travels in a URL is
 * a credential that leaks eventually.
 *
 * ## Nothing here fabricates, and nothing here throws
 *
 * Every method resolves with a {@link DatalasticResult}. A 402 is a
 * subscription statement, a 429 is a rate statement, a 200 with no rows
 * is an emptiness statement — three different answers that must never
 * collapse into "no vessels". The caller decides how to say it.
 *
 * ## Credits
 *
 * Datalastic bills per endpoint, and Location Traffic bills per vessel
 * returned. So: the cheapest endpoint that answers the question
 * (`/vessel`, one credit — never `/vessel_pro`), a clamped radius, and a
 * short in-process cache so five open Seaphore surfaces cost one call.
 */
import type {
  DatalasticAccount,
  DatalasticAreaQuery,
  DatalasticFindQuery,
  DatalasticHistoryPoint,
  DatalasticHistoryQuery,
  DatalasticMarineConditions,
  DatalasticResult,
  DatalasticStatus,
  DatalasticVesselIdentity,
  DatalasticVesselQuery,
  DatalasticVesselRecord,
  DatalasticVesselVoyage,
} from "@/connectors/datalastic/types";

import {
  datalasticGovernor,
  mayIssueRequest,
  recordFailure,
  recordRequestIssued,
  recordSuccess,
} from "./datalastic-governor";

const BASE_URL = "https://api.datalastic.com/api/v0";

/** Provider-documented ceiling is 600 req/min; we stay far below it. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Location Traffic bills per vessel found, so the radius is capped. */
/**
 * The provider's own ceiling for `/vessel_inradius`, in kilometres.
 *
 * Not a policy choice — Datalastic rejects anything larger with
 * `{"radius":"must be no greater than 50"}` and HTTP 400. This was 150,
 * so every area query the map made was refused before it reached the
 * fleet: the Nigerian EEZ box converts to a 493km circle, clamped to
 * 150, rejected, and reported as an unreachable provider. The map showed
 * an empty sea while the credential, the account and the data were all
 * fine.
 *
 * A single circle therefore covers 50km. Covering the whole EEZ needs
 * several, and that is a billing decision — this endpoint charges per
 * vessel found — so it is left to the caller rather than decided here.
 */
const MAX_RADIUS_KM = 50;

/** History bills per calendar date returned. */
const MAX_HISTORY_DAYS = 7;

/** Positions go stale fast; identity does not. Kept short and in-process. */
const CACHE_TTL_MS = {
  positions: 60_000,
  /*
   * Static particulars — tonnage, dimensions, year built.
   *
   * A day, because these change when a vessel is rebuilt, not while it is
   * being watched. The old ten minutes was set when this key held only
   * light identity fields and would now re-buy a refit-scale fact 144
   * times a day.
   */
  identity: 24 * 60 * 60_000,
  /** Voyage context: moves with the vessel, but far slower than position. */
  voyage: 5 * 60_000,
  /**
   * Identity search results.
   *
   * Ten minutes, not a day: a search is a question about the fleet as it
   * is now, and a vessel that has just entered the area should be findable
   * without waiting out a gazetteer-length cache.
   */
  search: 10 * 60_000,
  /** Ports move even more rarely than vessels are rebuilt. */
  gazetteer: 24 * 60 * 60_000,
  history: 10 * 60_000,
  /** Sea state moves, but not minute to minute. */
  weather: 30 * 60_000,
  stat: 5 * 60_000,
} as const;

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: DatalasticResult<unknown>;
}

const cache = new Map<string, CacheEntry>();

/** Test seam: drop every cached answer. */
export function clearDatalasticCache(): void {
  cache.clear();
}

/** Cumulative counters, for the provider-health surface. Never the key. */
export interface DatalasticUsage {
  requests: number;
  failures: number;
  cacheHits: number;
  lastStatus: DatalasticStatus | null;
  lastCheckedAt: string | null;
  /** Mirrored from `/stat`, so entitlement is observed rather than assumed. */
  account: DatalasticAccount | null;
}

const usage: DatalasticUsage = {
  requests: 0,
  failures: 0,
  cacheHits: 0,
  lastStatus: null,
  lastCheckedAt: null,
  account: null,
};

export function datalasticUsage(): DatalasticUsage {
  return { ...usage, account: usage.account ? { ...usage.account } : null };
}

/** Test seam: reset counters between cases. */
export function resetDatalasticUsage(): void {
  usage.requests = 0;
  usage.failures = 0;
  usage.cacheHits = 0;
  usage.lastStatus = null;
  usage.lastCheckedAt = null;
  usage.account = null;
}

function readKey(): string | null {
  // Read inside the boundary — env is injected per request on the edge.
  const key = process.env["DATALASTIC_API_KEY"];
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

function envelope<T>(
  endpoint: string,
  status: DatalasticStatus,
  partial: Partial<DatalasticResult<T>> = {},
): DatalasticResult<T> {
  return {
    status,
    data: partial.data ?? null,
    message: partial.message ?? null,
    endpoint,
    httpStatus: partial.httpStatus ?? null,
    latencyMs: partial.latencyMs ?? 0,
    retrievedAt: partial.retrievedAt ?? new Date().toISOString(),
    retryAfterSeconds: partial.retryAfterSeconds ?? null,
    cached: partial.cached ?? false,
  };
}

/**
 * Map an HTTP status to an honest provider state.
 *
 * Exported because the mapping is the load-bearing honesty rule of this
 * integration and is asserted directly by tests.
 */
export function datalasticStatusForHttp(httpStatus: number): DatalasticStatus {
  if (httpStatus === 401 || httpStatus === 403) return "unauthorized";
  if (httpStatus === 402) return "subscription-inactive";
  if (httpStatus === 404) return "empty";
  if (httpStatus === 429) return "rate-limited";
  /*
   * 400 is the provider answering, not failing to answer.
   *
   * Reporting a rejected request as "unavailable" sent an officer
   * looking for a network fault when the truth was that Seaphore had
   * asked for something the endpoint does not accept. The two need
   * different people to fix them, so they cannot share a status.
   */
  if (httpStatus === 400 || httpStatus === 422) return "request-rejected";
  return "unavailable";
}

function messageForStatus(status: DatalasticStatus, endpoint: string): string {
  switch (status) {
    case "credentials-missing":
      return "Datalastic is not configured. No AIS credential is present on the server.";
    case "unauthorized":
      return "Datalastic rejected the credential. AIS positions are unavailable until it is replaced.";
    case "subscription-inactive":
      return `Datalastic accepted the credential but the current plan does not include ${endpoint}. This is a subscription limit, not an empty sea.`;
    case "rate-limited":
      return "Datalastic rate limit reached. AIS positions will resume shortly.";
    case "request-rejected":
      return `Datalastic rejected the request to ${endpoint}. Seaphore asked for something the endpoint does not accept — a defect in the query, not a provider outage.`;
    case "unavailable":
      return "Datalastic is unreachable. Seaphore is not receiving AIS positions — this is a collection failure, not an absence of vessels.";
    case "empty":
      return "Datalastic holds no record matching this request.";
    case "ok":
      return "Datalastic responded.";
  }
}

interface RawResponse {
  readonly data?: unknown;
  readonly meta?: { readonly success?: boolean; readonly message?: string };
}

/**
 * One authenticated GET. Retries at most once, and only for conditions a
 * retry can fix (429 with a short Retry-After, or a network blip). No
 * loops: a provider asking us to slow down is not an invitation to spin.
 */
async function request<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  parse: (raw: RawResponse) => T | null,
  ttlMs: number,
  attempt = 0,
): Promise<DatalasticResult<T>> {
  const endpoint = `/api/v0/${path}`;

  /*
   * Checked before anything else, including the credential, so a blocked
   * provider costs nothing at all — no socket, no DNS lookup, and above
   * all no request the provider would still count against an allowance
   * that is already gone.
   */
  if (!mayIssueRequest()) {
    const snapshot = datalasticGovernor();
    const blocked = envelope<T>(
      endpoint,
      snapshot.state === "CREDIT_EXHAUSTED" ? "subscription-inactive" : "rate-limited",
      { message: snapshot.reason },
    );
    usage.lastStatus = blocked.status;
    usage.lastCheckedAt = blocked.retrievedAt;
    return blocked;
  }

  const key = readKey();
  if (!key) {
    const result = envelope<T>(endpoint, "credentials-missing", {
      message: messageForStatus("credentials-missing", endpoint),
    });
    usage.lastStatus = result.status;
    usage.lastCheckedAt = result.retrievedAt;
    return result;
  }

  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      search.set(name, String(value));
    }
  }
  // Cache key covers the request, never the credential.
  const cacheKey = `${path}?${search.toString()}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    usage.cacheHits += 1;
    return { ...(hit.value as DatalasticResult<T>), cached: true };
  }

  const started = Date.now();
  usage.requests += 1;
  recordRequestIssued();
  try {
    const response = await fetch(`${BASE_URL}/${path}?${search.toString()}`, {
      method: "GET",
      headers: { "x-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;

    if (!response.ok) {
      const status = datalasticStatusForHttp(response.status);
      // One retry, honouring Retry-After, and only when it is short.
      if (
        status === "rate-limited" &&
        attempt === 0 &&
        Number.isFinite(retryAfterSeconds) &&
        (retryAfterSeconds ?? 0) <= 5
      ) {
        await new Promise((resolve) => setTimeout(resolve, (retryAfterSeconds ?? 1) * 1000));
        return request(path, params, parse, ttlMs, attempt + 1);
      }
      usage.failures += status === "empty" ? 0 : 1;
      recordFailure({
        httpStatus: response.status,
        at: new Date().toISOString(),
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
      });
      const result = envelope<T>(endpoint, status, {
        httpStatus: response.status,
        latencyMs,
        message: messageForStatus(status, endpoint),
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
      });
      usage.lastStatus = status;
      usage.lastCheckedAt = result.retrievedAt;
      return result;
    }

    const raw = (await response.json()) as RawResponse;
    const parsed = parse(raw);
    const isEmpty =
      parsed === null || (Array.isArray(parsed) && (parsed as readonly unknown[]).length === 0);
    const status: DatalasticStatus = isEmpty ? "empty" : "ok";
    const result = envelope<T>(endpoint, status, {
      data: parsed,
      httpStatus: response.status,
      latencyMs,
      message: isEmpty ? messageForStatus("empty", endpoint) : null,
    });
    usage.lastStatus = status;
    usage.lastCheckedAt = result.retrievedAt;
    recordSuccess(result.retrievedAt);
    if (ttlMs > 0) cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value: result });
    return result;
  } catch (error) {
    usage.failures += 1;
    const result = envelope<T>(endpoint, "unavailable", {
      latencyMs: Date.now() - started,
      message: messageForStatus("unavailable", endpoint),
    });
    usage.lastStatus = "unavailable";
    usage.lastCheckedAt = result.retrievedAt;
    // A thrown request never reached the provider, so there is no status
    // to read — null tells the governor to treat it as an outage.
    recordFailure({ httpStatus: null, at: result.retrievedAt });
    // Logged without the credential; the URL is never logged.
    console.error("[datalastic] request failed", {
      endpoint,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return result;
  }
}

/* ── Parsers ─────────────────────────────────────────────────────────── */

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Provider timestamp, normalised to ISO — never substituted with now.
 *
 * Datalastic reports `last_position_UTC` (and, on some endpoints,
 * `last_position_epoch`). Both are the provider's claim about when the
 * position was seen. If neither is present the position has no time, and
 * a position with no time is not a current position.
 */
function providerTimestamp(row: Record<string, unknown>): string | null {
  const iso = str(row["last_position_UTC"]) ?? str(row["timestamp"]) ?? str(row["last_position"]);
  if (iso) {
    const parsed = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const epoch = num(row["last_position_epoch"]) ?? num(row["epoch"]);
  if (epoch !== null) return new Date(epoch * 1000).toISOString();
  return null;
}

export function parseVesselRow(input: unknown): DatalasticVesselRecord | null {
  if (typeof input !== "object" || input === null) return null;
  const row = input as Record<string, unknown>;
  return {
    uuid: str(row["uuid"]),
    imo: str(row["imo"]),
    mmsi: str(row["mmsi"]),
    name: str(row["name"]),
    callSign: str(row["callsign"]) ?? str(row["call_sign"]),
    flag: str(row["country_iso"]) ?? str(row["flag"]),
    type: str(row["type_specific"]) ?? str(row["type"]),
    lat: num(row["lat"]),
    lon: num(row["lon"]),
    speed: num(row["speed"]),
    course: num(row["course"]),
    heading: num(row["heading"]),
    destination: str(row["destination"]),
    eta: str(row["eta"]),
    observedAt: providerTimestamp(row),
    navigationStatus: str(row["navigation_status"]),
  };
}

/**
 * An epoch-or-ISO pair, as the provider gives its times.
 *
 * `vessel_pro` reports each time twice — `*_UTC` and `*_epoch`. The ISO
 * form is preferred because it carries its own zone; the epoch is the
 * fallback for the rows where the ISO string is absent. A null means the
 * provider gave no time, and is never filled in with the current one.
 */
function providerTime(
  row: Record<string, unknown>,
  isoKey: string,
  epochKey: string,
): string | null {
  const iso = str(row[isoKey]);
  if (iso) {
    const parsed = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const epoch = num(row[epochKey]);
  if (epoch !== null && epoch > 0) return new Date(epoch * 1000).toISOString();
  return null;
}

export function parseVesselIdentity(input: unknown): DatalasticVesselIdentity | null {
  if (typeof input !== "object" || input === null) return null;
  const row = input as Record<string, unknown>;
  // Identity is worthless without something to key it to.
  if (!str(row["imo"]) && !str(row["mmsi"]) && !str(row["uuid"])) return null;
  const navaid = row["is_navaid"];
  return {
    uuid: str(row["uuid"]),
    imo: str(row["imo"]),
    mmsi: str(row["mmsi"]),
    name: str(row["name"]),
    nameAis: str(row["name_ais"]),
    callSign: str(row["callsign"]),
    flag: str(row["country_iso"]),
    flagName: str(row["country_name"]),
    type: str(row["type"]),
    typeSpecific: str(row["type_specific"]),
    grossTonnage: num(row["gross_tonnage"]),
    deadweight: num(row["deadweight"]),
    teu: num(row["teu"]),
    liquidGas: num(row["liquid_gas"]),
    length: num(row["length"]),
    breadth: num(row["breadth"]),
    draughtAvg: num(row["draught_avg"]),
    draughtMax: num(row["draught_max"]),
    speedAvg: num(row["speed_avg"]),
    speedMax: num(row["speed_max"]),
    yearBuilt: num(row["year_built"]),
    homePort: str(row["home_port"]),
    isNavaid: typeof navaid === "boolean" ? navaid : null,
  };
}

export function parseVesselVoyage(input: unknown): DatalasticVesselVoyage | null {
  if (typeof input !== "object" || input === null) return null;
  const row = input as Record<string, unknown>;
  if (!str(row["imo"]) && !str(row["mmsi"]) && !str(row["uuid"])) return null;
  return {
    uuid: str(row["uuid"]),
    imo: str(row["imo"]),
    mmsi: str(row["mmsi"]),
    currentDraught: num(row["current_draught"]),
    navigationStatus: str(row["navigation_status"]),
    destination: str(row["destination"]),
    destinationPort: str(row["dest_port"]),
    destinationPortUnlocode: str(row["dest_port_unlocode"]),
    destinationPortUuid: str(row["dest_port_uuid"]),
    departurePort: str(row["dep_port"]),
    departurePortUnlocode: str(row["dep_port_unlocode"]),
    departurePortUuid: str(row["dep_port_uuid"]),
    departedAt: providerTime(row, "atd_UTC", "atd_epoch"),
    eta: providerTime(row, "eta_UTC", "eta_epoch"),
    observedAt: providerTimestamp(row),
  };
}

/**
 * Rows from a list endpoint.
 *
 * `requirePosition` is the difference between traffic and identity:
 * `/vessel_inradius` answers with positions and a row without one is
 * unusable, while `/vessel_find` is an identity search whose rows carry
 * no coordinates at all. Filtering on position there would return an
 * empty search for a provider that answered with matches.
 */
function parseVesselListWith(
  raw: RawResponse,
  requirePosition: boolean,
): readonly DatalasticVesselRecord[] | null {
  const container = raw.data;
  const rows = Array.isArray(container)
    ? container
    : typeof container === "object" && container !== null
      ? ((container as Record<string, unknown>)["vessels"] as unknown)
      : null;
  if (!Array.isArray(rows)) return null;
  return rows
    .map(parseVesselRow)
    .filter(
      (row): row is DatalasticVesselRecord =>
        row !== null && (!requirePosition || row.lat !== null),
    );
}

function parseVesselList(raw: RawResponse): readonly DatalasticVesselRecord[] | null {
  return parseVesselListWith(raw, true);
}

/* ── Client ──────────────────────────────────────────────────────────── */

/**
 * `/stat` — free, does not deduct credits.
 *
 * Called sparingly (five-minute cache) and used as the account's own
 * statement about entitlement, so Seaphore never claims an add-on the
 * key does not actually carry.
 */
export async function getStat(): Promise<DatalasticResult<DatalasticAccount>> {
  const result = await request<DatalasticAccount>(
    "stat",
    {},
    (raw) => {
      const data = raw.data as Record<string, unknown> | undefined;
      if (!data) return null;
      return {
        keyStatus: str(data["key_status"]) ?? "Unknown",
        requestsMade: num(data["requests_made"]),
        requestsRemaining: num(data["requests_remaining"]),
        addonsAvailable: data["addons"] === true,
      };
    },
    CACHE_TTL_MS.stat,
  );
  if (result.data) usage.account = result.data;
  return result;
}

/** `/vessel` — Basic, one credit. Never `/vessel_pro`: Basic answers this. */
export async function getVessel(
  query: DatalasticVesselQuery,
): Promise<DatalasticResult<DatalasticVesselRecord>> {
  return request<DatalasticVesselRecord>(
    "vessel",
    // IMO preferred, then MMSI, then provider uuid — canonical order.
    query.imo ? { imo: query.imo } : query.mmsi ? { mmsi: query.mmsi } : { uuid: query.uuid ?? "" },
    (raw) => parseVesselRow(raw.data),
    CACHE_TTL_MS.positions,
  );
}

/**
 * Parse `/weather`.
 *
 * The provider nests the reading under `weather.current` and echoes the
 * point it actually answered for, which it rounds to its own grid. Both are
 * kept: an officer comparing two vessels a mile apart should see that the
 * same reading was returned for both rather than assume two observations.
 */
export function parseMarineConditions(input: unknown): DatalasticMarineConditions | null {
  if (typeof input !== "object" || input === null) return null;
  const row = input as Record<string, unknown>;
  const weather = row["weather"];
  if (typeof weather !== "object" || weather === null) return null;
  const w = weather as Record<string, unknown>;
  const current = w["current"];
  if (typeof current !== "object" || current === null) return null;
  const c = current as Record<string, unknown>;

  /*
   * The provider gives a local wall-clock string with no zone and a
   * separate `utc_offset_seconds`. Reading it as UTC when it is not would
   * mis-age every observation, so the offset is applied rather than
   * assumed away.
   */
  const time = str(c["time"]);
  const offsetSec = num(w["utc_offset_seconds"]) ?? 0;
  let observedAt: string | null = null;
  if (time) {
    const parsed = Date.parse(time.includes("Z") ? time : `${time}Z`);
    if (Number.isFinite(parsed)) observedAt = new Date(parsed - offsetSec * 1000).toISOString();
  }

  return {
    lat: num(w["latitude"]),
    lon: num(w["longitude"]),
    observedAt,
    temperatureC: num(c["temperature_2m"]),
    windSpeedKph: num(c["wind_speed_10m"]),
    windDirectionDeg: num(c["wind_direction_10m"]),
    windGustsKph: num(c["wind_gusts_10m"]),
    waveHeightM: num(c["wave_height"]),
    waveDirectionDeg: num(c["wave_direction"]),
    wavePeriodS: num(c["wave_period"]),
    visibilityM: num(c["visibility"]),
    pressureHpa: num(c["pressure_msl"]),
    cloudCoverPct: num(c["cloud_cover"]),
    humidityPct: num(c["relative_humidity_2m"]),
  };
}

/**
 * Identify a vessel by whichever key the caller has.
 *
 * IMO first because it survives reflagging and renaming, then MMSI, then
 * the provider's own uuid. Same order everywhere so two surfaces asking
 * about one vessel produce one cache key rather than three.
 */
function identityParams(query: DatalasticVesselQuery): Record<string, string> {
  if (query.imo) return { imo: query.imo };
  if (query.mmsi) return { mmsi: query.mmsi };
  return { uuid: query.uuid ?? "" };
}

/**
 * `/vessel_info` — static particulars for one vessel.
 *
 * Tonnage, dimensions, year built, home port. Cached for a day: these
 * change on the scale of a refit, and paying for them again on every
 * selection would be buying the same answer.
 */
export async function getVesselIdentity(
  query: DatalasticVesselQuery,
): Promise<DatalasticResult<DatalasticVesselIdentity>> {
  return request<DatalasticVesselIdentity>(
    "vessel_info",
    identityParams(query),
    (raw) => parseVesselIdentity(raw.data),
    CACHE_TTL_MS.identity,
  );
}

/**
 * `/vessel_pro` — live voyage context for one vessel.
 *
 * Departure and destination ports with UNLOCODEs, actual departure time,
 * ETA, current draught, navigation status. Loaded when an officer selects
 * a vessel, never for the whole map: it is one request per vessel, and a
 * map holds hundreds.
 */
export async function getVesselVoyage(
  query: DatalasticVesselQuery,
): Promise<DatalasticResult<DatalasticVesselVoyage>> {
  return request<DatalasticVesselVoyage>(
    "vessel_pro",
    identityParams(query),
    (raw) => parseVesselVoyage(raw.data),
    CACHE_TTL_MS.voyage,
  );
}

/**
 * How coarsely a weather request is rounded before it is issued.
 *
 * Roughly eleven kilometres. Sea state does not change meaningfully across
 * that distance, and without it every selected vessel would be a distinct
 * cache key: four hundred vessels in one anchorage would become four
 * hundred paid requests for the same patch of water. Rounding collapses
 * them onto one.
 */
const WEATHER_GRID_DEGREES = 0.1;

/** Snap to the shared grid, so neighbours reuse one answer. */
function weatherGrid(value: number): number {
  return Math.round(value / WEATHER_GRID_DEGREES) * WEATHER_GRID_DEGREES;
}

/**
 * `/weather` — marine conditions at a point.
 *
 * Rounded to a grid before the request is made, not after, so the cache key
 * and the request agree and neighbouring vessels genuinely share one call.
 */
export async function getMarineWeather(query: {
  lat: number;
  lon: number;
}): Promise<DatalasticResult<DatalasticMarineConditions>> {
  const lat = weatherGrid(query.lat);
  const lon = weatherGrid(query.lon);
  return request<DatalasticMarineConditions>(
    "weather",
    { lat, lon },
    (raw) => parseMarineConditions(raw.data),
    CACHE_TTL_MS.weather,
  );
}

/**
 * `/vessel_inradius` — Location Traffic. Bills per vessel found.
 *
 * The provider's area endpoint is centre+radius and is named
 * `vessel_inradius`; `vessel_inarea` does not exist (it answers 404,
 * which this client would have reported as an empty sea).
 */
export async function getLocationTraffic(
  query: DatalasticAreaQuery,
): Promise<DatalasticResult<readonly DatalasticVesselRecord[]>> {
  const radius = Math.min(Math.max(query.radiusKm, 1), MAX_RADIUS_KM);
  return request<readonly DatalasticVesselRecord[]>(
    "vessel_inradius",
    { lat: query.lat, lon: query.lon, radius },
    parseVesselList,
    CACHE_TTL_MS.positions,
  );
}

/** `/vessel_find` — Vessel Finder. Bills per vessel found. */
export async function findVessels(
  query: DatalasticFindQuery,
): Promise<DatalasticResult<readonly DatalasticVesselRecord[]>> {
  return request<readonly DatalasticVesselRecord[]>(
    "vessel_find",
    {
      name: query.name,
      imo: query.imo,
      mmsi: query.mmsi,
      callsign: query.callSign,
      country_iso: query.countryIso,
      fuzzy: query.name ? 1 : undefined,
    },
    // Identity search: rows carry no position, so none is required.
    (raw) => parseVesselListWith(raw, false) ?? [],

    CACHE_TTL_MS.search,
  );
}

/** `/vessel_history` — bills per calendar date returned, so days is clamped. */
export async function getVesselHistory(
  query: DatalasticHistoryQuery,
): Promise<DatalasticResult<readonly DatalasticHistoryPoint[]>> {
  const days = Math.min(Math.max(Math.round(query.days), 1), MAX_HISTORY_DAYS);
  return request<readonly DatalasticHistoryPoint[]>(
    "vessel_history",
    {
      days,
      ...(query.imo
        ? { imo: query.imo }
        : query.mmsi
          ? { mmsi: query.mmsi }
          : { uuid: query.uuid ?? "" }),
    },
    (raw) => {
      const container = raw.data;
      const rows = Array.isArray(container)
        ? container
        : typeof container === "object" && container !== null
          ? ((container as Record<string, unknown>)["positions"] as unknown)
          : null;
      if (!Array.isArray(rows)) return null;
      const points: DatalasticHistoryPoint[] = [];
      for (const entry of rows) {
        if (typeof entry !== "object" || entry === null) continue;
        const row = entry as Record<string, unknown>;
        const lat = num(row["lat"]);
        const lon = num(row["lon"]);
        const observedAt = providerTimestamp(row);
        // A point with no provider time is not admitted: we will not
        // stamp a historical position with a time nobody reported.
        if (lat === null || lon === null || observedAt === null) continue;
        points.push({
          lat,
          lon,
          speed: num(row["speed"]),
          course: num(row["course"]),
          heading: num(row["heading"]),
          observedAt,
        });
      }
      return points.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    },
    CACHE_TTL_MS.history,
  );
}

/** `/port_find` — port identity only. Never replaces NPA as the authority. */
export async function findPorts(
  countryIso: string,
): Promise<DatalasticResult<readonly Record<string, unknown>[]>> {
  return request<readonly Record<string, unknown>[]>(
    "port_find",
    { country_iso: countryIso },
    (raw) => {
      const container = raw.data;
      const rows = Array.isArray(container)
        ? container
        : typeof container === "object" && container !== null
          ? ((container as Record<string, unknown>)["ports"] as unknown)
          : null;
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : null;
    },
    CACHE_TTL_MS.gazetteer,
  );
}
