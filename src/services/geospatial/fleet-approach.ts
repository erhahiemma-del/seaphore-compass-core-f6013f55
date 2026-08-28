/**
 * Which vessels are heading for Nigerian waters, and how sure we are.
 *
 * `assessApproach` answers that for one hull. This runs it across the
 * fleet and keeps only what the officer asked about — which is a
 * different job, and one that must not quietly invent the parts the
 * per-vessel engine refused to supply.
 *
 * ## It filters; it does not estimate
 *
 * Every number here comes from `assessApproach`. A vessel whose arrival
 * cannot be derived — stopped, heading away, no speed — comes back with
 * `basis: "UNAVAILABLE"` and is reported as unassessable rather than
 * given a plausible time. That distinction is the whole value of the
 * result: an officer can act on four vessels arriving within a day, and
 * cannot act on four vessels that might be.
 *
 * ## The threshold is the officer's, not ours
 *
 * "Within 24 hours" and "within 72 hours" produce different fleets from
 * the same positions. The horizon is passed in, never assumed here, so
 * the answer always corresponds to the question that was asked.
 */
import {
  assessApproach,
  DEFAULT_APPROACH_THRESHOLDS,
  NIGERIAN_WATERS_ACCURACY,
  NIGERIAN_WATERS_CAVEAT,
  type ApproachThresholds,
  type BoundaryAssessment,
} from "./maritime-boundary";
import type { LonLat } from "./types";
import type { Vessel } from "./vessel";
import { positionAgeMs } from "./vessel";

export interface FleetApproachEntry {
  readonly vessel: Vessel;
  readonly assessment: BoundaryAssessment;
  /**
   * Whether the position behind this assessment is fresh enough to act
   * on. Carried rather than applied: an officer may still want to see a
   * stale contact, but must never be shown its arrival time as current.
   */
  readonly positionAgeMs: number;
}

export interface FleetApproachResult {
  /** Vessels meeting the requested horizon, soonest first. */
  readonly approaching: readonly FleetApproachEntry[];
  /** Already inside the displayed boundary. */
  readonly inside: readonly FleetApproachEntry[];
  /**
   * Vessels the engine could not assess, with the reason it gave.
   *
   * Reported rather than dropped. A count of four approaching vessels
   * means something different when eleven others could not be assessed
   * at all, and hiding that turns a partial answer into a confident one.
   */
  readonly unassessable: readonly FleetApproachEntry[];
  /** How many vessels were considered, before any filtering. */
  readonly assessedCount: number;
  readonly thresholdHours: number;
  readonly boundaryAccuracy: typeof NIGERIAN_WATERS_ACCURACY;
  readonly boundaryCaveat: string;
}

export interface FleetApproachOptions {
  /** The horizon the officer asked about. */
  readonly thresholdHours: number;
  readonly thresholds?: ApproachThresholds;
  readonly now?: number;
}

/**
 * Assess the fleet against the boundary.
 *
 * Takes the vessels the caller already holds rather than fetching. The
 * map is what has live positions, and a second retrieval path would
 * produce an answer that could disagree with what the officer is
 * looking at.
 */
export function assessFleetApproach(
  vessels: readonly Vessel[],
  ring: readonly LonLat[],
  options: FleetApproachOptions,
): FleetApproachResult {
  const now = options.now ?? Date.now();
  const thresholds = options.thresholds ?? DEFAULT_APPROACH_THRESHOLDS;

  const approaching: FleetApproachEntry[] = [];
  const inside: FleetApproachEntry[] = [];
  const unassessable: FleetApproachEntry[] = [];

  for (const vessel of vessels) {
    const assessment = assessApproach(
      {
        position: [vessel.position.lon, vessel.position.lat],
        speed: vessel.position.speed,
        heading: vessel.position.heading,
        /*
         * Passed through rather than pre-filtered. The engine already
         * knows that an unreported course cannot project an arrival —
         * `heading` is a required number, so a source with no bearing
         * yields 0 and would otherwise read as a confident northerly
         * track. Deciding that here as well would be the same rule in
         * two places, free to disagree.
         */
        headingReported: vessel.position.headingReported,
        reportedEtaHours: vessel.position.etaHours,
      },
      ring,
      thresholds,
    );

    const entry: FleetApproachEntry = {
      vessel,
      assessment,
      positionAgeMs: positionAgeMs(vessel.position, now),
    };

    if (assessment.relation === "INSIDE_DISPLAYED_BOUNDARY") {
      inside.push(entry);
      continue;
    }
    if (assessment.basis === "UNAVAILABLE" || assessment.hoursToBoundary == null) {
      unassessable.push(entry);
      continue;
    }
    /*
     * The officer's horizon, applied last. A vessel eight hours out is
     * in a 24-hour answer and in a 72-hour one; a vessel sixty hours out
     * is only in the second.
     */
    if (assessment.hoursToBoundary <= options.thresholdHours) approaching.push(entry);
  }

  approaching.sort(
    (a, b) =>
      (a.assessment.hoursToBoundary ?? Infinity) - (b.assessment.hoursToBoundary ?? Infinity),
  );

  return {
    approaching,
    inside,
    unassessable,
    assessedCount: vessels.length,
    thresholdHours: options.thresholdHours,
    boundaryAccuracy: NIGERIAN_WATERS_ACCURACY,
    boundaryCaveat: NIGERIAN_WATERS_CAVEAT,
  };
}

/**
 * One sentence an officer can act on, or be told they cannot.
 *
 * Never rounds a partial answer into a confident one: when vessels could
 * not be assessed, the count says so in the same breath as the result.
 */
export function describeFleetApproach(result: FleetApproachResult): string {
  const { approaching, unassessable, thresholdHours } = result;

  if (approaching.length === 0) {
    const base = `No vessels meet the ${thresholdHours}-hour approach threshold.`;
    return unassessable.length > 0
      ? `${base} ${unassessable.length} could not be assessed from the available data.`
      : base;
  }

  const plural = approaching.length === 1 ? "vessel" : "vessels";
  const base = `${approaching.length} ${plural} meet the ${thresholdHours}-hour approach threshold.`;
  return unassessable.length > 0
    ? `${base} ${unassessable.length} could not be assessed from the available data.`
    : base;
}
