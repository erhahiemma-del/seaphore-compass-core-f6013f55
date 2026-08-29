/**
 * INTELLIGENCE FINDING — a presentation/attention projection.
 *
 * This is NOT a domain model and owns no rules. It exists so that one
 * surface (the attention centre, a map indicator, a case view) can list
 * items that came from different intelligence domains without any of
 * those domains learning about each other.
 *
 * Deliberately kept apart:
 *
 *   ArrivalInterventionAlert ≠ Sanctions finding ≠ Environmental finding
 *   ≠ Manifest finding
 *
 * Each provider domain keeps its own semantics, lifecycle, severity and
 * store. Nothing here decides a state, screens a subject, raises an
 * alert, or merges two sources. Projections in `from-*.ts` translate a
 * domain record into this shape for display only, and they never travel
 * back: no domain reads a finding to decide anything.
 *
 * ## Severity is not shared
 *
 * `attentionPriority` is a projection-local ordering hint. It is NOT the
 * arrival alert severity, NOT a risk level and NOT an attention score,
 * and must never be written back into any of them. Reusing those scales
 * across domains would make a sanctions candidate comparable to an
 * arrival window, which no officer asked for and no rule supports.
 */

export type FindingSubjectType = "vessel" | "company" | "person" | "port" | "cargo";

/** Which intelligence domain produced the item. Never collapsed. */
export type FindingType =
  | "ARRIVAL_INTERVENTION"
  | "SANCTIONS_SCREENING"
  | "ENVIRONMENTAL"
  | "MANIFEST";

export const FINDING_TYPE_LABEL: Record<FindingType, string> = {
  ARRIVAL_INTERVENTION: "Arrival",
  SANCTIONS_SCREENING: "Sanctions",
  ENVIRONMENTAL: "Environmental",
  MANIFEST: "Manifest",
};

/**
 * Ordering hint for one mixed list. Separate from every domain severity
 * scale on purpose (see the note above).
 */
export type FindingAttentionPriority = "REVIEW" | "AWARE" | "INFORMATIONAL";

export const FINDING_PRIORITY_LABEL: Record<FindingAttentionPriority, string> = {
  REVIEW: "Review",
  AWARE: "Aware",
  INFORMATIONAL: "Informational",
};

const PRIORITY_ORDER: Record<FindingAttentionPriority, number> = {
  REVIEW: 0,
  AWARE: 1,
  INFORMATIONAL: 2,
};

/**
 * Where the item stands for the officer. Provider-neutral words only:
 * a domain state (`REVIEW_REQUIRED`, `ACKNOWLEDGED`) stays in
 * `statusDetail`, so this field never implies a lifecycle it does not own.
 */
export type FindingStatus = "OPEN" | "REVIEWED" | "LINKED" | "CLOSED";

export interface IntelligenceFinding {
  readonly id: string;
  readonly subjectType: FindingSubjectType;
  /** Canonical subject id on the surface that owns it (IMO for a vessel). */
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly findingType: FindingType;
  readonly attentionPriority: FindingAttentionPriority;
  /** Provider or engine that produced the underlying record. */
  readonly source: string;
  /** Primary key of the record in its own store, when it has one. */
  readonly sourceRecordId: string | null;
  readonly summary: string;
  /** Why this needs attention, in the producing domain's own words. */
  readonly reason: string;
  /** Pointer an officer can follow to the evidence. Never fabricated. */
  readonly evidenceRef: string | null;
  readonly status: FindingStatus;
  /** The producing domain's own state, verbatim. Not reinterpreted. */
  readonly statusDetail: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One mixed list, ordered for display: priority, then most recent.
 * A stable order matters because two domains updating at different
 * cadences would otherwise reshuffle the list under the officer's cursor.
 */
export function orderFindings(
  findings: readonly IntelligenceFinding[],
): readonly IntelligenceFinding[] {
  return [...findings].sort((a, b) => {
    const byPriority =
      PRIORITY_ORDER[a.attentionPriority] - PRIORITY_ORDER[b.attentionPriority];
    if (byPriority !== 0) return byPriority;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function countFindingsByPriority(
  findings: readonly IntelligenceFinding[],
): Readonly<Record<FindingAttentionPriority, number>> {
  const counts = { REVIEW: 0, AWARE: 0, INFORMATIONAL: 0 };
  for (const finding of findings) counts[finding.attentionPriority] += 1;
  return counts;
}

export function findingsForSubject(
  findings: readonly IntelligenceFinding[],
  subjectId: string,
): readonly IntelligenceFinding[] {
  return findings.filter((finding) => finding.subjectId === subjectId);
}
