/**
 * THE PERSISTED INTELLIGENCE FINDING.
 *
 * `finding.ts` holds the display projection — a translation of a domain
 * record for one mixed list. This holds the record that actually lives in
 * the database, because an officer decision has to attach to something
 * durable: "who confirmed this, when, and against which evidence" cannot
 * be answered by a projection that is recomputed on every render.
 *
 * The two are kept apart deliberately. The projection still projects; it
 * does not gain a lifecycle. This record has a lifecycle and no opinion
 * about how any surface draws it.
 *
 * ## What this model refuses to do
 *
 *  - It never concludes. `CONFIRMED` means an officer confirmed the
 *    finding as stated, not that fraud, smuggling or a sanction was
 *    established. There is no `FRAUD` status and there must not be one.
 *  - It never fabricates a subject. `subjectId` is the canonical id on
 *    the surface that owns the subject (IMO for a vessel), and a finding
 *    with no resolvable subject is not written.
 *  - It never turns silence into a result. `dataState` and `confidence`
 *    travel with the record, so a finding produced from a stale or
 *    partial source says so wherever it is read.
 *  - A dismissal does not delete anything. The record stays, the reason
 *    is required, and the decision is appended.
 */

/** Where the finding stands for the officer. */
export type FindingRecordStatus =
  | "NEW"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "DISMISSED"
  | "INVESTIGATION_OPEN"
  | "RESOLVED";

export const FINDING_STATUS_LABEL: Record<FindingRecordStatus, string> = {
  NEW: "New",
  UNDER_REVIEW: "Under review",
  CONFIRMED: "Confirmed by officer",
  DISMISSED: "Dismissed by officer",
  INVESTIGATION_OPEN: "Investigation open",
  RESOLVED: "Resolved",
};

export const FINDING_STATUS_CAVEAT: Record<FindingRecordStatus, string> = {
  NEW: "No officer has looked at this yet.",
  UNDER_REVIEW: "An officer has opened this and has not ruled on it.",
  CONFIRMED:
    "An officer confirmed the finding as described. This is a confirmation of the observation, not a finding of wrongdoing.",
  DISMISSED: "An officer ruled this out with a recorded reason. The evidence is retained.",
  INVESTIGATION_OPEN: "This finding is attached to a case.",
  RESOLVED: "The case work on this finding is closed.",
};

/**
 * How loudly the finding presents on the map and in the queue.
 *
 * Separate from vessel-type semantics and from any risk score: a severity
 * here says how much officer attention the finding asks for, and nothing
 * about the hull.
 */
export type FindingSeverity = "ATTENTION" | "WARNING" | "CRITICAL";

export const FINDING_SEVERITY_LABEL: Record<FindingSeverity, string> = {
  ATTENTION: "Attention",
  WARNING: "Warning",
  CRITICAL: "Critical finding",
};

/**
 * Map indicator class. `INVESTIGATION` is not a severity — it is what a
 * finding already attached to a case looks like, which an officer needs
 * to tell apart from one still awaiting them.
 */
export type FindingIndicatorClass = "ATTENTION" | "WARNING" | "CRITICAL" | "INVESTIGATION";

export const FINDING_INDICATOR_COLOR: Record<FindingIndicatorClass, string> = {
  ATTENTION: "#FBBF24",
  WARNING: "#FB923C",
  CRITICAL: "#F87171",
  INVESTIGATION: "#38BDF8",
};

export const FINDING_INDICATOR_LABEL: Record<FindingIndicatorClass, string> = {
  ATTENTION: "Attention",
  WARNING: "Warning",
  CRITICAL: "Critical finding",
  INVESTIGATION: "Investigation",
};

/**
 * Which indicator a record draws. A finding in a case reads as an
 * investigation whatever its severity; a decided finding stops competing
 * for attention but never disappears.
 */
export function indicatorClassFor(record: PersistedFinding): FindingIndicatorClass {
  if (record.status === "INVESTIGATION_OPEN") return "INVESTIGATION";
  return record.severity;
}

/** One evidence pointer held on the record. Never invented. */
export interface FindingEvidenceRef {
  readonly ref: string;
  readonly label: string;
  readonly source: string;
  /** When the underlying observation was made, when the source stated it. */
  readonly observedAt: string | null;
  readonly confidence: string | null;
  readonly dataState: string | null;
}

/** Related canonical records, by the ids their own surfaces own. */
export interface FindingRelated {
  readonly vesselImos?: readonly string[];
  readonly portLocodes?: readonly string[];
  readonly terminals?: readonly string[];
  readonly berths?: readonly string[];
  readonly facilities?: readonly string[];
  readonly voyageIds?: readonly string[];
  readonly manifestIds?: readonly string[];
}

export interface PersistedFinding {
  readonly id: string;
  /** The producing domain, verbatim. Domains are never collapsed. */
  readonly findingType: string;
  readonly severity: FindingSeverity;
  readonly status: FindingRecordStatus;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectName: string | null;
  /** What happened, in the producing domain's own words. */
  readonly description: string;
  /** Why it deserves an officer's time. */
  readonly whyAttention: string;
  readonly detectedAt: string;
  readonly source: string;
  readonly sourceRecordId: string | null;
  readonly confidence: string | null;
  readonly dataState: string | null;
  readonly evidenceRefs: readonly FindingEvidenceRef[];
  readonly related: FindingRelated;
  readonly position: { readonly lat: number; readonly lng: number } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly decisions: readonly FindingDecision[];
}

export type FindingDecisionKind = "CONFIRM" | "DISMISS" | "OPEN_INVESTIGATION" | "NOTE" | "RESOLVE";

export interface FindingDecision {
  readonly id: string;
  readonly findingId: string;
  readonly decision: FindingDecisionKind;
  readonly previousStatus: FindingRecordStatus;
  readonly newStatus: FindingRecordStatus;
  readonly reason: string | null;
  readonly note: string | null;
  readonly evidenceRef: string | null;
  readonly investigationId: string | null;
  readonly officerId: string;
  readonly decidedAt: string;
}

/**
 * The reasons an officer may give for dismissing a finding.
 *
 * A closed list, because a free-text-only dismissal cannot be counted,
 * audited or learned from. "Other" still requires a note.
 */
export const FINDING_DISMISSAL_REASONS = [
  "FALSE_POSITIVE",
  "INSUFFICIENT_EVIDENCE",
  "EXPECTED_OPERATION",
  "SOURCE_DISCREPANCY",
  "DUPLICATE",
  "RESOLVED_ELSEWHERE",
  "OTHER",
] as const;

export type FindingDismissalReason = (typeof FINDING_DISMISSAL_REASONS)[number];

export const FINDING_DISMISSAL_LABEL: Record<FindingDismissalReason, string> = {
  FALSE_POSITIVE: "False positive",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  EXPECTED_OPERATION: "Expected operation",
  SOURCE_DISCREPANCY: "Source discrepancy",
  DUPLICATE: "Duplicate",
  RESOLVED_ELSEWHERE: "Resolved elsewhere",
  OTHER: "Other",
};

/** Whether a dismissal is complete enough to record. */
export function dismissalIsComplete(
  reason: FindingDismissalReason | null,
  note: string,
): { readonly ok: boolean; readonly problem?: string } {
  if (!reason) return { ok: false, problem: "A dismissal reason is required." };
  if (reason === "OTHER" && note.trim().length < 3) {
    return { ok: false, problem: "'Other' requires a note explaining the dismissal." };
  }
  return { ok: true };
}

/** Status after a decision. The only place this transition is decided. */
export function statusAfter(
  decision: FindingDecisionKind,
  current: FindingRecordStatus,
): FindingRecordStatus {
  switch (decision) {
    case "CONFIRM":
      return "CONFIRMED";
    case "DISMISS":
      return "DISMISSED";
    case "OPEN_INVESTIGATION":
      return "INVESTIGATION_OPEN";
    case "RESOLVE":
      return "RESOLVED";
    case "NOTE":
      // A note is not a ruling. It records that an officer looked.
      return current === "NEW" ? "UNDER_REVIEW" : current;
  }
}

/** Whether the officer still owns work on this finding. */
export function needsOfficer(record: PersistedFinding): boolean {
  return record.status === "NEW" || record.status === "UNDER_REVIEW";
}

const STATUS_ORDER: Record<FindingRecordStatus, number> = {
  NEW: 0,
  UNDER_REVIEW: 1,
  INVESTIGATION_OPEN: 2,
  CONFIRMED: 3,
  DISMISSED: 4,
  RESOLVED: 5,
};

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  ATTENTION: 2,
};

/** Stable display order: open work first, then severity, then recency. */
export function orderRecords(records: readonly PersistedFinding[]): readonly PersistedFinding[] {
  return [...records].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.detectedAt.localeCompare(a.detectedAt);
  });
}
