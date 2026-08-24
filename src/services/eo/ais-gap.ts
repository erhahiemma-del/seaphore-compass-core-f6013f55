/**
 * AIS Gap Engine.
 *
 * Finds periods when a vessel that had been transmitting stopped, and
 * bounds where it could have been while silent.
 *
 * ## Why this is not AISBehaviourAnalyzer
 *
 * That analyzer answers "did *this vessel* go dark, and how often?" — a
 * per-vessel continuity report feeding OSAE. This engine answers a
 * different question: "was anything dark *here*, when the satellite
 * looked?" It is area-scoped and time-indexed, because its output exists
 * to be intersected with a SAR acquisition.
 *
 * The two do not duplicate: this one computes a reachable-area bound,
 * which continuity reporting has no use for, and it does not segment,
 * contextualise or pattern-match, which is all the analyzer's work.
 *
 * ## What a gap is not
 *
 * A gap is a gap in *our data*. Receiver coverage, satellite revisit,
 * terrestrial range and provider outages all produce them, and none of
 * those is the vessel's doing. Nothing here calls a gap suspicious.
 */
import type { AisGap, AisReport } from "./types";

/** Metres per nautical mile. */
const M_PER_NM = 1852;

/**
 * Below this, a silence is ordinary.
 *
 * Class A transponders report every 2–10 s under way, but terrestrial
 * receivers and satellite passes make minutes-long holes routine. One
 * hour is the point where silence stops being explicable by collection
 * alone — the same threshold family the AIS analyzer uses at 6 h for
 * per-vessel continuity, set lower here because area sweeps want
 * sensitivity and the classifier downstream applies the real scepticism.
 */
export const DEFAULT_GAP_THRESHOLD_SEC = 3600;

/**
 * Speed assumed when the last report carried none.
 *
 * 20 kn is a fast merchant vessel. Assuming fast makes the reachable area
 * larger, which makes correlation *less* likely to declare a match — the
 * error that costs an officer least.
 */
const ASSUMED_MAX_SPEED_KN = 20;

export interface GapOptions {
  /** Silence longer than this counts as a gap. */
  readonly thresholdSec?: number;
  /** Treat the series as running up to here when it ends mid-silence. */
  readonly now?: number;
}

/**
 * Find gaps across a set of AIS reports, which may cover many vessels.
 *
 * Reports are grouped by MMSI and each track examined chronologically. A
 * track whose last report is older than the threshold yields an *open*
 * gap — the vessel has not been heard from since, and the silence has no
 * end yet.
 */
export function findAisGaps(
  reports: readonly AisReport[],
  options: GapOptions = {},
): readonly AisGap[] {
  const thresholdSec = options.thresholdSec ?? DEFAULT_GAP_THRESHOLD_SEC;
  const now = options.now ?? Date.now();

  const byVessel = new Map<string, AisReport[]>();
  for (const report of reports) {
    if (!report.mmsi) continue;
    const list = byVessel.get(report.mmsi);
    if (list) list.push(report);
    else byVessel.set(report.mmsi, [report]);
  }

  const gaps: AisGap[] = [];

  for (const [mmsi, track] of byVessel) {
    const sorted = [...track].sort((a, b) => Date.parse(a.reportedAt) - Date.parse(b.reportedAt));

    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      const durationSec = (Date.parse(current.reportedAt) - Date.parse(previous.reportedAt)) / 1000;
      if (durationSec <= thresholdSec) continue;

      gaps.push({
        id: `gap:${mmsi}:${previous.reportedAt}`,
        mmsi,
        imo: previous.imo ?? current.imo,
        name: previous.name ?? current.name,
        lastReportAt: previous.reportedAt,
        nextReportAt: current.reportedAt,
        durationSec,
        lastPosition: { latitude: previous.latitude, longitude: previous.longitude },
        nextPosition: { latitude: current.latitude, longitude: current.longitude },
        lastSpeedKnots: previous.speedKnots,
        open: false,
        source: previous.source,
      });
    }

    // An open gap: still silent as of `now`.
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    const silentSec = (now - Date.parse(last.reportedAt)) / 1000;
    if (silentSec > thresholdSec) {
      gaps.push({
        id: `gap:${mmsi}:${last.reportedAt}:open`,
        mmsi,
        imo: last.imo,
        name: last.name,
        lastReportAt: last.reportedAt,
        nextReportAt: null,
        durationSec: silentSec,
        lastPosition: { latitude: last.latitude, longitude: last.longitude },
        nextPosition: null,
        lastSpeedKnots: last.speedKnots,
        open: true,
        source: last.source,
      });
    }
  }

  return gaps.sort((a, b) => Date.parse(a.lastReportAt) - Date.parse(b.lastReportAt));
}

/** Is `instant` inside this gap's silence? */
export function gapCoversInstant(gap: AisGap, instantMs: number): boolean {
  const from = Date.parse(gap.lastReportAt);
  const to = gap.nextReportAt ? Date.parse(gap.nextReportAt) : Number.POSITIVE_INFINITY;
  return instantMs > from && instantMs < to;
}

/**
 * How far the vessel could have travelled from its last report by
 * `instantMs`, in metres.
 *
 * A circle, not an ellipse: without a course this is the honest bound,
 * and the vessel may have turned. When a *next* report exists the bound
 * is tightened to what is reachable from both ends, since the vessel
 * demonstrably got there.
 */
export function reachableRadiusM(gap: AisGap, instantMs: number): number {
  const speedKn = gap.lastSpeedKnots ?? ASSUMED_MAX_SPEED_KN;
  // A stopped vessel can still get under way, so never bound below the
  // assumed maximum when the reported speed is near zero.
  const effectiveKn = Math.max(speedKn, ASSUMED_MAX_SPEED_KN);
  const elapsedH = Math.max(0, (instantMs - Date.parse(gap.lastReportAt)) / 3_600_000);
  const fromLast = effectiveKn * elapsedH * M_PER_NM;

  if (!gap.nextReportAt) return fromLast;

  const remainingH = Math.max(0, (Date.parse(gap.nextReportAt) - instantMs) / 3_600_000);
  const fromNext = effectiveKn * remainingH * M_PER_NM;
  return Math.min(fromLast, fromNext);
}

/** Great-circle distance in metres. */
export function haversineM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Could the vessel in this gap have been at `position` at `instantMs`?
 *
 * Returns null when the gap does not cover the instant at all. A `true`
 * means only that the geometry permits it — never that it was there.
 */
export function gapCouldReach(
  gap: AisGap,
  position: { latitude: number; longitude: number },
  instantMs: number,
): { reachable: boolean; distanceM: number; radiusM: number } | null {
  if (!gapCoversInstant(gap, instantMs)) return null;
  const distanceM = haversineM(gap.lastPosition, position);
  const radiusM = reachableRadiusM(gap, instantMs);
  return { reachable: distanceM <= radiusM, distanceM, radiusM };
}
