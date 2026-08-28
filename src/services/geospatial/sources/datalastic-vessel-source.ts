/**
 * Datalastic — commercial AIS vessel source.
 *
 * The primary live implementation of {@link VesselSource}. It issues no
 * HTTP of its own and never sees a credential: every call goes through
 * the `@/lib/datalastic.functions` gateway, which runs server-side.
 *
 * ## What it reuses, and what it must not duplicate
 *
 * - the canonical {@link Vessel} model and its provenance fields
 * - the existing validation layer (`validateBatch`) — a commercial feed
 *   earns no exemption from null island, impossible speed, or a future
 *   timestamp
 * - the existing Nigerian EEZ definition (`NIGERIA_EEZ_BBOX`)
 * - the existing refresh loop: this class exposes `list()` and nothing
 *   polls from inside it, so map, alerts, search and Copilot all feed
 *   from the one canonical vessel cycle
 *
 * ## Timestamp honesty
 *
 * `observedAt` is the provider's own `last_position_UTC`, and a row with
 * no provider timestamp is dropped rather than stamped with now. A
 * position without a time cannot be said to be current, and freshness
 * banding downstream is only meaningful if nothing upstream lies to it.
 *
 * ## Provenance
 *
 * `source: "datalastic"`, `provider: "Datalastic"`, source type
 * `COMMERCIAL`. Positions are `OBSERVED` — a contracted AIS feed
 * genuinely reports observed transmissions — and never labelled
 * government or official, which Datalastic is not.
 *
 * ## Nigeria first
 *
 * The default query is the Nigerian EEZ box, converted to the centre and
 * radius Datalastic bills by. There is no global scan and no second
 * geographic definition.
 */
import { baseConfidence, confidenceLevelFor } from "@/lib/osint/confidence";
import type {
  DatalasticHistoryPoint,
  DatalasticResult,
  DatalasticStatus,
  DatalasticVesselRecord,
} from "@/connectors/datalastic/types";

import { NIGERIA_EEZ_BBOX } from "../constants";
import { validateBatch, type ValidationSummary } from "../validation";
import type { VesselType } from "../types";
import type { Vessel } from "../vessel";
import type { VesselHistory, VesselHistoryQuery, VesselTrackPoint } from "../vessel-history";
import {
  registerVesselSource,
  type DescribableVesselSource,
  type SourceHealthReport,
  type SourceStatus,
  type VesselQuery,
  type VesselSourceDescriptor,
} from "../vessel-source";

export const DATALASTIC_SOURCE_ID = "datalastic";
export const DATALASTIC_SOURCE_LABEL = "Datalastic";

/**
 * A contracted commercial AIS feed, graded above an aggregator and below
 * a government register.
 */
const DATALASTIC_PROVENANCE = "commercial_verified" as const;

/** Gateway shape, injected so tests need no network. */
export interface DatalasticGateway {
  areaTraffic(input: {
    lat: number;
    lon: number;
    radiusKm: number;
  }): Promise<DatalasticResult<readonly DatalasticVesselRecord[]>>;
  history(input: {
    imo?: string;
    mmsi?: string;
    days: number;
  }): Promise<DatalasticResult<readonly DatalasticHistoryPoint[]>>;
  find(input: {
    name?: string;
    imo?: string;
    mmsi?: string;
    callSign?: string;
  }): Promise<DatalasticResult<readonly DatalasticVesselRecord[]>>;
}

export interface DatalasticVesselSourceOptions {
  readonly gateway?: DatalasticGateway;
  /** Defaults to the Nigerian EEZ box. */
  readonly defaultBbox?: readonly [number, number, number, number];
  readonly now?: () => number;
  /** Switched on when no officer preference is stored. Defaults to true. */
  readonly defaultEnabled?: boolean;
}

/** Provider vessel-type strings mapped to Seaphore's canonical families. */
function canonicalType(providerType: string | null): VesselType | undefined {
  if (!providerType) return undefined;
  const value = providerType.toLowerCase();
  if (value.includes("tanker") || value.includes("lng") || value.includes("lpg")) return "TANKER";
  if (value.includes("container")) return "CONTAINER";
  if (value.includes("bulk")) return "BULK";
  if (value.includes("vehicle") || value.includes("ro-ro") || value.includes("roro"))
    return "VEHICLE";
  /*
   * Everything else maps to OTHER rather than to a family the canonical
   * model does not have. Inventing "FISHING" here would have the legend
   * and the renderer disagree about what was drawn.
   */
  if (value.length > 0) return "OTHER";
  return undefined;
}

/** Provider status → the source-registry vocabulary the Sources panel reads. */
export function sourceStatusForDatalastic(status: DatalasticStatus): SourceStatus {
  switch (status) {
    case "ok":
      return "ok";
    case "empty":
      return "empty";
    case "credentials-missing":
      return "credentials-missing";
    case "unauthorized":
      return "auth-failed";
    case "subscription-inactive":
      return "subscription-inactive";
    case "rate-limited":
    case "unavailable":
      return "upstream-error";
  }
}

/**
 * One provider row → one canonical vessel, or nothing.
 *
 * Returns `null` rather than a partial vessel when identity, position or
 * the provider timestamp is missing. Identity resolution prefers IMO,
 * falls back to MMSI, and never invents a key.
 */
export function toCanonicalVessel(
  record: DatalasticVesselRecord,
  retrievedAt: string,
): Vessel | null {
  const imo = record.imo ?? record.mmsi;
  if (!imo || record.lat === null || record.lon === null || record.observedAt === null) return null;

  // Course over ground is the map's heading. Absent means nobody said.
  const reportedCourse = record.course ?? record.heading;
  const confidence = baseConfidence(DATALASTIC_PROVENANCE);

  return {
    identity: {
      imo,
      ...(record.mmsi ? { mmsi: record.mmsi } : {}),
      name: record.name ?? `MMSI ${record.mmsi ?? imo}`,
      ...(record.callSign ? { callSign: record.callSign } : {}),
      ...(record.flag ? { flag: record.flag } : {}),
      ...(canonicalType(record.type) ? { type: canonicalType(record.type) } : {}),
    },
    position: {
      lat: record.lat,
      lon: record.lon,
      heading: reportedCourse ?? 0,
      headingReported: reportedCourse !== null && reportedCourse !== undefined,
      speed: record.speed ?? 0,
      timestamp: record.observedAt,
      kind: "OBSERVED",
      ...(record.destination ? { destination: record.destination } : {}),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    provenance: {
      source: DATALASTIC_SOURCE_ID,
      provider: DATALASTIC_SOURCE_LABEL,
      datasetId: "datalastic:ais",
      retrievedAt,
      observedAt: record.observedAt,
    },
    confidence,
    confidenceLevel: confidenceLevelFor(confidence),
  };
}

export class DatalasticVesselSource implements DescribableVesselSource {
  readonly id = DATALASTIC_SOURCE_ID;
  readonly label = DATALASTIC_SOURCE_LABEL;

  private readonly gateway: DatalasticGateway;
  private readonly defaultBbox: readonly [number, number, number, number];
  private readonly now: () => number;
  private readonly defaultEnabled: boolean;

  private status: SourceStatus = "not-queried";
  private message: string | null = "Not yet queried.";
  private lastCheckedAt: string | null = null;
  private lastLatencyMs: number | null = null;
  private lastSuccessfulSync: string | null = null;
  private newestObservedAt: number | null = null;
  private recordCount = 0;
  private cacheState: "hit" | "miss" | "unknown" = "unknown";
  private latencies: number[] = [];
  private counters = { requests: 0, failures: 0, warned: 0, rejected: 0 };
  private lastValidation: ValidationSummary | null = null;

  constructor(options: DatalasticVesselSourceOptions = {}) {
    this.gateway = options.gateway ?? defaultGateway;
    this.defaultBbox = options.defaultBbox ?? [
      NIGERIA_EEZ_BBOX.minLon,
      NIGERIA_EEZ_BBOX.minLat,
      NIGERIA_EEZ_BBOX.maxLon,
      NIGERIA_EEZ_BBOX.maxLat,
    ];
    this.now = options.now ?? (() => Date.now());
    this.defaultEnabled = options.defaultEnabled ?? true;
  }

  // ── VesselSource ────────────────────────────────────────────────────

  /**
   * Current vessels. Never throws: a provider failure yields an empty
   * list plus a status the Sources panel explains, which is a different
   * statement from an empty sea.
   */
  async list(query?: VesselQuery): Promise<readonly Vessel[]> {
    const bbox = query?.bbox ?? this.defaultBbox;
    const circle = circleForBbox(bbox);
    this.counters.requests += 1;

    const result = await this.gateway.areaTraffic(circle);
    this.status = sourceStatusForDatalastic(result.status);
    this.message = result.message;
    this.lastCheckedAt = result.retrievedAt;
    this.lastLatencyMs = result.latencyMs;
    this.cacheState = result.cached ? "hit" : "miss";

    if (result.status !== "ok") {
      if (result.status !== "empty") this.counters.failures += 1;
      this.recordCount = 0;
      return [];
    }

    this.latencies.push(result.latencyMs);
    const candidates = (result.data ?? [])
      .map((record) => toCanonicalVessel(record, result.retrievedAt))
      .filter((vessel): vessel is Vessel => vessel !== null);

    // Same validation every other source passes through.
    const validated = validateBatch(candidates, { now: this.now() });
    this.lastValidation = validated.summary;
    this.counters.warned += validated.summary.warned;
    this.counters.rejected += validated.summary.rejected;

    let vessels = validated.vessels;
    if (query?.riskLevels?.length) {
      const allowed = new Set(query.riskLevels);
      vessels = vessels.filter((vessel) => allowed.has(vessel.riskLevel));
    }
    if (query?.destination) {
      vessels = vessels.filter((vessel) => vessel.position.destination === query.destination);
    }
    if (typeof query?.limit === "number") vessels = vessels.slice(0, query.limit);

    this.recordCount = vessels.length;
    this.lastSuccessfulSync = result.retrievedAt;
    this.newestObservedAt = vessels.reduce<number | null>((newest, vessel) => {
      const at = Date.parse(vessel.position.timestamp);
      return newest === null || at > newest ? at : newest;
    }, null);
    return vessels;
  }

  /**
   * Recorded track from the provider's archive.
   *
   * `unavailable` carries the officer-facing reason, so "the plan does
   * not include history" never renders as "this vessel did not move".
   */
  async history(imo: string, query?: VesselHistoryQuery): Promise<VesselHistory> {
    const days = daysForWindow(query, this.now());
    const result = await this.gateway.history({ imo, days });
    if (result.status !== "ok" || !result.data || result.data.length === 0) {
      return {
        status: "unavailable",
        reason:
          result.message ??
          "Historical movement is unavailable from the connected source for this vessel.",
      };
    }
    const track: VesselTrackPoint[] = result.data.map((point) => ({
      position: [point.lon, point.lat] as const,
      timestamp: point.observedAt,
      ...((point.course ?? point.heading) ? { heading: point.course ?? point.heading ?? 0 } : {}),
      ...(point.speed !== null ? { speed: point.speed } : {}),
      kind: "OBSERVED" as const,
    }));
    return {
      status: "available",
      track,
      // Datalastic returns positions, not interpretations. Deriving
      // events here would present an inference as a provider report.
      events: [],
      from: track[0]?.timestamp ?? new Date(this.now()).toISOString(),
      to: track[track.length - 1]?.timestamp ?? new Date(this.now()).toISOString(),
    };
  }

  /**
   * Vessel search. Ambiguity is returned in full — the caller resolves
   * it explicitly rather than this class picking a hull.
   */
  async search(term: {
    name?: string;
    imo?: string;
    mmsi?: string;
    callSign?: string;
  }): Promise<readonly Vessel[]> {
    const result = await this.gateway.find(term);
    if (result.status !== "ok" || !result.data) return [];
    return result.data
      .map((record) => toCanonicalVessel(record, result.retrievedAt))
      .filter((vessel): vessel is Vessel => vessel !== null);
  }

  // ── Describable surface ─────────────────────────────────────────────

  describe(): VesselSourceDescriptor {
    return {
      id: this.id,
      label: this.label,
      type: "COMMERCIAL",
      description: "Commercial AIS positions, identity and history from Datalastic.",
      caveat:
        "Commercial AIS, not a Nigerian regulatory record. Positions carry the " +
        "provider's own timestamp; coverage depends on AIS transmission and plan entitlement.",
      defaultEnabled: this.defaultEnabled,
    };
  }

  report(): SourceHealthReport {
    const confidence = baseConfidence(DATALASTIC_PROVENANCE);
    const averageLatencyMs =
      this.latencies.length > 0
        ? Math.round(this.latencies.reduce((sum, value) => sum + value, 0) / this.latencies.length)
        : null;
    return {
      sourceId: this.id,
      status: this.status,
      connected: this.status === "ok",
      message: this.message,
      lastCheckedAt: this.lastCheckedAt,
      lastLatencyMs: this.lastLatencyMs,
      recordCount: this.recordCount,
      confidence: this.status === "ok" ? confidence : null,
      confidenceLevel: this.status === "ok" ? confidenceLevelFor(confidence) : null,
      freshnessMs: this.newestObservedAt === null ? null : this.now() - this.newestObservedAt,
      requestCount: this.counters.requests,
      failureCount: this.counters.failures,
      successRate:
        this.counters.requests === 0
          ? null
          : (this.counters.requests - this.counters.failures) / this.counters.requests,
      averageLatencyMs,
      cacheState: this.cacheState,
      lastSuccessfulSync: this.lastSuccessfulSync,
      warnedCount: this.counters.warned,
      rejectedCount: this.counters.rejected,
    };
  }

  /** Validation findings from the most recent batch. */
  validation(): ValidationSummary | null {
    return this.lastValidation;
  }
}

/**
 * Bounding box → the centre-and-radius Datalastic bills by.
 *
 * The radius is the half-diagonal, so the circle covers the box; it is
 * clamped by the gateway. One geographic definition, converted — not a
 * second one invented.
 */
export function circleForBbox(bbox: readonly [number, number, number, number]): {
  lat: number;
  lon: number;
  radiusKm: number;
} {
  const [west, south, east, north] = bbox;
  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  const latKm = ((north - south) / 2) * 111;
  const lonKm = ((east - west) / 2) * 111 * Math.cos((lat * Math.PI) / 180);
  return { lat, lon, radiusKm: Math.ceil(Math.sqrt(latKm * latKm + lonKm * lonKm)) };
}

/** Requested window → whole calendar days, which is how history is billed. */
function daysForWindow(query: VesselHistoryQuery | undefined, now: number): number {
  if (!query?.from) return 3;
  const from = Date.parse(query.from);
  if (!Number.isFinite(from)) return 3;
  const days = Math.ceil((now - from) / (24 * 60 * 60 * 1000));
  return Math.min(Math.max(days, 1), 7);
}

/** The gateway, reached through server functions. Imported lazily. */
const defaultGateway: DatalasticGateway = {
  async areaTraffic(input) {
    const { datalasticAreaTraffic } = await import("@/lib/datalastic.functions");
    return datalasticAreaTraffic({ data: input });
  },
  async history(input) {
    const { datalasticHistory } = await import("@/lib/datalastic.functions");
    return datalasticHistory({ data: input });
  },
  async find(input) {
    const { datalasticFind } = await import("@/lib/datalastic.functions");
    return datalasticFind({ data: input });
  },
};

let registered: DatalasticVesselSource | null = null;

/** Register Datalastic with the canonical source registry. Idempotent. */
export function registerDatalasticSource(
  options: DatalasticVesselSourceOptions = {},
): DatalasticVesselSource {
  const source = new DatalasticVesselSource(options);
  registerVesselSource(source);
  registered = source;
  return source;
}

/** The registered instance, when one exists. */
export function datalasticSource(): DatalasticVesselSource | null {
  return registered;
}
