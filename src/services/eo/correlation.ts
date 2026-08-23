/**
 * Dark Contact Correlation Engine.
 *
 * Given a SAR detection and whatever AIS was available, produce a ranked
 * list of *candidate* identities with confidence and evidence.
 *
 * ## The rule this engine exists to enforce
 *
 * A SAR return is never automatically identified as a specific vessel.
 * Even the strongest correlation is a hypothesis: two independent
 * observations that plausibly describe the same object. The engine
 * therefore returns candidates, never an identity, and carries the
 * evidence for each so an officer can disagree with it.
 *
 * ## Why "unmatched" and "no AIS coverage" are different statuses
 *
 * Both produce an empty candidate list, and conflating them is the most
 * consequential error available here. "Unmatched" means AIS coverage
 * existed and nothing was near — genuinely interesting. "No coverage"
 * means we could not see, and says nothing whatsoever about the vessel.
 * Reporting the second as the first turns a hole in our data into an
 * accusation.
 *
 * ## What it does not compute
 *
 * Evidence grade comes from `lib/osint/confidence`. Nothing here invents
 * a second confidence scale, and correlation confidence is never mixed
 * with the detector's confidence — one is "is this the same object?", the
 * other is "is this an object at all?".
 */
import { confidenceLevelFor } from "@/lib/osint/confidence";

import { haversineM } from "./ais-gap";
import { supportsUnmatchedConclusion, type AisCoverage } from "./ais-history";
import type {
  AisReport,
  CandidateIdentity,
  CorrelationEvidence,
  CorrelationResult,
  SarDetection,
} from "./types";

const M_PER_NM = 1852;

/**
 * Above this correlation confidence, the top candidate is reported as a
 * match.
 *
 * Set high deliberately. The cost of a false match — an officer briefing
 * that a named vessel was at a position it never occupied — is far worse
 * than the cost of an extra "ambiguous", which merely asks them to look.
 */
export const MATCH_THRESHOLD = 0.75;

/** Below this, a candidate is not worth showing at all. */
export const CANDIDATE_FLOOR = 0.15;

/**
 * Base search radius in metres, before the detection's own positional
 * uncertainty and the AIS extrapolation distance are added.
 */
const BASE_SEARCH_RADIUS_M = 2_000;

export interface CorrelateOptions {
  /** Maximum AIS age either side of acquisition to consider. Default 1 h. */
  readonly maxTimeDeltaSec?: number;
  readonly now?: number;
  /**
   * What the AIS provider declares it actually looked at.
   *
   * When supplied this is **authoritative** for the coverage question,
   * and it is the only way to tell an empty result apart from an
   * unasked one: a provider that ran and covers the area earns the
   * right to have its silence mean `unmatched`; anything else yields
   * `no-ais-coverage`.
   *
   * Omitted, the correlator falls back to inferring coverage from the
   * report count — the pre-Phase-7 behaviour, retained so existing
   * callers keep working, but it cannot distinguish the two cases and
   * resolves ambiguity toward `no-ais-coverage`.
   */
  readonly coverage?: AisCoverage;
}

/**
 * Where an AIS track would have been at `atMs`, dead-reckoned from a
 * report.
 *
 * Straight-line dead reckoning at the reported course and speed. Crude,
 * and it is *why* the search radius grows with the time delta: the
 * further we extrapolate the less the position means, and the correlator
 * must not treat a 40-minute extrapolation as though it were a fix.
 */
function extrapolate(
  report: AisReport,
  atMs: number,
): { latitude: number; longitude: number; extrapolated: boolean } {
  const deltaSec = (atMs - Date.parse(report.reportedAt)) / 1000;
  if (Math.abs(deltaSec) < 1 || report.speedKnots === null || report.courseDeg === null) {
    return { latitude: report.latitude, longitude: report.longitude, extrapolated: false };
  }

  const distanceM = (report.speedKnots * M_PER_NM * deltaSec) / 3600;
  const bearing = (report.courseDeg * Math.PI) / 180;
  const dNorthM = distanceM * Math.cos(bearing);
  const dEastM = distanceM * Math.sin(bearing);

  const latitude = report.latitude + dNorthM / 111_320;
  const lonScale = Math.cos((report.latitude * Math.PI) / 180) * 111_320;
  const longitude = report.longitude + (lonScale > 1 ? dEastM / lonScale : 0);

  return { latitude, longitude, extrapolated: true };
}

/** The AIS report nearest in time to acquisition, per vessel. */
function nearestPerVessel(
  reports: readonly AisReport[],
  acquiredMs: number,
  maxTimeDeltaSec: number,
): readonly AisReport[] {
  const best = new Map<string, { report: AisReport; delta: number }>();
  for (const report of reports) {
    const delta = Math.abs(acquiredMs - Date.parse(report.reportedAt)) / 1000;
    if (delta > maxTimeDeltaSec) continue;
    const current = best.get(report.mmsi);
    if (!current || delta < current.delta) best.set(report.mmsi, { report, delta });
  }
  return [...best.values()].map((entry) => entry.report);
}

/**
 * Score one AIS track against one detection.
 *
 * Returns null when the track is outside the search radius — not a
 * zero-confidence candidate, because a vessel 40 km away is not a weak
 * candidate, it is not a candidate.
 */
function scoreCandidate(
  detection: SarDetection,
  report: AisReport,
  acquiredMs: number,
): CandidateIdentity | null {
  const projected = extrapolate(report, acquiredMs);
  const distanceM = haversineM(detection.position, projected);
  const timeDeltaSec = Math.abs(acquiredMs - Date.parse(report.reportedAt)) / 1000;

  // The radius widens with how far we had to extrapolate: an hour-old
  // report dead-reckoned forward could be a mile off through a single
  // course change.
  const extrapolationSlackM = projected.extrapolated ? Math.min(3_000, timeDeltaSec * 2) : 0;
  const searchRadiusM = BASE_SEARCH_RADIUS_M + detection.positionUncertaintyM + extrapolationSlackM;

  if (distanceM > searchRadiusM) return null;

  const evidence: CorrelationEvidence[] = [];

  // ── Spatial proximity. The dominant factor, and rightly so. ──────
  const spatial = 1 - Math.min(1, distanceM / searchRadiusM);
  evidence.push({
    factor: "spatial-proximity",
    detail: `AIS position ${Math.round(distanceM)} m from the detection, within a ${Math.round(searchRadiusM)} m search radius.`,
    contribution: Number((spatial * 0.5).toFixed(3)),
  });

  // ── Temporal proximity. ──────────────────────────────────────────
  const temporal = 1 - Math.min(1, timeDeltaSec / 3600);
  evidence.push({
    factor: "temporal-proximity",
    detail: projected.extrapolated
      ? `Nearest AIS report ${Math.round(timeDeltaSec)} s from acquisition; position dead-reckoned to acquisition time.`
      : `AIS report effectively simultaneous with acquisition (${Math.round(timeDeltaSec)} s).`,
    contribution: Number((temporal * 0.2).toFixed(3)),
  });

  let score = spatial * 0.5 + temporal * 0.2;

  // ── Length. Weak as confirmation, strong as exclusion. ───────────
  if (detection.estimatedLengthM !== null && report.lengthM !== null && report.lengthM > 0) {
    const ratio = detection.estimatedLengthM / report.lengthM;
    if (ratio > 0.7 && ratio < 1.4) {
      const agreement = 1 - Math.abs(1 - ratio) / 0.4;
      evidence.push({
        factor: "length-agreement",
        detail: `SAR length estimate ${Math.round(detection.estimatedLengthM)} m against AIS ${Math.round(report.lengthM)} m.`,
        contribution: Number((agreement * 0.3).toFixed(3)),
      });
      score += agreement * 0.3;
    } else {
      // A 60 m return is not a 300 m tanker. This is the engine's
      // sharpest discriminator, so it is allowed to dominate.
      evidence.push({
        factor: "length-conflict",
        detail: `SAR length estimate ${Math.round(detection.estimatedLengthM)} m conflicts with AIS ${Math.round(report.lengthM)} m — unlikely to be the same object.`,
        contribution: -0.4,
      });
      score -= 0.4;
    }
  }

  // ── Heading. SAR cannot resolve the 180° ambiguity, so the ───────
  //    detection heading is treated as an axis, not a direction.
  if (detection.estimatedHeadingDeg !== null && report.courseDeg !== null) {
    const raw = Math.abs(detection.estimatedHeadingDeg - report.courseDeg) % 360;
    const separation = Math.min(raw, 360 - raw);
    const axial = Math.min(separation, 180 - separation);
    if (axial < 30) {
      const agreement = 1 - axial / 30;
      evidence.push({
        factor: "heading-agreement",
        detail: `SAR heading axis within ${Math.round(axial)}° of the AIS course (180° ambiguity not resolved).`,
        contribution: Number((agreement * 0.1).toFixed(3)),
      });
      score += agreement * 0.1;
    }
  }

  const confidence = Number(Math.max(0, Math.min(1, score)).toFixed(3));
  if (confidence < CANDIDATE_FLOOR) return null;

  return {
    mmsi: report.mmsi,
    imo: report.imo,
    name: report.name,
    confidence,
    // Grade from the OSINT engine's own thresholds. No second scale.
    grade: confidenceLevelFor(confidence),
    distanceM: Math.round(distanceM),
    timeDeltaSec: Math.round(timeDeltaSec),
    positionExtrapolated: projected.extrapolated,
    evidence,
  };
}

/**
 * Correlate one detection against the available AIS picture.
 *
 * `aisReports` must be everything available for the area and window. An
 * empty array is read as no coverage, not as an empty sea, so callers
 * must not pre-filter it down to nothing.
 */
export function correlateDetection(
  detection: SarDetection,
  aisReports: readonly AisReport[],
  options: CorrelateOptions = {},
): CorrelationResult {
  const maxTimeDeltaSec = options.maxTimeDeltaSec ?? 3600;
  const acquiredMs = Date.parse(detection.acquiredAt);
  const correlatedAt = new Date(options.now ?? Date.now()).toISOString();
  const searchRadiusM = BASE_SEARCH_RADIUS_M + detection.positionUncertaintyM;

  // A provider that actually ran and covers this area has earned the
  // right to have its silence mean something. Without that declaration,
  // an empty result is our blindness and nothing more.
  const coverageSupportsConclusion = options.coverage
    ? supportsUnmatchedConclusion(options.coverage)
    : aisReports.length > 0;

  const nearest =
    aisReports.length > 0 ? nearestPerVessel(aisReports, acquiredMs, maxTimeDeltaSec) : [];

  if (nearest.length === 0) {
    return {
      detectionId: detection.id,
      // Declared coverage with zero reports is an observation about the
      // world: AIS was watching and nothing was transmitting here.
      status: coverageSupportsConclusion ? "unmatched" : "no-ais-coverage",
      candidates: [],
      aisReportsConsidered: nearest.length,
      searchRadiusM,
      correlatedAt,
    };
  }

  const candidates = nearest
    .map((report) => scoreCandidate(detection, report, acquiredMs))
    .filter((candidate): candidate is CandidateIdentity => candidate !== null)
    .sort((a, b) => b.confidence - a.confidence);

  const top = candidates[0];
  const status = !top ? "unmatched" : top.confidence >= MATCH_THRESHOLD ? "matched" : "ambiguous";

  return {
    detectionId: detection.id,
    status,
    candidates,
    aisReportsConsidered: nearest.length,
    searchRadiusM,
    correlatedAt,
  };
}

/**
 * Correlate many detections against one AIS picture.
 *
 * Each detection is scored independently — one SAR return being explained
 * does not make its neighbour more or less likely to be, and pretending
 * otherwise would smuggle in an assignment problem nobody asked for.
 */
export function correlateDetections(
  detections: readonly SarDetection[],
  aisReports: readonly AisReport[],
  options: CorrelateOptions = {},
): readonly CorrelationResult[] {
  return detections.map((detection) => correlateDetection(detection, aisReports, options));
}
