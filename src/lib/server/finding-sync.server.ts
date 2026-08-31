/**
 * Persisting findings from records the provider domains already hold.
 *
 * This is a translation pass, not an engine. It screens nobody, calls no
 * provider, and derives no state: it reads persisted sanctions screenings
 * and writes one finding per screening that a domain already decided was
 * worth an officer's attention. A screening that returned nothing above
 * threshold is deliberately not a finding — projecting `NO_MATCH` into
 * the queue would read as a clearance.
 *
 * Every finding carries the screening's own id as `sourceRecordId`, which
 * is what makes re-running this safe: an officer's ruling is never
 * reopened because a sync pass ran again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { effectiveState, type SanctionsScreeningRecord } from "@/lib/sanctions/match-state";
import type { FindingSeverity } from "@/services/findings/record";

import { loadRecentScreenings } from "./sanctions-store.server";
import { upsertFindings, type UpsertFindingInput } from "./finding-records.server";

type Db = SupabaseClient<never, never, never>;

/**
 * Severity from the screening state the domain already committed to.
 *
 * A confirmed match is critical because an officer put their name to it.
 * A provider that could not answer is `ATTENTION`: it is a collection
 * gap that someone must close, and it asserts nothing about the subject.
 */
function severityFor(state: string): FindingSeverity | null {
  switch (state) {
    case "CONFIRMED_MATCH":
      return "CRITICAL";
    case "REVIEW_REQUIRED":
      return "WARNING";
    case "POSSIBLE_MATCH":
      return "ATTENTION";
    case "SCREENING_UNAVAILABLE":
      return "ATTENTION";
    default:
      return null;
  }
}

function whyAttentionFor(record: SanctionsScreeningRecord, state: string): string {
  if (state === "SCREENING_UNAVAILABLE") {
    return record.errorMessage
      ? `The screening provider did not answer (${record.errorMessage}). This is a collection gap, not a clear result.`
      : "The screening provider did not answer. No conclusion may be drawn.";
  }
  if (state === "CONFIRMED_MATCH") {
    return "An officer confirmed a list candidate against this subject. Their decision is on the record.";
  }
  const top = record.candidates[0];
  const score = record.topScore === null ? "no score reported" : record.topScore.toFixed(2);
  return top
    ? `A sanctions list candidate ("${top.caption}", similarity ${score}) resembles this subject. Similarity is evidence, not proof — an officer must rule on it.`
    : "A sanctions list candidate was returned for this subject and no officer has ruled on it.";
}

function descriptionFor(record: SanctionsScreeningRecord, state: string): string {
  if (state === "SCREENING_UNAVAILABLE") return "Sanctions screening could not complete.";
  const count = record.candidates.length;
  return `${count} sanctions ${count === 1 ? "candidate" : "candidates"} returned by ${record.provider} for ${record.subjectName}.`;
}

export function findingInputsFromScreenings(
  screenings: readonly SanctionsScreeningRecord[],
): readonly UpsertFindingInput[] {
  const inputs: UpsertFindingInput[] = [];
  for (const record of screenings) {
    const state = effectiveState(record);
    const severity = severityFor(state);
    if (!severity) continue;

    inputs.push({
      findingType: "SANCTIONS_SCREENING",
      severity,
      subjectType: record.entityKind === "vessel" ? "vessel" : "company",
      subjectId: record.subjectImo ?? record.subjectName,
      subjectName: record.subjectName,
      description: descriptionFor(record, state),
      whyAttention: whyAttentionFor(record, state),
      detectedAt: record.screenedAt,
      source: record.provider,
      sourceRecordId: record.id,
      confidence: state === "SCREENING_UNAVAILABLE" ? "UNCONFIRMED" : "OBSERVED",
      dataState: state === "SCREENING_UNAVAILABLE" ? "UNAVAILABLE" : "LIVE",
      evidenceRefs: record.candidates.slice(0, 5).map((candidate) => ({
        ref: candidate.id,
        label: `${candidate.caption} · similarity ${candidate.score.toFixed(2)}`,
        source: record.provider,
        observedAt: record.screenedAt,
        confidence: candidate.score >= 0.85 ? "CLOSE_CANDIDATE" : "CANDIDATE",
        dataState: "LIVE",
      })),
      related: record.subjectImo ? { vesselImos: [record.subjectImo] } : {},
      position: null,
    });
  }
  return inputs;
}

/** Persist findings for everything the screening domain has on file. */
export async function syncFindingsFromScreenings(
  db: Db,
  officerId: string,
): Promise<{ readonly created: number; readonly existing: number }> {
  const screenings = await loadRecentScreenings(db, 200);
  return upsertFindings(db, officerId, findingInputsFromScreenings(screenings));
}
