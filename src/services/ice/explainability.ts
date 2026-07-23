/**
 * ICE-13 · Explainability Engine. Templated, deterministic prose so an
 * officer can reproduce every explanation from the database. No LLM
 * calls happen here — a fabricated explanation is a compliance failure
 * (HR-3, HR-6 in the Honesty Rules).
 */

import type {
  ConflictRow, CorroborationRow, FusedField, MatrixCell,
} from "./types";
import { SOURCE_LABEL } from "./field-config";
import { groupByField } from "./correlation";

export interface ExplainInputs {
  readonly cells: ReadonlyArray<MatrixCell>;
  readonly conflicts: ReadonlyArray<ConflictRow>;
  readonly corroborations: ReadonlyArray<CorroborationRow>;
}

export function explainAll(
  fused: FusedField[],
  inputs: ExplainInputs,
): FusedField[] {
  const groups = groupByField(inputs.cells as MatrixCell[]);
  const conflictByKey = new Map(inputs.conflicts.map((c) => [`${c.canonicalId}::${c.fieldName}`, c]));
  const corrByKey     = new Map(inputs.corroborations.map((c) => [`${c.canonicalId}::${c.fieldName}`, c]));

  return fused.map((f) => {
    const key = `${f.canonicalId}::${f.fieldName}`;
    const group = groups.get(key) ?? [];
    const conflict = conflictByKey.get(key);
    const corr = corrByKey.get(key);
    return { ...f, explanationText: explainOne(f, group, conflict, corr) };
  });
}

function explainOne(
  f: FusedField,
  group: ReadonlyArray<MatrixCell>,
  conflict: ConflictRow | undefined,
  corr: CorroborationRow | undefined,
): string {
  const conf = Math.round(f.confidence * 100);
  const pretty = (v: unknown) => v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  const label = (id: string) => SOURCE_LABEL[id] ?? id;

  if (f.hasMissingData && f.fusedValue == null) {
    return `No source in this query returned ${f.fieldName} data. Consider adding another registry connector to improve coverage.`;
  }

  if (conflict) {
    const majList = conflict.majoritySources.map(label).join(", ");
    const minList = conflict.minoritySources.map(label).join(", ");
    const minAgeDays = Math.round(Math.abs(conflict.ageDifferentialHrs) / 24);
    const loser = group.find((c) => c.cellStatus === "CONFLICT_MINORITY");
    return (
      `Sources disagree on ${f.fieldName}. ` +
      `Majority view (${conflict.majoritySources.length} source(s)): ${pretty(conflict.majorityValue)}. Sources: ${majList}. ` +
      `Minority view (${conflict.minoritySources.length} source(s)): ${pretty(conflict.minorityValue)}. Source: ${minList} ` +
      `(${minAgeDays} day(s) older than most recent majority source). ` +
      `ICE selected: ${pretty(f.fusedValue)}. Evidence Score: ${f.winningEvidenceScore.toFixed(1)} vs ${(loser?.evidenceScore ?? 0).toFixed(1)}. ` +
      `Confidence: ${conf}%. Officer review recommended.`
    );
  }

  if (f.cellStatus === "VERIFIED" && corr) {
    return (
      `${corr.agreementCount} independent sources agree on ${f.fieldName}: ${pretty(f.fusedValue)}. ` +
      `Sources: ${corr.agreeingSources.map(label).join(", ")}. Confidence: ${conf}%.`
    );
  }

  if (f.cellStatus === "CORROBORATED" && corr) {
    const top = group.slice().sort((a, b) => b.trustScore - a.trustScore)[0];
    return (
      `${corr.agreementCount} of ${group.length} sources with ${f.fieldName} data agree on ${pretty(f.fusedValue)}. ` +
      `Highest-trust source: ${label(top.sourceId)} (trust=${top.trustScore.toFixed(0)}, ${top.freshnessAgeHrs.toFixed(1)} hours old). ` +
      `Confidence: ${conf}%.`
    );
  }

  // SINGLE_SOURCE fallback
  const only = group[0];
  return (
    `Only one source (${label(only.sourceId)}) has ${f.fieldName} data: ${pretty(f.fusedValue)}. ` +
    `This value cannot be corroborated. Treat as OBSERVED. Confidence: ${conf}%. ` +
    `Consider adding another connector to improve coverage.`
  );
}
