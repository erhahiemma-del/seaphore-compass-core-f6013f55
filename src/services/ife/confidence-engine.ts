/**
 * Composite confidence + human-readable explanation for the whole
 * fused package.
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type { Contradiction, FusedEntityRecord, FusionConfidence } from "./types";

const CONF_RANK: Record<FusionConfidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const RANK_TO_CONF: FusionConfidence[] = ["LOW", "LOW", "MEDIUM", "HIGH"];
const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};
const RANK_TO_GRADE: EvidenceGrade[] = [
  "UNKNOWN",
  "INFERRED",
  "REPORTED",
  "OBSERVED",
  "CORROBORATED",
  "VERIFIED",
];

export function packageConfidence(
  records: ReadonlyArray<FusedEntityRecord>,
  contradictions: ReadonlyArray<Contradiction>,
): { confidence: FusionConfidence; grade: EvidenceGrade; explanation: string } {
  if (records.length === 0) {
    return {
      confidence: "LOW",
      grade: "UNKNOWN",
      explanation: "No canonical entities could be resolved from the acquired evidence.",
    };
  }

  const minConf = records.reduce((m, r) => Math.min(m, CONF_RANK[r.confidence]), 3);
  const minGrade = records.reduce((m, r) => Math.min(m, GRADE_RANK[r.grade]), 5);
  let confidence = RANK_TO_CONF[minConf] ?? "LOW";

  // Contradictions drag the composite down.
  const critical = contradictions.filter((c) => c.severity === "critical").length;
  if (critical > 0 && confidence === "HIGH") confidence = "MEDIUM";
  if (critical >= 2 && confidence === "MEDIUM") confidence = "LOW";

  const grade = RANK_TO_GRADE[minGrade] ?? "UNKNOWN";
  const explanation = [
    `${records.length} canonical entit${records.length === 1 ? "y" : "ies"}`,
    `${contradictions.length} contradiction(s) surfaced`,
    critical > 0 ? `${critical} critical` : null,
    `composite ${confidence}/${grade}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return { confidence, grade, explanation };
}
