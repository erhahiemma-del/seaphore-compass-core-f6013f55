/**
 * Evidence Package Builder — assembles the single artefact the OIE reads.
 *
 * The OIE stays provider-independent: whether one connector or ten
 * responded, the shape is identical. Missing kinds are reported so the OIE
 * can escalate to "Insufficient Evidence" rather than infer.
 */
import type {
  AcquisitionQuery,
  ConnectorResult,
  EvidenceConflict,
  EvidenceFieldValue,
  EvidencePackage,
  EvidenceSummary,
  NormalizedEvidence,
  SourceAttribution,
  ValidationIssue,
} from "./types";
import { resolveEntities } from "./entity-resolver";
import { validateRecords } from "./validator";

const GRADE_RANK: Record<NormalizedEvidence["grade"], number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};

export interface PackageBuilderInput {
  readonly query: AcquisitionQuery;
  readonly results: ReadonlyArray<ConnectorResult>;
  readonly cacheHits: number;
}

export function buildEvidencePackage(input: PackageBuilderInput): EvidencePackage {
  const records: NormalizedEvidence[] = [];
  const sources: SourceAttribution[] = [];

  for (const r of input.results) {
    if (r.ok && r.records.length > 0) {
      records.push(...r.records);
      const grade = pickHighestGrade(r.records);
      sources.push({
        connectorId: r.connectorId,
        sourceName: r.records[0]?.sourceName ?? String(r.connectorId),
        records: r.records.length,
        grade,
        latencyMs: r.latencyMs,
      });
    }
  }

  const validation = validateRecords(records);
  const dupeIds = new Set(
    validation.issues.filter((i) => i.code === "duplicate").map((i) => i.evidenceId),
  );
  const deduped = records.filter((r) => !dupeIds.has(r.id));

  const entities = resolveEntities(deduped);
  const conflicts = detectConflicts(deduped);

  const sorted = [...deduped].sort((a, b) => {
    const g = GRADE_RANK[b.grade] - GRADE_RANK[a.grade];
    if (g !== 0) return g;
    return a.freshnessSeconds - b.freshnessSeconds;
  });

  const requestedKinds = input.query.kinds ?? [];
  const returnedKinds = new Set(sorted.map((r) => r.kind));
  const missing = requestedKinds.filter((k) => !returnedKinds.has(k));

  const summary: EvidenceSummary = {
    totalRecords: sorted.length,
    verifiedCount: sorted.filter((r) => r.grade === "VERIFIED").length,
    corroboratedCount: sorted.filter((r) => r.grade === "CORROBORATED").length,
    conflictCount: conflicts.length,
    sourcesQueried: input.results.length,
    sourcesResponded: input.results.filter((r) => r.ok).length,
    cacheHits: input.cacheHits,
    averageFreshnessSeconds: sorted.length
      ? Math.round(sorted.reduce((s, r) => s + r.freshnessSeconds, 0) / sorted.length)
      : 0,
  };

  return {
    id: `pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    query: input.query,
    verified: sorted,
    conflicting: conflicts,
    missing,
    issues: validation.issues,
    sources,
    canonicalEntities: entities.canonical,
    summary,
  };
}

function pickHighestGrade(
  records: ReadonlyArray<NormalizedEvidence>,
): NormalizedEvidence["grade"] {
  let best: NormalizedEvidence["grade"] = "UNKNOWN";
  for (const r of records) {
    if (GRADE_RANK[r.grade] > GRADE_RANK[best]) best = r.grade;
  }
  return best;
}

function detectConflicts(records: ReadonlyArray<NormalizedEvidence>): EvidenceConflict[] {
  const perEntityField = new Map<
    string,
    { value: EvidenceFieldValue; evidenceId: string; source: NormalizedEvidence["source"]; grade: NormalizedEvidence["grade"] }[]
  >();
  for (const r of records) {
    for (const [field, value] of Object.entries(r.fields)) {
      if (value == null) continue;
      const key = `${r.entity.id}|${field}`;
      if (!perEntityField.has(key)) perEntityField.set(key, []);
      perEntityField.get(key)!.push({
        value,
        evidenceId: r.id,
        source: r.source,
        grade: r.grade,
      });
    }
  }
  const conflicts: EvidenceConflict[] = [];
  for (const [key, values] of perEntityField) {
    const uniqueValues = new Set(values.map((v) => JSON.stringify(v.value)));
    if (uniqueValues.size <= 1) continue;
    const [entityId, field] = key.split("|");
    const kindGuess = entityId.split(":")[0] as NormalizedEvidence["entity"]["kind"];
    conflicts.push({
      entity: { id: entityId, kind: kindGuess },
      field,
      values,
    });
  }
  return conflicts;
}

// Re-exports for external consumers that want the raw helpers.
export type { ValidationIssue };
