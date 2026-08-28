/**
 * Whether an approach assessment deserves an officer's attention.
 *
 * Deliberately downstream. This layer decides nothing about navigation:
 * not the arrival time, not the distance, not the direction, not the
 * boundary relation. Those come from `assessApproach` and arrive here
 * already decided. What this decides is narrower and different — given
 * that assessment, should a human be interrupted?
 *
 * Keeping the two apart is what stops a second navigation rule growing
 * inside the alert layer, where it would silently disagree with the
 * engine the map draws from.
 */
import type { FleetApproachEntry } from "@/services/geospatial/fleet-approach";

import { conditionFor, type AlertCondition } from "./arrival-alert";

/**
 * How old a position may be and still support raising an alert.
 *
 * Interrupting an officer about a vessel whose last report is hours old
 * is asking them to act on a picture that may no longer exist. An
 * *existing* alert is not withdrawn for staleness — that is a separate
 * question, and the answer to it is never "resolved".
 */
export const MAX_AGE_FOR_NEW_ALERT_MS = 30 * 60_000;

export type Eligibility =
  /** The assessment supports raising or maintaining an alert. */
  | { readonly kind: "ELIGIBLE"; readonly condition: AlertCondition }
  /**
   * A real assessment that does not meet any alert condition — outside
   * every threshold, or heading away. A definite negative.
   */
  | { readonly kind: "NOT_ELIGIBLE"; readonly reason: string }
  /**
   * The data could not answer the question. Distinct from a negative,
   * and the distinction is the point: nobody established that this
   * vessel is not approaching.
   */
  | { readonly kind: "UNASSESSABLE"; readonly reason: string };

/**
 * Read an assessment's eligibility, and nothing else.
 *
 * Pure and total: every entry produces exactly one of the three
 * outcomes, so a caller cannot receive silence and read it as safety.
 */
export function evaluateAlertEligibility(
  entry: FleetApproachEntry,
  options: { readonly maxPositionAgeMs?: number } = {},
): Eligibility {
  const maxAge = options.maxPositionAgeMs ?? MAX_AGE_FOR_NEW_ALERT_MS;
  const { assessment } = entry;

  /*
   * No usable arrival basis is not an all-clear. A stopped vessel, or
   * one whose course was never reported, is a vessel nobody has
   * assessed — and reporting that as "not approaching" would be the
   * engine's refusal laundered into a conclusion.
   */
  if (assessment.basis === "UNAVAILABLE") {
    return {
      kind: "UNASSESSABLE",
      reason: "No usable arrival basis. Speed, course or position cannot support an estimate.",
    };
  }

  if (entry.positionAgeMs > maxAge) {
    return {
      kind: "UNASSESSABLE",
      reason: "The position behind this assessment is too old to raise a new alert on.",
    };
  }

  /*
   * The condition comes from the relation and the hours the engine
   * derived — never from distance, and never recomputed here.
   */
  const condition = conditionFor(assessment.relation, assessment.hoursToBoundary);
  if (!condition) {
    return {
      kind: "NOT_ELIGIBLE",
      reason: "Outside every supported approach threshold.",
    };
  }

  return { kind: "ELIGIBLE", condition };
}
