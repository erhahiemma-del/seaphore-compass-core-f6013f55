/**
 * ICE-12 · Fusion Engine. Picks the best-supported value per field
 * (highest evidence_score in the winning bucket) and produces one
 * `FusedField` row per (canonical_id × field). Never deletes matrix
 * cells — every source stays visible for officer review.
 *
 * confidence_level maps from cell_status:
 *   VERIFIED           → VERIFIED
 *   CORROBORATED       → CORROBORATED
 *   CONFLICT_MAJORITY  → INFERRED (officer review required)
 *   SINGLE_SOURCE      → OBSERVED
 *   MISSING            → OBSERVED with null value
 */

import type {
  CorroborationRow,
  FusedField,
  MatrixCell,
  ConfidenceLevel,
  CellStatus,
} from "./types";
import { CRITICAL_FIELDS } from "./field-config";
import { groupByField } from "./correlation";

export const FUSION_POLICY_VERSION = "v1.0";

export function fuseIntelligence(
  cells: MatrixCell[],
  corroborations: ReadonlyArray<CorroborationRow>,
): FusedField[] {
  const corrByKey = new Map<string, CorroborationRow>();
  for (const c of corroborations) corrByKey.set(`${c.canonicalId}::${c.fieldName}`, c);

  const out: FusedField[] = [];
  for (const group of groupByField(cells).values()) {
    // Pick the winning cell (highest evidence_score; ties broken by trust).
    const winner = [...group].sort(
      (a, b) => b.evidenceScore - a.evidenceScore || b.trustScore - a.trustScore,
    )[0];
    const key = `${winner.canonicalId}::${winner.fieldName}`;
    const corr = corrByKey.get(key);
    const hasConflict = group.some(
      (c) => c.cellStatus === "CONFLICT_MINORITY" || c.cellStatus === "CONFLICT_MAJORITY",
    );
    const status: CellStatus = winner.cellStatus;

    const { confidence, level } = confidenceFromStatus(winner, corr, hasConflict);
    const requiresReview =
      hasConflict || (CRITICAL_FIELDS.includes(winner.fieldName) && status !== "VERIFIED");

    out.push({
      canonicalId: winner.canonicalId,
      fieldName: winner.fieldName,
      fusedValue: winner.normalizedValue,
      winningSource: winner.sourceId,
      winningEvidenceScore: winner.evidenceScore,
      confidence: Number(confidence.toFixed(4)),
      confidenceLevel: level,
      cellStatus: status,
      hasConflict,
      hasMissingData: group.length < 2,
      requiresOfficerReview: requiresReview,
      explanationText: "",
      fusionPolicyVersion: FUSION_POLICY_VERSION,
    });
  }
  return out;
}

function confidenceFromStatus(
  winner: MatrixCell,
  corr: CorroborationRow | undefined,
  hasConflict: boolean,
): { confidence: number; level: ConfidenceLevel } {
  if (winner.cellStatus === "VERIFIED") {
    const conf = (corr?.weightedConfidence ?? winner.trustScore) / 100;
    return { confidence: conf, level: "VERIFIED" };
  }
  if (winner.cellStatus === "CORROBORATED") {
    const conf = (corr?.weightedConfidence ?? winner.trustScore) / 100;
    return { confidence: conf, level: "CORROBORATED" };
  }
  if (hasConflict) {
    return { confidence: (winner.evidenceScore * 0.85) / 100, level: "INFERRED" };
  }
  // SINGLE_SOURCE (or MISSING handled by caller)
  return { confidence: (winner.trustScore * 0.8) / 100, level: "OBSERVED" };
}
