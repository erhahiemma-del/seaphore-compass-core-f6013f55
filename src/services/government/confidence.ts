/**
 * Cargo Confidence Model for government evidence (Sprint EP-GOV-01).
 *
 * Government authorities of record sit at the top of the ladder, but a
 * high authority weight never hides a thin record: completeness,
 * corroboration and freshness all move the score, and every result
 * carries the reason. Pure functions — no state, no I/O.
 *
 * OC-001 grades are the only vocabulary; the ladder is unchanged.
 */
import type { EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import type { GovernmentEvidenceRecord, GovernmentRecordType } from "./types";

/** Fields an authoritative record must carry to be considered complete. */
export const REQUIRED_FIELDS: Readonly<Record<GovernmentRecordType, ReadonlyArray<string>>> = {
  "customs-declaration": ["declarationNumber", "declarationStatus", "importerName"],
  "cargo-declaration": ["cargoDescription", "hsCode", "grossMassKg"],
  "manifest-return": ["manifestNumber", "carrierName", "portOfDischarge"],
  "revenue-assessment": ["assessmentNumber", "totalPayable"],
  "inspection-record": ["inspectionType", "inspectionOutcome"],
  "voyage-report": ["voyageNumber", "portOfArrival"],
  "port-clearance": ["clearanceStatus", "portCode"],
  "container-event": ["containerNumber", "eventType"],
};

export interface CargoConfidence {
  /** 0..1 composite score. */
  readonly score: number;
  readonly grade: EvidenceGrade;
  readonly axes: {
    readonly authority: number;
    readonly completeness: number;
    readonly corroboration: number;
    readonly freshness: number;
  };
  /** Officer-facing sentence explaining the score. */
  readonly rationale: string;
  readonly missingFields: ReadonlyArray<string>;
}

/** Completeness of a single government record against its required set. */
export function completeness(record: GovernmentEvidenceRecord): {
  ratio: number;
  missing: ReadonlyArray<string>;
} {
  const required = REQUIRED_FIELDS[record.recordType] ?? [];
  if (required.length === 0) return { ratio: 1, missing: [] };
  const missing = required.filter((f) => {
    const value = record.fields[f];
    return value === undefined || value === null || value === "";
  });
  return { ratio: (required.length - missing.length) / required.length, missing };
}

function freshnessScore(observedAt: string | undefined, now: number): number {
  if (!observedAt) return 0.5;
  const ts = new Date(observedAt).getTime();
  if (Number.isNaN(ts)) return 0.5;
  const days = Math.max(0, (now - ts) / 86_400_000);
  if (days <= 7) return 1;
  if (days <= 30) return 0.9;
  if (days <= 180) return 0.75;
  if (days <= 365) return 0.6;
  return 0.45;
}

export function gradeForScore(score: number): EvidenceGrade {
  if (score >= 0.9) return "VERIFIED";
  if (score >= 0.75) return "CORROBORATED";
  if (score >= 0.6) return "OBSERVED";
  if (score >= 0.4) return "REPORTED";
  if (score >= 0.2) return "INFERRED";
  return "UNKNOWN";
}

/**
 * Score one authoritative record.
 *
 * `corroborationCount` is how many other records in the same acquisition
 * describe the same subject — a declaration confirmed by a manifest return
 * outranks a declaration standing alone.
 */
export function scoreGovernmentRecord(
  record: GovernmentEvidenceRecord,
  opts: { trustWeight: number; corroborationCount?: number; now?: number },
): CargoConfidence {
  const now = opts.now ?? Date.now();
  const { ratio, missing } = completeness(record);
  const authority = Math.max(0, Math.min(1, opts.trustWeight));
  const corroborationCount = opts.corroborationCount ?? 0;
  const corroboration = corroborationCount >= 2 ? 1 : corroborationCount === 1 ? 0.85 : 0.7;
  const fresh = freshnessScore(record.occurredAt, now);

  const score = authority * 0.45 + ratio * 0.25 + corroboration * 0.15 + fresh * 0.15;
  const rounded = Math.round(score * 100) / 100;

  const parts = [
    `${record.agencyName} is the authority of record for ${record.recordType.replace(/-/g, " ")}`,
    missing.length === 0 ? "all required fields present" : `missing ${missing.join(", ")}`,
    corroborationCount > 0
      ? `corroborated by ${corroborationCount} other government record${corroborationCount === 1 ? "" : "s"}`
      : "no corroborating government record in this acquisition",
  ];

  return {
    score: rounded,
    grade: gradeForScore(rounded),
    axes: {
      authority: Math.round(authority * 100) / 100,
      completeness: Math.round(ratio * 100) / 100,
      corroboration,
      freshness: fresh,
    },
    rationale: `${parts.join("; ")}.`,
    missingFields: missing,
  };
}

/** Package-level confidence across every accepted government record. */
export function aggregateConfidence(
  records: ReadonlyArray<{ confidence: CargoConfidence }>,
): CargoConfidence {
  if (records.length === 0) {
    return {
      score: 0,
      grade: "UNKNOWN",
      axes: { authority: 0, completeness: 0, corroboration: 0, freshness: 0 },
      rationale: "No government evidence was returned for this subject.",
      missingFields: [],
    };
  }
  const avg = (pick: (c: CargoConfidence) => number) =>
    Math.round((records.reduce((s, r) => s + pick(r.confidence), 0) / records.length) * 100) / 100;
  const score = avg((c) => c.score);
  return {
    score,
    grade: gradeForScore(score),
    axes: {
      authority: avg((c) => c.axes.authority),
      completeness: avg((c) => c.axes.completeness),
      corroboration: avg((c) => c.axes.corroboration),
      freshness: avg((c) => c.axes.freshness),
    },
    rationale: `${records.length} government record${records.length === 1 ? "" : "s"} scored across authority, completeness, corroboration and freshness.`,
    missingFields: Array.from(new Set(records.flatMap((r) => r.confidence.missingFields))),
  };
}

/** Grade already carried by normalised evidence, for projection surfaces. */
export function gradeOf(evidence: NormalizedEvidence): EvidenceGrade {
  return evidence.grade;
}
