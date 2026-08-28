/**
 * Canonical sanctions screening states (client-safe).
 *
 * A provider match score is EVIDENCE OF SIMILARITY, never proof of a
 * sanction. Only an officer decision produces `CONFIRMED_MATCH`; the
 * system may never derive it from a score.
 */
export type SanctionsMatchState =
  | "NOT_SCREENED"
  | "NO_MATCH"
  | "POSSIBLE_MATCH"
  | "REVIEW_REQUIRED"
  | "CONFIRMED_MATCH";

export const SANCTIONS_MATCH_LABEL: Record<SanctionsMatchState, string> = {
  NOT_SCREENED: "Not screened",
  NO_MATCH: "Clear / No match",
  POSSIBLE_MATCH: "Possible match",
  REVIEW_REQUIRED: "Review required",
  CONFIRMED_MATCH: "Confirmed match",
};

/** Score thresholds. Deliberately conservative and provider-agnostic. */
export const POSSIBLE_MATCH_THRESHOLD = 0.6;
export const REVIEW_REQUIRED_THRESHOLD = 0.85;

/**
 * Derive a screening state from the highest candidate score.
 * `CONFIRMED_MATCH` is intentionally unreachable here.
 */
export function deriveMatchState(topScore: number | null): SanctionsMatchState {
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
  readonly datasets: ReadonlyArray<string>;
  readonly topics: ReadonlyArray<string>;
  readonly countries: ReadonlyArray<string>;
  readonly imoNumber: string | null;
  readonly detailUrl: string;
}

/** Normalized screening finding — the only shape officer surfaces consume. */
export interface SanctionsScreeningFinding {
  readonly subject: string;
  readonly entityKind: string;
  readonly state: SanctionsMatchState;
  readonly topScore: number | null;
  readonly candidates: ReadonlyArray<SanctionsCandidate>;
  readonly provider: string;
  readonly dataset: string;
  readonly screenedAt: string;
  /** Present only when screening could not complete. Never a silent clear. */
  readonly error: string | null;
}
