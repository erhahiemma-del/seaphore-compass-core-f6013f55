/**
 * Finding → investigation linkage (server only).
 *
 * The safest relationship the existing schema supports:
 *
 *   Finding → Case → Subject vessel/entity → Evidence
 *
 * What this deliberately does NOT do:
 *
 *  - It does not write an IMO into the investigation's free-text
 *    `scenario`. A hull identifier buried in prose is not a relationship;
 *    it cannot be queried and cannot be trusted.
 *  - It does not invent a `target_voyage_id`. A voyage UUID we did not
 *    resolve would be a fabricated fact in the case record.
 *  - It does not create a vessel→case edge in the relationship graph. The
 *    subject travels as `subject_type` + `subject_id` on the link row,
 *    which is exactly what we actually know.
 *
 * Links are append-only. Attaching the same finding to a second case is a
 * new row; nothing is ever rewritten or removed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<never, never, never>;
type Row = Record<string, unknown>;

type LooseQuery = {
  insert: (row: Record<string, unknown>) => LooseQuery;
  select: (columns: string) => LooseQuery;
  order: (column: string, options: { ascending: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  single: () => PromiseLike<{ data: unknown; error: unknown }>;
} & PromiseLike<{ data: unknown; error: unknown }>;

function table(db: Db, name: string): LooseQuery {
  return (db as unknown as { from: (t: string) => LooseQuery }).from(name);
}

export interface FindingLink {
  readonly id: string;
  readonly findingId: string;
  readonly findingType: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectLabel: string | null;
  readonly source: string;
  readonly sourceRecordId: string | null;
  readonly summary: string | null;
  readonly evidenceRef: string | null;
  readonly investigationId: string;
  readonly caseNumber: string | null;
  readonly linkedBy: string;
  readonly createdAt: string;
}

function toLink(row: Row, caseNumber: string | null): FindingLink {
  const text = (key: string): string | null => {
    const value = row[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  return {
    id: String(row["id"]),
    findingId: String(row["finding_id"]),
    findingType: String(row["finding_type"]),
    subjectType: String(row["subject_type"]),
    subjectId: String(row["subject_id"]),
    subjectLabel: text("subject_label"),
    source: String(row["source"]),
    sourceRecordId: text("source_record_id"),
    summary: text("summary"),
    evidenceRef: text("evidence_ref"),
    investigationId: String(row["investigation_id"]),
    caseNumber,
    linkedBy: String(row["linked_by"]),
    createdAt: String(row["created_at"]),
  };
}

export interface LinkFindingInput {
  readonly findingId: string;
  readonly findingType: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectLabel?: string;
  readonly source: string;
  readonly sourceRecordId?: string;
  readonly summary?: string;
  readonly evidenceRef?: string;
  /** Attach to an existing case. Omitted means open a new one. */
  readonly investigationId?: string;
}

/**
 * A case number an officer can read and say out loud. Derived from the
 * date and a short random suffix — never from the subject, so the case
 * number itself never asserts anything about a vessel.
 */
function caseNumberFor(now: Date): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CASE-${stamp}-${suffix}`;
}

/**
 * `investigations.id` references `entities.id`, so a case is an entity
 * first. The entity is `DECLARED`: an officer declared the case exists.
 * It is not `VERIFIED`, which the database requires a source for.
 */
async function createInvestigation(
  db: Db,
  officerId: string,
  scenario: string,
): Promise<{ id: string; caseNumber: string }> {
  const caseNumber = caseNumberFor(new Date());

  const { data: entity, error: entityError } = await table(db, "entities")
    .insert({
      type: "investigation",
      name: caseNumber,
      confidence: "DECLARED",
      attributes: { origin: "intelligence-finding" },
      created_by: officerId,
      updated_by: officerId,
    })
    .select("id")
    .single();
  if (entityError) throw entityError;

  const id = String((entity as Row)["id"]);

  const { error } = await table(db, "investigations").insert({
    id,
    case_number: caseNumber,
    scenario,
    status: "open",
    lead_officer_id: officerId,
  });
  if (error) throw error;

  return { id, caseNumber };
}

export interface LinkFindingResult {
  readonly link: FindingLink;
  readonly investigationId: string;
  readonly caseNumber: string;
  readonly created: boolean;
}

export async function linkFindingToInvestigation(
  db: Db,
  officerId: string,
  input: LinkFindingInput,
): Promise<LinkFindingResult> {
  let investigationId = input.investigationId ?? null;
  let caseNumber: string | null = null;
  let created = false;

  if (investigationId) {
    const { data, error } = await table(db, "investigations")
      .select("case_number")
      .eq("id", investigationId)
      .single();
    if (error) throw error;
    caseNumber = String((data as Row)["case_number"]);
  } else {
    /*
     * The scenario names the finding type only. The subject identity is
     * a column on the link row, not prose in a case description.
     */
    const opened = await createInvestigation(
      db,
      officerId,
      `Opened from a ${input.findingType} finding reported by ${input.source}.`,
    );
    investigationId = opened.id;
    caseNumber = opened.caseNumber;
    created = true;
  }

  const { data, error } = await table(db, "finding_investigation_links")
    .insert({
      finding_id: input.findingId,
      finding_type: input.findingType,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      subject_label: input.subjectLabel ?? null,
      source: input.source,
      source_record_id: input.sourceRecordId ?? null,
      summary: input.summary ?? null,
      evidence_ref: input.evidenceRef ?? null,
      investigation_id: investigationId,
      linked_by: officerId,
    })
    .select("*")
    .single();
  if (error) throw error;

  await writeFindingAudit(db, officerId, {
    action: created ? "INVESTIGATION_OPENED" : "FINDING_REVIEWED",
    entityId: investigationId,
    metadata: {
      findingId: input.findingId,
      findingType: input.findingType,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      source: input.source,
      evidenceRef: input.evidenceRef ?? null,
      caseNumber,
    },
  });

  return {
    link: toLink(data as Row, caseNumber),
    investigationId,
    caseNumber: caseNumber ?? "",
    created,
  };
}

export async function loadFindingLinks(
  db: Db,
  filter: { readonly subjectId?: string; readonly investigationId?: string },
): Promise<FindingLink[]> {
  let query = table(db, "finding_investigation_links")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter.investigationId) query = query.eq("investigation_id", filter.investigationId);
  else if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
  else return [];

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Case numbers are read once per distinct investigation, so a case view
  // can name the case without the link row duplicating it.
  const numbers = new Map<string, string | null>();
  for (const row of rows) {
    const id = String(row["investigation_id"]);
    if (numbers.has(id)) continue;
    const { data: inv } = await table(db, "investigations")
      .select("case_number")
      .eq("id", id)
      .single();
    numbers.set(id, inv ? String((inv as Row)["case_number"]) : null);
  }

  return rows.map((row) => toLink(row, numbers.get(String(row["investigation_id"])) ?? null));
}

export async function writeFindingAudit(
  db: Db,
  officerId: string,
  entry: {
    readonly action: string;
    readonly entityId: string | null;
    readonly metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await table(db, "audit_log").insert({
    officer_id: officerId,
    action: entry.action,
    entity: "intelligence_finding",
    entity_id: entry.entityId,
    module: "intelligence-findings",
    rule_refs: ["HR-9"],
    metadata: entry.metadata,
    ip_address: "server",
  });
  // Audit failure is a compliance defect, never swallowed.
  if (error) throw error;
}
