/**
 * The durable implementation of `AlertRepository`, over Lovable Cloud.
 *
 * It adds no rules. Every method here takes a decision the domain has
 * already made and records it, exactly as `InMemoryAlertRepository` does,
 * and both are held to the same contract — so nothing that calls a
 * repository needs to know which one it holds.
 *
 * ## What the database contributes that memory cannot
 *
 * Two guarantees, and only two:
 *
 *   • one active episode per hull, from the unique partial index. Two
 *     workers can both read "no active alert" before either writes; only
 *     one insert survives, and the loser converges on the winner's row
 *     rather than opening a second episode.
 *   • optimistic concurrency, from asserting `version` in the UPDATE's
 *     WHERE clause. An officer acting on a stale view is told, not
 *     silently overwritten.
 *
 * Both surface as the same `WriteResult` values the in-memory store
 * returns, which is why the coordinator is identical for both.
 *
 * ## Events are appended, never rewritten
 *
 * The event table has INSERT and SELECT policies and no UPDATE or DELETE
 * ones, so history cannot be revised. `actor_type` distinguishes a system
 * reconciliation from an officer decision at the row level, and a CHECK
 * constraint refuses an OFFICER row without an officer — a reconciliation
 * can never borrow a person's name.
 *
 * ## Why the write order is alert-then-event
 *
 * PostgREST has no client-side transaction. An alert whose RAISED event
 * failed to land is recoverable and visible; an event pointing at an
 * alert that does not exist is neither, and the foreign key would refuse
 * it anyway. So the alert lands first and the event follows.
 */
import { supabase } from "@/integrations/supabase/client";

import type { AlertEvent, AlertEventType, AlertState } from "./alert-lifecycle";
import type { AlertCondition, AlertEvidence, AttentionSeverity } from "./arrival-alert";
import {
  ACTIVE_STATES,
  type ActiveAlertQuery,
  type AlertRepository,
  type AssessmentInput,
  type EscalationInput,
  type RaiseInput,
  type StoredAlert,
  type TransitionPersistInput,
  type WriteResult,
} from "./alert-repository";

const ALERTS = "arrival_intervention_alerts";
const EVENTS = "arrival_alert_events";

/** Postgres unique-violation. The one collision that is a normal outcome. */
const UNIQUE_VIOLATION = "23505";

interface AlertRow {
  id: string;
  imo: string;
  vessel_name: string | null;
  episode_sequence: number;
  condition: string;
  severity: string;
  state: string;
  trigger_evidence: unknown;
  current_assessment: unknown;
  current_assessment_unavailable: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  closed_by: string | null;
  closed_at: string | null;
  closure_reason: string | null;
  raised_at: string;
  updated_at: string;
  version: number;
}

interface EventRow {
  id: string;
  alert_id: string;
  type: string;
  previous_state: string | null;
  next_state: string | null;
  actor_type: string;
  officer_id: string | null;
  note: string | null;
  at: string;
}

const ALERT_COLUMNS = "*";
const WITH_EVENTS = `*, ${EVENTS}(*)`;

function toEvent(row: EventRow): AlertEvent {
  return {
    id: row.id,
    alertId: row.alert_id,
    type: row.type as AlertEventType,
    ...(row.previous_state ? { previousState: row.previous_state as AlertState } : {}),
    ...(row.next_state ? { nextState: row.next_state as AlertState } : {}),
    // SYSTEM rows carry no officer, by constraint. The actor string the
    // domain uses is the officer id, or the literal "SYSTEM".
    actor: row.actor_type === "OFFICER" && row.officer_id ? row.officer_id : "SYSTEM",
    at: row.at,
    ...(row.note ? { note: row.note } : {}),
  };
}

function toStored(row: AlertRow, events: readonly AlertEvent[]): StoredAlert {
  return {
    id: row.id,
    episode: { imo: row.imo, sequence: row.episode_sequence },
    vessel: { imo: row.imo, ...(row.vessel_name ? { name: row.vessel_name } : {}) },
    condition: row.condition as AlertCondition,
    severity: row.severity as AttentionSeverity,
    state: row.state as AlertState,
    evidence: row.trigger_evidence as AlertEvidence,
    ...(row.current_assessment
      ? { currentAssessment: row.current_assessment as AlertEvidence }
      : {}),
    currentAssessmentUnavailable: row.current_assessment_unavailable,
    raisedAt: row.raised_at,
    updatedAt: row.updated_at,
    ...(row.acknowledged_at ? { acknowledgedAt: row.acknowledged_at } : {}),
    ...(row.acknowledged_by ? { acknowledgedBy: row.acknowledged_by } : {}),
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    ...(row.resolved_by ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolution_reason ? { resolutionReason: row.resolution_reason } : {}),
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
    ...(row.closed_by ? { closedBy: row.closed_by } : {}),
    ...(row.closure_reason ? { closureReason: row.closure_reason } : {}),
    ...(row.assigned_to ? { assignedTo: row.assigned_to } : {}),
    events: [...events].sort((a, b) => a.at.localeCompare(b.at)),
    version: row.version,
  };
}

type JoinedRow = AlertRow & Record<typeof EVENTS, EventRow[] | null>;

function toStoredJoined(row: JoinedRow): StoredAlert {
  const events = (row[EVENTS] ?? []).map(toEvent);
  return toStored(row, events);
}

/** Severity ordering for the attention surface. Presentation re-sorts. */
const SEVERITY_RANK: Readonly<Record<string, number>> = { URGENT: 0, ATTENTION: 1, WATCH: 2 };

function describe(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export class SupabaseAlertRepository implements AlertRepository {
  async getAlert(alertId: string): Promise<StoredAlert | null> {
    const { data, error } = await supabase
      .from(ALERTS as never)
      .select(WITH_EVENTS)
      .eq("id", alertId)
      .maybeSingle();
    if (error || !data) return null;
    return toStoredJoined(data as unknown as JoinedRow);
  }

  async findActiveEpisode(imo: string): Promise<StoredAlert | null> {
    const { data, error } = await supabase
      .from(ALERTS as never)
      .select(WITH_EVENTS)
      .eq("imo", imo)
      .in("state", ACTIVE_STATES as unknown as string[])
      .maybeSingle();
    if (error || !data) return null;
    return toStoredJoined(data as unknown as JoinedRow);
  }

  async highestSequence(imo: string): Promise<number> {
    // Read, never counted: an archived episode must not let a later
    // approach reuse an identity.
    const { data, error } = await supabase
      .from(ALERTS as never)
      .select("episode_sequence")
      .eq("imo", imo)
      .order("episode_sequence", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return 0;
    return (data[0] as unknown as { episode_sequence: number }).episode_sequence;
  }

  /**
   * The active list in ONE query.
   *
   * Thirty-two vessels must not become thirty-two round trips, so events
   * arrive through an embedded select rather than a follow-up read per
   * alert. The partial index on (severity, raised_at) serves the filter.
   */
  async listActive(query: ActiveAlertQuery = {}): Promise<readonly StoredAlert[]> {
    let request = supabase
      .from(ALERTS as never)
      .select(WITH_EVENTS)
      .in("state", ACTIVE_STATES as unknown as string[])
      .order("raised_at", { ascending: false });
    if (query.severity) request = request.eq("severity", query.severity);
    if (query.assignedTo) request = request.eq("assigned_to", query.assignedTo);
    if (query.limit != null) request = request.limit(query.limit);

    const { data, error } = await request;
    if (error || !data) return [];
    return (data as unknown as JoinedRow[])
      .map(toStoredJoined)
      .sort(
        (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
      );
  }

  async listByVessel(imo: string): Promise<readonly StoredAlert[]> {
    const { data, error } = await supabase
      .from(ALERTS as never)
      .select(WITH_EVENTS)
      .eq("imo", imo)
      .order("episode_sequence", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as JoinedRow[]).map(toStoredJoined);
  }

  async events(alertId: string): Promise<readonly AlertEvent[]> {
    const { data, error } = await supabase
      .from(EVENTS as never)
      .select("*")
      .eq("alert_id", alertId)
      .order("at", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as EventRow[]).map(toEvent);
  }

  async raise(input: RaiseInput): Promise<WriteResult<StoredAlert>> {
    const insert = {
      imo: input.episode.imo,
      vessel_name: input.vesselName ?? null,
      episode_sequence: input.episode.sequence,
      condition: input.condition,
      severity: input.severity,
      state: "OPEN",
      trigger_evidence: input.evidence as unknown,
      // The raising assessment IS the current one until a reassessment
      // arrives. Leaving it null would read as "not yet assessed".
      current_assessment: input.evidence as unknown,
      current_assessment_unavailable: false,
      raised_at: input.at,
      updated_at: input.at,
      version: 1,
    };

    const { data, error } = await supabase
      .from(ALERTS as never)
      .insert(insert as never)
      .select(ALERT_COLUMNS)
      .single();

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === UNIQUE_VIOLATION) {
        // Either the active-episode index or the (imo, sequence) key. Both
        // mean somebody already opened this episode; adopt theirs.
        const existing = await this.findActiveEpisode(input.episode.imo);
        return existing
          ? { ok: false, reason: "DUPLICATE_EPISODE", existing }
          : { ok: false, reason: "DUPLICATE_EPISODE" };
      }
      return { ok: false, reason: "UNAVAILABLE", detail: describe(error) };
    }

    const row = data as unknown as AlertRow;
    const event = await this.appendEvent(row.id, {
      type: "RAISED",
      nextState: "OPEN",
      actor: input.actor,
      note: `${input.condition} · ${input.evidence.rationale}`,
      at: input.at,
    });
    return { ok: true, value: toStored(row, event ? [event] : []) };
  }

  async updateAssessment(input: AssessmentInput): Promise<WriteResult<StoredAlert>> {
    return this.write(input.alertId, input.expectedVersion, {
      // The trigger evidence is deliberately not in this patch. Why an
      // alert was raised is not revised by where the vessel went next.
      current_assessment: input.assessment as unknown,
      current_assessment_unavailable: false,
      updated_at: input.at,
    });
  }

  async escalate(input: EscalationInput): Promise<WriteResult<StoredAlert>> {
    const result = await this.write(input.alertId, input.expectedVersion, {
      condition: input.condition,
      severity: input.severity,
      current_assessment: input.assessment as unknown,
      current_assessment_unavailable: false,
      updated_at: input.at,
    });
    if (!result.ok) return result;
    return this.withEvent(result.value, {
      type: "ESCALATED",
      actor: { type: "SYSTEM" },
      note: `${input.from} → ${input.condition}`,
      at: input.at,
    });
  }

  async markAssessmentUnavailable(
    input: Omit<AssessmentInput, "assessment"> & { readonly reason: string },
  ): Promise<WriteResult<StoredAlert>> {
    // Losing sight of a vessel is recorded, never resolved. State,
    // acknowledgement and assignment are all left alone.
    const result = await this.write(input.alertId, input.expectedVersion, {
      current_assessment_unavailable: true,
      updated_at: input.at,
    });
    if (!result.ok) return result;
    return this.withEvent(result.value, {
      type: "EVIDENCE_STALE",
      actor: { type: "SYSTEM" },
      note: input.reason,
      at: input.at,
    });
  }

  async applyTransition(input: TransitionPersistInput): Promise<WriteResult<StoredAlert>> {
    const next = input.event.nextState;
    const patch: Record<string, unknown> = { updated_at: input.event.at };
    if (next) patch["state"] = next;
    if (next === "ACKNOWLEDGED") {
      patch["acknowledged_at"] = input.event.at;
      patch["acknowledged_by"] = input.officerId;
    }
    if (next === "RESOLVED") {
      patch["resolved_at"] = input.event.at;
      patch["resolved_by"] = input.officerId;
      patch["resolution_reason"] = input.reason ?? null;
    }
    if (next === "CLOSED") {
      patch["closed_at"] = input.event.at;
      patch["closed_by"] = input.officerId;
      patch["closure_reason"] = input.reason ?? null;
    }

    const result = await this.write(input.alertId, input.expectedVersion, patch);
    if (!result.ok) return result;
    return this.withEvent(result.value, {
      type: input.event.type,
      ...(input.event.previousState ? { previousState: input.event.previousState } : {}),
      ...(next ? { nextState: next } : {}),
      actor: { type: "OFFICER", officerId: input.officerId },
      ...(input.event.note ? { note: input.event.note } : {}),
      at: input.event.at,
    });
  }

  async addNote(input: TransitionPersistInput): Promise<WriteResult<StoredAlert>> {
    const result = await this.write(input.alertId, input.expectedVersion, {
      updated_at: input.event.at,
    });
    if (!result.ok) return result;
    return this.withEvent(result.value, {
      type: "NOTE_ADDED",
      actor: { type: "OFFICER", officerId: input.officerId },
      ...(input.event.note ? { note: input.event.note } : {}),
      at: input.event.at,
    });
  }

  async assign(
    input: TransitionPersistInput & { readonly assignee: string },
  ): Promise<WriteResult<StoredAlert>> {
    const result = await this.write(input.alertId, input.expectedVersion, {
      assigned_to: input.assignee,
      assigned_by: input.officerId,
      assigned_at: input.event.at,
      updated_at: input.event.at,
    });
    if (!result.ok) return result;
    return this.withEvent(result.value, {
      type: "ASSIGNED",
      actor: { type: "OFFICER", officerId: input.officerId },
      ...(input.event.note ? { note: input.event.note } : {}),
      at: input.event.at,
    });
  }

  /* ── One write path, so the version check exists once ──────────────── */

  private async write(
    alertId: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
  ): Promise<
    | { ok: true; value: StoredAlert }
    | Extract<WriteResult<StoredAlert>, { ok: false }>
  > {
    /*
     * The version assertion lives in the WHERE clause, not in a read
     * beforehand. A read-then-write would leave a window in which another
     * context could commit between the two, which is exactly the overwrite
     * the version exists to prevent.
     */
    const { data, error } = await supabase
      .from(ALERTS as never)
      .update({ ...patch, version: expectedVersion + 1 } as never)
      .eq("id", alertId)
      .eq("version", expectedVersion)
      .select(WITH_EVENTS)
      .maybeSingle();

    if (error) return { ok: false, reason: "UNAVAILABLE", detail: describe(error) };
    if (!data) {
      // No row matched: either the alert is gone or its version moved.
      // Distinguishing the two is the difference between "retry" and
      // "stop", so it is worth the extra read on this cold path.
      const current = await this.getAlert(alertId);
      return current
        ? { ok: false, reason: "VERSION_CONFLICT", current }
        : { ok: false, reason: "NOT_FOUND" };
    }
    return { ok: true, value: toStoredJoined(data as unknown as JoinedRow) };
  }

  private async appendEvent(
    alertId: string,
    event: {
      type: AlertEventType;
      previousState?: AlertState;
      nextState?: AlertState;
      actor: RaiseInput["actor"];
      note?: string;
      at: string;
    },
  ): Promise<AlertEvent | null> {
    const insert = {
      alert_id: alertId,
      type: event.type,
      previous_state: event.previousState ?? null,
      next_state: event.nextState ?? null,
      actor_type: event.actor.type,
      officer_id: event.actor.type === "OFFICER" ? event.actor.officerId : null,
      note: event.note ?? null,
      at: event.at,
    };
    /*
     * The row and its event are two calls, not one transaction, because
     * PostgREST offers no cross-table atomic write. The consequence is a
     * narrow one — a saved state change whose history line is missing —
     * and it is handled the only two honest ways available: retry once,
     * because the common cause is a transient network failure, and then
     * report it loudly. A silently dropped history line would leave an
     * officer reading an audit trail with a hole in it and no sign there
     * was ever supposed to be an entry there.
     */
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase
        .from(EVENTS as never)
        .insert(insert as never)
        .select("*")
        .single();
      if (!error && data) return toEvent(data as unknown as EventRow);
      if (attempt === 1) {
        console.error(
          `[alerts] history line not written for alert ${alertId} (${event.type}): ` +
            `${(error as { message?: string } | null)?.message ?? "no row returned"}`,
        );
      }
    }
    return null;
  }

  private async withEvent(
    alert: StoredAlert,
    event: Parameters<SupabaseAlertRepository["appendEvent"]>[1],
  ): Promise<WriteResult<StoredAlert>> {
    const written = await this.appendEvent(alert.id, event);
    if (!written) return { ok: true, value: alert };
    return { ok: true, value: { ...alert, events: [...alert.events, written] } };
  }
}
