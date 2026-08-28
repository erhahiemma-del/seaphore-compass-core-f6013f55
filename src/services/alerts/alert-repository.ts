/**
 * The boundary between the alert domain and wherever alerts are stored.
 *
 * The domain decides; this persists. Keeping them apart is not tidiness —
 * every rule that leaks into a repository becomes a second copy of that
 * rule, free to drift from the one the tests cover, and the drift is
 * silent because both sides look correct on their own.
 *
 * So this interface deliberately offers no judgement. There is no
 * `shouldEscalate`, no `isEligible`, no severity derivation. It takes
 * decisions already made and records them.
 *
 * ## Two implementations, one contract
 *
 * `InMemoryAlertRepository` below is not a test double bolted on
 * afterwards. It is the reference implementation of the contract, and the
 * one the application currently runs on: the alert tables are authored
 * but not yet applied to the project database, so the durable adapter
 * cannot be the default without pretending alerts survive a reload when
 * they do not. Both implementations are held to the same test suite.
 *
 * ## The one thing storage must guarantee
 *
 * Exactly one active episode per hull, under concurrency. Everything else
 * the domain can enforce alone; that one cannot, because two workers can
 * both read "no active alert" before either writes. The relational
 * implementation gets it from a unique partial index; the in-memory one
 * gets it from being single-threaded. Both surface the same
 * `DUPLICATE_EPISODE` outcome so callers converge identically.
 */
import type { ArrivalInterventionAlert } from "./index";
import type { AlertEvent, AlertState } from "./alert-lifecycle";
import type { AlertCondition, AlertEvidence, AttentionSeverity } from "./arrival-alert";
import type { EpisodeKey } from "./alert-episode";

/** Lifecycle states in which an alert is still the officer's open work. */
export const ACTIVE_STATES: readonly AlertState[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
];

/**
 * A write's outcome.
 *
 * Failure is a value rather than an exception because both failures here
 * are *expected* under normal operation — a racing worker and a stale
 * officer view — and neither is exceptional enough to unwind a
 * reconciliation pass over.
 */
export type WriteResult<T> =
  | { readonly ok: true; readonly value: T }
  /**
   * Another worker already created this episode. Not an error: the
   * desired state exists, and the caller converges on it.
   */
  | { readonly ok: false; readonly reason: "DUPLICATE_EPISODE"; readonly existing?: T }
  /**
   * The alert changed since it was read. The caller must re-read rather
   * than overwrite, which is the whole point of tracking a version.
   */
  | { readonly ok: false; readonly reason: "VERSION_CONFLICT"; readonly current?: T }
  | { readonly ok: false; readonly reason: "NOT_FOUND" }
  | { readonly ok: false; readonly reason: "UNAVAILABLE"; readonly detail: string };

/** An alert as stored, with the concurrency token the store maintains. */
export interface StoredAlert extends ArrivalInterventionAlert {
  /** Incremented on every write. Asserted by the next one. */
  readonly version: number;
}

/** Who performed a write. Never a person's name for a system action. */
export type Actor =
  | { readonly type: "SYSTEM" }
  | { readonly type: "OFFICER"; readonly officerId: string };

export interface RaiseInput {
  readonly episode: EpisodeKey;
  readonly vesselName?: string;
  readonly condition: AlertCondition;
  readonly severity: AttentionSeverity;
  readonly evidence: AlertEvidence;
  readonly at: string;
  readonly actor: Actor;
}

export interface AssessmentInput {
  readonly alertId: string;
  readonly expectedVersion: number;
  readonly assessment: AlertEvidence;
  readonly at: string;
}

export interface EscalationInput extends AssessmentInput {
  readonly condition: AlertCondition;
  readonly severity: AttentionSeverity;
  readonly from: AlertCondition;
}

export interface TransitionPersistInput {
  readonly alertId: string;
  readonly expectedVersion: number;
  readonly event: AlertEvent;
  readonly officerId: string;
  /** Recorded when the transition is a resolution or a closure. */
  readonly reason?: string;
}

export interface ActiveAlertQuery {
  readonly severity?: AttentionSeverity;
  readonly assignedTo?: string;
  readonly limit?: number;
}

/**
 * What any alert store must be able to do.
 *
 * Reads are plain; every write returns a `WriteResult` so a race is a
 * value the caller handles rather than a throw it must guess about.
 */
export interface AlertRepository {
  getAlert(alertId: string): Promise<StoredAlert | null>;
  /** The live episode for a hull, if one is open. */
  findActiveEpisode(imo: string): Promise<StoredAlert | null>;
  /**
   * The highest episode number ever used for a hull, closed ones
   * included. Read rather than counted: a deleted or archived episode
   * must not let a later approach reuse an identity.
   */
  highestSequence(imo: string): Promise<number>;
  listActive(query?: ActiveAlertQuery): Promise<readonly StoredAlert[]>;
  listByVessel(imo: string): Promise<readonly StoredAlert[]>;
  events(alertId: string): Promise<readonly AlertEvent[]>;

  /** Create an episode and its RAISED event as one indivisible write. */
  raise(input: RaiseInput): Promise<WriteResult<StoredAlert>>;
  /** Replace the current assessment. Never touches the trigger evidence. */
  updateAssessment(input: AssessmentInput): Promise<WriteResult<StoredAlert>>;
  /** Raise the condition and record the escalation together. */
  escalate(input: EscalationInput): Promise<WriteResult<StoredAlert>>;
  /** Record that the latest assessment could not be made. */
  markAssessmentUnavailable(
    input: Omit<AssessmentInput, "assessment"> & { readonly reason: string },
  ): Promise<WriteResult<StoredAlert>>;
  /** Apply an officer transition the domain has already approved. */
  applyTransition(input: TransitionPersistInput): Promise<WriteResult<StoredAlert>>;
  /** Append a note. Never replaces an earlier one. */
  addNote(input: TransitionPersistInput): Promise<WriteResult<StoredAlert>>;
  /** Record an assignment. Reconciliation never calls this. */
  assign(
    input: TransitionPersistInput & { readonly assignee: string },
  ): Promise<WriteResult<StoredAlert>>;
}

/* ── Reference implementation ────────────────────────────────────────── */

/**
 * The contract, implemented over a map.
 *
 * Used by the application today and by the test suite always. It is held
 * to the same behaviour as a relational store, including the version
 * checks and the duplicate-episode outcome, so a caller written against
 * it does not need changing when the tables land.
 */
export class InMemoryAlertRepository implements AlertRepository {
  private readonly alerts = new Map<string, StoredAlert>();
  private readonly eventLog = new Map<string, AlertEvent[]>();

  async getAlert(alertId: string): Promise<StoredAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async findActiveEpisode(imo: string): Promise<StoredAlert | null> {
    for (const alert of this.alerts.values()) {
      if (alert.vessel.imo === imo && ACTIVE_STATES.includes(alert.state)) return alert;
    }
    return null;
  }

  async highestSequence(imo: string): Promise<number> {
    let highest = 0;
    for (const alert of this.alerts.values()) {
      if (alert.vessel.imo === imo) highest = Math.max(highest, alert.episode.sequence);
    }
    return highest;
  }

  async listActive(query: ActiveAlertQuery = {}): Promise<readonly StoredAlert[]> {
    const rows = [...this.alerts.values()].filter(
      (alert) =>
        ACTIVE_STATES.includes(alert.state) &&
        (query.severity == null || alert.severity === query.severity) &&
        (query.assignedTo == null || alert.assignedTo === query.assignedTo),
    );
    return query.limit == null ? rows : rows.slice(0, query.limit);
  }

  async listByVessel(imo: string): Promise<readonly StoredAlert[]> {
    return [...this.alerts.values()]
      .filter((alert) => alert.vessel.imo === imo)
      .sort((a, b) => a.episode.sequence - b.episode.sequence);
  }

  async events(alertId: string): Promise<readonly AlertEvent[]> {
    return this.eventLog.get(alertId) ?? [];
  }

  async raise(input: RaiseInput): Promise<WriteResult<StoredAlert>> {
    /*
     * The uniqueness the relational index enforces, enforced here by
     * checking before writing — which is only sufficient because this
     * implementation cannot be interleaved. A store that can be must get
     * the guarantee from the database, not from this check.
     */
    const existing = await this.findActiveEpisode(input.episode.imo);
    if (existing) return { ok: false, reason: "DUPLICATE_EPISODE", existing };

    const id = `alert_${input.episode.imo}#${input.episode.sequence}`;
    const event: AlertEvent = {
      id: `${id}:raised`,
      alertId: id,
      type: "RAISED",
      actor: input.actor.type === "SYSTEM" ? "SYSTEM" : input.actor.officerId,
      at: input.at,
      note: `${input.condition} · ${input.evidence.rationale}`,
      nextState: "OPEN",
    };
    const alert: StoredAlert = {
      id,
      episode: input.episode,
      vessel: { imo: input.episode.imo, name: input.vesselName },
      condition: input.condition,
      severity: input.severity,
      state: "OPEN",
      evidence: input.evidence,
      currentAssessment: input.evidence,
      raisedAt: input.at,
      updatedAt: input.at,
      events: [event],
      version: 1,
    };
    // Alert and first event land together; there is no window in which an
    // alert exists without the record of why.
    this.alerts.set(id, alert);
    this.eventLog.set(id, [event]);
    return { ok: true, value: alert };
  }

  async updateAssessment(input: AssessmentInput): Promise<WriteResult<StoredAlert>> {
    return this.write(input.alertId, input.expectedVersion, (alert) => ({
      ...alert,
      // The trigger evidence is deliberately not in this object spread's
      // reach. Why an alert was raised is not revised by where the vessel
      // went afterwards.
      currentAssessment: input.assessment,
      currentAssessmentUnavailable: false,
      updatedAt: input.at,
    }));
  }

  async escalate(input: EscalationInput): Promise<WriteResult<StoredAlert>> {
    const event: AlertEvent = {
      id: `${input.alertId}:esc:${input.at}`,
      alertId: input.alertId,
      type: "ESCALATED",
      actor: "SYSTEM",
      at: input.at,
      note: `${input.from} → ${input.condition}`,
    };
    return this.write(input.alertId, input.expectedVersion, (alert) => ({
      ...alert,
      condition: input.condition,
      severity: input.severity,
      currentAssessment: input.assessment,
      currentAssessmentUnavailable: false,
      updatedAt: input.at,
      events: [...alert.events, event],
    }));
  }

  async markAssessmentUnavailable(
    input: Omit<AssessmentInput, "assessment"> & { readonly reason: string },
  ): Promise<WriteResult<StoredAlert>> {
    const event: AlertEvent = {
      id: `${input.alertId}:stale:${input.at}`,
      alertId: input.alertId,
      type: "EVIDENCE_STALE",
      actor: "SYSTEM",
      at: input.at,
      note: input.reason,
    };
    return this.write(input.alertId, input.expectedVersion, (alert) => ({
      ...alert,
      // Losing sight of a vessel is recorded, never resolved. The state,
      // the acknowledgement and the assignment are all untouched.
      currentAssessmentUnavailable: true,
      updatedAt: input.at,
      events: [...alert.events, event],
    }));
  }

  async applyTransition(input: TransitionPersistInput): Promise<WriteResult<StoredAlert>> {
    const next = input.event.nextState;
    return this.write(input.alertId, input.expectedVersion, (alert) => ({
      ...alert,
      ...(next ? { state: next } : {}),
      ...(next === "ACKNOWLEDGED"
        ? { acknowledgedAt: input.event.at, acknowledgedBy: input.officerId }
        : {}),
      ...(next === "RESOLVED"
        ? {
            resolvedAt: input.event.at,
            resolvedBy: input.officerId,
            resolutionReason: input.reason,
          }
        : {}),
      ...(next === "CLOSED"
        ? { closedAt: input.event.at, closedBy: input.officerId, closureReason: input.reason }
        : {}),
      updatedAt: input.event.at,
      events: [...alert.events, input.event],
    }));
  }

  async addNote(input: TransitionPersistInput): Promise<WriteResult<StoredAlert>> {
    // Appended. A note is a record of what an officer observed, and an
    // earlier observation is not made untrue by a later one.
    return this.write(input.alertId, input.expectedVersion, (alert) => ({
      ...alert,
      updatedAt: input.event.at,
      events: [...alert.events, input.event],
    }));
  }

  async assign(
    input: TransitionPersistInput & { readonly assignee: string },
  ): Promise<WriteResult<StoredAlert>> {
    return this.write(input.alertId, input.expectedVersion, (alert) => ({
      ...alert,
      assignedTo: input.assignee,
      updatedAt: input.event.at,
      events: [...alert.events, input.event],
    }));
  }

  /**
   * Every mutation goes through here, so the version check exists once.
   *
   * A second copy of this comparison is a second chance to forget it.
   */
  private async write(
    alertId: string,
    expectedVersion: number,
    change: (alert: StoredAlert) => StoredAlert,
  ): Promise<WriteResult<StoredAlert>> {
    const current = this.alerts.get(alertId);
    if (!current) return { ok: false, reason: "NOT_FOUND" };
    if (current.version !== expectedVersion) {
      return { ok: false, reason: "VERSION_CONFLICT", current };
    }
    const next: StoredAlert = { ...change(current), version: current.version + 1 };
    this.alerts.set(alertId, next);
    this.eventLog.set(alertId, [...next.events]);
    return { ok: true, value: next };
  }
}
