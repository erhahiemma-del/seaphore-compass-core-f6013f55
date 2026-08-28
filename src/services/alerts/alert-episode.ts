/**
 * One approach, one alert.
 *
 * The fleet is reassessed continuously. Without an identity that
 * survives reassessment, a vessel eighteen hours out generates a fresh
 * alert every cycle, the notification count climbs into the hundreds,
 * and officers learn to ignore the whole surface. That failure is the
 * reason this module exists, and it is a failure of identity rather than
 * of filtering.
 *
 * ## What makes two observations the same episode
 *
 * The same vessel, still approaching, on an alert nobody has finished
 * with. That is the whole rule. The threshold it crossed is *not* part
 * of the identity — a vessel moving from 48 hours out to 24 is the same
 * approach getting closer, and raising a second alert would double-count
 * one event.
 *
 * ## What makes a new episode
 *
 * The previous alert reached a terminal state and the vessel approached
 * again. That is a genuinely new operational event: an officer resolved
 * something, and the situation recurred. It should be visible, dated,
 * and separate — which is also why a closed alert can never reopen.
 */
import {
  isMoreUrgent,
  type AlertCondition,
  type AlertEvidence,
  type AlertVesselRef,
} from "./arrival-alert";
import { isActive, type AlertState } from "./alert-lifecycle";

/**
 * The stable key for an approach episode.
 *
 * IMO plus a sequence number. Not the condition, because the condition
 * changes as the vessel closes; not the name, because a rename must not
 * orphan a live alert.
 */
export interface EpisodeKey {
  readonly imo: string;
  /** 1 for the vessel's first episode, incrementing per new approach. */
  readonly sequence: number;
}

export function episodeId(key: EpisodeKey): string {
  return `${key.imo}#${key.sequence}`;
}

/** The minimum an existing alert must expose to be reconciled against. */
export interface ReconcilableAlert {
  readonly id: string;
  readonly episode: EpisodeKey;
  readonly vessel: AlertVesselRef;
  readonly condition: AlertCondition;
  readonly state: AlertState;
  /**
   * The latest assessment already recorded, when there is one.
   *
   * Read so an unchanged feed can be recognised as unchanged. Without
   * it every polling cycle would look like news and the event history
   * would fill with identical records.
   */
  readonly currentAssessment?: AlertEvidence;
}

export type Reconciliation =
  /** Nothing to do — the same episode, at the same urgency. */
  | { readonly kind: "UNCHANGED"; readonly alertId: string }
  /**
   * The same episode, but closer. The existing alert is escalated
   * rather than replaced, so its history and acknowledgement survive.
   */
  | {
      readonly kind: "ESCALATE";
      readonly alertId: string;
      readonly from: AlertCondition;
      readonly to: AlertCondition;
    }
  /** No live alert for this vessel. Raise one. */
  | { readonly kind: "RAISE"; readonly episode: EpisodeKey };

/**
 * Decide what an assessment means for the alerts already held.
 *
 * Pure, and takes the existing alerts rather than reading a store, so
 * the rule can be reasoned about and tested without any state at all.
 */
export function reconcile(
  vessel: AlertVesselRef,
  condition: AlertCondition,
  existing: readonly ReconcilableAlert[],
): Reconciliation {
  const forVessel = existing.filter((alert) => alert.vessel.imo === vessel.imo);
  const live = forVessel.find((alert) => isActive(alert.state));

  if (live) {
    /*
     * An episode already open. Closing in raises its urgency; drifting
     * back out does not lower it — an alert an officer has been asked to
     * look at does not quietly downgrade itself while they are deciding.
     */
    return isMoreUrgent(condition, live.condition)
      ? { kind: "ESCALATE", alertId: live.id, from: live.condition, to: condition }
      : { kind: "UNCHANGED", alertId: live.id };
  }

  /*
   * Every prior episode is finished, so this approach is a new one. The
   * sequence continues from the highest already seen rather than the
   * count, so a deleted record cannot cause a collision.
   */
  const highest = forVessel.reduce((max, alert) => Math.max(max, alert.episode.sequence), 0);
  return { kind: "RAISE", episode: { imo: vessel.imo, sequence: highest + 1 } };
}

/**
 * Whether an assessment should raise or touch an alert at all.
 *
 * A condition the evidence cannot establish produces nothing. An
 * assessment that could not derive an arrival is not a quiet all-clear
 * and must not become an alert asserting a horizon nobody computed —
 * the caller reports it as unassessable instead.
 */
export function isAlertable(condition: AlertCondition | null): condition is AlertCondition {
  return condition != null;
}
