/**
 * Canonical sanctions screening states (client-safe, no provider code).
 *
 * A provider match score is EVIDENCE OF SIMILARITY, never proof of a
 * sanction. Only an officer decision produces `CONFIRMED_MATCH`; the
 * system may never derive it from a score. Equally, a provider that could
 * not answer produces `SCREENING_UNAVAILABLE` — never `NO_MATCH`, because
 * silence is not a clearance.
 */

export type SanctionsMatchState =
  | "NOT_SCREENED"
  | "NO_MATCH"
  | "POSSIBLE_MATCH"
  | "REVIEW_REQUIRED"
  | "CONFIRMED_MATCH"
  | "SCREENING_UNAVAILABLE";

export const SANCTIONS_MATCH_LABEL: Record<SanctionsMatchState, string> = {
  NOT_SCREENED: "Not screened",
  NO_MATCH: "No match",
  POSSIBLE_MATCH: "Possible match",
  REVIEW_REQUIRED: "Review required",
  CONFIRMED_MATCH: "Confirmed match",
  SCREENING_UNAVAILABLE: "Screening unavailable",
};

/**
 * What an officer must be told alongside the state. `NO_MATCH` is the one
 * that is routinely misread, so it carries its own caveat everywhere.
 */
export const SANCTIONS_STATE_CAVEAT: Record<SanctionsMatchState, string> = {
  NOT_SCREENED: "This subject has not been screened. Nothing has been checked.",
  NO_MATCH:
    "No candidate above threshold in the screened lists. This is not proof of compliance and does not clear the subject.",
  POSSIBLE_MATCH: "One or more candidates resemble this subject. An officer must review them.",
  REVIEW_REQUIRED: "A close candidate was returned. Officer review is required before any action.",
  CONFIRMED_MATCH: "An officer confirmed this match. The decision is recorded against their name.",
  SCREENING_UNAVAILABLE:
    "The provider could not answer. No conclusion may be drawn — this is a collection gap, not a clear result.",
};

/** Why a screening could not complete. Never collapsed into NO_MATCH. */
export type SanctionsFailureReason =
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "NO_RECORD";

export const SANCTIONS_FAILURE_LABEL: Record<SanctionsFailureReason, string> = {
  AUTHENTICATION_FAILED: "Provider credential rejected",
  RATE_LIMITED: "Provider rate limit reached",
  PROVIDER_ERROR: "Provider error",
  NO_RECORD: "Subject could not be described well enough to screen",
};

/** Score thresholds. Deliberately conservative and provider-agnostic. */
export const POSSIBLE_MATCH_THRESHOLD = 0.6;
export const REVIEW_REQUIRED_THRESHOLD = 0.85;

/**
 * Derive a screening state from the highest candidate score.
 * `CONFIRMED_MATCH` and `SCREENING_UNAVAILABLE` are intentionally
 * unreachable here: one is a human decision, the other a transport fact.
 */
export function deriveMatchState(
  topScore: number | null,
): Extract<SanctionsMatchState, "NO_MATCH" | "POSSIBLE_MATCH" | "REVIEW_REQUIRED"> {
  if (topScore === null || topScore < POSSIBLE_MATCH_THRESHOLD) return "NO_MATCH";
  if (topScore >= REVIEW_REQUIRED_THRESHOLD) return "REVIEW_REQUIRED";
  return "POSSIBLE_MATCH";
}

/** One ranked candidate returned by the screening provider. */
export interface SanctionsCandidate {
  readonly id: string;
  readonly caption: string;
  readonly schema: string;
  readonly score: number;
  /** Which properties drove the score, as reported by the provider. */
  readonly matchBasis: ReadonlyArray<string>;
  readonly datasets: ReadonlyArray<string>;
  readonly topics: ReadonlyArray<string>;
  readonly programs: ReadonlyArray<string>;
  readonly countries: ReadonlyArray<string>;
  readonly identifiers: ReadonlyArray<string>;
  readonly imoNumber: string | null;
}

/** How the subject reached screening. Roles stay distinct, never merged. */
export type SanctionsSubjectRole = "vessel" | "owner" | "operator" | "manager" | "agent";

/** Normalized screening record — the only shape officer surfaces consume. */
export interface SanctionsScreeningRecord {
  readonly id: string;
  readonly subjectName: string;
  readonly subjectImo: string | null;
  readonly entityKind: string;
  readonly entityRole: SanctionsSubjectRole | null;
  readonly state: SanctionsMatchState;
  readonly failureReason: SanctionsFailureReason | null;
  readonly errorMessage: string | null;
  readonly topScore: number | null;
  readonly candidates: ReadonlyArray<SanctionsCandidate>;
  readonly provider: string;
  readonly dataset: string;
  readonly scope: string;
  readonly screenedAt: string;
  readonly decisions: ReadonlyArray<SanctionsMatchDecision>;
}

export interface SanctionsMatchDecision {
  readonly id: string;
  readonly screeningId: string;
  readonly candidateId: string;
  readonly candidateCaption: string | null;
  readonly decision: "CONFIRMED" | "DISMISSED";
  readonly reason: string;
  readonly note: string | null;
  readonly evidenceRef: string | null;
  readonly officerId: string;
  readonly decidedAt: string;
}

/**
 * The state an officer should see for a screening, after their own
 * decisions are applied. A confirmation raises the state; a dismissal
 * does NOT lower it to `NO_MATCH` — the candidate was still returned, and
 * rewriting history to say otherwise would erase the evidence.
 */
export function effectiveState(record: SanctionsScreeningRecord): SanctionsMatchState {
  if (record.decisions.some((d) => d.decision === "CONFIRMED")) return "CONFIRMED_MATCH";
  return record.state;
}

/** Reasons an officer may give for dismissing a candidate. */
export const DISMISSAL_REASONS: ReadonlyArray<string> = [
  "Different vessel — identifiers do not match",
  "Different entity — name coincidence only",
  "Listing no longer in force",
  "Out of scope for this assessment",
  "Superseded by a verified identity record",
];
