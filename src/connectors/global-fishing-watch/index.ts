/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE OSINT CONNECTOR — GLOBAL FISHING WATCH (client proxy)
 * ─────────────────────────────────────────────────────────────────────
 *
 * This file runs in the BROWSER bundle. It contains ZERO
 * authentication logic and ZERO environment access. All authenticated
 * work is performed by the server-side gateway at
 * `src/lib/server/gfw.server.ts`, invoked via the `createServerFn`
 * wrappers in `src/lib/gfw.functions.ts`.
 *
 * Responsibilities:
 *   • Invoke the server function.
 *   • Cache Evidence Packages by query (client-side, plain data).
 *   • Publish AIS continuity evidence into OSAE.
 *   • Expose connector metadata (name, category, provenance …) to the
 *     OSINT registry and health-check UI.
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
import { OSAE } from "@/services/osae";
import { gfwSearch, gfwHealth } from "@/lib/gfw.functions";
import type {
  GfwEvidencePackage,
  GfwHealthPayload,
} from "./types";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — client cache only

export class GlobalFishingWatchConnector implements ConnectorInterface {
  // ── SECTION 1: METADATA ──────────────────────────────────────────
  readonly name = "global-fishing-watch";
  readonly description =
    "Global Fishing Watch — vessel identity, position, movement history, and AIS continuity evidence. Tier-1 intelligence source. Evidence-only; risk is OSAE's job.";
  readonly category: OsintCategory = "AIS";
  readonly authMethod: OsintAuthMethod = "api_key";
  readonly endpoint = "server:/gfw"; // opaque — real endpoint lives server-side
  readonly pollingIntervalMinutes = 15;
  readonly rateLimitPerMinute = 60;
  readonly provenance: OsintProvenance = "commercial_verified";

  private cache = new Map<string, CacheEntry<GfwEvidencePackage | null>>();

  /**
   * Registration is unconditional: the client cannot know whether the
   * server has the secret without asking. Health-check surfaces the
   * real state via `runGfwHealthCheck()`.
   */
  hasCredentials(): boolean {
    return true;
  }

  /** Test seam. */
  __clearCache(): void {
    this.cache.clear();
  }

  // ── SECTION 2: SEARCH (via server function) ──────────────────────
  async search(query: string): Promise<GfwEvidencePackage | null> {
    const q = String(query ?? "").trim();
    if (!q) return null;

    const cacheKey = q.toLowerCase();
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const response = await gfwSearch({ data: { query: q } });
    if (response.error) {
      // Officer-safe: surface the failure through OSINT health/log
      // pipes, do not throw into copilot flow.
      if (typeof console !== "undefined") {
        console.warn(
          `[global-fishing-watch] ${response.error.code}: ${response.error.message}`,
        );
      }
      this.cache.set(cacheKey, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const pkg = response.package;
    this.cache.set(cacheKey, { value: pkg, expiresAt: Date.now() + CACHE_TTL_MS });

    // OSAE receives the sanitised evidence — but ONLY when the
    // identity is confirmed. Ambiguous / low-confidence matches must
    // wait for the officer to confirm the intended vessel.
    if (pkg && !pkg.requiresConfirmation) {
      OSAE.publishAisContinuity(pkg.continuityReport);
    }
    return pkg;
  }

  // ── SECTION 3: HEALTH (via server function) ──────────────────────
  async healthCheck(): Promise<HealthStatus> {
    let payload: GfwHealthPayload;
    try {
      payload = await gfwHealth();
    } catch (err) {
      return {
        status: "down",
        latencyMs: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return {
      status: payload.status,
      latencyMs: payload.latencyMs,
      message: payload.message,
    };
  }

  // ── SECTION 4: SCHEDULER CONTRACT ────────────────────────────────
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

  async ingest(_records: SeaphoreRecord[]): Promise<IngestionResult> {
    return { fetched: 0, ingested: 0, errors: [], deadLettered: 0 };
  }
}

export const globalFishingWatchConnector = new GlobalFishingWatchConnector();
