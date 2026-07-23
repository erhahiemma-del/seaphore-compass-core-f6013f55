/**
 * ICE-14 · Recommendation Engine. Reads the full intelligence picture
 * and emits ranked operational actions. Rules are hardcoded and
 * auditable — the OIE may reword these, but the underlying trigger is
 * traceable back to a specific matrix state.
 *
 *   P1 → critical conflict (identity, sanctions)
 *   P2 → high-value conflict (cargo >5 %, ownership)
 *   P3 → low confidence on a required field
 *   P4 → clean voyage / all critical fields VERIFIED
 *   INFO → SINGLE_SOURCE evidence on any field
 */

import type { ConflictRow, FusedField, Priority, Recommendation } from "./types";
import { CRITICAL_FIELDS } from "./field-config";

export function generateRecommendations(
  fused: ReadonlyArray<FusedField>,
  conflicts: ReadonlyArray<ConflictRow>,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const c of conflicts) {
    if (c.severity === "CRITICAL") {
      out.push(rec("P1",
        `Escalate ${c.fieldName} conflict for ${c.canonicalId} — sources disagree on a critical identifier.`,
        "critical_field_conflict",
        { field: c.fieldName, majority: c.majoritySources, minority: c.minoritySources }));
    } else if (c.severity === "HIGH") {
      out.push(rec("P2",
        `Investigate ${c.fieldName} conflict for ${c.canonicalId} before acting on downstream evidence.`,
        "high_severity_conflict",
        { field: c.fieldName, majority: c.majorityValue, minority: c.minorityValue }));
    } else if (c.severity === "MEDIUM") {
      out.push(rec("P3",
        `Review ${c.fieldName} disagreement for ${c.canonicalId}.`,
        "medium_severity_conflict",
        { field: c.fieldName }));
    }
  }

  for (const f of fused) {
    if (f.cellStatus === "SINGLE_SOURCE") {
      out.push(rec("INFO",
        `${f.fieldName} for ${f.canonicalId} is single-sourced (${f.winningSource ?? "unknown"}). Corroborate before relying.`,
        "single_source",
        { field: f.fieldName, source: f.winningSource }));
    }
    if (f.confidence < 0.5 && !f.hasConflict) {
      out.push(rec("P3",
        `Confidence on ${f.fieldName} for ${f.canonicalId} is ${Math.round(f.confidence * 100)}%. Refresh evidence.`,
        "low_confidence",
        { field: f.fieldName, confidence: f.confidence }));
    }
  }

  const criticalAllVerified =
    CRITICAL_FIELDS.every((k) => fused.some((f) => f.fieldName === k && f.cellStatus === "VERIFIED"));
  if (criticalAllVerified && conflicts.length === 0) {
    out.push(rec("P4",
      "All critical fields are VERIFIED across multiple sources. Voyage appears clean.",
      "clean_voyage", {}));
  }

  return out.sort((a, b) => rank(a.priority) - rank(b.priority));
}

function rec(priority: Priority, recommendation: string, trigger: string,
             detail: Record<string, unknown>): Recommendation {
  return { priority, recommendation, triggerCondition: trigger, triggerDetail: detail };
}
function rank(p: Priority): number { return { P1: 0, P2: 1, P3: 2, P4: 3, INFO: 4 }[p]; }
