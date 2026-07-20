/**
 * Sprint 8 · Confidence propagation (Layer 2.11 / 2.3).
 *
 * Confidence degrades as reasoning moves further from raw evidence:
 *   Evidence 95%  →  Relationship 90%  →  Pattern 84%
 *                  →  Assessment 79%   →  Recommendation 73%
 *
 * The engine anchors the ladder to the average confidence of the top-K
 * evidence items and applies fixed step ratios that MATCH the spec ladder
 * when the anchor is 0.95. Every stage is clamped to [0, 1] and rounded
 * to 3 decimals for stable comparisons.
 */
import type { ConfidenceBand, ConfidencePropagation } from "./types";
import type { ScoredEvidence } from "@/services/fusion";

/** Spec ladder anchor values — used to derive the step ratios below. */
export const SPEC_LADDER = Object.freeze({
  evidence: 0.95,
  relationship: 0.9,
  pattern: 0.84,
  assessment: 0.79,
  recommendation: 0.73,
});

/** Step ratios preserve the spec cascade when anchored at 0.95. */
export const STEP_RATIO = Object.freeze({
  evidenceToRelationship: SPEC_LADDER.relationship / SPEC_LADDER.evidence, // ~0.947
  relationshipToPattern: SPEC_LADDER.pattern / SPEC_LADDER.relationship, // ~0.933
  patternToAssessment: SPEC_LADDER.assessment / SPEC_LADDER.pattern, // ~0.940
  assessmentToRecommendation: SPEC_LADDER.recommendation / SPEC_LADDER.assessment, // ~0.924
});

const round3 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

/** Anchor = mean confidence of top-K evidence (default 5). */
export function anchorFromEvidence(items: readonly ScoredEvidence[], k = 5): number {
  if (items.length === 0) return 0;
  const top = items.slice(0, k);
  const sum = top.reduce((acc, it) => acc + it.confidence, 0);
  return sum / top.length;
}

export function propagate(anchor: number): ConfidencePropagation {
  const evidence = round3(anchor);
  const relationship = round3(evidence * STEP_RATIO.evidenceToRelationship);
  const pattern = round3(relationship * STEP_RATIO.relationshipToPattern);
  const assessment = round3(pattern * STEP_RATIO.patternToAssessment);
  const recommendation = round3(assessment * STEP_RATIO.assessmentToRecommendation);
  return { evidence, relationship, pattern, assessment, recommendation };
}

export function bandOf(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  if (confidence >= 0.25) return "low";
  return "insufficient";
}

export function requiresCounterHypothesis(band: ConfidenceBand): boolean {
  return band === "high" || band === "medium";
}
