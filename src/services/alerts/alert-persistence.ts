/**
 * From a reconciliation decision to a durable write.
 *
 * `reconcileFleetApproach` says what should happen; the repository knows
 * how to store things. Neither should know about the other. This is the
 * seam between them, and it is deliberately the only place that knows
 * both — a coordinator with one job is auditable in a way that the same
 * logic scattered across a runner and a repository is not.
 *
 * ## It performs decisions; it does not make them
 *
 * There is no eligibility check here, no severity derivation, no arrival
 * arithmetic and no threshold. Every one of those arrives decided. What
 * this adds is the handling of the two things only storage can tell you:
 * that another worker got there first, and that the record moved under
 * you.
 *
 * ## Converging rather than failing
 *
 * A duplicate-episode collision is a normal outcome of two workers
 * assessing the same fleet, not an error. The correct final state — one
 * active episode — already exists, so the loser adopts it and continues.
 * Treating that as a failure would turn a working system into a noisy
 * one.
 */
import type { FleetApproachEntry, FleetApproachResult } from "@/services/geospatial/fleet-approach";

import { SEVERITY_FOR_CONDITION } from "./arrival-alert";
import {
  reconcileFleetApproach,
  type ReconcileContext,
  type ReconcileOutcome,
} from "./alert-reconciliation";
import type { AlertRepository, StoredAlert } from "./alert-repository";
import type { ReconcilableAlert } from "./alert-episode";

/** What one vessel's outcome did to storage. */
export type PersistedOutcome =
  | "RAISED"
  /** Another worker raised it first. The episode exists; this converged. */
  | "RAISE_CONVERGED"
  | "ESCALATED"
  | "UPDATED"
  | "UNCHANGED"
  | "MARKED_UNASSESSABLE"
  /** Reported only. An ended condition is never a resolution. */
  | "CONDITION_ENDED"
  | "NO_ALERT"
  /** The record moved mid-pass. Left alone; the next pass re-reads. */
  | "VERSION_CONFLICT"
  | "STORE_UNAVAILABLE";

export interface PersistenceReport {
  readonly outcomes: ReadonlyMap<string, PersistedOutcome>;
  readonly raised: number;
  readonly escalated: number;
  readonly updated: number;
  readonly unassessable: number;
  readonly conflicts: number;
  /** Non-fatal storage failures, kept so a caller can report degradation. */
  readonly failures: readonly string[];
}

/**
 * Reconcile a fleet assessment and persist every outcome.
 *
 * Reads the alerts once, decides in one pure pass, then writes. Running
 * it repeatedly on the same assessment is safe: reconciliation returns
 * `UNCHANGED` for everything already recorded, so a retry after a lost
 * response performs no second raise and writes no second event.
 */
export async function persistFleetReconciliation(
  result: FleetApproachResult,
  repository: AlertRepository,
  context: ReconcileContext,
): Promise<PersistenceReport> {
  const outcomes = new Map<string, PersistedOutcome>();
  const failures: string[] = [];
  let raised = 0;
  let escalated = 0;
  let updated = 0;
  let unassessable = 0;
  let conflicts = 0;

  const entries = [...result.approaching, ...result.inside, ...result.unassessable];
  const byImo = new Map(entries.map((entry) => [entry.vessel.identity.imo, entry]));

  /*
   * The alerts as reconciliation needs to see them, read before any write.
   * A snapshot rather than a live view, so no vessel's outcome can depend
   * on the order the batch happened to run in.
   */
  const held = await activeAlertsFor(repository, [...byImo.keys()]);
  const reconcilable: ReconcilableAlert[] = held.map(toReconcilable);
  const versions = new Map(held.map((alert) => [alert.id, alert.version]));

  for (const { imo, outcome } of reconcileFleetApproach(result, reconcilable, context)) {
    const entry = byImo.get(imo);
    const persisted = await persistOne(outcome, entry, repository, context, versions, failures);
    outcomes.set(imo, persisted);

    if (persisted === "RAISED") raised += 1;
    else if (persisted === "ESCALATED") escalated += 1;
    else if (persisted === "UPDATED") updated += 1;
    else if (persisted === "MARKED_UNASSESSABLE") unassessable += 1;
    else if (persisted === "VERSION_CONFLICT") conflicts += 1;
  }

  return { outcomes, raised, escalated, updated, unassessable, conflicts, failures };
}

async function persistOne(
  outcome: ReconcileOutcome,
  entry: FleetApproachEntry | undefined,
  repository: AlertRepository,
  context: ReconcileContext,
  versions: Map<string, number>,
  failures: string[],
): Promise<PersistedOutcome> {
  switch (outcome.kind) {
    case "RAISE": {
      if (!entry) return "NO_ALERT";
      /*
       * The sequence is read from storage rather than carried from the
       * reconciliation decision, because the decision was made against a
       * snapshot and another worker may have closed an episode since.
       * Highest-ever rather than a count: an archived episode must not
       * let a new approach reuse an identity.
       */
      const highest = await repository.highestSequence(outcome.episode.imo);
      const write = await repository.raise({
        episode: { imo: outcome.episode.imo, sequence: highest + 1 },
        vesselName: entry.vessel.identity.name,
        condition: outcome.condition,
        severity: SEVERITY_FOR_CONDITION[outcome.condition],
        evidence: outcome.evidence,
        at: context.assessedAt,
        actor: { type: "SYSTEM" },
      });
      if (write.ok) return "RAISED";
      /*
       * Lost the race. The episode exists and is correct, so this pass
       * adopts it rather than reporting a failure an operator would have
       * to interpret.
       */
      if (write.reason === "DUPLICATE_EPISODE") return "RAISE_CONVERGED";
      return recordFailure(write.reason, failures, outcome.episode.imo);
    }

    case "ESCALATE": {
      const version = versions.get(outcome.alertId);
      if (version == null) return "VERSION_CONFLICT";
      const write = await repository.escalate({
        alertId: outcome.alertId,
        expectedVersion: version,
        from: outcome.from,
        condition: outcome.to,
        severity: SEVERITY_FOR_CONDITION[outcome.to],
        assessment: outcome.assessment,
        at: context.assessedAt,
      });
      if (write.ok) return "ESCALATED";
      // Left for the next pass rather than retried with a fresh read: a
      // retry here would re-decide against state this pass never saw.
      return write.reason === "VERSION_CONFLICT"
        ? "VERSION_CONFLICT"
        : recordFailure(write.reason, failures, outcome.alertId);
    }

    case "UPDATE": {
      const version = versions.get(outcome.alertId);
      if (version == null) return "VERSION_CONFLICT";
      const write = await repository.updateAssessment({
        alertId: outcome.alertId,
        expectedVersion: version,
        assessment: outcome.assessment,
        at: context.assessedAt,
      });
      if (write.ok) return "UPDATED";
      return write.reason === "VERSION_CONFLICT"
        ? "VERSION_CONFLICT"
        : recordFailure(write.reason, failures, outcome.alertId);
    }

    case "UNASSESSABLE": {
      if (!outcome.alertId) return "NO_ALERT";
      const version = versions.get(outcome.alertId);
      if (version == null) return "VERSION_CONFLICT";
      const alert = await repository.getAlert(outcome.alertId);
      /*
       * Recorded once. Saying "still could not assess" on every cycle
       * would bury the moment sight was lost in a column of identical
       * entries — and that moment is the one an officer needs to find.
       */
      if (alert?.currentAssessmentUnavailable) return "UNCHANGED";
      const write = await repository.markAssessmentUnavailable({
        alertId: outcome.alertId,
        expectedVersion: version,
        reason: outcome.reason,
        at: context.assessedAt,
      });
      if (write.ok) return "MARKED_UNASSESSABLE";
      return write.reason === "VERSION_CONFLICT"
        ? "VERSION_CONFLICT"
        : recordFailure(write.reason, failures, outcome.alertId);
    }

    /*
     * Reported, never written. A vessel that stopped approaching has not
     * been dealt with, and an alert that closed itself would remove an
     * officer's workflow item on the strength of the weather changing.
     */
    case "CONDITION_ENDED":
      return "CONDITION_ENDED";

    case "UNCHANGED":
      return "UNCHANGED";

    case "NO_ALERT":
      return "NO_ALERT";
  }
}

function recordFailure(reason: string, failures: string[], subject: string): PersistedOutcome {
  failures.push(`${subject}: ${reason}`);
  return "STORE_UNAVAILABLE";
}

/** The live episodes for a set of hulls, read in one pass. */
async function activeAlertsFor(
  repository: AlertRepository,
  imos: readonly string[],
): Promise<readonly StoredAlert[]> {
  /*
   * Taken from the active list rather than one query per vessel. A fleet
   * of thirty-two would otherwise cost thirty-two round trips per cycle
   * to learn what one query already answers.
   */
  const active = await repository.listActive();
  const wanted = new Set(imos);
  return active.filter((alert) => wanted.has(alert.vessel.imo));
}

function toReconcilable(alert: StoredAlert): ReconcilableAlert {
  return {
    id: alert.id,
    episode: alert.episode,
    vessel: alert.vessel,
    condition: alert.condition,
    state: alert.state,
    currentAssessment: alert.currentAssessment,
  };
}
