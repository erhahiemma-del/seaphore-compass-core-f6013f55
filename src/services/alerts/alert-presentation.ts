/**
 * What an alert looks like, derived entirely from what it already says.
 *
 * The map beacon, the attention centre and the drawer section all need
 * the same handful of decisions: how loud is this, is it still pulsing,
 * what does the arrival line read, what may the officer do next. Making
 * each surface work that out itself is how three surfaces end up
 * disagreeing about one alert — and the one that disagrees quietly is the
 * one an officer trusts.
 *
 * So it is decided once, here, and the surfaces render the result.
 *
 * ## This layer computes no intelligence
 *
 * It does not derive an arrival time, a distance, a boundary relation, a
 * severity or a risk. Every one of those arrives already decided by the
 * approach engine and the alert domain, and is copied through. The only
 * things invented here are words and visual states — which is exactly
 * what a presentation layer is allowed to invent.
 *
 * ## Severity is not risk
 *
 * `URGENT` means look now. It says nothing about the vessel, its crew,
 * its cargo or its lawfulness, and no string in this file may imply that
 * it does.
 */
import type { ArrivalInterventionAlert } from "./index";
import { needsReminder, type AlertState } from "./alert-lifecycle";
import type { AlertCondition, AlertEvidence, AttentionSeverity } from "./arrival-alert";

/**
 * How the beacon draws.
 *
 * Deliberately not a colour. Colour is one of four channels the visual
 * language uses, and a presentation state that named a colour would let a
 * surface satisfy the contract while remaining unreadable to an officer
 * who cannot distinguish amber from red.
 */
export type AlertVisualState =
  /** Unacknowledged and live. The only state that pulses. */
  | "ACTIVE"
  /** Seen by an officer. Still on the map, no longer moving. */
  | "QUIET"
  /** Dealt with. No beacon. */
  | "CLEARED";

/** Officer-facing actions. Only ones the domain genuinely performs. */
export type AlertAction = "ACKNOWLEDGE" | "ADD_UPDATE" | "RESOLVE" | "CLOSE";

export interface AlertPresentation {
  readonly alertId: string;
  readonly imo: string;
  readonly vesselName: string;
  readonly condition: AlertCondition;
  readonly severity: AttentionSeverity;
  readonly lifecycleState: AlertState;
  readonly acknowledged: boolean;
  readonly visualState: AlertVisualState;
  /** Whether the audio scheduler should still be reminding. */
  readonly remindable: boolean;
  /**
   * Sort key. Lower is more urgent. Severity first, then arrival.
   *
   * A number rather than a comparator so the same order is reachable from
   * a list, a map layer and a test without three implementations of it.
   */
  readonly displayPriority: number;
  /** One line naming the condition, in an officer's words. */
  readonly headline: string;
  /**
   * The arrival, with its basis attached — or the refusal to state one.
   *
   * Never a bare number of hours. An estimate presented as a measurement
   * is the single most consequential lie this surface could tell, because
   * it is the number an officer plans around.
   */
  readonly arrivalLine: string;
  /** Why this alert exists, from the evidence rather than from a guess. */
  readonly reason: string;
  /** Source, freshness and accuracy, each stated or explicitly absent. */
  readonly provenance: {
    readonly source: string;
    readonly positionAge: string;
    readonly arrivalBasis: string;
    readonly boundaryAccuracy: string;
  };
  /** True when the most recent reassessment could not be made. */
  readonly assessmentUnavailable: boolean;
  readonly actions: readonly AlertAction[];
}

const CONDITION_HEADLINE: Readonly<Record<AlertCondition, string>> = {
  APPROACHING_72H: "Approach watch",
  APPROACHING_48H: "Approaching within 48 hours",
  APPROACHING_24H: "Approaching within 24 hours",
  ENTERING: "Entering Nigerian waters",
  INSIDE_BOUNDARY: "Inside Nigerian waters",
};

/**
 * The threshold each condition represents, for the reason line.
 *
 * Read from the condition rather than from the evidence's
 * `thresholdHours`, which records the window the *assessment* ran with
 * and is not always the window the alert was raised against.
 */
const CONDITION_THRESHOLD: Readonly<Record<AlertCondition, string>> = {
  APPROACHING_72H: "72-hour",
  APPROACHING_48H: "48-hour",
  APPROACHING_24H: "24-hour",
  ENTERING: "boundary-crossing",
  INSIDE_BOUNDARY: "inside-boundary",
};

const SEVERITY_RANK: Readonly<Record<AttentionSeverity, number>> = {
  URGENT: 0,
  ATTENTION: 1,
  WATCH: 2,
};

/**
 * How an arrival basis is described to an officer.
 *
 * `UNAVAILABLE` has no adjective on purpose — there is nothing to
 * qualify, and the arrival line says so outright instead.
 */
const BASIS_LABEL: Readonly<Record<string, string>> = {
  REPORTED: "Reported",
  ESTIMATED: "Estimated",
  PROJECTED: "Projected",
  UNAVAILABLE: "Unavailable",
};

const ACCURACY_LABEL: Readonly<Record<string, string>> = {
  EXACT: "Exact",
  APPROXIMATE: "Approximate",
  UNKNOWN: "Not established",
};

/**
 * The arrival, said exactly as well as it is known.
 *
 * Three shapes, and the difference between them is the whole function.
 * A reported arrival is stated. An estimated one is stated as an
 * approximation and labelled. One that could not be derived is refused
 * out loud, because an absent number must never read as a short one.
 */
export function arrivalLineFor(evidence: AlertEvidence): string {
  const hours = evidence.hoursToBoundary;
  const basis = evidence.arrivalBasis;

  if (hours == null || basis === "UNAVAILABLE") {
    return "Arrival estimate unavailable";
  }

  const rounded = Math.round(hours);
  const unit = rounded === 1 ? "hour" : "hours";
  const label = BASIS_LABEL[basis] ?? basis;
  return basis === "REPORTED"
    ? `${rounded} ${unit} · ${label}`
    : `Approximately ${rounded} ${unit} · ${label}`;
}

/**
 * How old the position behind the assessment is.
 *
 * Bands rather than a raw duration: an officer needs to know whether to
 * trust the picture, and "4 minutes" invites arithmetic that "Fresh"
 * does not.
 */
export function positionAgeLabel(ageMs: number | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs)) return "Position age not established";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 5) return "Fresh";
  if (minutes < 30) return `${minutes} minutes old`;
  const hours = Math.floor(minutes / 60);
  return hours < 1 ? `${minutes} minutes old` : `${hours} hours old`;
}

/**
 * Which actions the domain can genuinely perform from this state.
 *
 * A control that cannot act is not offered. Assignment and escalation
 * are deliberately absent: assignment needs a real roster of
 * authenticated officers, which does not exist, and escalation is
 * decided by the reconciliation engine from the vessel's own approach —
 * offering an officer a button that manually raises severity would put a
 * navigation decision in the interface.
 */
export function actionsFor(state: AlertState): readonly AlertAction[] {
  switch (state) {
    case "OPEN":
      return ["ACKNOWLEDGE", "ADD_UPDATE", "RESOLVE"];
    case "ACKNOWLEDGED":
    case "UNDER_REVIEW":
    case "ACTION_REQUIRED":
      return ["ADD_UPDATE", "RESOLVE"];
    case "RESOLVED":
      return ["CLOSE"];
    case "CLOSED":
      return [];
  }
}

export function visualStateFor(state: AlertState): AlertVisualState {
  if (state === "RESOLVED" || state === "CLOSED") return "CLEARED";
  return state === "OPEN" ? "ACTIVE" : "QUIET";
}

/**
 * Project one alert for display.
 *
 * The current assessment is preferred over the trigger evidence for
 * anything describing where the vessel is *now*, and the trigger evidence
 * is kept for the reason it was raised. Both are read; neither is
 * recomputed, and neither overwrites the other.
 */
export function presentAlert(alert: ArrivalInterventionAlert): AlertPresentation {
  const latest = alert.currentAssessment ?? alert.evidence;
  const visualState = visualStateFor(alert.state);

  return {
    alertId: alert.id,
    imo: alert.vessel.imo,
    vesselName: alert.vessel.name ?? alert.vessel.imo,
    condition: alert.condition,
    severity: alert.severity,
    lifecycleState: alert.state,
    acknowledged: alert.acknowledgedAt != null,
    visualState,
    remindable: needsReminder(alert.state),
    displayPriority: displayPriorityFor(alert),
    headline: CONDITION_HEADLINE[alert.condition],
    arrivalLine: alert.currentAssessmentUnavailable
      ? "Latest assessment unavailable"
      : arrivalLineFor(latest),
    /*
     * The reason is the threshold the alert was raised against and
     * nothing more. It does not mention manifests, risk, ownership or
     * compliance, because the approach engine established none of those
     * and an alert is not evidence about them.
     */
    reason: `Vessel meets the current ${CONDITION_THRESHOLD[alert.condition]} operational approach threshold.`,
    provenance: {
      source: latest.sourceId,
      positionAge: positionAgeLabel(latest.positionAgeMs),
      arrivalBasis: BASIS_LABEL[latest.arrivalBasis] ?? latest.arrivalBasis,
      boundaryAccuracy: ACCURACY_LABEL[latest.boundaryAccuracy] ?? latest.boundaryAccuracy,
    },
    assessmentUnavailable: alert.currentAssessmentUnavailable === true,
    actions: actionsFor(alert.state),
  };
}

/**
 * Ordering, decided once.
 *
 * Severity first, because that is what the ranking is for. Within a
 * severity the nearer arrival comes first — and an alert with no derived
 * arrival sorts last within its band rather than being given a number.
 * Inventing one would be this layer making a navigation claim.
 */
export function displayPriorityFor(alert: ArrivalInterventionAlert): number {
  const latest = alert.currentAssessment ?? alert.evidence;
  const severity = SEVERITY_RANK[alert.severity] * 1_000_000;
  const hours = latest.hoursToBoundary;
  if (hours == null || latest.arrivalBasis === "UNAVAILABLE") {
    // Last within the band, deterministically, without claiming a time.
    return severity + 999_999;
  }
  return severity + Math.min(Math.max(Math.round(hours), 0), 999_998);
}

/** Project and order a list of alerts for the attention centre. */
export function presentAlerts(
  alerts: readonly ArrivalInterventionAlert[],
): readonly AlertPresentation[] {
  return alerts.map(presentAlert).sort(
    (a, b) =>
      a.displayPriority - b.displayPriority ||
      // Stable tie-break so two alerts at the same urgency and arrival
      // never swap places between renders.
      a.alertId.localeCompare(b.alertId),
  );
}
