/**
 * Canonical entity record builder.
 *
 * Consumes an entity's grouped-by-field records and produces:
 *   - one `FusedEntityRecord` (the canonical view the OIE consumes)
 *   - a list of `Contradiction`s for every field that disagreed
 *
 * The OIE never receives duplicates — for each field there is exactly one
 * accepted value plus a timeline of what came before / was superseded.
 */
import type { CanonicalEntityRef, EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import { detectDisagreements } from "./conflict-detector";
import { fuseField, toCandidate } from "./fusion-rules";
import { buildFieldTimeline } from "./timeline";
import type { Contradiction, FusedEntityRecord, FusedFieldValue, FusionConfidence } from "./types";

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
const CONF_RANK: Record<FusionConfidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const RANK_TO_CONF: FusionConfidence[] = ["LOW", "LOW", "MEDIUM", "HIGH"];

export interface EntityFusionResult {
  readonly record: FusedEntityRecord;
  readonly contradictions: ReadonlyArray<Contradiction>;
}

export function buildCanonicalRecord(
  entity: CanonicalEntityRef,
  byField: Map<string, NormalizedEvidence[]>,
): EntityFusionResult {
  const fields: FusedFieldValue[] = [];
  const contradictions: Contradiction[] = [];
  const disagreements = new Map(detectDisagreements(byField).map((d) => [d.field, d]));

  for (const [field, records] of byField.entries()) {
    const disagreement = disagreements.get(field);
    let outcome;
    if (disagreement) {
      outcome = fuseField(disagreement);
    } else {
      outcome = fuseField([toCandidate(records[0].fields[field] ?? null, records)]);
    }

    const timeline = buildFieldTimeline(field, outcome.winner, outcome.losers);
    fields.push({
      field,
      value: outcome.winner.value,
      confidence: outcome.confidence,
      grade: outcome.grade,
      supportingEvidenceIds: outcome.winner.records.map((r) => r.id),
      supportingSources: outcome.winner.sources,
      dissentingSources: dedupe(outcome.losers.flatMap((l) => l.sources)),
      explanation: outcome.explanation,
      timeline,
    });

    if (outcome.losers.length > 0) {
      contradictions.push({
        entity,
        field,
        severity: contradictionSeverity(outcome.losers.length + 1, outcome.confidence),
        values: [
          ...outcome.winner.records.map((r) => ({
            value: outcome.winner.value,
            source: r.source,
            grade: r.grade,
            evidenceId: r.id,
            observedAt: r.observedAt,
            accepted: true,
          })),
          ...outcome.losers.flatMap((l) =>
            l.records.map((r) => ({
              value: l.value,
              source: r.source,
              grade: r.grade,
              evidenceId: r.id,
              observedAt: r.observedAt,
              accepted: false,
            })),
          ),
        ],
        resolution:
          outcome.resolution === "sole-source" || outcome.resolution === "unanimous"
            ? "unresolved"
            : outcome.resolution,
        explanation: outcome.explanation,
      });
    }
  }

  const recordConfidence = compositeConfidence(fields);
  const recordGrade = compositeGrade(fields);
  const sources = dedupe(fields.flatMap((f) => f.supportingSources));

  const record: FusedEntityRecord = {
    entity,
    fields,
    confidence: recordConfidence,
    grade: recordGrade,
    sources,
    explanation: buildRecordExplanation(fields, contradictions.length),
  };
  return { record, contradictions };
}

function contradictionSeverity(
  valueCount: number,
  confidence: FusionConfidence,
): Contradiction["severity"] {
  if (confidence === "LOW") return "critical";
  if (valueCount >= 3) return "critical";
  if (confidence === "MEDIUM") return "warn";
  return "info";
}

function compositeConfidence(fields: ReadonlyArray<FusedFieldValue>): FusionConfidence {
  if (fields.length === 0) return "LOW";
  const min = fields.reduce((m, f) => Math.min(m, CONF_RANK[f.confidence]), 3);
  return RANK_TO_CONF[min] ?? "LOW";
}

function compositeGrade(fields: ReadonlyArray<FusedFieldValue>): EvidenceGrade {
  if (fields.length === 0) return "UNKNOWN";
  const min = fields.reduce((m, f) => Math.min(m, GRADE_RANK[f.grade]), 5);
  return RANK_TO_GRADE[min] ?? "UNKNOWN";
}

function buildRecordExplanation(
  fields: ReadonlyArray<FusedFieldValue>,
  contradictionCount: number,
): string {
  const highCount = fields.filter((f) => f.confidence === "HIGH").length;
  const lowCount = fields.filter((f) => f.confidence === "LOW").length;
  const parts = [`${fields.length} fused field(s)`, `${highCount} HIGH / ${lowCount} LOW`];
  if (contradictionCount > 0) parts.push(`${contradictionCount} contradiction(s) preserved`);
  return parts.join(" · ");
}

function dedupe<T>(arr: ReadonlyArray<T>): T[] {
  return Array.from(new Set(arr));
}
