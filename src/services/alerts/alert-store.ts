/**
 * The alerts currently held, and the one place they change.
 *
 * The domain below this file decides things: whether an assessment is
 * eligible, which episode it belongs to, what a transition is allowed to
 * do. None of it holds anything. This holds — and holds *only* — so that
 * "which alerts exist right now" has exactly one answer for the map, the
 * notification centre, the drawer and the audio scheduler to read.
 *
 * ## It applies outcomes; it does not make them
 *
 * `reconcileFleetApproach` returns what should happen. This performs it,
 * through the domain's own `raiseAlert`, `escalateAlert`,
 * `updateCurrentAssessment` and `markAssessmentUnavailable`. There is no
 * second rule here about when an alert appears, escalates or goes quiet,
 * because a store that decided as well as held would be free to disagree
 * with the engine it was built to serve.
 *
 * ## Nothing is removed
 *
 * Resolving and closing are transitions, not deletions. An alert an
 * officer dealt with stays readable afterwards — that record is the point
 * of having a lifecycle rather than a list. `CONDITION_ENDED` likewise
 * only reports: a vessel that stopped approaching did not resolve
 * anything, and an alert that cleared itself would take the officer's
 * workflow item with it.
 *
 * ## In memory, and honest about it
 *
 * There is no arrival-alert table. `public.alerts` exists but is a
 * different, older signal-linked concept with no episode identity, no
 * approach evidence and a different lifecycle; writing this domain into
 * it would silently merge two models. Until a schema exists these alerts
 * live for the session, and every surface that shows them must say so
 * rather than implying a record that would survive a reload.
 */
import type { FleetApproachResult } from "@/services/geospatial/fleet-approach";

import {
  escalateAlert,
  markAssessmentUnavailable,
  raiseAlert,
  updateCurrentAssessment,
  type ArrivalInterventionAlert,
} from "./index";
import { isActive, type AlertState } from "./alert-lifecycle";
import type { ReconcilableAlert } from "./alert-episode";
import {
  reconcileFleetApproach,
  type ReconcileContext,
  type ReconcileOutcome,
} from "./alert-reconciliation";

/** What one reconciliation pass did, for callers that react to change. */
export interface AlertStoreChange {
  /** Alerts newly raised in this pass. The audio and badge cues read this. */
  readonly raised: readonly ArrivalInterventionAlert[];
  /** Alerts whose condition became more urgent. */
  readonly escalated: readonly ArrivalInterventionAlert[];
  /** Vessels whose latest assessment could not be made. */
  readonly unassessable: number;
  /**
   * Alerts whose approach condition no longer holds.
   *
   * Reported so a surface can say so; never acted on. An officer closes
   * an alert, a change in the weather does not.
   */
  readonly conditionEnded: readonly ArrivalInterventionAlert[];
}

export type AlertStoreListener = (
  alerts: readonly ArrivalInterventionAlert[],
  change: AlertStoreChange,
) => void;

/**
 * Whether an alert still counts against the officer's attention.
 *
 * Acknowledged is deliberately still active. An officer saying "seen"
 * is not an officer saying "dealt with", and dropping it from the count
 * at that point would reward dismissing alerts over resolving them.
 */
export function isActiveAlert(alert: ArrivalInterventionAlert): boolean {
  return isActive(alert.state);
}

const EMPTY_CHANGE: AlertStoreChange = {
  raised: [],
  escalated: [],
  unassessable: 0,
  conditionEnded: [],
};

export class ArrivalAlertStore {
  private alerts = new Map<string, ArrivalInterventionAlert>();
  private readonly listeners = new Set<AlertStoreListener>();

  /** Every alert held, active or not, newest episode first. */
  snapshot(): readonly ArrivalInterventionAlert[] {
    return [...this.alerts.values()];
  }

  /** Only the alerts still counting against an officer's attention. */
  active(): readonly ArrivalInterventionAlert[] {
    return this.snapshot().filter(isActiveAlert);
  }

  get(alertId: string): ArrivalInterventionAlert | undefined {
    return this.alerts.get(alertId);
  }

  /** The live alert for a hull, when there is one. */
  forVessel(imo: string): ArrivalInterventionAlert | undefined {
    return this.snapshot().find((alert) => alert.vessel.imo === imo && isActiveAlert(alert));
  }

  subscribe(listener: AlertStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Apply a fleet assessment.
   *
   * Idempotent by construction: reconciliation compares the assessment
   * against what is already held, so running this every polling cycle on
   * an unchanged feed produces `UNCHANGED` for every vessel and no
   * notification at all. That property is the reason the officer's alert
   * list does not climb into the hundreds.
   */
  apply(result: FleetApproachResult, context: ReconcileContext, actor: string): AlertStoreChange {
    const reconcilable: ReconcilableAlert[] = this.snapshot().map((alert) => ({
      id: alert.id,
      episode: alert.episode,
      vessel: alert.vessel,
      condition: alert.condition,
      state: alert.state,
      currentAssessment: alert.currentAssessment,
    }));

    const raised: ArrivalInterventionAlert[] = [];
    const escalated: ArrivalInterventionAlert[] = [];
    const conditionEnded: ArrivalInterventionAlert[] = [];
    let unassessable = 0;

    for (const { imo, outcome } of reconcileFleetApproach(result, reconcilable, context)) {
      const applied = this.applyOutcome(outcome, result, imo, context, actor);
      if (applied?.kind === "RAISE") raised.push(applied.alert);
      if (applied?.kind === "ESCALATE") escalated.push(applied.alert);
      if (applied?.kind === "CONDITION_ENDED") conditionEnded.push(applied.alert);
      if (outcome.kind === "UNASSESSABLE") unassessable += 1;
    }

    const change: AlertStoreChange = { raised, escalated, unassessable, conditionEnded };
    if (raised.length || escalated.length || conditionEnded.length) this.emit(change);
    else if (unassessable !== 0) this.emit(change);
    return change;
  }

  private applyOutcome(
    outcome: ReconcileOutcome,
    result: FleetApproachResult,
    imo: string,
    context: ReconcileContext,
    actor: string,
  ): { kind: string; alert: ArrivalInterventionAlert } | null {
    switch (outcome.kind) {
      case "RAISE": {
        /*
         * The vessel reference comes from the assessment that raised the
         * alert, so the alert records the hull as the source described it
         * at that moment rather than as it is described later.
         */
        const entry = [...result.approaching, ...result.inside].find(
          (candidate) => candidate.vessel.identity.imo === imo,
        );
        if (!entry) return null;
        const alert = raiseAlert({
          episode: outcome.episode,
          vessel: { imo, name: entry.vessel.identity.name },
          condition: outcome.condition,
          evidence: outcome.evidence,
          actor,
          at: context.assessedAt,
        });
        this.alerts.set(alert.id, alert);
        return { kind: "RAISE", alert };
      }
      case "ESCALATE": {
        const held = this.alerts.get(outcome.alertId);
        if (!held) return null;
        const escalatedAlert = updateCurrentAssessment(
          escalateAlert(held, outcome.to, actor, context.assessedAt),
          outcome.assessment,
          context.assessedAt,
        );
        this.alerts.set(escalatedAlert.id, escalatedAlert);
        return { kind: "ESCALATE", alert: escalatedAlert };
      }
      case "UPDATE": {
        const held = this.alerts.get(outcome.alertId);
        if (!held) return null;
        const updated = updateCurrentAssessment(held, outcome.assessment, context.assessedAt);
        this.alerts.set(updated.id, updated);
        return { kind: "UPDATE", alert: updated };
      }
      case "UNASSESSABLE": {
        if (!outcome.alertId) return null;
        const held = this.alerts.get(outcome.alertId);
        // Already recorded as unassessable: saying so again on every
        // cycle would fill the event history with the same sentence.
        if (!held || held.currentAssessmentUnavailable) return null;
        const marked = markAssessmentUnavailable(held, actor, outcome.reason, context.assessedAt);
        this.alerts.set(marked.id, marked);
        return { kind: "UNASSESSABLE", alert: marked };
      }
      case "CONDITION_ENDED": {
        const held = this.alerts.get(outcome.alertId);
        // Reported, never applied. The alert keeps its state, and only a
        // person moves it out of the officer's list.
        return held ? { kind: "CONDITION_ENDED", alert: held } : null;
      }
      default:
        return null;
    }
  }

  /**
   * Replace one alert with the result of a domain transition.
   *
   * The only way an officer's action reaches the store. It takes the
   * already-transitioned alert rather than a target state, so there is no
   * route in that skips the lifecycle table.
   */
  replace(alert: ArrivalInterventionAlert): void {
    if (!this.alerts.has(alert.id)) return;
    this.alerts.set(alert.id, alert);
    this.emit(EMPTY_CHANGE);
  }

  /** Test and session-teardown support. Never called by a surface. */
  reset(): void {
    this.alerts.clear();
    this.emit(EMPTY_CHANGE);
  }

  private emit(change: AlertStoreChange): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot, change);
  }
}

/** Count of active alerts per severity, for the attention badge. */
export function countBySeverity(
  alerts: readonly ArrivalInterventionAlert[],
): Readonly<Record<"URGENT" | "ATTENTION" | "WATCH", number>> {
  const counts = { URGENT: 0, ATTENTION: 0, WATCH: 0 };
  for (const alert of alerts) counts[alert.severity] += 1;
  return counts;
}

/** Lifecycle states that still count as the officer's open work. */
export const ACTIVE_ALERT_STATES: readonly AlertState[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
];
