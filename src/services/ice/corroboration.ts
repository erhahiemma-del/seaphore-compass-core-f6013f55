/**
 * ICE-7 · Corroboration Engine. Finds every field where multiple sources
 * agree, scores the strength of that agreement, and writes back to the
 * matrix so ICE-11 can reward corroborated cells. Runs AFTER conflict
 * detection so agreement is computed relative to the majority bucket.
 */

import type { CorroborationLevel, CorroborationRow, MatrixCell } from "./types";
import { groupByField } from "./correlation";
import { valuesEqual } from "./conflict";

export function detectCorroborations(cells: MatrixCell[]): CorroborationRow[] {
  const out: CorroborationRow[] = [];
  for (const group of groupByField(cells).values()) {
    if (group.length < 2) continue;

    // Find the value with the most support.
    const buckets: { value: unknown; cells: MatrixCell[] }[] = [];
    for (const c of group) {
      const match = buckets.find((b) => valuesEqual(b.value, c.normalizedValue));
      if (match) match.cells.push(c);
      else buckets.push({ value: c.normalizedValue, cells: [c] });
    }
    const winner = buckets.sort((a, b) => b.cells.length - a.cells.length)[0];
    if (winner.cells.length < 2) continue;

    const level: CorroborationLevel = winner.cells.length >= 4
      ? "VERIFIED" : winner.cells.length === 3
      ? "STRONG" : "PARTIAL";

    const weightedConfidence = Number(
      (winner.cells.reduce((s, c) => s + c.trustScore, 0) / winner.cells.length).toFixed(2),
    );

    out.push({
      canonicalId: winner.cells[0].canonicalId,
      fieldName:   winner.cells[0].fieldName,
      agreedValue: winner.value,
      agreeingSources: winner.cells.map((c) => c.sourceId),
      agreementCount: winner.cells.length,
      weightedConfidence,
      level,
    });

    // Corroboration_score = min(100, (agreeing - 1) × 25) — spec ICE-7.
    const corrScore = Math.min(100, (winner.cells.length - 1) * 25);
    const majorityAll = winner.cells.length === group.length;
    for (const c of winner.cells) {
      c.corroborationScore = corrScore;
      // Only promote to CORROBORATED / VERIFIED when there is no conflict
      // remaining (matrix cell is not already flagged CONFLICT_*).
      if (c.cellStatus === "CONFLICT_MAJORITY" || c.cellStatus === "CONFLICT_MINORITY") continue;
      c.cellStatus = majorityAll ? "VERIFIED" : "CORROBORATED";
    }
  }
  return out;
}
