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
  DatalasticResult,
  DatalasticStatus,
  DatalasticVesselQuery,
  DatalasticVesselRecord,
} from "@/connectors/datalastic/types";

const BASE_URL = "https://api.datalastic.com/api/v0";

/** Provider-documented ceiling is 600 req/min; we stay far below it. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Location Traffic bills per vessel found, so the radius is capped. */
const MAX_RADIUS_KM = 150;

/** History bills per calendar date returned. */
const MAX_HISTORY_DAYS = 7;

/** Positions go stale fast; identity does not. Kept short and in-process. */
const CACHE_TTL_MS = {
  positions: 60_000,
  identity: 10 * 60_000,
  history: 10 * 60_000,
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

    CACHE_TTL_MS.identity,
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
    CACHE_TTL_MS.identity,
  );
}
