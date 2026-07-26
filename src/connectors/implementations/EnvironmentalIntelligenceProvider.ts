/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-02 — Environmental Intelligence Provider (EIP)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  The platform's SINGLE environmental evidence source.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *
 *    Officer Query → IAL → EnvironmentalIntelligenceProvider
 *      → EvidencePackage → IFE → Canonical UIP → Workspace → OKL
 *      → OIE → MIBC
 *
 *  DESIGN PRINCIPLE
 *  ----------------
 *  Environmental Intelligence is EVIDENCE, not reasoning.
 *  The provider ACQUIRES observations. The OIE INTERPRETS them.
 *
 *  This provider therefore never computes CALM / ROUGH / SAFE / UNSAFE /
 *  LOW RISK / HIGH RISK, never scores severity, and never forecasts.
 *  It returns measured values with their units, their observation time,
 *  their source, and a completeness-based acquisition confidence.
 *
 *  MULTI-SOURCE ARCHITECTURE
 *  -------------------------
 *  Environmental sources are ADAPTERS behind one provider:
 *
 *      EnvironmentalIntelligenceProvider
 *        ├─ OpenMeteoMarineAdapter        (Source 1 — implemented)
 *        ├─ NOAA adapter                  (future)
 *        ├─ Copernicus / ECMWF adapter    (future)
 *        ├─ Tide / ocean-current adapter  (future)
 *        └─ Storm / cyclone / flood feeds (future)
 *
 *  Adapters return the SAME `EnvironmentalObservation` shape, so the rest
 *  of Seaphore never learns which environmental source supplied a value.
 *  Adding a source = adding an adapter to `sources`. No IAL change, no
 *  IFE change, no registry change, no cache change.
 *
 *  REUSED FRAMEWORK (nothing new introduced)
 *    • `Connector` contract   (src/services/ial/connectors/base.ts)
 *    • `EvidenceCache`        (src/services/ial/cache.ts)      — TTL 1h
 *    • `normalizeRecord`      (src/services/ial/normalizer.ts)
 *    • `validateRecords`      (src/services/ial/validator.ts)
 *    • `stableHash`           (src/services/ial/hash.ts)
 *    • Provider Resolver metadata (`provider` block below)
 *
 *  NEVER: persist to the database · resolve identities · remove
 *         duplicates · score risk · merge investigations · create the
 *         canonical intelligence package · create reports · trigger
 *         workflows. This file has no database imports whatsoever.
 * ─────────────────────────────────────────────────────────────────────
 */
import { EvidenceCache } from "@/services/ial/cache";
import { stableHash } from "@/services/ial/hash";
import { normalizeRecord } from "@/services/ial/normalizer";
import { validateRecords } from "@/services/ial/validator";
import type { Connector, ConnectorCapability } from "@/services/ial/connectors/base";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  EvidenceFieldValue,
  NormalizedEvidence,
} from "@/services/ial/types";

// ───────────────────────────────────────────────────────────────────
//  SECTION 1: METADATA
// ───────────────────────────────────────────────────────────────────

export const ENVIRONMENTAL_INTELLIGENCE_METADATA = {
  id: "environmental-intelligence",
  name: "Environmental Intelligence",
  tier: 1,
  entityTypes: ["LOCATION", "PORT", "VESSEL"] as const,
  fieldCategories: ["ENVIRONMENTAL"] as const,
  updateFrequency: "hourly" as const,
  requiresAuth: false,
} as const;

/** Sprint EP-02 cache TTL — reuses the existing EvidenceCache. */
export const ENVIRONMENTAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DEFAULT_TIMEOUT_MS = 5_000;

// ───────────────────────────────────────────────────────────────────
//  SECTION 2: REQUEST / OBSERVATION MODEL (source-independent)
// ───────────────────────────────────────────────────────────────────

export interface EnvironmentalTimeRange {
  /** ISO 8601 UTC. */
  readonly from: string;
  /** ISO 8601 UTC. */
  readonly to: string;
}

export interface EnvironmentalRequest {
  readonly latitude: number;
  readonly longitude: number;
  /** UN/LOCODE or operational port code, when the officer named a port. */
  readonly portCode?: string;
  /** ISO 8601 UTC — the moment under investigation. Defaults to now. */
  readonly investigationTime?: string;
  /** Window of interest; the provider selects the observation inside it. */
  readonly timeRange?: EnvironmentalTimeRange;
  /** Where the vessel was, when the coordinates come from an AIS fix. */
  readonly vesselLocation?: { readonly latitude: number; readonly longitude: number };
  /** Bypass the 1h cache. */
  readonly forceRefresh?: boolean;
}

/**
 * The single normalized environmental measurement set. EVERY adapter —
 * Open-Meteo today, NOAA / Copernicus / tides tomorrow — returns this
 * exact shape. Absent measures are `null`; they are never inferred,
 * back-filled, or interpolated from another measure.
 */
export interface EnvironmentalObservation {
  readonly location: { readonly latitude: number; readonly longitude: number };
  /** ISO 8601 UTC — when the measurement was valid. */
  readonly observationTime: string;
  /** metres */
  readonly waveHeight: number | null;
  /** degrees true, 0–360 */
  readonly waveDirection: number | null;
  /** knots */
  readonly windSpeed: number | null;
  /** degrees true, 0–360 */
  readonly windDirection: number | null;
  /** metres */
  readonly visibility: number | null;
  /** degrees Celsius */
  readonly seaSurfaceTemperature: number | null;
  /** Human-readable source name, e.g. "Open-Meteo Marine". */
  readonly source: string;
  /** Acquisition confidence 0–1 (completeness + freshness). NOT risk. */
  readonly confidence: number;
  /** Verbatim provider payload, kept for the Evidence Explorer. */
  readonly rawPayload: Record<string, unknown>;
  /** Stable content hash over `rawPayload`. */
  readonly rawHash: string;
}

/** Canonical units for every environmental field. */
export const ENVIRONMENTAL_UNITS: Readonly<Record<string, string>> = Object.freeze({
  waveHeight: "m",
  waveDirection: "deg",
  windSpeed: "kn",
  windDirection: "deg",
  visibility: "m",
  seaSurfaceTemperature: "degC",
});

// ───────────────────────────────────────────────────────────────────
//  SECTION 3: SOURCE ADAPTER CONTRACT (the extension point)
// ───────────────────────────────────────────────────────────────────

export interface EnvironmentalAdapterContext {
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
  readonly now: () => number;
}

/**
 * An environmental data source. Future sources (NOAA, Copernicus, ECMWF,
 * storm advisories, ocean currents, tides, wave forecasts, cyclone
 * alerts, flood warnings, hazard feeds) implement THIS interface and are
 * appended to the provider's `sources` list. Nothing else changes.
 */
export interface EnvironmentalSourceAdapter {
  /** Stable adapter id, e.g. "open-meteo-marine". */
  readonly id: string;
  /** Officer-facing source name recorded on every observation. */
  readonly sourceName: string;
  /** Adapter self-selection (coverage area, licence, capability). */
  supports(request: EnvironmentalRequest): boolean;
  /** Acquire one observation, or null when the source has no data. */
  observe(
    request: EnvironmentalRequest,
    ctx: EnvironmentalAdapterContext,
  ): Promise<EnvironmentalObservation | null>;
}

// ───────────────────────────────────────────────────────────────────
//  SECTION 4: SOURCE 1 — OPEN-METEO MARINE ADAPTER
// ───────────────────────────────────────────────────────────────────

const OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const MARINE_VARS = ["wave_height", "wave_direction", "sea_surface_temperature"];
const ATMOSPHERIC_VARS = ["wind_speed_10m", "wind_direction_10m", "visibility"];

interface OpenMeteoHourly {
  time?: string[];
  [key: string]: unknown;
}

interface OpenMeteoResponse {
  hourly?: OpenMeteoHourly;
  hourly_units?: Record<string, string>;
  error?: boolean;
  reason?: string;
}

/**
 * Open-Meteo Marine — Source 1.
 *
 * Two endpoints are queried because Open-Meteo splits sea state (marine
 * API) from wind and visibility (forecast API). That split is an
 * Open-Meteo implementation detail and is hidden entirely inside this
 * adapter: the provider and everything above it see one observation.
 */
export class OpenMeteoMarineAdapter implements EnvironmentalSourceAdapter {
  readonly id = "open-meteo-marine";
  readonly sourceName = "Open-Meteo Marine";

  /** Global marine coverage; any valid coordinate is supported. */
  supports(_request: EnvironmentalRequest): boolean {
    return true;
  }

  async observe(
    request: EnvironmentalRequest,
    ctx: EnvironmentalAdapterContext,
  ): Promise<EnvironmentalObservation | null> {
    const targetMs = resolveTargetTime(request, ctx.now());

    const [marine, atmospheric] = await Promise.all([
      this.get(OPEN_METEO_MARINE_URL, MARINE_VARS, request, ctx),
      this.get(OPEN_METEO_FORECAST_URL, ATMOSPHERIC_VARS, request, ctx),
    ]);

    // Both endpoints empty → the source has nothing for this location.
    if (!marine && !atmospheric) return null;

    const marinePick = pickHour(marine, targetMs);
    const atmoPick = pickHour(atmospheric, targetMs);
    if (!marinePick && !atmoPick) return null;

    const observationTimeMs = marinePick?.timeMs ?? atmoPick?.timeMs ?? targetMs;

    const waveHeight = numberAt(marine, marinePick?.index, "wave_height");
    const waveDirection = degrees(numberAt(marine, marinePick?.index, "wave_direction"));
    const seaSurfaceTemperature = numberAt(
      marine,
      marinePick?.index,
      "sea_surface_temperature",
    );

    // Open-Meteo reports wind in km/h by default → convert to knots
    // (Seaphore-canonical unit). Unit conversion is normalization, not
    // interpretation.
    const windKmh = numberAt(atmospheric, atmoPick?.index, "wind_speed_10m");
    const windSpeed = windKmh == null ? null : round(windKmh / 1.852, 2);
    const windDirection = degrees(numberAt(atmospheric, atmoPick?.index, "wind_direction_10m"));
    const visibility = numberAt(atmospheric, atmoPick?.index, "visibility");

    const rawPayload: Record<string, unknown> = {
      adapter: this.id,
      requested: {
        latitude: request.latitude,
        longitude: request.longitude,
        investigationTime: request.investigationTime ?? null,
      },
      marine: marine ?? null,
      atmospheric: atmospheric ?? null,
    };

    const measured = [
      waveHeight,
      waveDirection,
      windSpeed,
      windDirection,
      visibility,
      seaSurfaceTemperature,
    ];

    return {
      location: { latitude: request.latitude, longitude: request.longitude },
      observationTime: new Date(observationTimeMs).toISOString(),
      waveHeight,
      waveDirection,
      windSpeed,
      windDirection,
      visibility,
      seaSurfaceTemperature,
      source: this.sourceName,
      confidence: acquisitionConfidence(measured, observationTimeMs, targetMs),
      rawPayload,
      rawHash: stableHash(rawPayload),
    };
  }

  private async get(
    base: string,
    variables: string[],
    request: EnvironmentalRequest,
    ctx: EnvironmentalAdapterContext,
  ): Promise<OpenMeteoResponse | null> {
    const url = new URL(base);
    url.searchParams.set("latitude", String(request.latitude));
    url.searchParams.set("longitude", String(request.longitude));
    url.searchParams.set("hourly", variables.join(","));
    url.searchParams.set("timezone", "UTC");
    if (request.timeRange) {
      url.searchParams.set("start_date", isoDay(request.timeRange.from));
      url.searchParams.set("end_date", isoDay(request.timeRange.to));
    }

    const res = await withTimeout(
      (signal) =>
        ctx.fetchImpl(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal,
        }),
      ctx.timeoutMs,
    );
    if (!res.ok) {
      throw new Error(`Open-Meteo returned ${res.status}`);
    }
    const body = (await res.json()) as OpenMeteoResponse;
    if (!body || typeof body !== "object") {
      throw new Error("Open-Meteo response body is not an object");
    }
    if (body.error) {
      throw new Error(`Open-Meteo error: ${body.reason ?? "unknown"}`);
    }
    return Array.isArray(body.hourly?.time) ? body : null;
  }
}

// ───────────────────────────────────────────────────────────────────
//  SECTION 5: THE PROVIDER
// ───────────────────────────────────────────────────────────────────

export interface EnvironmentalIntelligenceProviderOptions {
  /** Injectable fetch — tests pass a stub; production uses global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable cache — defaults to a provider-local 1h EvidenceCache. */
  readonly cache?: EvidenceCache;
  /** Injectable clock for deterministic cache-expiry tests. */
  readonly clock?: () => number;
  /** Per-request timeout. */
  readonly timeoutMs?: number;
  /** Ordered source adapters. Defaults to `[OpenMeteoMarineAdapter]`. */
  readonly sources?: ReadonlyArray<EnvironmentalSourceAdapter>;
}

export class EnvironmentalIntelligenceProvider implements Connector {
  readonly id: ConnectorId = ENVIRONMENTAL_INTELLIGENCE_METADATA.id;
  readonly displayName = ENVIRONMENTAL_INTELLIGENCE_METADATA.name;

  /** One capability only. Every environmental source feeds it. */
  readonly capabilities: ReadonlyArray<ConnectorCapability> = ["ENVIRONMENTAL_INTELLIGENCE"];

  /** Provider Resolver metadata (Sprint EP-01A) — unchanged mechanism. */
  readonly provider = {
    providerType: "LIVE" as const,
    priority: 100,
    environment: "both" as const,
    enabled: true,
  };

  /** Environmental evidence is location-bound. */
  readonly entityKinds = ["port", "vessel"] as const;

  /** Ordered environmental sources. Append adapters here — nothing else. */
  readonly sources: ReadonlyArray<EnvironmentalSourceAdapter>;

  private readonly fetchImpl: typeof fetch;
  private readonly cache: EvidenceCache;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private available = true;
  private authed = false;
  private lastError: string | null = null;
  private lastSuccessAt: string | null = null;
  private latencies: number[] = [];
  private calls = 0;
  private failures = 0;

  constructor(opts: EnvironmentalIntelligenceProviderOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.now = opts.clock ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sources = opts.sources ?? [new OpenMeteoMarineAdapter()];
    this.cache =
      opts.cache ??
      new EvidenceCache({ defaultTtlMs: ENVIRONMENTAL_CACHE_TTL_MS, clock: this.now });
  }

  // ─── lifecycle ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.available = await this.probe();
  }

  async authenticate(): Promise<boolean> {
    // Open-Meteo is keyless (requiresAuth: false); reachability is the
    // only meaningful auth signal.
    const ok = await this.probe();
    this.authed = ok;
    this.available = ok;
    return ok;
  }

  private async probe(): Promise<boolean> {
    try {
      const url = new URL(OPEN_METEO_MARINE_URL);
      url.searchParams.set("latitude", "0");
      url.searchParams.set("longitude", "0");
      url.searchParams.set("hourly", "wave_height");
      const res = await withTimeout(
        (signal) => this.fetchImpl(url.toString(), { method: "GET", signal }),
        this.timeoutMs,
      );
      const ok = res.status === 200;
      this.lastError = ok ? null : `health probe returned ${res.status}`;
      return ok;
    } catch (err) {
      this.lastError = describe(err);
      return false;
    }
  }

  // ─── acquire(): the environmental entry point ─────────────────────

  /**
   * Acquire → normalize → validate → cache → return.
   *
   * Non-throwing: coordinate validation failures, timeouts, empty
   * responses, and provider errors all surface as a failed
   * `ConnectorResult` with an explanatory `error`. Absent evidence is
   * reported as absent; it is never fabricated.
   */
  async acquire(request: EnvironmentalRequest): Promise<ConnectorResult> {
    const started = this.now();

    // 1 — validate the request BEFORE any network call.
    const invalid = validateRequest(request);
    if (invalid) return this.fail(invalid, started);

    // 2 — cache (1h TTL, existing EvidenceCache).
    const key = this.cacheKey(request);
    if (!request.forceRefresh) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }

    // 3 — acquire from the first supporting source that returns data.
    //     Sources are tried in order; results are never merged across
    //     sources (that is fusion, and fusion belongs to the IFE).
    let observation: EnvironmentalObservation | null = null;
    const errors: string[] = [];
    for (const source of this.sources) {
      if (!source.supports(request)) continue;
      try {
        observation = await source.observe(request, {
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs,
          now: this.now,
        });
      } catch (err) {
        errors.push(`${source.id}: ${describe(err)}`);
        continue;
      }
      if (observation) break;
    }

    if (!observation) {
      if (errors.length > 0) return this.fail(errors.join("; "), started);
      // Empty response — a clean, successful, EMPTY package.
      const empty: ConnectorResult = {
        connectorId: this.id,
        ok: true,
        records: [],
        latencyMs: this.elapsed(started),
      };
      this.record(true, empty.latencyMs);
      return empty;
    }

    // 4 — normalize into a single Environmental Evidence entity.
    const record = this.toEvidence(observation, request);

    // 5 — validate with the existing framework validator (flags, never drops).
    validateRecords([record]);

    const result: ConnectorResult = {
      connectorId: this.id,
      ok: true,
      records: [record],
      latencyMs: this.elapsed(started),
    };

    // 6 — cache for 1 hour.
    this.cache.set(key, result, ENVIRONMENTAL_CACHE_TTL_MS);
    this.record(true, result.latencyMs);
    return result;
  }

  // ─── Connector contract ───────────────────────────────────────────

  async search(query: AcquisitionQuery): Promise<ConnectorResult> {
    const request = requestFromQuery(query);
    if (!request) {
      return {
        connectorId: this.id,
        ok: false,
        records: [],
        error: "no coordinates in query — environmental evidence is location-bound",
        latencyMs: 0,
      };
    }
    return this.acquire(request);
  }

  async lookup(query: AcquisitionQuery): Promise<ConnectorResult> {
    return this.search(query);
  }

  /** Normalization ONLY — no enrichment, no merging, no duplicate removal. */
  normalize(raw: unknown, query: AcquisitionQuery): NormalizedEvidence | null {
    const observation = raw as EnvironmentalObservation | null;
    if (!observation || typeof observation !== "object") return null;
    if (!observation.location || !observation.observationTime) return null;
    return this.toEvidence(observation, requestFromQuery(query) ?? {
      latitude: observation.location.latitude,
      longitude: observation.location.longitude,
    });
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.id,
      available: this.available,
      authenticated: this.authed,
      latencyMsP50: p50(this.latencies),
      failureRate: this.calls === 0 ? 0 : this.failures / this.calls,
      quotaRemaining: null,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  // ─── internals ────────────────────────────────────────────────────

  /**
   * One observation → one Environmental Evidence record.
   *
   * `condition` is deliberately the literal string "OBSERVED": the
   * evidence model requires a condition marker for `kind: "weather"`,
   * and this provider refuses to characterise the sea state. CALM /
   * ROUGH / SAFE / UNSAFE are OIE interpretations, never acquisition
   * output.
   */
  private toEvidence(
    observation: EnvironmentalObservation,
    request: EnvironmentalRequest,
  ): NormalizedEvidence {
    const { latitude, longitude } = observation.location;
    const nativeId =
      request.portCode?.trim() || `${round(latitude, 4)},${round(longitude, 4)}`;

    const fields: Record<string, EvidenceFieldValue> = {
      condition: "OBSERVED",
      latitude,
      longitude,
      location: `${round(latitude, 4)},${round(longitude, 4)}`,
      portCode: request.portCode ?? null,
      observationTime: observation.observationTime,
      waveHeight: observation.waveHeight,
      waveDirection: observation.waveDirection,
      windSpeed: observation.windSpeed,
      windDirection: observation.windDirection,
      visibility: observation.visibility,
      seaSurfaceTemperature: observation.seaSurfaceTemperature,
      source: observation.source,
      confidence: observation.confidence,
      rawHash: observation.rawHash,
    };

    const record = normalizeRecord({
      source: this.id,
      sourceName: ENVIRONMENTAL_INTELLIGENCE_METADATA.name,
      grade: "OBSERVED",
      entity: {
        kind: "port",
        nativeId,
        label: request.portCode ?? `Position ${fields.location}`,
      },
      kind: "weather",
      fields,
      observedAt: observation.observationTime,
      providerRecordId: `${observation.rawHash}`,
      units: { ...ENVIRONMENTAL_UNITS },
      excerpt: describeObservation(observation),
    });

    // rawPayload travels alongside the normalized record for the
    // Evidence Explorer; it is never merged into normalized fields.
    return Object.assign({}, record, {
      rawPayload: observation.rawPayload,
    }) as NormalizedEvidence;
  }

  private cacheKey(request: EnvironmentalRequest): string {
    const hour = Math.floor(
      resolveTargetTime(request, this.now()) / (60 * 60 * 1000),
    );
    return [
      "environmental",
      round(request.latitude, 3),
      round(request.longitude, 3),
      request.portCode ?? "-",
      hour,
    ].join(":");
  }

  private elapsed(started: number): number {
    return Math.max(0, Math.round(this.now() - started));
  }

  private fail(error: string, started: number): ConnectorResult {
    const latencyMs = this.elapsed(started);
    this.lastError = error;
    this.record(false, latencyMs);
    return { connectorId: this.id, ok: false, records: [], error, latencyMs };
  }

  private record(ok: boolean, latencyMs: number): void {
    this.calls += 1;
    if (!ok) this.failures += 1;
    else this.lastSuccessAt = new Date(this.now()).toISOString();
    this.latencies = [...this.latencies.slice(-49), latencyMs];
  }
}

// ───────────────────────────────────────────────────────────────────
//  helpers — pure, source-independent
// ───────────────────────────────────────────────────────────────────

/** Returns an error string when the request cannot be served, else null. */
export function validateRequest(request: EnvironmentalRequest): string | null {
  if (!request || typeof request !== "object") return "missing environmental request";
  const { latitude, longitude } = request;
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) {
    return "invalid latitude: not a finite number";
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) {
    return "invalid longitude: not a finite number";
  }
  if (latitude < -90 || latitude > 90) {
    return `invalid latitude: ${latitude} is outside -90..90`;
  }
  if (longitude < -180 || longitude > 180) {
    return `invalid longitude: ${longitude} is outside -180..180`;
  }
  if (request.investigationTime && !Number.isFinite(Date.parse(request.investigationTime))) {
    return "invalid investigationTime: not an ISO 8601 timestamp";
  }
  if (request.timeRange) {
    const from = Date.parse(request.timeRange.from);
    const to = Date.parse(request.timeRange.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return "invalid timeRange: not ISO 8601 timestamps";
    }
    if (to < from) return "invalid timeRange: 'to' precedes 'from'";
  }
  return null;
}

/** Coordinates may arrive as free text ("6.45,3.38") or on the entity ref. */
export function requestFromQuery(query: AcquisitionQuery): EnvironmentalRequest | null {
  const candidates = [query?.text, query?.entity?.id, query?.entity?.label];
  for (const candidate of candidates) {
    const parsed = parseCoordinates(candidate);
    if (parsed) return { ...parsed, forceRefresh: query?.forceRefresh };
  }
  return null;
}

function parseCoordinates(
  value: string | undefined,
): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\s*[,;/ ]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function resolveTargetTime(request: EnvironmentalRequest, nowMs: number): number {
  const explicit = request.investigationTime
    ? Date.parse(request.investigationTime)
    : NaN;
  if (Number.isFinite(explicit)) return explicit;
  const from = request.timeRange ? Date.parse(request.timeRange.from) : NaN;
  if (Number.isFinite(from)) return from;
  return nowMs;
}

function pickHour(
  body: OpenMeteoResponse | null,
  targetMs: number,
): { index: number; timeMs: number } | null {
  const times = body?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return null;
  let best = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const ms = parseOpenMeteoTime(times[i]);
    if (!Number.isFinite(ms)) continue;
    const delta = Math.abs(ms - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  if (best < 0) return null;
  return { index: best, timeMs: parseOpenMeteoTime(times[best]) };
}

/** Open-Meteo returns `2026-07-26T12:00` in the requested timezone (UTC). */
function parseOpenMeteoTime(value: string): number {
  if (!value) return NaN;
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}:00Z`.replace(
    /:00:00Z$/,
    ":00Z",
  );
  return Date.parse(iso);
}

function numberAt(
  body: OpenMeteoResponse | null,
  index: number | undefined,
  key: string,
): number | null {
  if (!body || index == null) return null;
  const series = body.hourly?.[key];
  if (!Array.isArray(series)) return null;
  const value = series[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function degrees(value: number | null): number | null {
  if (value == null) return null;
  const wrapped = ((value % 360) + 360) % 360;
  return round(wrapped, 1);
}

/**
 * Acquisition confidence — a measure of EVIDENCE QUALITY, not of sea
 * state and not of risk. It combines how many of the six requested
 * measures were returned with how close the observation sits to the
 * investigated moment.
 */
export function acquisitionConfidence(
  measures: ReadonlyArray<number | null>,
  observationTimeMs: number,
  targetMs: number,
): number {
  const present = measures.filter((m) => m != null).length;
  const completeness = measures.length === 0 ? 0 : present / measures.length;
  const hoursOff = Math.abs(observationTimeMs - targetMs) / (60 * 60 * 1000);
  const temporalFit = hoursOff <= 1 ? 1 : hoursOff <= 3 ? 0.9 : hoursOff <= 12 ? 0.75 : 0.5;
  return round(Math.min(1, Math.max(0, completeness * temporalFit)), 2);
}

/** Neutral, non-judgemental restatement of the measured values. */
function describeObservation(o: EnvironmentalObservation): string {
  const parts: string[] = [];
  if (o.waveHeight != null) parts.push(`wave height ${o.waveHeight} m`);
  if (o.windSpeed != null) parts.push(`wind ${o.windSpeed} kn`);
  if (o.visibility != null) parts.push(`visibility ${o.visibility} m`);
  if (o.seaSurfaceTemperature != null) parts.push(`SST ${o.seaSurfaceTemperature} °C`);
  const measured = parts.length > 0 ? parts.join(", ") : "no measures returned";
  return `${o.source} observation at ${o.observationTime}: ${measured}.`;
}

function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

function isoDay(value: string): string {
  const ms = Date.parse(value);
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString().slice(0, 10);
}

async function withTimeout(
  call: (signal: AbortSignal) => Promise<Response>,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await call(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function p50(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "AbortError" ? "timeout" : err.message;
  }
  return String(err);
}

/** Shared singleton — registered via `src/connectors/index.ts`. */
export const environmentalIntelligenceProvider = new EnvironmentalIntelligenceProvider();
