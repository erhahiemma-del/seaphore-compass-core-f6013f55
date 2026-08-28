/**
 * How an alert moves, and the record it leaves behind.
 *
 * The transition table is the whole safety property. Without one, any
 * surface that touches an alert can put it in any state, and "resolved"
 * stops meaning an officer resolved it — it means some code path set a
 * field. Every move is checked, and every move that happens produces an
 * immutable event naming who made it.
 *
 * Modelled on the shape `investigations-workflow` already uses — a
 * `Record<State, readonly State[]>` and an append-only trail of
 * `{ at, actor, action }` — because that pattern is sound and a third
 * variant would be a third thing to keep correct. The states themselves
 * are not shared: a case moves through intake and evidence, an alert
 * through acknowledgement and resolution, and collapsing them would make
 * every glance at a vessel into a case file.
 */

export type AlertState =
  /** Raised, nobody has looked. */
  | "OPEN"
  /** An officer has seen it. Audible reminders stop here. */
  | "ACKNOWLEDGED"
  /** Somebody is actively looking. */
  | "UNDER_REVIEW"
  /** Reviewed, and something must be done. */
  | "ACTION_REQUIRED"
  /** Dealt with. */
  | "RESOLVED"
  /** Filed. Terminal. */
  | "CLOSED";

/**
 * Where each state may go.
 *
 * `OPEN → UNDER_REVIEW` is permitted: an officer who starts working on
 * an alert has plainly seen it, and forcing a separate acknowledgement
 * click would be ceremony that teaches people to click past things.
 *
 * `RESOLVED → UNDER_REVIEW` is permitted because resolution can turn out
 * to be wrong while the episode is still live.
 *
 * `CLOSED` goes nowhere. A closed alert that could reopen would let a
 * long-settled record silently become live again; a fresh approach
 * raises a new episode instead, which is visible and dated.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<AlertState, readonly AlertState[]>> = {
  OPEN: ["ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED"],
  ACKNOWLEDGED: ["UNDER_REVIEW", "ACTION_REQUIRED", "RESOLVED"],
  UNDER_REVIEW: ["ACTION_REQUIRED", "RESOLVED"],
  ACTION_REQUIRED: ["UNDER_REVIEW", "RESOLVED"],
  RESOLVED: ["CLOSED", "UNDER_REVIEW"],
  CLOSED: [],
};

export function canTransition(from: AlertState, to: AlertState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: AlertState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/** States in which an alert is still asking for something. */
export function isActive(state: AlertState): boolean {
  return state !== "RESOLVED" && state !== "CLOSED";
}

/**
 * Whether an alert should still be making noise.
 *
 * Acknowledgement is the point at which reminders stop — the officer has
 * seen it, and continuing to sound would train them to ignore the sound.
 * The alert stays visible either way.
 */
export function needsReminder(state: AlertState): boolean {
  return state === "OPEN";
}

/* ── The record ──────────────────────────────────────────────────────── */

export type AlertEventType =
  | "RAISED"
  | "TRANSITIONED"
  /** The episode crossed into a tighter threshold. */
  | "ESCALATED"
  | "ASSIGNED"
  | "NOTE_ADDED"
  /** The position behind the evidence went stale. */
  | "EVIDENCE_STALE";

export interface AlertEvent {
  readonly id: string;
  readonly alertId: string;
  readonly type: AlertEventType;
  readonly previousState?: AlertState;
  readonly nextState?: AlertState;
  /** Who did it. Never inferred — an unattributed action is a bug. */
  readonly actor: string;
  readonly at: string;
  readonly note?: string;
}

export interface TransitionInput {
  readonly alertId: string;
  readonly from: AlertState;
  readonly to: AlertState;
  readonly actor: string;
  readonly at?: string;
  readonly note?: string;
}

export type TransitionOutcome =
  | { readonly ok: true; readonly state: AlertState; readonly event: AlertEvent }
  | { readonly ok: false; readonly reason: string };

/**
 * Move an alert, or explain why it cannot move.
 *
 * Returns a refusal rather than throwing, so a surface that asks for an
 * impossible transition gets an answer it can show an officer instead of
 * an exception it has to catch.
 */
export function transitionAlert(input: TransitionInput): TransitionOutcome {
  if (input.from === input.to) {
    return { ok: false, reason: `The alert is already ${input.to}.` };
  }
  if (!canTransition(input.from, input.to)) {
    /*
     * Named specifically for the closed case, because it is the one an
     * officer is most likely to attempt and the one where a silent
     * success would be most damaging.
     */
    if (input.from === "CLOSED") {
      return {
        ok: false,
        reason: "A closed alert cannot be reopened. A new approach raises a new alert.",
      };
    }
    return { ok: false, reason: `An alert cannot go from ${input.from} to ${input.to}.` };
  }

  const at = input.at ?? new Date().toISOString();
  return {
    ok: true,
    state: input.to,
    event: {
      id: eventId(),
      alertId: input.alertId,
      type: "TRANSITIONED",
      previousState: input.from,
      nextState: input.to,
      actor: input.actor,
      at,
      note: input.note,
    },
  };
}

/** An event that records something other than a move. */
export function alertEvent(
  alertId: string,
  type: AlertEventType,
  actor: string,
  options: { readonly note?: string; readonly at?: string } = {},
): AlertEvent {
  return {
    id: eventId(),
    alertId,
    type,
    actor,
    at: options.at ?? new Date().toISOString(),
    note: options.note,
  };
}

/**
 * Identifier shape borrowed from the investigation store, so ids read
 * the same across the product and sort roughly by creation time.
 */
function eventId(): string {
  return `alertevt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
