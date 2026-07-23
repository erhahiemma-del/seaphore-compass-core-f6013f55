/**
 * ICE-11 · Evidence Scoring Engine. Combines five components into one
 * score per cell, then applies a conflict penalty to minority cells.
 *
 *   evidence_score = 0.30·trust + 0.20·freshness + 0.25·corroboration
 *                  + 0.15·completeness + 0.10·quality − penalty
 *
 * Minority cells lose 15 points. Score is clamped to [0, 100].
 */

import type { MatrixCell } from "./types";

const W = { trust: 0.30, freshness: 0.20, corroboration: 0.25, completeness: 0.15, quality: 0.10 };
const CONFLICT_PENALTY = 15;

export interface ScoreBreakdown {
  readonly trust: number;
  readonly freshness: number;
  readonly corroboration: number;
  readonly completeness: number;
  readonly quality: number;
  readonly penalty: number;
  readonly total: number;
}

export function scoreEvidence(cells: MatrixCell[]): Map<string, ScoreBreakdown> {
  const map = new Map<string, ScoreBreakdown>();
  for (const c of cells) {
    const trust         = c.trustScore         * W.trust;
    const freshness     = c.freshnessScore     * W.freshness;
    const corroboration = c.corroborationScore * W.corroboration;
    const completeness  = c.completenessScore  * W.completeness;
    const quality       = c.qualityScore       * W.quality;
    const penalty       = c.cellStatus === "CONFLICT_MINORITY" ? CONFLICT_PENALTY : 0;
    const total = clamp0to100(trust + freshness + corroboration + completeness + quality - penalty);
    c.conflictPenalty = penalty;
    c.evidenceScore   = Number(total.toFixed(2));
    map.set(cellKey(c), {
      trust: round(trust), freshness: round(freshness), corroboration: round(corroboration),
      completeness: round(completeness), quality: round(quality),
      penalty, total: Number(total.toFixed(2)),
    });
  }
  return map;
}

export function cellKey(c: MatrixCell): string {
  return `${c.canonicalId}::${c.fieldName}::${c.sourceId}`;
}

function clamp0to100(n: number): number { return Math.max(0, Math.min(100, n)); }
function round(n: number): number { return Number(n.toFixed(2)); }
