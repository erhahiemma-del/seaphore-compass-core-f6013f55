/**
 * The arrival intervention alert domain.
 *
 * Pure logic: no store, no map layer, no sound, no interface. Those come
 * later and will read this. Keeping the domain free of them means the
 * rules that matter — what may transition, what counts as the same
 * approach, what evidence an alert is entitled to claim — can be
 * reasoned about and tested without a browser.
 *
 * An alert is not an investigation and does not become one. It may one
 * day escalate into a case; it must never require one.
 */
export * from "./arrival-alert";
export * from "./alert-lifecycle";
export * from "./alert-episode";
export * from "./alert-eligibility";
export * from "./alert-reconciliation";
export * from "./alert-presentation";
export * from "./alert-repository";
export * from "./alert-repository.supabase";
export * from "./alert-persistence";
export * from "./alert-runner";

import {
  SEVERITY_FOR_CONDITION,
  type AlertCondition,
  type AlertEvidence,
  type AlertVesselRef,
  type AttentionSeverity,
} from "./arrival-alert";
import { alertEvent, type AlertEvent, type AlertState } from "./alert-lifecycle";
import { episodeId, type EpisodeKey } from "./alert-episode";

/**
 * One operational attention episode.
 *
 * `evidence` is the assessment as it stood when the alert was raised and
 * is never recomputed — an officer asking why an alert exists must see
 * what was true then, not a reconstruction from data that has moved.
 * `condition` and `severity` do change, when the same approach closes in.
 */
export interface ArrivalInterventionAlert {
  readonly id: string;
  readonly episode: EpisodeKey;
  readonly vessel: AlertVesselRef;

  readonly condition: AlertCondition;
  readonly severity: AttentionSeverity;
  readonly state: AlertState;

  /** Frozen at creation. The reason this alert exists. */
  readonly evidence: AlertEvidence;
  /**
   * The latest assessment for this vessel, replaced as the fleet is
   * reassessed.
   *
   * Separate from `evidence` on purpose, and the separation is the
   * whole point of having both: an officer must be able to see why the
   * alert was raised *and* where the vessel is now, and those are
   * different questions with different answers. Overwriting the first
   * with the second destroys the audit.
   *
   * Absent means no reassessment has arrived since the alert was
   * raised — never that the vessel has gone.
   */
  readonly currentAssessment?: AlertEvidence;
  /**
   * True when the latest assessment could not be made at all.
   *
   * Carried rather than inferred from a missing field, because "we
   * could not assess" and "we have not reassessed" are different
   * states, and neither is "resolved".
   */
  readonly currentAssessmentUnavailable?: boolean;

  readonly raisedAt: string;
  readonly updatedAt: string;
  readonly acknowledgedAt?: string;
  readonly acknowledgedBy?: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly closedAt?: string;
  readonly closedBy?: string;
  /**
   * Why an officer resolved or closed it, in their words.
   *
   * Separate from the events so the current record answers "why is this
   * finished" without replaying the history, and optional because not
   * every transition is required to carry a reason.
   */
  readonly resolutionReason?: string;
  readonly closureReason?: string;

  /**
   * Who is dealing with it.
   *
   * Absent means unassigned, never "assigned to nobody in particular" —
   * an alert with a fabricated owner is worse than an unowned one.
   */
  readonly assignedTo?: string;

  /** Append-only. Every state change and escalation lands here. */
  readonly events: readonly AlertEvent[];
}

export interface RaiseAlertInput {
  readonly episode: EpisodeKey;
  readonly vessel: AlertVesselRef;
  readonly condition: AlertCondition;
  readonly evidence: AlertEvidence;
  readonly actor: string;
  readonly at?: string;
}

/** Raise a new alert for a new approach episode. */
export function raiseAlert(input: RaiseAlertInput): ArrivalInterventionAlert {
  const at = input.at ?? new Date().toISOString();
  const id = `alert_${episodeId(input.episode)}`;
  return {
    id,
    episode: input.episode,
    vessel: input.vessel,
    condition: input.condition,
    severity: SEVERITY_FOR_CONDITION[input.condition],
    state: "OPEN",
    evidence: input.evidence,
    raisedAt: at,
    updatedAt: at,
    events: [
      alertEvent(id, "RAISED", input.actor, {
        at,
        note: `${input.condition} · ${input.evidence.rationale}`,
      }),
    ],
  };
}

/**
 * Raise the urgency of a live alert as the same approach closes in.
 *
 * The alert is not replaced. Its acknowledgement, its assignment and its
 * history survive, because an officer who already looked at this vessel
 * has not stopped having looked at it just because the vessel got
 * closer. The original evidence is likewise untouched: it records why
 * the alert was raised, and that has not changed.
 */
export function escalateAlert(
  alert: ArrivalInterventionAlert,
  condition: AlertCondition,
  actor: string,
  at: string = new Date().toISOString(),
): ArrivalInterventionAlert {
  return {
    ...alert,
    condition,
    severity: SEVERITY_FOR_CONDITION[condition],
    updatedAt: at,
    events: [
      ...alert.events,
      alertEvent(alert.id, "ESCALATED", actor, {
        at,
        note: `${alert.condition} → ${condition}`,
      }),
    ],
  };
}

/**
 * Apply a transition that has already been checked.
 *
 * Takes the event rather than the target state, so an alert can only
 * move by a route `transitionAlert` approved — there is no second way in
 * that skips the table.
 */
export function applyTransition(
  alert: ArrivalInterventionAlert,
  event: AlertEvent,
): ArrivalInterventionAlert {
  const next = event.nextState;
  if (!next) return alert;

  return {
    ...alert,
    state: next,
    updatedAt: event.at,
    ...(next === "ACKNOWLEDGED" ? { acknowledgedAt: event.at, acknowledgedBy: event.actor } : {}),
    ...(next === "RESOLVED" ? { resolvedAt: event.at, resolvedBy: event.actor } : {}),
    ...(next === "CLOSED" ? { closedAt: event.at, closedBy: event.actor } : {}),
    events: [...alert.events, event],
  };
}

/**
 * Record the latest assessment against a live alert.
 *
 * Touches `currentAssessment` and nothing else. The trigger evidence,
 * the acknowledgement, the assignment and the lifecycle state all
 * survive — an officer who already looked at this vessel has not
 * stopped having looked at it because a new position arrived.
 */
export function updateCurrentAssessment(
  alert: ArrivalInterventionAlert,
  assessment: AlertEvidence,
  at: string = new Date().toISOString(),
): ArrivalInterventionAlert {
  return {
    ...alert,
    currentAssessment: assessment,
    currentAssessmentUnavailable: false,
    updatedAt: at,
  };
}

/**
 * Record that the latest assessment could not be made.
 *
 * Deliberately does not resolve, downgrade or close anything. Losing
 * sight of a vessel is not the same as the vessel ceasing to matter,
 * and an alert that quietly cleared itself when the data went missing
 * would be the most dangerous behaviour in this module.
 */
export function markAssessmentUnavailable(
  alert: ArrivalInterventionAlert,
  actor: string,
  reason: string,
  at: string = new Date().toISOString(),
): ArrivalInterventionAlert {
  return {
    ...alert,
    currentAssessmentUnavailable: true,
    updatedAt: at,
    events: [...alert.events, alertEvent(alert.id, "EVIDENCE_STALE", actor, { at, note: reason })],
  };
}

/** Record who is dealing with an alert. */
export function assignAlert(
  alert: ArrivalInterventionAlert,
  assignee: string,
  actor: string,
  at: string = new Date().toISOString(),
): ArrivalInterventionAlert {
  return {
    ...alert,
    assignedTo: assignee,
    updatedAt: at,
    events: [...alert.events, alertEvent(alert.id, "ASSIGNED", actor, { at, note: assignee })],
  };
}
