/**
 * Officer decisions over intelligence.
 *
 * ## A decision is not a change to the intelligence
 *
 * The sprint's rule, encoded: an officer acting on a finding must not
 * alter the finding. Evidence, confidence, priority and provenance are
 * owned by the engines that produced them, and an officer disagreeing
 * with an assessment does not make the assessment different — it makes
 * an operational record that sits *beside* it:
 *
 *     Intelligence Finding  +  Officer Decision  =  Operational Record
 *
 * So `buildOperationalRecord` takes the brief by value and returns a new
 * object. It has no access to a finding store and no way to write back.
 * That is enforced structurally rather than by convention: there is no
 * mutation path to misuse.
 *
 * ## Priority and confidence are copied, never recomputed
 *
 * The record snapshots what OSAE and `reasoning` said *at the moment of
 * the decision*. Later reassessment may move them, and when it does the
 * record must still show what the officer was actually looking at — an
 * audit that reads back today's priority against yesterday's decision
 * describes a decision nobody made.
 *
 * Both fields are read straight off the brief. Nothing here derives them.
 */
import type { ExecutiveBriefV2 } from "./executive-brief";

/**
 * What an officer can do with a brief.
 *
 * Four verbs, matching the operational vocabulary: an officer
 * acknowledges intelligence, opens an investigation, escalates it, or
 * judges it not actionable. Note that none of them is "approve" —
 * a finding is not a request, and approving one is not a thing an
 * officer does.
 */
export type OfficerDecisionKind = "acknowledge" | "investigate" | "escalate" | "dismiss";

export const OFFICER_DECISIONS: readonly OfficerDecisionKind[] = [
  "acknowledge",
  "investigate",
  "escalate",
  "dismiss",
];

/** Officer-facing label for each decision. */
export const DECISION_LABEL: Readonly<Record<OfficerDecisionKind, string>> = {
  acknowledge: "Acknowledge",
  investigate: "Investigate",
  escalate: "Escalate",
  dismiss: "Not actionable",
};

/**
 * The immutable join of a finding and an officer's judgement.
 *
 * Every field is either the officer's own input or a snapshot copied
 * from the brief. Nothing is computed.
 */
export interface OperationalRecord {
  readonly decision: OfficerDecisionKind;
  /** The question the brief answered. Identifies what was decided on. */
  readonly query: string;
  /** Findings the brief carried, by id — the decision's subject matter. */
  readonly findingIds: readonly string[];
  /**
   * OSAE's priority for the lead finding at decision time, or null when
   * nothing reached a priority. Copied from the brief.
   */
  readonly priorityAtDecision: string | null;
  /** Assessment confidence bands present at decision time. Copied. */
  readonly confidenceAtDecision: readonly string[];
  /** When the brief was produced, distinct from when it was decided. */
  readonly briefProducedAt: string;
  readonly decidedAt: string;
  /** Optional free-text justification the officer supplied. */
  readonly note: string | null;
}

/**
 * Build the record. Pure — no I/O, no clock beyond the injected one.
 *
 * `now` is a parameter so tests pin it and so the caller decides what
 * "decision time" means, rather than this module reading a clock the
 * caller cannot see.
 */
export function buildOperationalRecord(
  brief: ExecutiveBriefV2,
  decision: OfficerDecisionKind,
  options: { readonly note?: string | null; readonly now?: number } = {},
): OperationalRecord {
  const { note = null, now = Date.now() } = options;

  return {
    decision,
    query: brief.query,
    findingIds: brief.keyFindings.map((finding) => finding.id),
    // Read, not derived. The lead finding is the one the brief already
    // ordered first; re-ranking here would be a second priority owner.
    priorityAtDecision: brief.keyFindings[0]?.priority ?? null,
    confidenceAtDecision: brief.confidence.bands,
    briefProducedAt: brief.producedAt,
    decidedAt: new Date(now).toISOString(),
    note: note && note.trim().length > 0 ? note.trim() : null,
  };
}

/**
 * Where a record is persisted.
 *
 * Injected so the UI layer depends on this contract rather than on
 * `writeAuditLog` directly, and so tests assert what would be written
 * without a Supabase client. The production sink is the append-only
 * `audit_log` table, which has no UPDATE or DELETE policy — the record
 * is immutable once written, which is the point.
 */
export interface DecisionSink {
  (input: {
    action: string;
    entity: string;
    entityId?: string;
    module: string;
    metadata: Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * Persist a decision as an audit entry.
 *
 * Returns the record regardless of whether the sink succeeded, and
 * reports the failure separately. An officer who has decided has
 * decided; losing the audit write is a problem to surface, not a reason
 * to pretend the decision did not happen or to silently discard it.
 */
export async function recordOfficerDecision(
  brief: ExecutiveBriefV2,
  decision: OfficerDecisionKind,
  sink: DecisionSink,
  options: { readonly note?: string | null; readonly now?: number } = {},
): Promise<{ record: OperationalRecord; persisted: boolean; error: string | null }> {
  const record = buildOperationalRecord(brief, decision, options);

  try {
    await sink({
      action: `intelligence.decision.${decision}`,
      entity: "ExecutiveBrief",
      entityId: record.findingIds[0],
      module: "maritime-intelligence",
      metadata: { ...record },
    });
    return { record, persisted: true, error: null };
  } catch (error) {
    return {
      record,
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
