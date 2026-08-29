/**
 * The subtle vessel intelligence indicator.
 *
 * Four words, and only four, because each is defensible:
 *
 *   NOT SCREENED     nobody checked
 *   REVIEW REQUIRED  a provider returned a candidate; no one has ruled
 *   MATCH CONFIRMED  an officer confirmed, and is named in the record
 *   DISMISSED        an officer ruled the candidate out, with a reason
 *
 * "SANCTIONED" is not one of them and must never be. A provider candidate
 * is evidence of similarity; only an officer decision resolves it, and
 * even a confirmed match is stated as a decision rather than as a fact
 * about the hull.
 *
 * `SCREENING UNAVAILABLE` is carried too, because a provider that could
 * not answer is a collection gap and not a clear result.
 */
import { effectiveState, type SanctionsScreeningRecord } from "./match-state";

export type SanctionsIndicatorState =
  | "NOT_SCREENED"
  | "REVIEW_REQUIRED"
  | "MATCH_CONFIRMED"
  | "DISMISSED"
  | "NO_MATCH"
  | "SCREENING_UNAVAILABLE";

export const SANCTIONS_INDICATOR_LABEL: Record<SanctionsIndicatorState, string> = {
  NOT_SCREENED: "Not screened",
  REVIEW_REQUIRED: "Review required",
  MATCH_CONFIRMED: "Match confirmed",
  DISMISSED: "Dismissed",
  NO_MATCH: "No match",
  SCREENING_UNAVAILABLE: "Screening unavailable",
};

export const SANCTIONS_INDICATOR_CAVEAT: Record<SanctionsIndicatorState, string> = {
  NOT_SCREENED: "This vessel has not been screened against sanctions lists.",
  REVIEW_REQUIRED: "A candidate was returned. No officer has ruled on it yet.",
  MATCH_CONFIRMED: "An officer confirmed this match. Their decision is on the record.",
  DISMISSED: "An officer ruled the candidate out. The provider record is retained.",
  NO_MATCH: "No candidate above threshold. This is not proof of compliance.",
  SCREENING_UNAVAILABLE: "The provider could not answer. No conclusion may be drawn.",
};

/**
 * The indicator for the newest screening of a subject.
 *
 * A dismissal is reported as `DISMISSED` rather than as `NO_MATCH`: the
 * candidate was returned and an officer ruled on it, and saying "no
 * match" would delete that history from the officer's view.
 */
export function indicatorFor(
  screenings: readonly SanctionsScreeningRecord[],
): SanctionsIndicatorState {
  const latest = screenings[0];
  if (!latest) return "NOT_SCREENED";

  const state = effectiveState(latest);
  if (state === "CONFIRMED_MATCH") return "MATCH_CONFIRMED";
  if (state === "SCREENING_UNAVAILABLE") return "SCREENING_UNAVAILABLE";
  if (state === "NO_MATCH") return "NO_MATCH";

  const dismissedAll =
    latest.candidates.length > 0 &&
    latest.candidates.every((candidate) =>
      latest.decisions.some(
        (decision) => decision.candidateId === candidate.id && decision.decision === "DISMISSED",
      ),
    );
  if (dismissedAll) return "DISMISSED";

  return "REVIEW_REQUIRED";
}

/** Whether the indicator represents work an officer still owns. */
export function indicatorNeedsOfficer(state: SanctionsIndicatorState): boolean {
  return state === "REVIEW_REQUIRED" || state === "MATCH_CONFIRMED";
}
