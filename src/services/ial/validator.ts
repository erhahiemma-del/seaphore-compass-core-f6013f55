/**
 * Evidence Validator — never drops records; flags them.
 *
 * Rules mirror the "evidence-first" contract: absent data is louder than
 * bad data. The pipeline continues even when every record for a kind is
 * flagged — the OIE will see the flag via `EvidencePackage.issues` and
 * either escalate to Insufficient Evidence or downgrade confidence.
 */
import type { NormalizedEvidence, ValidationIssue } from "./types";

const STALE_THRESHOLD_SECONDS = 60 * 60 * 24 * 30; // 30 days
const LOW_GRADES = new Set(["UNKNOWN", "INFERRED"]);

const REQUIRED_FIELDS: Record<NormalizedEvidence["kind"], ReadonlyArray<string>> = {
  identity: ["name"],
  position: ["lat", "lon"],
  voyage: ["from", "to"],
  ownership: ["ownerName"],
  cargo: ["commodity"],
  sanctions: ["listName"],
  compliance: ["status"],
  "port-call": ["port"],
  weather: ["condition"],
  other: [],
};

export function validateRecords(
  records: ReadonlyArray<NormalizedEvidence>,
): { issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const seenHashes = new Map<string, string>();

  for (const r of records) {
    const required = REQUIRED_FIELDS[r.kind] ?? [];
    for (const field of required) {
      if (r.fields[field] == null || r.fields[field] === "") {
        issues.push({
          evidenceId: r.id,
          code: "missing-required",
          severity: "warn",
          message: `Required field '${field}' missing for ${r.kind}`,
        });
      }
    }

    if (r.freshnessSeconds > STALE_THRESHOLD_SECONDS) {
      issues.push({
        evidenceId: r.id,
        code: "stale",
        severity: "info",
        message: `Record is ${Math.round(r.freshnessSeconds / 86400)} days old`,
      });
    }

    const drift = Date.parse(r.retrievedAt) - Date.parse(r.observedAt);
    if (!Number.isFinite(drift) || drift < 0) {
      issues.push({
        evidenceId: r.id,
        code: "timestamp-drift",
        severity: "warn",
        message: "observedAt is in the future relative to retrievedAt",
      });
    }

    if (LOW_GRADES.has(r.grade)) {
      issues.push({
        evidenceId: r.id,
        code: "low-source-confidence",
        severity: "info",
        message: `Source grade ${r.grade}`,
      });
    }

    const dupeKey = `${r.entity.id}|${r.kind}|${r.hash}`;
    if (seenHashes.has(dupeKey)) {
      issues.push({
        evidenceId: r.id,
        code: "duplicate",
        severity: "info",
        message: `Duplicate of ${seenHashes.get(dupeKey)}`,
      });
    } else {
      seenHashes.set(dupeKey, r.id);
    }
  }

  return { issues };
}
