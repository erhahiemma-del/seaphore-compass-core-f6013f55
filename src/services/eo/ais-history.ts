/**
 * AIS history — the evidence window around a SAR acquisition.
 *
 * ## The question this module exists to ask correctly
 *
 * The wrong question is "what vessels are here now?". A Sentinel-1 scene
 * was acquired at a fixed instant, possibly days ago, and comparing it to
 * the current AIS picture would correlate a radar target against vessels
 * that arrived long after the satellite passed.
 *
 * The right question is:
 *
 *   "What vessels were plausibly present when the image was acquired?"
 *
 * So every query is bounded to `acquiredAt ± windowMs`, and the window is
 * explicit, configurable and carried into the evidence.
 *
 * ## Coverage is declared, never inferred
 *
 * This is the defect this module fixes. Correlation previously read an
 * empty AIS array as "no coverage" — which is true when no provider was
 * asked, and false when a provider was asked, covered the area, and
 * genuinely saw nothing. Those two produce opposite intelligence:
 *
 *   not queried  → NO_AIS_COVERAGE   (a hole in our collection)
 *   queried, 0   → UNMATCHED_SAR     (an observation about the world)
 *
 * An array cannot distinguish them. An `AisCoverage` record can, and the
 * provider is required to declare it. That makes the distinction
 * structural rather than a matter of UI wording.
 */
import type { AisReport } from "./types";

/**
 * Default evidence window either side of acquisition: ±1 hour.
 *
 * Chosen against vessel motion, not convenience. A merchant vessel at
 * 15 kn covers ~28 km in an hour, which is already far wider than the
 * correlator's search radius — so a wider default would admit candidates
 * that could not physically have been at the detection, and a much
 * narrower one would miss vessels reporting on a slow duty cycle.
 *
 * Configurable per query; whatever is used is recorded in the coverage.
 */
export const DEFAULT_AIS_WINDOW_MS = 60 * 60 * 1000;

/** Geographic bounds of a query. */
export interface BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

/**
 * A provider's declaration about what it actually looked at.
 *
 * `queried: false` means no provider ran. `queried: true` with
 * `reportCount: 0` means a provider ran, covered the area and window, and
 * saw nothing — a real observation.
 */
export interface AisCoverage {
  /** True only when a provider actually executed a query. */
  readonly queried: boolean;
  readonly providerId: string | null;
  readonly bbox: BoundingBox | null;
  readonly fromMs: number;
  readonly toMs: number;
  readonly windowMs: number;
  readonly reportCount: number;
  /**
   * True when the provider states it covers this area and period. A
   * provider may run and still not cover — terrestrial AIS has range
   * limits, and satellite AIS has revisit gaps.
   */
  readonly areaCovered: boolean;
  /** Populated whenever `queried` or `areaCovered` is false. */
  readonly unavailableReason: string | null;
}

export interface AisHistoryResult {
  readonly status: "ok" | "no-provider" | "not-covered" | "failed";
  readonly reports: readonly AisReport[];
  readonly coverage: AisCoverage;
  readonly durationMs: number;
}

/**
 * A source of historical AIS.
 *
 * Implemented per provider — Datalastic, SeaVantage, Spire. The interface
 * is deliberately history-shaped rather than position-shaped: a "current
 * position" API cannot answer a question about last Tuesday, and SAR
 * correlation is always about the past.
 */
export interface AisHistoryProvider {
  readonly providerId: string;
  /**
   * Whether this provider claims coverage of an area and period. Allows
   * the pipeline to record an honest "not covered" instead of an empty
   * result that reads as an empty sea.
   */
  covers(bbox: BoundingBox, fromMs: number, toMs: number): boolean;
  query(bbox: BoundingBox, fromMs: number, toMs: number): Promise<readonly AisReport[]>;
}

const state: { provider: AisHistoryProvider | null } = { provider: null };

/** Install the configured AIS history provider. Replaces any previous one. */
export function registerAisHistoryProvider(provider: AisHistoryProvider): void {
  state.provider = provider;
}

export function getAisHistoryProvider(): AisHistoryProvider | null {
  return state.provider;
}

/** Test seam. */
export function clearAisHistoryProvider(): void {
  state.provider = null;
}

/** The evidence window around an acquisition instant. */
export function aisWindowFor(
  acquiredAt: string,
  windowMs: number = DEFAULT_AIS_WINDOW_MS,
): { fromMs: number; toMs: number; windowMs: number } | null {
  const acquiredMs = Date.parse(acquiredAt);
  if (Number.isNaN(acquiredMs)) return null;
  return { fromMs: acquiredMs - windowMs, toMs: acquiredMs + windowMs, windowMs };
}

/** Bounding box around a point, padded by a radius in metres. */
export function bboxAround(latitude: number, longitude: number, radiusM: number): BoundingBox {
  const latDelta = radiusM / 111_320;
  const lonScale = Math.cos((latitude * Math.PI) / 180) * 111_320;
  const lonDelta = lonScale > 1 ? radiusM / lonScale : 180;
  return {
    west: longitude - lonDelta,
    south: latitude - latDelta,
    east: longitude + lonDelta,
    north: latitude + latDelta,
  };
}

function emptyCoverage(
  fromMs: number,
  toMs: number,
  windowMs: number,
  providerId: string | null,
  reason: string,
): AisCoverage {
  return {
    queried: false,
    providerId,
    bbox: null,
    fromMs,
    toMs,
    windowMs,
    reportCount: 0,
    areaCovered: false,
    unavailableReason: reason,
  };
}

/**
 * Fetch the AIS picture as it stood around a SAR acquisition.
 *
 * Never throws. Every failure becomes a status and a declared coverage,
 * because a thrown error here would surface as an empty AIS picture — and
 * an empty picture is exactly what must never be confused with a covered
 * one.
 */
export async function queryAisAroundAcquisition(
  acquiredAt: string,
  bbox: BoundingBox,
  options: { readonly windowMs?: number } = {},
): Promise<AisHistoryResult> {
  const started = Date.now();
  const windowMs = options.windowMs ?? DEFAULT_AIS_WINDOW_MS;
  const window = aisWindowFor(acquiredAt, windowMs);

  if (!window) {
    return {
      status: "failed",
      reports: [],
      coverage: emptyCoverage(
        0,
        0,
        windowMs,
        null,
        `Unparseable acquisition time "${acquiredAt}".`,
      ),
      durationMs: Date.now() - started,
    };
  }

  const provider = state.provider;

  if (!provider) {
    return {
      status: "no-provider",
      reports: [],
      coverage: emptyCoverage(
        window.fromMs,
        window.toMs,
        windowMs,
        null,
        "No AIS history provider is configured. Absence of AIS reports here reflects Seaphore's collection, not the absence of vessels, and must not be read as a dark contact.",
      ),
      durationMs: Date.now() - started,
    };
  }

  if (!provider.covers(bbox, window.fromMs, window.toMs)) {
    return {
      status: "not-covered",
      reports: [],
      coverage: {
        queried: false,
        providerId: provider.providerId,
        bbox,
        fromMs: window.fromMs,
        toMs: window.toMs,
        windowMs,
        reportCount: 0,
        areaCovered: false,
        unavailableReason: `${provider.providerId} does not cover this area for the acquisition window. No conclusion can be drawn about what was transmitting here.`,
      },
      durationMs: Date.now() - started,
    };
  }

  try {
    const reports = await provider.query(bbox, window.fromMs, window.toMs);
    return {
      status: "ok",
      reports,
      coverage: {
        queried: true,
        providerId: provider.providerId,
        bbox,
        fromMs: window.fromMs,
        toMs: window.toMs,
        windowMs,
        reportCount: reports.length,
        areaCovered: true,
        // Zero reports from a covering provider is a real observation, so
        // there is nothing unavailable to explain.
        unavailableReason: null,
      },
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      status: "failed",
      reports: [],
      coverage: {
        queried: false,
        providerId: provider.providerId,
        bbox,
        fromMs: window.fromMs,
        toMs: window.toMs,
        windowMs,
        reportCount: 0,
        areaCovered: false,
        unavailableReason: `AIS history query failed: ${
          error instanceof Error ? error.message : String(error)
        }. The area was not observed by Seaphore.`,
      },
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Whether the AIS picture is strong enough to support an "unmatched"
 * conclusion.
 *
 * The single gate between a hole in our collection and a claim about the
 * world. Only a provider that actually ran **and** covers the area earns
 * the right to have its silence mean something.
 */
export function supportsUnmatchedConclusion(coverage: AisCoverage): boolean {
  return coverage.queried && coverage.areaCovered;
}

/** Officer-facing coverage statement. Never phrased as an absence of vessels. */
export function describeCoverage(coverage: AisCoverage): string {
  if (!coverage.queried) {
    return coverage.unavailableReason ?? "AIS coverage was not established for this acquisition.";
  }
  const hours = Math.round(coverage.windowMs / 360_000) / 10;
  return `${coverage.providerId} covered this area for ±${hours} h around acquisition and returned ${coverage.reportCount} report${coverage.reportCount === 1 ? "" : "s"}.`;
}
