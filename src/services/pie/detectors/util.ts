import type { EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import type {
  Prediction,
  PredictionCategory,
  PredictionEvidenceCitation,
  PredictionFactor,
  PredictionHorizon,
  PredictionSeverity,
} from "../types";

export function citation(e: NormalizedEvidence): PredictionEvidenceCitation {
  return {
    evidenceId: e.id,
    source: e.source,
    sourceName: e.sourceName,
    grade: e.grade,
    observedAt: e.observedAt,
    excerpt: e.excerpt,
  };
}

/** Aggregate a set of evidence grades into a single OC-001 grade for a
 * prediction. Never upgrade — a prediction cannot be more confident than
 * its weakest supporting piece of evidence. */
export function aggregateGrade(evidence: ReadonlyArray<NormalizedEvidence>): EvidenceGrade {
  if (evidence.length === 0) return "UNKNOWN";
  const order: EvidenceGrade[] = [
    "VERIFIED",
    "CORROBORATED",
    "OBSERVED",
    "REPORTED",
    "INFERRED",
    "UNKNOWN",
  ];
  let worst: EvidenceGrade = "VERIFIED";
  for (const e of evidence) {
    if (order.indexOf(e.grade) > order.indexOf(worst)) worst = e.grade;
  }
  return worst;
}

export function severityFor(probability: number): PredictionSeverity {
  if (probability >= 0.75) return "critical";
  if (probability >= 0.55) return "elevated";
  if (probability >= 0.35) return "watch";
  return "info";
}

export function horizonFor(category: PredictionCategory): PredictionHorizon {
  switch (category) {
    case "ais-behaviour":
    case "sanctions-proximity":
      return "immediate";
    case "route-deviation":
    case "cargo-anomaly":
      return "short";
    case "compliance-recurrence":
    case "ownership-churn":
      return "medium";
    case "revenue-anomaly":
      return "medium";
  }
}

export function combineProbability(factors: ReadonlyArray<PredictionFactor>): number {
  // Independent-evidence combination via complement product, bounded [0,1].
  // Positive weights push probability up; negative weights (exculpatory
  // signals) pull it down.
  let p = 0;
  for (const f of factors) {
    const w = clamp(f.weight, -0.9, 0.9);
    if (w >= 0) p = 1 - (1 - p) * (1 - w);
    else p = p * (1 + w); // discount
  }
  return clamp(p, 0, 0.99);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function stableId(category: PredictionCategory, subjectId: string, salt: string): string {
  // Deterministic id so the same evidence produces the same prediction id
  // across cycles — Copilot and OSAE can dedupe by id safely.
  const raw = `${category}:${subjectId}:${salt}`;
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) {
    h = (h * 31 + raw.charCodeAt(i)) | 0;
  }
  return `pie_${category}_${(h >>> 0).toString(36)}`;
}

export function buildPrediction(args: {
  category: PredictionCategory;
  subject: NormalizedEvidence["entity"];
  headline: string;
  explanation: string;
  factors: ReadonlyArray<PredictionFactor>;
  evidence: ReadonlyArray<NormalizedEvidence>;
  alternatives?: Prediction["alternatives"];
  baseline?: Prediction["baseline"];
  now: Date;
  revision: number;
  salt: string;
  alertThreshold?: number;
}): Prediction {
  const probability = combineProbability(args.factors);
  const severity = severityFor(probability);
  const confidence = aggregateGrade(args.evidence);
  const alert = probability >= (args.alertThreshold ?? 0.55) && confidence !== "UNKNOWN";
  return {
    id: stableId(args.category, args.subject.id, args.salt),
    subject: args.subject,
    category: args.category,
    headline: args.headline,
    explanation: args.explanation,
    probability,
    confidence,
    severity,
    horizon: horizonFor(args.category),
    factors: args.factors,
    alternatives: args.alternatives ?? [],
    citations: args.evidence.map(citation),
    baseline: args.baseline,
    alert,
    generatedAt: args.now.toISOString(),
    revision: args.revision,
  };
}
