/**
 * Durable sanctions screening store (server only).
 *
 * Screenings and officer decisions are append-only in the database, so
 * this module never updates or deletes: a later screening is a NEW row.
 * "What did we know on 28 August" stays answerable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SanctionsCandidate,
  SanctionsFailureReason,
  SanctionsMatchDecision,
  SanctionsMatchState,
  SanctionsScreeningRecord,
  SanctionsSubjectRole,
} from "@/lib/sanctions/match-state";
import type { ScreenSubjectOutcome } from "@/lib/server/opensanctions.server";

type Db = SupabaseClient<never, never, never>;
type Row = Record<string, unknown>;

/**
 * PostgREST query builder for a table the generated types do not know
 * about yet. Typed loosely on purpose, and only here: the row shapes are
 * narrowed by `toRecord`/`toDecision` before anything else sees them.
 */
type LooseQuery = {
  insert: (row: Record<string, unknown>) => LooseQuery;
  select: (columns: string) => LooseQuery;
  order: (column: string, options: { ascending: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, values: readonly string[]) => LooseQuery;
  single: () => PromiseLike<{ data: unknown; error: unknown }>;
} & PromiseLike<{ data: unknown; error: unknown }>;

function table(db: Db, name: string): LooseQuery {
  return (db as unknown as { from: (t: string) => LooseQuery }).from(name);
}

function str(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function toRecord(row: Row, decisions: SanctionsMatchDecision[]): SanctionsScreeningRecord {
  return {
    id: String(row["id"]),
    subjectName: String(row["subject_name"] ?? ""),
    subjectImo: str(row, "subject_imo"),
    entityKind: String(row["entity_kind"] ?? "vessel"),
    entityRole: (str(row, "entity_role") as SanctionsSubjectRole | null) ?? null,
    state: String(row["state"]) as SanctionsMatchState,
    failureReason: (str(row, "failure_reason") as SanctionsFailureReason | null) ?? null,
    errorMessage: str(row, "error_message"),
    topScore:
      typeof row["top_score"] === "number"
        ? row["top_score"]
        : row["top_score"] === null
          ? null
          : Number(row["top_score"]),
    candidates: Array.isArray(row["candidates"]) ? (row["candidates"] as SanctionsCandidate[]) : [],
    provider: String(row["provider"] ?? "OpenSanctions"),
    dataset: String(row["dataset"] ?? "sanctions"),
    scope: String(row["scope"] ?? "sanctions"),
    screenedAt: String(row["screened_at"] ?? new Date().toISOString()),
    decisions,
  };
}

function toDecision(row: Row): SanctionsMatchDecision {
  return {
    id: String(row["id"]),
    screeningId: String(row["screening_id"]),
    candidateId: String(row["candidate_id"]),
    candidateCaption: str(row, "candidate_caption"),
    decision: String(row["decision"]) as "CONFIRMED" | "DISMISSED",
    reason: String(row["reason"] ?? ""),
    note: str(row, "note"),
    evidenceRef: str(row, "evidence_ref"),
    officerId: String(row["officer_id"]),
    decidedAt: String(row["decided_at"]),
  };
}

export interface InsertScreeningInput {
  readonly subjectName: string;
  readonly subjectImo: string | null;
  readonly entityKind: string;
  readonly entityRole: SanctionsSubjectRole;
  readonly requestedBy: string;
  readonly outcome: ScreenSubjectOutcome;
}

export async function insertScreening(db: Db, input: InsertScreeningInput): Promise<Row> {
  const { outcome } = input;
  const { data, error } = await table(db, "sanctions_screenings")
    .insert({
      subject_name: input.subjectName,
      subject_imo: input.subjectImo,
      entity_kind: input.entityKind,
      entity_role: input.entityRole,
      provider: outcome.provider,
      dataset: outcome.dataset,
      scope: `${outcome.provider} · ${outcome.dataset}`,
      state: outcome.state,
      failure_reason: outcome.failureReason,
      error_message: outcome.errorMessage,
      top_score: outcome.topScore,
      candidate_count: outcome.candidates.length,
      candidates: outcome.candidates,
      requested_by: input.requestedBy,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Row;
}

export async function loadScreenings(
  db: Db,
  filter: { readonly imo?: string; readonly name?: string },
): Promise<SanctionsScreeningRecord[]> {
  let query = table(db, "sanctions_screenings")
    .select("*")
    .order("screened_at", { ascending: false })
    .limit(50);

  if (filter.imo) query = query.eq("subject_imo", filter.imo);
  else if (filter.name) query = query.eq("subject_name", filter.name);
  else return [];

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => String(row["id"]));
  const { data: decisionRows, error: decisionError } = await table(db, "sanctions_match_decisions")
    .select("*")
    .in("screening_id", ids)
    .order("decided_at", { ascending: false });
  if (decisionError) throw decisionError;

  const byScreening = new Map<string, SanctionsMatchDecision[]>();
  for (const raw of (decisionRows ?? []) as Row[]) {
    const decision = toDecision(raw);
    const bucket = byScreening.get(decision.screeningId) ?? [];
    bucket.push(decision);
    byScreening.set(decision.screeningId, bucket);
  }

  return rows.map((row) => toRecord(row, byScreening.get(String(row["id"])) ?? []));
}

export interface InsertDecisionInput {
  readonly screeningId: string;
  readonly candidateId: string;
  readonly candidateCaption?: string;
  readonly decision: "CONFIRMED" | "DISMISSED";
  readonly reason: string;
  readonly note?: string;
  readonly evidenceRef?: string;
}

export async function insertDecision(
  db: Db,
  officerId: string,
  input: InsertDecisionInput,
): Promise<SanctionsMatchDecision> {
  const { data: screening, error: loadError } = await table(db, "sanctions_screenings")
    .select("subject_name, subject_imo")
    .eq("id", input.screeningId)
    .single();
  if (loadError) throw loadError;

  const { data, error } = await table(db, "sanctions_match_decisions")
    .insert({
      screening_id: input.screeningId,
      subject_name: (screening as Row)["subject_name"],
      subject_imo: (screening as Row)["subject_imo"],
      candidate_id: input.candidateId,
      candidate_caption: input.candidateCaption ?? null,
      decision: input.decision,
      reason: input.reason,
      note: input.note ?? null,
      evidence_ref: input.evidenceRef ?? null,
      officer_id: officerId,
    })
    .select("*")
    .single();
  if (error) throw error;

  await writeAudit(db, officerId, {
    action: input.decision === "CONFIRMED" ? "MATCH_CONFIRMED" : "MATCH_DISMISSED",
    entity: "sanctions_match_decision",
    entityId: String((data as Row)["id"]),
    metadata: {
      screeningId: input.screeningId,
      candidateId: input.candidateId,
      reason: input.reason,
    },
  });

  return toDecision(data as Row);
}

/**
 * Audit through the existing immutable log. Written directly rather than
 * through the audit server function because we are already inside an
 * authenticated server handler holding the caller's client.
 */
async function writeAudit(
  db: Db,
  officerId: string,
  entry: {
    action: string;
    entity: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await table(db, "audit_log").insert({
    officer_id: officerId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    module: "sanctions-screening",
    rule_refs: ["HR-2", "HR-9"],
    metadata: entry.metadata,
    ip_address: "server",
  });
  // An audit failure must be loud: it is a compliance defect, not noise.
  if (error) throw error;
}

export async function writeScreeningAudit(
  db: Db,
  officerId: string,
  row: Row,
  outcome: ScreenSubjectOutcome,
): Promise<void> {
  await writeAudit(db, officerId, {
    action: "SCREENING_REQUESTED",
    entity: "sanctions_screening",
    entityId: String(row["id"]),
    metadata: {
      subject: row["subject_name"],
      imo: row["subject_imo"],
      provider: outcome.provider,
      dataset: outcome.dataset,
    },
  });
  await writeAudit(db, officerId, {
    action: "SCREENING_COMPLETED",
    entity: "sanctions_screening",
    entityId: String(row["id"]),
    metadata: {
      state: outcome.state,
      failureReason: outcome.failureReason,
      candidateCount: outcome.candidates.length,
      topScore: outcome.topScore,
    },
  });
}

/**
 * The newest screenings across every subject, for the cross-surface
 * attention projection.
 *
 * A separate loader rather than a looser `loadScreenings`, because the
 * subject-scoped read must keep refusing an unfiltered query: a drawer
 * that silently listed the whole estate would attribute other vessels'
 * screenings to the one on screen.
 */
export async function loadRecentScreenings(
  db: Db,
  limit = 100,
): Promise<SanctionsScreeningRecord[]> {
  const { data, error } = await table(db, "sanctions_screenings")
    .select("*")
    .order("screened_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => String(row["id"]));
  const { data: decisionRows, error: decisionError } = await table(db, "sanctions_match_decisions")
    .select("*")
    .in("screening_id", ids)
    .order("decided_at", { ascending: false });
  if (decisionError) throw decisionError;

  const byScreening = new Map<string, SanctionsMatchDecision[]>();
  for (const raw of (decisionRows ?? []) as Row[]) {
    const decision = toDecision(raw);
    const bucket = byScreening.get(decision.screeningId) ?? [];
    bucket.push(decision);
    byScreening.set(decision.screeningId, bucket);
  }

  return rows.map((row) => toRecord(row, byScreening.get(String(row["id"])) ?? []));
}
