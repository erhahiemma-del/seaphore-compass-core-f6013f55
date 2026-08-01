/**
 * INT-01B — Entity Resolution Engine · Types
 *
 * The Entity Resolution Engine sits above the IFE's resolveIdentities()
 * (which handles IMO/MMSI at the evidence level) and adds cross-entity
 * deduplication at the Intelligence Object level using:
 *   • Container numbers (ISO 6346)
 *   • Bill of lading references
 *   • Company registration numbers (CAC / LEI)
 *   • Name similarity (normalised token set ratio)
 *
 * Every merge is evidence-backed, scored, and logged. No silent merges.
 */

export type ResolutionMethod =
  | "imo-match"
  | "mmsi-match"
  | "container-number-match"
  | "bill-of-lading-match"
  | "company-registration-match"
  | "lei-match"
  | "name-similarity"
  | "manual";

export interface ResolutionSignal {
  readonly method: ResolutionMethod;
  readonly field: string;
  readonly valueA: string;
  readonly valueB: string;
  readonly score: number; // 0..1 — 1 = certain match
}

export interface ResolutionDecision {
  readonly canonicalId: string; // the entity that survives
  readonly mergedId: string; // the entity that was absorbed
  readonly signals: ReadonlyArray<ResolutionSignal>;
  readonly confidence: number; // 0..1 composite
  readonly method: ResolutionMethod; // primary method that triggered merge
  readonly decidedAt: string; // ISO 8601
  readonly explanation: string;
}

export interface EntityResolutionResult {
  readonly totalCandidates: number;
  readonly mergesPerformed: number;
  readonly decisions: ReadonlyArray<ResolutionDecision>;
  readonly durationMs: number;
}
