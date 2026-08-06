/**
 * GIP — Global Fishing Watch vessel source.
 *
 * The first live implementation of {@link VesselSource}. Bridges the GFW
 * gateway's area query (Step 3) to the map's canonical {@link Vessel} model.
 *
 * ## What it reuses
 *
 * - **Connector / gateway** — `gfwAreaSearch` and `gfwSearch` server
 *   functions. This class issues no HTTP of its own and never sees an API
 *   key; both are the gateway's responsibility.
 * - **Confidence engine** — `baseConfidence` / `confidenceLevelFor` from
 *   `@/lib/osint/confidence`. Confidence is never invented here.
 * - **Diagnostics** — `GfwAreaDiagnostics`, returned by the gateway.
 *
 * ## Provenance grade
 *
 * GFW is treated as `aggregated` (0.6 baseline): it fuses terrestrial and
 * satellite AIS from several upstream feeds rather than publishing a
 * government register or a contracted commercial feed. Grading it higher
 * would overstate what a free-tier, event-derived position actually is.
 *
 * ## Semantic limit — read before using
 *
 * GFW publishes no live "all vessels transmitting" feed. Area results are
 * derived from the **events** dataset, so this source returns vessels that
 * produced an AIS-derived event inside the box during the window, at that
 * event's position. It is a recent-activity picture, not real-time
 * traffic. The UI must label it as such.
 */
import type {
  GfwAreaDiagnostics,
  GfwAreaQuery,
  GfwAreaResult,
  GfwAreaStatus,
  GfwAreaVessel,
} from "@/connectors/global-fishing-watch/types";
import { baseConfidence, confidenceLevelFor } from "@/lib/osint/confidence";

import { NIGERIA_EEZ_BBOX } from "../constants";
import { validateBatch, type ValidationSummary } from "../validation";
import type { Vessel, VesselProvenance } from "../vessel";
import {
  registerVesselSource,
  type DescribableVesselSource,
  type SourceHealthReport,
  type VesselQuery,
  type VesselSourceDescriptor,
} from "../vessel-source";

/** Connector id — matches the registered OSINT connector name. */
export const GFW_SOURCE_ID = "global-fishing-watch";

/** Display name shown wherever the source is surfaced to an officer. */
export const GFW_SOURCE_LABEL = "Global Fishing Watch";

/** Upstream dataset behind the area query. */
const GFW_EVENTS_DATASET = "public-global-events:latest";

/**
 * GFW fuses multiple AIS feeds rather than publishing an authoritative
 * register — `aggregated`, not `government` or `commercial_verified`.
 */
const GFW_PROVENANCE = "aggregated" as const;

/** Health as reported by this source. Mirrors the gateway's status vocabulary. */
export interface GfwSourceHealth {
  readonly sourceId: string;
  readonly label: string;
  readonly status: GfwAreaStatus;
  /** True only when the last query authenticated and returned data. */
  readonly connected: boolean;
  readonly message: string | null;
  readonly lastCheckedAt: string | null;
  readonly lastLatencyMs: number | null;
}

/** Cumulative counters. Reset only by constructing a new source. */
export interface GfwSourceStats {
  readonly requests: number;
  readonly failures: number;
  readonly entriesReceived: number;
  readonly entriesDiscarded: number;
  readonly vesselsAccepted: number;
  readonly vesselsRejected: number;
  /** Observations admitted with a caveat. */
  readonly vesselsWarned: number;
  /** Findings from the most recent batch, by code. */
  readonly lastValidation: ValidationSummary | null;
  readonly lastDiagnostics: GfwAreaDiagnostics | null;
}

/** A single evidence citation for one observation. */
export interface VesselCitation {
  readonly sourceId: string;
  readonly provider: string;
  readonly datasetId: string;
  readonly observedAt: string;
  readonly retrievedAt: string;
  readonly confidence: number;
  readonly confidenceLevel: string;
  /** Plain-language statement of what this source actually asserts. */
  readonly statement: string;
}

/** Injection points. The gateway calls are injectable so tests need no network. */
export interface GlobalFishingWatchVesselSourceOptions {
  /** Area query. Defaults to the `gfwAreaSearch` server function. */
  readonly areaSearch?: (query: GfwAreaQuery) => Promise<GfwAreaResult>;
  /** Bounding box used when a caller supplies none. Defaults to the Nigerian EEZ. */
  readonly defaultBbox?: readonly [number, number, number, number];
  /** Activity window in milliseconds. Defaults to 24 hours. */
  readonly windowMs?: number;
  /** Clock, injectable for deterministic tests. */
  readonly now?: () => number;
}

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export class GlobalFishingWatchVesselSource implements DescribableVesselSource {
  readonly id = GFW_SOURCE_ID;
  readonly label = GFW_SOURCE_LABEL;

  private readonly areaSearch: (query: GfwAreaQuery) => Promise<GfwAreaResult>;
  private readonly defaultBbox: readonly [number, number, number, number];
  private readonly windowMs: number;
  private readonly now: () => number;

  private lastHealth: GfwSourceHealth;
  private counters = {
    requests: 0,
    failures: 0,
    entriesReceived: 0,
    entriesDiscarded: 0,
    vesselsAccepted: 0,
    vesselsRejected: 0,
    vesselsWarned: 0,
  };
  private lastDiagnostics: GfwAreaDiagnostics | null = null;
  private lastValidation: ValidationSummary | null = null;
  /** Newest observation timestamp seen, in epoch ms. Drives freshness. */
  private newestObservedAt: number | null = null;
  /** Vessels held from the most recent successful query. */
  private recordCount = 0;

  constructor(options: GlobalFishingWatchVesselSourceOptions = {}) {
    this.areaSearch = options.areaSearch ?? defaultAreaSearch;
    this.defaultBbox = options.defaultBbox ?? [
      NIGERIA_EEZ_BBOX.minLon,
      NIGERIA_EEZ_BBOX.minLat,
      NIGERIA_EEZ_BBOX.maxLon,
      NIGERIA_EEZ_BBOX.maxLat,
    ];
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
    this.lastHealth = {
      sourceId: this.id,
      label: this.label,
      status: "empty",
      connected: false,
      message: "Not yet queried.",
      lastCheckedAt: null,
      lastLatencyMs: null,
    };
  }

  // ── VesselSource contract ───────────────────────────────────────────

  /**
   * Fetch vessels for the map. Never throws — a failure yields an empty
   * list and a health status the UI can explain.
   */
  async list(query?: VesselQuery): Promise<readonly Vessel[]> {
    const result = await this.searchArea(query?.bbox ?? this.defaultBbox, {
      limit: query?.limit,
    });
    let vessels = result.vessels;
    if (query?.riskLevels?.length) {
      const allowed = new Set(query.riskLevels);
      vessels = vessels.filter((vessel) => allowed.has(vessel.riskLevel));
    }
    return vessels;
  }

  // ── Required surface ────────────────────────────────────────────────

  /** Current health. Reflects the most recent query, not a fresh probe. */
  health(): GfwSourceHealth {
    return this.lastHealth;
  }

  /** Cumulative counters for the diagnostics surface. */
  stats(): GfwSourceStats {
    return {
      ...this.counters,
      lastDiagnostics: this.lastDiagnostics,
      lastValidation: this.lastValidation,
    };
  }

  /**
   * Query an area and return normalised vessels plus the raw status.
   *
   * Exposed separately from `list` so callers that need the status and
   * diagnostics — a feed monitor, a validation dashboard — can have them
   * without a second request.
   */
  async searchArea(
    bbox: readonly [number, number, number, number],
    options: { since?: string; until?: string; limit?: number } = {},
  ): Promise<{
    readonly status: GfwAreaStatus;
    readonly vessels: readonly Vessel[];
    readonly message: string | null;
    readonly diagnostics: GfwAreaDiagnostics;
  }> {
    const until = options.until ?? new Date(this.now()).toISOString();
    const since = options.since ?? new Date(this.now() - this.windowMs).toISOString();

    this.counters.requests += 1;

    let result: GfwAreaResult;
    try {
      result = await this.areaSearch({ bbox, since, until, limit: options.limit });
    } catch (error) {
      // The gateway is designed not to throw; a throw here means transport
      // failure. Surface it as an upstream error rather than propagating.
      this.counters.failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      const diagnostics: GfwAreaDiagnostics = {
        requestedAt: new Date(this.now()).toISOString(),
        latencyMs: 0,
        entriesReceived: 0,
        entriesDiscarded: 0,
        vesselsReturned: 0,
        fromCache: false,
      };
      this.recordHealth("upstream-error", `Transport failure — ${message}`, diagnostics);
      return { status: "upstream-error", vessels: [], message, diagnostics };
    }

    this.lastDiagnostics = result.diagnostics;
    this.counters.entriesReceived += result.diagnostics.entriesReceived;
    this.counters.entriesDiscarded += result.diagnostics.entriesDiscarded;
    if (result.status === "auth-failed" || result.status === "upstream-error") {
      this.counters.failures += 1;
    }

    // Normalise first, then validate. Normalisation answers "can this be
    // represented?"; validation answers "should this reach the map?".
    const normalised: Vessel[] = [];
    for (const raw of result.vessels) {
      const vessel = this.normalize(raw);
      if (vessel) normalised.push(vessel);
      else this.counters.vesselsRejected += 1;
    }

    const validated = validateBatch(normalised, { now: this.now() });
    const vessels = [...validated.vessels];
    this.counters.vesselsAccepted += validated.summary.accepted + validated.summary.warned;
    this.counters.vesselsRejected += validated.summary.rejected;
    this.counters.vesselsWarned += validated.summary.warned;
    this.lastValidation = validated.summary;

    this.recordCount = vessels.length;
    this.newestObservedAt = vessels.reduce<number | null>((newest, vessel) => {
      const at = Date.parse(vessel.position.timestamp);
      if (Number.isNaN(at)) return newest;
      return newest === null || at > newest ? at : newest;
    }, null);

    this.recordHealth(result.status, result.message, result.diagnostics);
    return {
      status: result.status,
      vessels,
      message: result.message,
      diagnostics: result.diagnostics,
    };
  }

  /**
   * Look up a single vessel by name, IMO, or MMSI.
   *
   * Delegates to the pre-existing identity search. That endpoint returns an
   * Evidence Package rather than positions, so this method deliberately
   * returns the gateway's own result shape: converting it to a `Vessel`
   * would require a position the search does not reliably carry.
   */
  async searchVessel(
    query: string,
    search?: (input: { data: { query: string } }) => Promise<unknown>,
  ): Promise<unknown> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const fn = search ?? (await loadVesselSearch());
    return fn({ data: { query: trimmed.slice(0, 200) } });
  }

  /**
   * Convert one gateway vessel into the map's canonical model.
   *
   * Pure and synchronous so it can be unit-tested without a network or a
   * source instance. Returns null when the observation cannot be keyed —
   * the map is keyed by IMO, and a vessel with neither IMO nor MMSI nor
   * vessel id cannot be tracked across refreshes.
   */
  normalize(raw: GfwAreaVessel): Vessel | null {
    // Key preference: IMO (globally unique and stable) → MMSI → GFW id.
    // Falling back keeps AIS-only fishing vessels visible; most carry no IMO.
    const key = raw.imo ?? raw.mmsi ?? raw.vesselId;
    if (!key) return null;
    if (!Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) return null;
    if (Number.isNaN(Date.parse(raw.timestamp))) return null;

    const confidence = baseConfidence(GFW_PROVENANCE);
    const provenance: VesselProvenance = {
      source: this.id,
      provider: this.label,
      datasetId: GFW_EVENTS_DATASET,
      retrievedAt: raw.retrievedAt,
      observedAt: raw.timestamp,
    };

    return {
      identity: {
        imo: key,
        ...(raw.mmsi ? { mmsi: raw.mmsi } : {}),
        name: raw.name ?? `Unidentified (${key})`,
        ...(raw.flag ? { flag: raw.flag } : {}),
      },
      position: {
        lon: raw.longitude,
        lat: raw.latitude,
        heading: raw.courseDeg ?? 0,
        speed: raw.speedKnots ?? 0,
        timestamp: raw.timestamp,
      },
      // Risk is OSAE's to assign. A position observation asserts nothing
      // about risk, so it enters the map as UNKNOWN, never as CLEAN.
      riskLevel: "UNKNOWN",
      attentionScore: 0,
      provenance,
      confidence,
      confidenceLevel: confidenceLevelFor(confidence),
    };
  }

  /**
   * Evidence citations for one vessel.
   *
   * Returns an empty array for a vessel this source did not produce, so a
   * fused picture never attributes another provider's observation to GFW.
   */
  citations(vessel: Vessel): readonly VesselCitation[] {
    const provenance = vessel.provenance;
    if (!provenance || provenance.source !== this.id) return [];
    const confidence = vessel.confidence ?? baseConfidence(GFW_PROVENANCE);
    return [
      {
        sourceId: this.id,
        provider: provenance.provider,
        datasetId: provenance.datasetId ?? GFW_EVENTS_DATASET,
        observedAt: provenance.observedAt,
        retrievedAt: provenance.retrievedAt,
        confidence,
        confidenceLevel: vessel.confidenceLevel ?? confidenceLevelFor(confidence),
        statement:
          `${provenance.provider} recorded AIS-derived activity for this vessel at ` +
          `${vessel.position.lat.toFixed(4)}, ${vessel.position.lon.toFixed(4)} ` +
          `on ${provenance.observedAt}. Event-derived position — not a continuous track.`,
      },
    ];
  }

  /**
   * Self-description for the Sources section.
   *
   * The UI renders from this alone, which is why the caveat lives here and
   * not in a component: a limitation stated in the descriptor cannot be
   * lost between the data layer and the screen.
   */
  describe(): VesselSourceDescriptor {
    return {
      id: this.id,
      label: this.label,
      type: "OSINT",
      description: "AIS-derived vessel activity from Global Fishing Watch.",
      caveat:
        "Event-derived positions, not a continuous live feed. Shows vessels that " +
        "produced an AIS event in the area during the window.",
      defaultEnabled: true,
    };
  }

  /** Point-in-time report for the Sources section and diagnostics. */
  report(): SourceHealthReport {
    const health = this.lastHealth;
    const confidence = baseConfidence(GFW_PROVENANCE);
    return {
      sourceId: this.id,
      status: health.lastCheckedAt === null ? "not-queried" : health.status,
      connected: health.connected,
      message: health.message,
      lastCheckedAt: health.lastCheckedAt,
      lastLatencyMs: health.lastLatencyMs,
      recordCount: this.recordCount,
      confidence,
      confidenceLevel: confidenceLevelFor(confidence),
      freshnessMs:
        this.newestObservedAt === null ? null : Math.max(0, this.now() - this.newestObservedAt),
    };
  }

  private recordHealth(
    status: GfwAreaStatus,
    message: string | null,
    diagnostics: GfwAreaDiagnostics,
  ): void {
    this.lastHealth = {
      sourceId: this.id,
      label: this.label,
      status,
      connected: status === "ok" || status === "empty",
      message,
      lastCheckedAt: diagnostics.requestedAt,
      lastLatencyMs: diagnostics.latencyMs,
    };
  }
}

/**
 * Default area query — the `gfwAreaSearch` server function.
 *
 * Imported lazily so this module can be loaded in a test or a worker
 * without pulling the TanStack server-function runtime.
 */
async function defaultAreaSearch(query: GfwAreaQuery): Promise<GfwAreaResult> {
  const { gfwAreaSearch } = await import("@/lib/gfw.functions");
  return gfwAreaSearch({ data: query });
}

/** Lazily resolve the identity-search server function. */
async function loadVesselSearch(): Promise<
  (input: { data: { query: string } }) => Promise<unknown>
> {
  const { gfwSearch } = await import("@/lib/gfw.functions");
  return gfwSearch as unknown as (input: { data: { query: string } }) => Promise<unknown>;
}

/**
 * Register the shipped GFW source so the Sources section discovers it.
 *
 * Idempotent: `registerVesselSource` replaces by id, so importing this more
 * than once cannot produce a duplicate row. Call from an app entry point.
 */
export function registerGlobalFishingWatchSource(
  options?: GlobalFishingWatchVesselSourceOptions,
): () => void {
  return registerVesselSource(new GlobalFishingWatchVesselSource(options));
}
