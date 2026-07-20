/**
 * Sprint 7 · Layer 5 — Ranking.
 *
 * Order: confidence DESC → grade weight DESC → recency DESC → source authority
 * DESC → id ASC (stable tiebreak). Items in conflict are NOT deprioritised —
 * the Reasoning Engine decides how to present them.
 */
import type { ScoredEvidence } from "./types";

export function rank(items: readonly ScoredEvidence[]): readonly ScoredEvidence[] {
  const sorted = [...items].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.gradeWeight !== a.gradeWeight) return b.gradeWeight - a.gradeWeight;
    if (b.recency !== a.recency) return b.recency - a.recency;
    if (b.authority !== a.authority) return b.authority - a.authority;
    return a.id.localeCompare(b.id);
  });
  return Object.freeze(sorted);
}
