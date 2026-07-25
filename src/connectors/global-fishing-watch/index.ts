/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — GLOBAL FISHING WATCH (Sprint 1C)
 * ─────────────────────────────────────────────────────────────────────
 *
 * Tier-1 intelligence source for vessel identity, position, movement
 * history, and AIS continuity signals. This connector COLLECTS
 * evidence only; it never assigns risk.
 *
 *   Global Fishing Watch
 *     ↓ Evidence Collection
 *   AIS Behaviour Analyzer  ← analytical, never risk-scored
 *     ↓ Evidence Package
 *   OSAE                    ← assigns priority + recommendation
 *
 * Design rules:
 *   • Never log or embed the API key.
 *   • Never emit "High/Medium/Low Risk" strings.
 *   • Never register the connector if authentication fails; log a
 *     warning and continue startup instead.
 * ─────────────────────────────────────────────────────────────────────
 */
import type {
  ConnectorInterface,
  HealthStatus,
  IngestionResult,
  OsintAuthMethod,
  OsintCategory,
  OsintProvenance,
  RawRecord,
  SeaphoreRecord,
} from "@/lib/osint/types";
import { baseConfidence } from "@/lib/osint/confidence";
import { AuthError, NetworkError, ParseError } from "@/lib/osint/errors";
import {
  AISBehaviourAnalyzer,
  type AisContinuityReport,
  type AisMovementEvent,
} from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface GfwVesselSearchResult {
  imo: string | null;
  mmsi: string | null;
  callSign: string | null;
  flag: string | null;
  name: string | null;
  vesselId: string;
}

interface GfwEvidence {
  vessel: GfwVesselSearchResult;
  lastPosition: {
    latitude: number;
    longitude: number;
    timestamp: string;
    speedKnots?: number;
    courseDeg?: number;
    destination?: string;
    eta?: string;
  } | null;
  movementHistory: AisMovementEvent[];
  continuityReport: AisContinuityReport;
  evidenceUrl: string;
}

const BASE_URL = "https://gateway.api.globalfishingwatch.org";
const SEARCH_PATH = "/v3/vessels/search";
const EVENTS_PATH = "/v3/events";

// Cache TTLs from Sprint 1C spec.
const CACHE_VESSEL_MS = 24 * 60 * 60 * 1000;
const CACHE_MOVEMENT_MS = 30 * 60 * 1000;
const CACHE_CONTINUITY_MS = 15 * 60 * 1000;

export class GlobalFishingWatchConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "global-fishing-watch";
  readonly description =
    "Global Fishing Watch — vessel identity, position, movement history, and AIS continuity evidence. Tier-1 intelligence source. Evidence-only; risk is OSAE's job.";
  readonly category: OsintCategory = "AIS";
  readonly authMethod: OsintAuthMethod = "api_key";
  readonly endpoint = BASE_URL;
  readonly pollingIntervalMinutes = 15;
  readonly rateLimitPerMinute = 60;
  readonly provenance: OsintProvenance = "commercial_verified";

  private cache = new Map<string, CacheEntry<unknown>>();

  // ── SECTION 2: AUTHENTICATION ────────────────────────────────────
  private buildHeaders(): Record<string, string> {
    const apiKey = process.env.GLOBAL_FISHING_WATCH_API_KEY;
    if (!apiKey) {
      throw new AuthError(
        "Missing env var GLOBAL_FISHING_WATCH_API_KEY — required by global-fishing-watch connector",
      );
    }
    return {
      Accept: "application/json",
      "User-Agent": "Seaphore-OSINT/1.0",
      Authorization: `Bearer ${apiKey}`,
    };
  }

  hasCredentials(): boolean {
    return Boolean(process.env.GLOBAL_FISHING_WATCH_API_KEY);
  }

  // ── SECTION 3: CACHE ─────────────────────────────────────────────
  private cacheGet<T>(key: string): T | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return hit.value as T;
  }
  private cacheSet<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  /** Test seam. */
  __clearCache(): void {
    this.cache.clear();
  }

  // ── SECTION 4: HTTP ──────────────────────────────────────────────
  private async httpGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: this.buildHeaders(),
      });
    } catch (err) {
      throw new NetworkError(`Network failure calling ${this.name}`, err);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(`${this.name} auth failed with ${response.status}`);
    }
    if (!response.ok) {
      throw new NetworkError(`${this.name} returned ${response.status}`);
    }
    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new ParseError(`${this.name} returned invalid JSON`, err);
    }
  }

  // ── SECTION 5: SEARCH WORKFLOW ───────────────────────────────────
  /**
   * search(query) → vessel + movement + continuity evidence.
   * Never returns risk. Publishes the continuity report to OSAE, which
   * assigns priority.
   */
  async search(query: string): Promise<GfwEvidence | null> {
    const q = String(query ?? "").trim();
    if (!q) return null;
    const vessel = await this.searchVessel(q);
    if (!vessel) return null;
    const events = await this.fetchMovementHistory(vessel.vesselId);
    const report = this.analyseContinuity(vessel.vesselId, events);
    // OSAE integration — the connector publishes evidence and receives
    // an assessment. It never uses that assessment to relabel evidence.
    OSAE.publishAisContinuity(report);
    return {
      vessel,
      lastPosition: events[events.length - 1]
        ? {
            latitude: events[events.length - 1].latitude,
            longitude: events[events.length - 1].longitude,
            timestamp: events[events.length - 1].timestamp,
            speedKnots: events[events.length - 1].speedKnots,
            courseDeg: events[events.length - 1].courseDeg,
          }
        : null,
      movementHistory: events,
      continuityReport: report,
      evidenceUrl: `https://globalfishingwatch.org/vessel-search/vessels/${encodeURIComponent(vessel.vesselId)}`,
    };
  }

  private async searchVessel(q: string): Promise<GfwVesselSearchResult | null> {
    const key = `vessel:${q.toLowerCase()}`;
    const cached = this.cacheGet<GfwVesselSearchResult | null>(key);
    if (cached !== null) return cached;
    const body = await this.httpGet<{ entries?: unknown[] }>(SEARCH_PATH, { query: q });
    const raw = Array.isArray(body?.entries) ? body.entries[0] : null;
    if (!raw || typeof raw !== "object") {
      this.cacheSet(key, null, CACHE_VESSEL_MS);
      return null;
    }
    const r = raw as Record<string, unknown>;
    const result: GfwVesselSearchResult = {
      vesselId: String(r.id ?? r.vesselId ?? q),
      imo: (r.imo as string) ?? null,
      mmsi: (r.mmsi as string) ?? null,
      callSign: (r.callsign as string) ?? (r.callSign as string) ?? null,
      flag: (r.flag as string) ?? null,
      name: (r.shipname as string) ?? (r.name as string) ?? null,
    };
    this.cacheSet(key, result, CACHE_VESSEL_MS);
    return result;
  }

  private async fetchMovementHistory(vesselId: string): Promise<AisMovementEvent[]> {
    const key = `movement:${vesselId}`;
    const cached = this.cacheGet<AisMovementEvent[]>(key);
    if (cached) return cached;
    const body = await this.httpGet<{ entries?: unknown[] }>(EVENTS_PATH, {
      vessels: vesselId,
      types: "port_visit,gap,fishing,encounter",
    });
    const items = Array.isArray(body?.entries) ? body.entries : [];
    const events: AisMovementEvent[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const ts = (it.start as string) ?? (it.timestamp as string);
      const pos = (it.position as Record<string, unknown> | undefined) ?? undefined;
      if (!ts || !pos) continue;
      events.push({
        timestamp: ts,
        latitude: Number(pos.lat ?? pos.latitude ?? 0),
        longitude: Number(pos.lon ?? pos.lng ?? pos.longitude ?? 0),
        speedKnots: typeof it.speed === "number" ? (it.speed as number) : undefined,
        courseDeg: typeof it.course === "number" ? (it.course as number) : undefined,
        nearestPort: typeof it.nearestPort === "string" ? (it.nearestPort as string) : undefined,
        distanceFromPortNm:
          typeof it.distanceFromPortNm === "number" ? (it.distanceFromPortNm as number) : undefined,
        distanceFromCoastNm:
          typeof it.distanceFromCoastNm === "number" ? (it.distanceFromCoastNm as number) : undefined,
        weather:
          it.weather === "clear" || it.weather === "moderate" || it.weather === "severe"
            ? (it.weather as "clear" | "moderate" | "severe")
            : undefined,
        trafficDensity:
          it.trafficDensity === "sparse" ||
          it.trafficDensity === "moderate" ||
          it.trafficDensity === "dense"
            ? (it.trafficDensity as "sparse" | "moderate" | "dense")
            : undefined,
      });
    }
    this.cacheSet(key, events, CACHE_MOVEMENT_MS);
    return events;
  }

  private analyseContinuity(vesselId: string, events: AisMovementEvent[]): AisContinuityReport {
    const key = `continuity:${vesselId}:${events.length}:${events[events.length - 1]?.timestamp ?? ""}`;
    const cached = this.cacheGet<AisContinuityReport>(key);
    if (cached) return cached;
    const report = AISBehaviourAnalyzer.analyse({ vesselId, events });
    this.cacheSet(key, report, CACHE_CONTINUITY_MS);
    return report;
  }

  // ── SECTION 6: FETCH / NORMALIZE (scheduler contract) ────────────
  /**
   * Scheduler fetch — pulls the currently watched vessels. In this
   * sprint the connector is search-driven, so the scheduled fetch
   * returns an empty array (evidence is collected on demand via
   * `search()`). Reserved for a future watchlist integration.
   */
  async fetch(): Promise<RawRecord[]> {
    return [];
  }

  normalize(raw: RawRecord): SeaphoreRecord {
    try {
      const entityId = String(raw["imo"] ?? raw["vesselId"] ?? "");
      const now = new Date().toISOString();
      if (!entityId) return this.emptyRecord(raw);
      return {
        sourceId: this.name,
        sourceRef: raw.sourceRef,
        entityType: "VESSEL",
        entityId,
        data: {
          imo: raw["imo"] ?? null,
          mmsi: raw["mmsi"] ?? null,
          callSign: raw["callSign"] ?? null,
          flag: raw["flag"] ?? null,
          name: raw["name"] ?? null,
          lastPosition: raw["lastPosition"] ?? null,
          lastTransmission: raw["lastTransmission"] ?? null,
          course: raw["courseDeg"] ?? null,
          speed: raw["speedKnots"] ?? null,
          destination: raw["destination"] ?? null,
          eta: raw["eta"] ?? null,
          movementHistory: raw["movementHistory"] ?? [],
          aisContinuityReport: raw["aisContinuityReport"] ?? null,
          evidenceUrl: raw["evidenceUrl"] ?? null,
        },
        rawData: raw as Record<string, unknown>,
        confidence: baseConfidence(this.provenance),
        confidenceLevel: "OBSERVED",
        fetchedAt: now,
        validFrom: now,
        validTo: null,
        tags: [this.name, "ais", "movement"],
      };
    } catch {
      return this.emptyRecord(raw);
    }
  }

  private emptyRecord(raw: RawRecord): SeaphoreRecord {
    const now = new Date().toISOString();
    return {
      sourceId: this.name,
      sourceRef: raw.sourceRef ?? "unknown",
      entityType: "VESSEL",
      entityId: "",
      data: {},
      rawData: raw as Record<string, unknown>,
      confidence: 0,
      confidenceLevel: "OBSERVED",
      fetchedAt: now,
      validFrom: now,
      validTo: null,
      tags: [this.name, "unparseable"],
    };
  }

  // ── SECTION 7: INGEST ────────────────────────────────────────────
  async ingest(_records: SeaphoreRecord[]): Promise<IngestionResult> {
    // Search-driven connector: no scheduled ingest in Sprint 1C.
    return { fetched: 0, ingested: 0, errors: [], deadLettered: 0 };
  }

  // ── SECTION 8: HEALTH CHECK ──────────────────────────────────────
  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    if (!this.hasCredentials()) {
      return {
        status: "down",
        latencyMs: 0,
        message: "GLOBAL_FISHING_WATCH_API_KEY not configured",
      };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const url = new URL(SEARCH_PATH, BASE_URL);
      url.searchParams.set("query", "healthcheck");
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (response.status === 401 || response.status === 403) {
        return { status: "down", latencyMs, message: "Authentication Failed" };
      }
      if (response.status >= 500) {
        return { status: "down", latencyMs, message: `Unavailable (HTTP ${response.status})` };
      }
      if (!response.ok) {
        return { status: "degraded", latencyMs, message: `HTTP ${response.status}` };
      }
      return { status: "healthy", latencyMs };
    } catch (err) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const globalFishingWatchConnector = new GlobalFishingWatchConnector();
