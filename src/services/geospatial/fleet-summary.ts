/**
 * GIP — Fleet summary.
 *
 * Condenses the currently loaded vessel set into a compact, factual
 * structure any consumer can read — the Copilot, a briefing, an export.
 *
 * Built entirely from existing models: freshness bands from
 * `freshness.ts`, confidence from the observations themselves, provenance
 * from `VesselProvenance`. Nothing is scored, ranked or inferred here.
 *
 * The prose form is deliberately conservative. It states counts, spans and
 * provenance, and it states what is *absent* — because a summary that
 * silently omits "no IMO, no course" would let a reader assume the data is
 * richer than it is.
 */
import { freshnessDistribution, type FreshnessBand } from "./freshness";
import type { RiskLevel } from "./types";
import { positionAgeMs, type Vessel } from "./vessel";

/** A factual snapshot of the loaded fleet. */
export interface FleetSummary {
  readonly vesselCount: number;
  /** Distinct providers contributing, by source id. */
  readonly sources: readonly string[];
  readonly riskCounts: Readonly<Record<RiskLevel, number>>;
  readonly freshness: Readonly<Record<FreshnessBand, number>>;
  /** Mean confidence across vessels that carry one, or null. */
  readonly averageConfidence: number | null;
  /** Oldest and newest observation timestamps, ISO, or null when empty. */
  readonly observedFrom: string | null;
  readonly observedTo: string | null;
  /** Flags present, most frequent first. */
  readonly topFlags: ReadonlyArray<{ readonly flag: string; readonly count: number }>;
  /** Counts of fields absent across the fleet — stated, never hidden. */
  readonly missing: {
    readonly mmsi: number;
    readonly flag: number;
    readonly course: number;
    readonly speed: number;
  };
}

/** Build a summary. Pure; `now` is injectable for deterministic output. */
export function summarizeFleet(vessels: readonly Vessel[], now: number = Date.now()): FleetSummary {
  const riskCounts: Record<RiskLevel, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    UNKNOWN: 0,
    CLEAN: 0,
  };
  const sources = new Set<string>();
  const flags = new Map<string, number>();
  let confidenceSum = 0;
  let confidenceCount = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  const missing = { mmsi: 0, flag: 0, course: 0, speed: 0 };

  for (const vessel of vessels) {
    riskCounts[vessel.riskLevel] += 1;
    if (vessel.provenance) sources.add(vessel.provenance.source);
    if (typeof vessel.confidence === "number") {
      confidenceSum += vessel.confidence;
      confidenceCount += 1;
    }
    if (!vessel.identity.mmsi) missing.mmsi += 1;
    if (!vessel.identity.flag) missing.flag += 1;
    else flags.set(vessel.identity.flag, (flags.get(vessel.identity.flag) ?? 0) + 1);
    // Zero is the documented "not reported" default for both fields.
    if (!vessel.position.heading) missing.course += 1;
    if (!vessel.position.speed) missing.speed += 1;

    const at = Date.parse(vessel.position.timestamp);
    if (!Number.isNaN(at)) {
      if (oldest === null || at < oldest) oldest = at;
      if (newest === null || at > newest) newest = at;
    }
  }

  return {
    vesselCount: vessels.length,
    sources: [...sources].sort(),
    riskCounts,
    freshness: freshnessDistribution(
      vessels.map((v) => {
        const age = positionAgeMs(v.position, now);
        return Number.isFinite(age) ? age : null;
      }),
    ),
    averageConfidence: confidenceCount === 0 ? null : confidenceSum / confidenceCount,
    observedFrom: oldest === null ? null : new Date(oldest).toISOString(),
    observedTo: newest === null ? null : new Date(newest).toISOString(),
    topFlags: [...flags.entries()]
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    missing,
  };
}

/**
 * Render a summary as prose for an LLM prompt or a briefing.
 *
 * States absences explicitly. A summary that omitted "no course reported"
 * would let a reader conclude the vessels are stationary or northbound,
 * which the data does not support.
 */
export function describeFleet(summary: FleetSummary): string {
  if (summary.vesselCount === 0) {
    return "No vessels are currently loaded. The map is showing geography only.";
  }

  const parts: string[] = [];
  parts.push(
    `${summary.vesselCount} vessels loaded from ${summary.sources.length} provider(s): ${summary.sources.join(", ") || "unknown"}.`,
  );

  if (summary.observedFrom && summary.observedTo) {
    parts.push(`Observations span ${summary.observedFrom} to ${summary.observedTo}.`);
  }

  const fresh = summary.freshness;
  parts.push(
    `Freshness — fresh ${fresh.fresh}, recent ${fresh.recent}, ageing ${fresh.ageing}, stale ${fresh.stale}, unknown ${fresh.unknown}.`,
  );

  if (summary.averageConfidence !== null) {
    parts.push(`Mean confidence ${(summary.averageConfidence * 100).toFixed(0)}%.`);
  }

  const risks = Object.entries(summary.riskCounts)
    .filter(([, n]) => n > 0)
    .map(([band, n]) => `${band} ${n}`)
    .join(", ");
  parts.push(`Risk bands — ${risks}.`);

  if (summary.topFlags.length > 0) {
    parts.push(`Flags — ${summary.topFlags.map((f) => `${f.flag} ${f.count}`).join(", ")}.`);
  }

  const absent: string[] = [];
  if (summary.missing.mmsi > 0) absent.push(`${summary.missing.mmsi} without MMSI`);
  if (summary.missing.flag > 0) absent.push(`${summary.missing.flag} without flag`);
  if (summary.missing.course > 0) absent.push(`${summary.missing.course} without course`);
  if (summary.missing.speed > 0) absent.push(`${summary.missing.speed} without speed`);
  if (absent.length > 0) {
    parts.push(
      `Data gaps — ${absent.join(", ")}. Treat these as unreported, not as zero or stationary.`,
    );
  }

  return parts.join(" ");
}
