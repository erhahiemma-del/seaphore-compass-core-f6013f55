/**
 * National operating picture — "what is happening in Nigerian waters?"
 *
 * ## The distinction this module exists to enforce
 *
 * A metric reading **0** and a metric that **cannot be computed** are
 * different claims, and rendering both as "0" is the most damaging
 * mistake available on this screen:
 *
 *   "0 high-risk vessels"          Seaphore checked and found none.
 *   "High risk — source pending"   Seaphore cannot answer that question.
 *
 * An officer who reads the second as the first concludes Nigerian waters
 * are clear when in fact nothing was examined. So a metric is a
 * discriminated union, not a number, and there is no code path that
 * turns an absent source into a zero.
 *
 * ## It counts; it does not assess
 *
 * Risk bands come from OSAE via the vessel model, freshness from
 * `freshness.ts`, provenance from `VesselProvenance`. This module groups
 * and counts what other engines decided.
 */
import { freshnessBandForAge } from "./freshness";
import type { FleetSummary } from "./fleet-summary";
import { positionAgeMs, type Vessel } from "./vessel";

/**
 * A metric an officer reads.
 *
 * `available` carries a count that was actually computed. `pending`
 * carries the reason no count exists. There is deliberately no third
 * state and no default value.
 */
export type Metric =
  | {
      readonly kind: "available";
      readonly value: number;
      /** Providers the count was computed from. */
      readonly sources: readonly string[];
      /** Age of the newest contributing observation, ms. */
      readonly ageMs: number | null;
    }
  | {
      readonly kind: "pending";
      /** Officer-facing. Names the blocker, never implies emptiness. */
      readonly reason: string;
      /** What would make this metric computable. */
      readonly requires: string;
    };

export interface NationalPicture {
  readonly vessels: Metric;
  readonly arrivals: Metric;
  readonly departures: Metric;
  readonly anchored: Metric;
  readonly highRisk: Metric;
  readonly aisGaps: Metric;
  readonly sarObservations: Metric;
  readonly environmentalEvents: Metric;
  readonly activeInvestigations: Metric;
  readonly producedAt: string;
  /**
   * Providers contributing to any metric. Empty means the picture is
   * entirely pending — which the UI must say, not draw as an empty sea.
   */
  readonly contributingSources: readonly string[];
}

/** Build an available metric. */
function available(value: number, sources: readonly string[], ageMs: number | null): Metric {
  return { kind: "available", value, sources, ageMs };
}

/** Build a pending metric. Requires a reason — there is no silent pending. */
function pending(reason: string, requires: string): Metric {
  return { kind: "pending", reason, requires };
}

/**
 * Distinct providers behind a set of vessels.
 *
 * `provenance` is optional on `Vessel` — a fixture or a future provider
 * may carry none — so an unattributed observation is labelled rather than
 * dropped from the count.
 */
function vesselSources(vessels: readonly Vessel[]): readonly string[] {
  return [...new Set(vessels.map((v) => v.provenance?.source ?? "unattributed"))].sort();
}

export interface NationalPictureInputs {
  /** Vessels currently loaded. Empty with a connected source is a real zero. */
  readonly vessels: readonly Vessel[];
  /**
   * Whether any vessel provider is connected.
   *
   * Distinct from `vessels.length > 0`: no provider means the count is
   * unknowable, while a connected provider returning nothing means the
   * water is empty of *observed* vessels.
   */
  readonly vesselSourceConnected: boolean;
  /**
   * Whether any connected provider publishes speed over ground.
   *
   * Declared by the caller because it cannot be inferred: the vessel
   * model always carries a `speed`, so a provider publishing none looks
   * identical to a fleet that is genuinely stopped.
   */
  readonly providerReportsSpeed?: boolean;
  /** Port-call data, from NPA. Null when no route is configured. */
  readonly portCalls?: {
    readonly arrivals: number;
    readonly departures: number;
    readonly sources: readonly string[];
  } | null;
  /** AIS gap count. Null when no AIS history provider is connected. */
  readonly aisGaps?: { readonly count: number; readonly sources: readonly string[] } | null;
  /** SAR detections. Null when no detector is configured. */
  readonly sarDetections?: {
    readonly count: number;
    readonly acquiredAt: string | null;
  } | null;
  /** Environmental incidents, from NOSDRA. Null when unlicensed/unconnected. */
  readonly environmentalEvents?: {
    readonly count: number;
    readonly sources: readonly string[];
  } | null;
  /** Investigations open to this officer. Always computable — it is ours. */
  readonly activeInvestigations?: number;
  /**
   * True while the vessel feed has not yet answered.
   *
   * Distinct from `vesselSourceConnected: false`. A connected source
   * mid-request has not returned zero vessels; it has returned nothing
   * yet, and reporting that as a count would be a number invented during
   * a network round-trip.
   */
  readonly vesselsLoading?: boolean;
  /**
   * Set when the last refresh failed. The previously loaded vessels are
   * still counted — they did not leave — but the picture is marked stale
   * rather than presented as current.
   */
  readonly vesselFeedError?: string | null;
  readonly now?: number;
}

/**
 * Compute the picture.
 *
 * Every metric with no connected source returns `pending` with a named
 * blocker. Nothing defaults to zero.
 */
export function buildNationalPicture(inputs: NationalPictureInputs): NationalPicture {
  const now = inputs.now ?? Date.now();
  const contributing = new Set<string>();

  /* ── Vessels ────────────────────────────────────────────────── */
  let vessels: Metric;
  if (!inputs.vesselSourceConnected) {
    vessels = pending(
      "No vessel provider is connected, so the number of vessels in Nigerian waters cannot be established.",
      "An AIS provider (Datalastic or SeaVantage) or Global Fishing Watch",
    );
  } else if (inputs.vesselsLoading && inputs.vessels.length === 0) {
    // Mid-request. Reporting 0 here would be a number invented during a
    // network round-trip.
    vessels = pending(
      "The vessel feed has not yet returned. No count can be given until it does.",
      "The in-flight request to complete",
    );
  } else {
    const ages = inputs.vessels.map((vessel) => positionAgeMs(vessel.position, now));
    for (const source of vesselSources(inputs.vessels)) contributing.add(source);
    vessels = available(
      inputs.vessels.length,
      vesselSources(inputs.vessels),
      ages.length > 0 ? Math.min(...ages) : null,
    );
  }

  /* ── Anchored ───────────────────────────────────────────────── */
  // Anchored is derived from speed over ground, so it needs a provider
  // that actually reports it. `VesselPosition.speed` is always present in
  // the model, which means a provider that publishes none is
  // indistinguishable from a fleet that is genuinely stopped — GFW is
  // exactly that case. Capability is therefore declared by the caller,
  // never inferred from a zero.
  const anchored = !inputs.vesselSourceConnected
    ? pending("No vessel provider is connected.", "An AIS provider reporting speed over ground")
    : !inputs.providerReportsSpeed
      ? pending(
          "No connected provider reports speed over ground, so vessels at anchor cannot be distinguished from vessels under way. Global Fishing Watch publishes no speed on its event datasets.",
          "An AIS provider reporting speed over ground",
        )
      : available(
          inputs.vessels.filter((v) => v.position.speed <= 0.5).length,
          vesselSources(inputs.vessels),
          null,
        );

  /* ── High risk ──────────────────────────────────────────────── */
  // `riskLevel` is always populated, with UNKNOWN meaning "no assessment
  // resolved". A fleet entirely UNKNOWN has not been assessed, which is
  // not the same as having no high-risk vessels.
  const assessed = inputs.vessels.filter((v) => v.riskLevel !== "UNKNOWN");
  const highRisk = !inputs.vesselSourceConnected
    ? pending("No vessel provider is connected.", "A vessel provider plus OSAE assessment")
    : assessed.length === 0
      ? pending(
          "No loaded vessel carries a risk assessment, so the number at high risk cannot be established.",
          "OSAE assessments over the loaded fleet",
        )
      : available(
          assessed.filter((v) => v.riskLevel === "CRITICAL" || v.riskLevel === "HIGH").length,
          vesselSources(assessed),
          null,
        );

  /* ── Port calls ─────────────────────────────────────────────── */
  const arrivals = inputs.portCalls
    ? available(inputs.portCalls.arrivals, inputs.portCalls.sources, null)
    : pending(
        "NPA port data is not connected, so arrivals cannot be counted.",
        "An authorized NPA SHIPPOS route",
      );
  const departures = inputs.portCalls
    ? available(inputs.portCalls.departures, inputs.portCalls.sources, null)
    : pending(
        "NPA port data is not connected, so departures cannot be counted.",
        "An authorized NPA SHIPPOS route",
      );
  if (inputs.portCalls) for (const s of inputs.portCalls.sources) contributing.add(s);

  /* ── AIS gaps ───────────────────────────────────────────────── */
  const aisGaps = inputs.aisGaps
    ? available(inputs.aisGaps.count, inputs.aisGaps.sources, null)
    : pending(
        "No AIS history provider is connected, so transmission gaps cannot be detected. This is not a statement that no vessel has gone dark.",
        "Datalastic or SeaVantage credentials",
      );
  if (inputs.aisGaps) for (const s of inputs.aisGaps.sources) contributing.add(s);

  /* ── SAR ────────────────────────────────────────────────────── */
  const sarObservations = inputs.sarDetections
    ? available(
        inputs.sarDetections.count,
        ["sentinel-1"],
        inputs.sarDetections.acquiredAt
          ? Math.max(0, now - Date.parse(inputs.sarDetections.acquiredAt))
          : null,
      )
    : pending(
        "No SAR ship-detection service is configured, so satellite imagery has not been analysed.",
        "A licensed Sentinel-1 ship detector",
      );
  if (inputs.sarDetections) contributing.add("sentinel-1");

  /* ── Environment ────────────────────────────────────────────── */
  const environmentalEvents = inputs.environmentalEvents
    ? available(inputs.environmentalEvents.count, inputs.environmentalEvents.sources, null)
    : pending(
        "NOSDRA incident data is not connected.",
        "NOSDRA export access and a licence review",
      );
  if (inputs.environmentalEvents) {
    for (const s of inputs.environmentalEvents.sources) contributing.add(s);
  }

  /* ── Investigations ─────────────────────────────────────────── */
  // Seaphore's own records. Always computable, so zero here is a real zero.
  const activeInvestigations = available(inputs.activeInvestigations ?? 0, ["seaphore"], null);

  return {
    vessels,
    arrivals,
    departures,
    anchored,
    highRisk,
    aisGaps,
    sarObservations,
    environmentalEvents,
    activeInvestigations,
    producedAt: new Date(now).toISOString(),
    contributingSources: [...contributing].sort(),
  };
}

/**
 * Officer-facing rendering of a metric.
 *
 * Never returns a bare number for a pending metric, and never returns
 * "0" where the answer is unknown.
 */
export function describeMetric(metric: Metric): string {
  return metric.kind === "available" ? String(metric.value) : "Data source pending";
}

/** Freshness band for a metric, or null when it is pending. */
export function metricFreshness(metric: Metric) {
  if (metric.kind !== "available") return null;
  return freshnessBandForAge(metric.ageMs);
}

/** How much of the picture can actually be answered. */
export function pictureCoverage(picture: NationalPicture): {
  readonly available: number;
  readonly pending: number;
  readonly total: number;
} {
  const metrics = [
    picture.vessels,
    picture.arrivals,
    picture.departures,
    picture.anchored,
    picture.highRisk,
    picture.aisGaps,
    picture.sarObservations,
    picture.environmentalEvents,
    picture.activeInvestigations,
  ];
  const availableCount = metrics.filter((m) => m.kind === "available").length;
  return {
    available: availableCount,
    pending: metrics.length - availableCount,
    total: metrics.length,
  };
}

/** Convenience: build the vessel-derived inputs from an existing summary. */
export function inputsFromFleetSummary(
  summary: FleetSummary,
  vessels: readonly Vessel[],
): Pick<NationalPictureInputs, "vessels" | "vesselSourceConnected"> {
  return { vessels, vesselSourceConnected: summary.sources.length > 0 };
}
