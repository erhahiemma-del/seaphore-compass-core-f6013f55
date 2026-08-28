/**
 * From a fleet assessment to the alerts an officer should see.
 *
 * The production seam. `assessFleetApproach` says where every vessel
 * stands; this says what that means for the alerts already held. It
 * decides nothing about navigation — not arrival, not distance, not
 * direction, not the boundary relation. Those arrive decided, and
 * re-deriving any of them here would create a second navigation rule
 * free to disagree with the engine the map draws from.
 *
 * ## Pure, and deliberately so
 *
 * It reads a result and a list of alerts and returns outcomes. It
 * touches no store, no map, no timer, no audio, no React state. A
 * caller applies the outcomes. That is what makes running it four times
 * on identical input provably harmless — the property that stops one
 * vessel generating an alert per polling cycle.
 */
import type { FleetApproachEntry, FleetApproachResult } from "@/services/geospatial/fleet-approach";

import { evaluateAlertEligibility, type Eligibility } from "./alert-eligibility";
import { isMoreUrgent, type AlertCondition, type AlertEvidence } from "./arrival-alert";
import { isActive } from "./alert-lifecycle";
import type { EpisodeKey, ReconcilableAlert } from "./alert-episode";

/** What a caller should do about one vessel. */
export type ReconcileOutcome =
  /** No alert exists and one should. */
  | {
      readonly kind: "RAISE";
      readonly episode: EpisodeKey;
      readonly condition: AlertCondition;
      readonly evidence: AlertEvidence;
    }
  /** The same alert, closer in. Same id, same episode, same history. */
  | {
      readonly kind: "ESCALATE";
      readonly alertId: string;
      readonly from: AlertCondition;
      readonly to: AlertCondition;
      readonly assessment: AlertEvidence;
    }
  /** The same alert at the same urgency, with a newer position. */
  | { readonly kind: "UPDATE"; readonly alertId: string; readonly assessment: AlertEvidence }
  /** Nothing changed worth recording. */
  | { readonly kind: "UNCHANGED"; readonly alertId: string }
  /**
   * The vessel no longer meets any alert condition.
   *
   * Reported, never acted on. "No longer approaching" is not "an officer
   * resolved this", and an alert that cleared itself would take the
   * officer's workflow item with it.
   */
  | { readonly kind: "CONDITION_ENDED"; readonly alertId: string; readonly reason: string }
  /**
   * The assessment could not be made. The alert stands and its current
   * assessment is marked unavailable — losing sight of a vessel is not
   * an all-clear.
   */
  | { readonly kind: "UNASSESSABLE"; readonly alertId?: string; readonly reason: string }
  /** Nothing to alert on and nothing held. */
  | { readonly kind: "NO_ALERT"; readonly reason: string };

export interface ReconcileContext {
  /** When this assessment ran. Injected so outcomes are deterministic. */
  readonly assessedAt: string;
  /** Which provider supplied the positions behind it. */
  readonly sourceId: string;
  readonly maxPositionAgeMs?: number;
}

export interface VesselReconciliation {
  readonly imo: string;
  readonly outcome: ReconcileOutcome;
}

/**
 * Reconcile a whole fleet assessment against the alerts already held.
 *
 * Every vessel in the result produces exactly one outcome, including the
 * ones that produce nothing — a caller must never receive silence about
 * a vessel and read it as safety.
 */
export function reconcileFleetApproach(
  result: FleetApproachResult,
  existing: readonly ReconcilableAlert[],
  context: ReconcileContext,
): readonly VesselReconciliation[] {
  const outcomes: VesselReconciliation[] = [];

  /*
   * Sequences are read once, from the alerts as supplied, and not
   * updated as outcomes are produced. Two vessels cannot share an
   * episode, so no vessel's decision can affect another's — which is
   * what keeps a batch deterministic regardless of iteration order.
   */
  for (const entry of [...result.approaching, ...result.inside, ...result.unassessable]) {
    const imo = entry.vessel.identity.imo;
    outcomes.push({
      imo,
      outcome: reconcileVessel(entry, result, existing, context),
    });
  }

  return outcomes;
}

/** The decision for one vessel. Exported for testing one case at a time. */
export function reconcileVessel(
  entry: FleetApproachEntry,
  result: FleetApproachResult,
  existing: readonly ReconcilableAlert[],
  context: ReconcileContext,
): ReconcileOutcome {
  const imo = entry.vessel.identity.imo;
  const forVessel = existing.filter((alert) => alert.vessel.imo === imo);
  const live = forVessel.find((alert) => isActive(alert.state));

  const eligibility: Eligibility = evaluateAlertEligibility(entry, {
    maxPositionAgeMs: context.maxPositionAgeMs,
  });

  if (eligibility.kind === "UNASSESSABLE") {
    /*
     * Data loss is not resolution. An existing alert keeps its state and
     * records that the latest look failed; a vessel with no alert does
     * not acquire one on the strength of an assessment that could not be
     * made.
     */
    return { kind: "UNASSESSABLE", alertId: live?.id, reason: eligibility.reason };
  }

  if (eligibility.kind === "NOT_ELIGIBLE") {
    return live
      ? { kind: "CONDITION_ENDED", alertId: live.id, reason: eligibility.reason }
      : { kind: "NO_ALERT", reason: eligibility.reason };
  }

  const assessment = evidenceFrom(entry, result, context);

  if (!live) {
    /*
     * The sequence continues from the highest ever seen for this hull,
     * not the number of records held. A deleted or archived episode must
     * not let a new one reuse an old identity.
     */
    const highest = forVessel.reduce((max, alert) => Math.max(max, alert.episode.sequence), 0);
    return {
      kind: "RAISE",
      episode: { imo, sequence: highest + 1 },
      condition: eligibility.condition,
      evidence: assessment,
    };
  }

  /*
   * Urgency is compared by condition, never by distance. A vessel can
   * be geographically nearer while the assessment supports a weaker
   * condition, and escalating on distance alone would be this layer
   * inventing a navigation rule.
   */
  if (isMoreUrgent(eligibility.condition, live.condition)) {
    return {
      kind: "ESCALATE",
      alertId: live.id,
      from: live.condition,
      to: eligibility.condition,
      assessment,
    };
  }

  /*
   * Same urgency. The position has still moved, so the current
   * assessment is refreshed — but only when it actually differs, so an
   * unchanged feed cannot fill the history with identical records.
   */
  return sameAssessment(live, assessment)
    ? { kind: "UNCHANGED", alertId: live.id }
    : { kind: "UPDATE", alertId: live.id, assessment };
}

/**
 * The assessment in the shape an alert stores.
 *
 * A straight translation. Every value comes from the engine's result;
 * nothing is computed, defaulted or filled in here.
 */
export function evidenceFrom(
  entry: FleetApproachEntry,
  result: FleetApproachResult,
  context: ReconcileContext,
): AlertEvidence {
  return {
    relation: entry.assessment.relation,
    thresholdHours: result.thresholdHours,
    hoursToBoundary: entry.assessment.hoursToBoundary,
    distanceNm: entry.assessment.distanceNm,
    arrivalBasis: entry.assessment.basis,
    boundaryAccuracy: entry.assessment.accuracy,
    rationale: entry.assessment.rationale,
    /*
     * The provider is taken from the vessel's own lineage where it has
     * one, falling back to the run's source. A vessel that changed
     * provider keeps its episode — identity is the hull, not the feed.
     */
    sourceId: entry.vessel.provenance?.source ?? context.sourceId,
    observedAt: entry.vessel.position.timestamp,
    positionAgeMs: entry.positionAgeMs,
    assessedAt: context.assessedAt,
  };
}

/**
 * Whether a new assessment says anything the alert does not already hold.
 *
 * Compared on the substance — relation, arrival, distance, basis — and
 * not on `assessedAt`, which changes on every polling cycle and would
 * make every cycle look like news.
 */
function sameAssessment(alert: ReconcilableAlert, next: AlertEvidence): boolean {
  const current = alert.currentAssessment;
  if (!current) return false;
  return (
    current.relation === next.relation &&
    current.hoursToBoundary === next.hoursToBoundary &&
    current.distanceNm === next.distanceNm &&
    current.arrivalBasis === next.arrivalBasis
  );
}
