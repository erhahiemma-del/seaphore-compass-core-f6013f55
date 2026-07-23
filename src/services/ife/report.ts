/**
 * Contradiction report — a shape the OIE can render verbatim into the
 * "Contradictions", "Evidence Strength", "Missing Evidence", and
 * "Unknowns" sections of an operational briefing.
 */
import type {
  Contradiction,
  ContradictionReport,
  FusedEntityRecord,
  FusionConfidence,
} from "./types";

export function buildContradictionReport(
  records: ReadonlyArray<FusedEntityRecord>,
  contradictions: ReadonlyArray<Contradiction>,
  missing: ReadonlyArray<string>,
  packageConfidence: FusionConfidence,
): ContradictionReport {
  const unknowns = extractUnknowns(records);
  const critical = contradictions.filter((c) => c.severity === "critical").length;
  const summary =
    contradictions.length === 0
      ? `No contradictions across ${records.length} entit${records.length === 1 ? "y" : "ies"}. Evidence strength: ${packageConfidence}.`
      : `${contradictions.length} contradiction(s) (${critical} critical) across ${records.length} entit${records.length === 1 ? "y" : "ies"}. Evidence strength: ${packageConfidence}.`;

  return {
    contradictions,
    evidenceStrength: packageConfidence,
    missing: [...missing],
    unknowns,
    summary,
  };
}

function extractUnknowns(records: ReadonlyArray<FusedEntityRecord>): string[] {
  const out: string[] = [];
  for (const r of records) {
    for (const f of r.fields) {
      if (f.value === null || f.value === undefined || f.value === "") {
        out.push(`${r.entity.id}.${f.field}`);
      }
    }
  }
  return out;
}
