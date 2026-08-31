/**
 * Durable intelligence-finding store (server only).
 *
 * Findings are written from records a provider domain already persisted —
 * never from a guess, and never from something the UI passed in as a
 * label. A finding row carries the source and that source's own record id,
 * so it can be traced back and so re-synchronising cannot duplicate it.
 *
 * Decisions are append-only in the database. Status on the finding row is
 * a cached projection of the newest decision; the decisions themselves are
 * the record of what happened and can never be rewritten. Every
 * consequential change also writes `audit_log`, and an audit failure is
 * raised rather than swallowed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  statusAfter,
  type FindingDecision,
  type FindingDecisionKind,
  type FindingEvidenceRef,
  type FindingRecordStatus,
  type FindingRelated,
  type FindingSeverity,
  type PersistedFinding,
} from "@/services/findings/record";

import { writeFindingAudit } from "./findings-store.server";

type Db = SupabaseClient<never, never, never>;
type Row = Record<string, unknown>;

type LooseQuery = {
  insert: (row: Record<string, unknown> | Record<string, unknown>[]) => LooseQuery;
  update: (row: Record<string, unknown>) => LooseQuery;
  upsert: (
    row: Record<string, unknown> | Record<string, unknown>[],
    options?: Record<string, unknown>,
  ) => LooseQuery;
  select: (columns: string) => LooseQuery;
  order: (column: string, options: { ascending: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, values: readonly string[]) => LooseQuery;
  single: () => PromiseLike<{ data: unknown; error: unknown }>;
  maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
} & PromiseLike<{ data: unknown; error: unknown }>;

function table(db: Db, name: string): LooseQuery {
  return (db as unknown as { from: (t: string) => LooseQuery }).from(name);
}

function str(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDecision(row: Row): FindingDecision {
  return {
    id: String(row["id"]),
    findingId: String(row["finding_id"]),
    decision: String(row["decision"]) as FindingDecisionKind,
    previousStatus: String(row["previous_status"]) as FindingRecordStatus,
    newStatus: String(row["new_status"]) as FindingRecordStatus,
    reason: str(row, "reason"),
    note: str(row, "note"),
    evidenceRef: str(row, "evidence_ref"),
    investigationId: str(row, "investigation_id"),
    officerId: String(row["officer_id"]),
    decidedAt: String(row["decided_at"]),
  };
}

function toFinding(row: Row, decisions: readonly FindingDecision[]): PersistedFinding {
  const lat = num(row, "latitude");
  const lng = num(row, "longitude");
  return {
    id: String(row["id"]),
    findingType: String(row["finding_type"]),
    severity: String(row["severity"]) as FindingSeverity,
    status: String(row["status"]) as FindingRecordStatus,
    subjectType: String(row["subject_type"]),
    subjectId: String(row["subject_id"]),
    subjectName: str(row, "subject_name"),
    description: String(row["description"] ?? ""),
    whyAttention: String(row["why_attention"] ?? ""),
    detectedAt: String(row["detected_at"]),
    source: String(row["source"]),
    sourceRecordId: str(row, "source_record_id"),
    confidence: str(row, "confidence"),
    dataState: str(row, "data_state"),
    evidenceRefs: Array.isArray(row["evidence_refs"])
      ? (row["evidence_refs"] as FindingEvidenceRef[])
      : [],
    related:
      row["related"] && typeof row["related"] === "object"
        ? (row["related"] as FindingRelated)
        : ({} as FindingRelated),
    position: lat !== null && lng !== null ? { lat, lng } : null,
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
    decisions,
  };
}

/**
 * Audit metadata, flattened to primitives.
 *
 * The audit row stores JSON, and a nested object crossing the server
 * boundary is not serialisable by contract. Nested values are stringified
 * rather than dropped: an audit entry that quietly loses a field is worse
 * than one that reads a little awkwardly.
 */
function flattenMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null) out[key] = null;
    else if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean")
      out[key] = raw;
    else out[key] = JSON.stringify(raw);
  }
  return out;
}

export interface UpsertFindingInput {
  readonly findingType: string;
  readonly severity: FindingSeverity;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectName?: string | null;
  readonly description: string;
  readonly whyAttention: string;
  readonly detectedAt: string;
  readonly source: string;
  /** The producing domain's own primary key. Required for idempotency. */
  readonly sourceRecordId: string;
  readonly confidence?: string | null;
  readonly dataState?: string | null;
  readonly evidenceRefs?: readonly FindingEvidenceRef[];
  readonly related?: FindingRelated;
  readonly position?: { readonly lat: number; readonly lng: number } | null;
}

/**
 * Write findings for domain records, without duplicating and without
 * overwriting an officer's ruling.
 *
 * A finding already on file keeps its status and its decisions: a later
 * sync pass must never quietly reopen something an officer dismissed, and
 * must never mark something confirmed because a source repeated itself.
 */
export async function upsertFindings(
  db: Db,
  officerId: string,
  inputs: readonly UpsertFindingInput[],
): Promise<{ readonly created: number; readonly existing: number }> {
  if (inputs.length === 0) return { created: 0, existing: 0 };

  const { data: existingRows, error: readError } = await table(db, "intelligence_findings")
    .select("id,source,source_record_id")
    .in(
      "source_record_id",
      inputs.map((input) => input.sourceRecordId),
    );
  if (readError) throw readError;

  const seen = new Set(
    ((existingRows ?? []) as Row[]).map((row) => `${row["source"]}::${row["source_record_id"]}`),
  );

  const fresh = inputs.filter((input) => !seen.has(`${input.source}::${input.sourceRecordId}`));
  if (fresh.length === 0) return { created: 0, existing: inputs.length };

  const { data, error } = await table(db, "intelligence_findings")
    .insert(
      fresh.map((input) => ({
        finding_type: input.findingType,
        severity: input.severity,
        status: "NEW",
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        subject_name: input.subjectName ?? null,
        description: input.description,
        why_attention: input.whyAttention,
        detected_at: input.detectedAt,
        source: input.source,
        source_record_id: input.sourceRecordId,
        confidence: input.confidence ?? null,
        data_state: input.dataState ?? null,
        evidence_refs: input.evidenceRefs ?? [],
        related: input.related ?? {},
        latitude: input.position?.lat ?? null,
        longitude: input.position?.lng ?? null,
        created_by: officerId,
      })),
    )
    .select("id,finding_type,subject_id,source,source_record_id");
  if (error) throw error;

  for (const row of (data ?? []) as Row[]) {
    await writeFindingAudit(db, officerId, {
      action: "FINDING_RECORDED",
      entityId: String(row["id"]),
      metadata: {
        findingType: row["finding_type"],
        subjectId: row["subject_id"],
        source: row["source"],
        sourceRecordId: row["source_record_id"],
      },
    });
  }

  return { created: ((data ?? []) as Row[]).length, existing: inputs.length - fresh.length };
}

export interface ListFindingsFilter {
  readonly subjectId?: string;
  readonly status?: readonly FindingRecordStatus[];
  readonly limit?: number;
}

export async function loadFindings(
  db: Db,
  filter: ListFindingsFilter = {},
): Promise<PersistedFinding[]> {
  let query = table(db, "intelligence_findings")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(Math.min(filter.limit ?? 200, 500));
  if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
  if (filter.status && filter.status.length > 0) query = query.in("status", filter.status);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const { data: decisionRows, error: decisionError } = await table(db, "finding_decisions")
    .select("*")
    .in(
      "finding_id",
      rows.map((row) => String(row["id"])),
    )
    .order("decided_at", { ascending: false });
  if (decisionError) throw decisionError;

  const byFinding = new Map<string, FindingDecision[]>();
  for (const row of (decisionRows ?? []) as Row[]) {
    const decision = toDecision(row);
    const list = byFinding.get(decision.findingId) ?? [];
    list.push(decision);
    byFinding.set(decision.findingId, list);
  }

  return rows.map((row) => toFinding(row, byFinding.get(String(row["id"])) ?? []));
}

export async function loadFinding(db: Db, findingId: string): Promise<PersistedFinding | null> {
  const { data, error } = await table(db, "intelligence_findings")
    .select("*")
    .eq("id", findingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: decisionRows, error: decisionError } = await table(db, "finding_decisions")
    .select("*")
    .eq("finding_id", findingId)
    .order("decided_at", { ascending: false });
  if (decisionError) throw decisionError;

  return toFinding(data as Row, ((decisionRows ?? []) as Row[]).map(toDecision));
}

export interface DecideFindingInput {
  readonly findingId: string;
  readonly decision: FindingDecisionKind;
  readonly reason?: string;
  readonly note?: string;
  readonly evidenceRef?: string;
  readonly investigationId?: string;
}

/**
 * Record an officer's decision on a finding.
 *
 * The previous status is read from the database rather than trusted from
 * the caller: a stale tab must not be able to claim a transition that
 * never happened. A dismissal without a reason is refused here, not only
 * in the dialog, because the dialog is not the boundary.
 */
export async function decideFinding(
  db: Db,
  officerId: string,
  input: DecideFindingInput,
): Promise<PersistedFinding> {
  const current = await loadFinding(db, input.findingId);
  if (!current) throw new Error("That finding is not on file.");

  if (input.decision === "DISMISS" && !input.reason) {
    throw new Error("A dismissal reason is required.");
  }

  const nextStatus = statusAfter(input.decision, current.status);

  const { error: decisionError } = await table(db, "finding_decisions").insert({
    finding_id: current.id,
    decision: input.decision,
    previous_status: current.status,
    new_status: nextStatus,
    reason: input.reason ?? null,
    note: input.note ?? null,
    evidence_ref: input.evidenceRef ?? null,
    investigation_id: input.investigationId ?? null,
    officer_id: officerId,
  });
  if (decisionError) throw decisionError;

  const { error: statusError } = await table(db, "intelligence_findings")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", current.id);
  if (statusError) throw statusError;

  await writeFindingAudit(db, officerId, {
    action: `FINDING_${input.decision}`,
    entityId: current.id,
    metadata: {
      findingType: current.findingType,
      subjectType: current.subjectType,
      subjectId: current.subjectId,
      source: current.source,
      sourceRecordId: current.sourceRecordId,
      previousStatus: current.status,
      newStatus: nextStatus,
      reason: input.reason ?? null,
      note: input.note ?? null,
      evidenceRef: input.evidenceRef ?? null,
      investigationId: input.investigationId ?? null,
    },
  });

  const updated = await loadFinding(db, current.id);
  if (!updated) throw new Error("The finding could not be re-read after the decision.");
  return updated;
}

/** Audit entries recorded against findings, newest first. */
export async function loadFindingAudit(
  db: Db,
  filter: { readonly findingId?: string; readonly investigationId?: string },
): Promise<
  Array<{
    readonly id: string;
    readonly action: string;
    readonly officerId: string;
    readonly entityId: string | null;
    readonly metadata: Record<string, string | number | boolean | null>;
    readonly createdAt: string;
  }>
> {
  let query = table(db, "audit_log")
    .select("id,action,officer_id,entity_id,metadata,created_at")
    .eq("entity", "intelligence_finding")
    .order("created_at", { ascending: false })
    .limit(200);

  const target = filter.findingId ?? filter.investigationId;
  if (!target) return [];
  query = query.eq("entity_id", target);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row["id"]),
    action: String(row["action"]),
    officerId: String(row["officer_id"] ?? ""),
    entityId: str(row, "entity_id"),
    metadata: flattenMetadata(row["metadata"]),
    createdAt: String(row["created_at"]),
  }));
}
