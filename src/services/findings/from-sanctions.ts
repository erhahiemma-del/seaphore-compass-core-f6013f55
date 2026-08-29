/**
 * Sanctions screening → finding projection.
 *
 * Display translation only. It reads what the screening domain already
 * decided (state, candidates, officer decisions) and never re-derives it:
 * no threshold is applied here, no candidate is chosen, and no score is
 * turned into a conclusion.
 *
 * A screening that returned nothing above threshold is deliberately NOT a
 * finding. Projecting a `NO_MATCH` into the attention list would fill an
 * officer's queue with items that assert nothing and would quietly read
 * as a clearance.
 */
import {
  effectiveState,
  type SanctionsMatchState,
  type SanctionsScreeningRecord,
} from "@/lib/sanctions/match-state";

import type { FindingAttentionPriority, IntelligenceFinding } from "./finding";

/**
 * The projection-local ordering hint. Not the arrival severity, not a
 * risk level: a screening awaiting an officer outranks one already ruled
 * on, and nothing here is comparable to an approach window.
 */
function priorityFor(state: SanctionsMatchState): FindingAttentionPriority | null {
  switch (state) {
    case "CONFIRMED_MATCH":
    case "REVIEW_REQUIRED":
      return "REVIEW";
    case "POSSIBLE_MATCH":
      return "AWARE";
    case "SCREENING_UNAVAILABLE":
      // A collection gap is worth knowing about and asserts nothing.
      return "INFORMATIONAL";
    default:
      return null;
  }
}

function summaryFor(record: SanctionsScreeningRecord, state: SanctionsMatchState): string {
  if (state === "SCREENING_UNAVAILABLE") return "Sanctions screening could not complete";
  if (state === "CONFIRMED_MATCH") return "Officer confirmed a sanctions list match";
  const count = record.candidates.length;
  return `${count} sanctions ${count === 1 ? "candidate" : "candidates"} returned for review`;
}

function reasonFor(record: SanctionsScreeningRecord, state: SanctionsMatchState): string {
  if (state === "SCREENING_UNAVAILABLE") {
    return record.errorMessage
      ? `Provider did not answer: ${record.errorMessage}`
      : "Provider did not answer. No conclusion may be drawn.";
  }
  if (state === "CONFIRMED_MATCH") {
    const confirmed = record.decisions.find((d) => d.decision === "CONFIRMED");
    return confirmed
      ? `Confirmed by an officer · ${confirmed.reason}`
      : "Confirmed by an officer.";
  }
  const top = record.candidates[0];
  const score = record.topScore === null ? "no score reported" : `score ${record.topScore.toFixed(2)}`;
  return top
    ? `Candidate "${top.caption}" (${score}) resembles this subject. Officer review required.`
    : "A candidate was returned. Officer review required.";
}

function statusFor(record: SanctionsScreeningRecord): IntelligenceFinding["status"] {
  if (record.decisions.length === 0) return "OPEN";
  return "REVIEWED";
}

/**
 * Project the screenings of one or many subjects into findings.
 *
 * Only the newest screening per subject becomes a finding — earlier ones
 * remain in the append-only history and are never deleted, but repeating
 * them in the attention list would count one concern many times.
 */
export function findingsFromScreenings(
  screenings: readonly SanctionsScreeningRecord[],
): readonly IntelligenceFinding[] {
  const newestBySubject = new Map<string, SanctionsScreeningRecord>();
  for (const record of screenings) {
    const key = record.subjectImo ?? record.subjectName;
    const held = newestBySubject.get(key);
    if (!held || record.screenedAt > held.screenedAt) newestBySubject.set(key, record);
  }

  const findings: IntelligenceFinding[] = [];
  for (const record of newestBySubject.values()) {
    const state = effectiveState(record);
    const priority = priorityFor(state);
    if (!priority) continue;

    findings.push({
      id: `sanctions:${record.id}`,
      subjectType: record.entityKind === "vessel" ? "vessel" : "company",
      subjectId: record.subjectImo ?? record.subjectName,
      subjectLabel: record.subjectName,
      findingType: "SANCTIONS_SCREENING",
      attentionPriority: priority,
      source: record.provider,
      sourceRecordId: record.id,
      summary: summaryFor(record, state),
      reason: reasonFor(record, state),
      evidenceRef: record.candidates[0]?.id ?? null,
      status: statusFor(record),
      statusDetail: state,
      createdAt: record.screenedAt,
      updatedAt: record.decisions[0]?.decidedAt ?? record.screenedAt,
    });
  }

  return findings;
}
