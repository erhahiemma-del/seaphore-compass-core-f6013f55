/**
 * Confidence Breakdown — expose the 4 axes behind the confidence chip.
 *
 * Every evidence item gets a deterministic breakdown across:
 *   • identity           — how strongly the subject is disambiguated
 *   • freshness          — how recent the evidence is
 *   • completeness       — presence of key fields (source, timestamp, subject)
 *   • crossSourceAgreement — whether other connectors corroborate the claim
 *
 * Values are 0..1. The breakdown is presentational; it never invents fields
 * that aren't in the underlying evidence. Officers can inspect every axis
 * and trace it back to the evidence.
 */
import type {
  EvidenceConfidence,
  IntelligenceEvidenceItem,
} from "@/lib/evidence/intelligence-evidence";

export interface ConfidenceBreakdown {
  identity: number;
  freshness: number;
  completeness: number;
  crossSourceAgreement: number;
  /** Weighted overall (0..1) — for visualization only, not for chip-grading. */
  overall: number;
}

const CHIP_TO_IDENTITY: Record<EvidenceConfidence, number> = {
  VERIFIED: 0.95,
  OBSERVED: 0.75,
  INFERRED: 0.5,
  UNCONFIRMED: 0.25,
};

/** 1.0 at t=now, halving every `halfLifeDays`. */
function freshnessScore(iso: string, halfLifeDays = 30): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0.3;
  const days = Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24));
  const score = Math.pow(0.5, days / halfLifeDays);
  return Math.max(0.05, Math.min(1, score));
}

function completenessScore(item: IntelligenceEvidenceItem): number {
  let s = 0;
  if (item.source) s += 0.25;
  if (item.timestamp) s += 0.25;
  if (item.subject || (item.entities && item.entities.length > 0)) s += 0.2;
  if (item.summary) s += 0.15;
  if (item.hash || item.sourceUrl || item.producer) s += 0.15;
  return Math.min(1, s);
}

function agreementScore(item: IntelligenceEvidenceItem, all: IntelligenceEvidenceItem[]): number {
  const subject = item.subject?.toLowerCase();
  if (!subject) return 0.4;
  const cohort = all.filter(
    (x) =>
      x.id !== item.id &&
      x.evidenceType === item.evidenceType &&
      (x.subject?.toLowerCase() === subject ||
        x.entities?.some((e) => e.name.toLowerCase() === subject)),
  );
  if (cohort.length === 0) return 0.4; // no corroboration = neutral
  const connectors = new Set(cohort.map((c) => c.connector).filter(Boolean));
  const agreeing = cohort.filter(
    (c) =>
      c.confidence === item.confidence && c.status !== "conflicting" && c.status !== "rejected",
  );
  const distinct = Math.min(1, connectors.size / 3); // 3+ connectors = full spread
  const agree = agreeing.length / cohort.length;
  return Math.max(0.1, Math.min(1, 0.5 * distinct + 0.5 * agree));
}

export function computeConfidenceBreakdown(
  item: IntelligenceEvidenceItem,
  cohort: IntelligenceEvidenceItem[] = [],
): ConfidenceBreakdown {
  const identity = CHIP_TO_IDENTITY[item.confidence];
  const freshness = freshnessScore(item.timestamp);
  const completeness = completenessScore(item);
  const crossSourceAgreement = agreementScore(item, cohort);
  const overall =
    0.35 * identity + 0.2 * freshness + 0.2 * completeness + 0.25 * crossSourceAgreement;
  return {
    identity,
    freshness,
    completeness,
    crossSourceAgreement,
    overall: Math.max(0, Math.min(1, overall)),
  };
}
