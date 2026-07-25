/**
 * Operational Knowledge Layer (OKL) — canonical types.
 *
 * OKL consumes the IFE Unified Intelligence Package and produces
 * OperationalPatterns and OperationalRecommendations, each carrying a
 * full 5-level Confidence Pyramid and a traceable reasoning trace.
 *
 * Golden Rule: Facts → Evidence → Intelligence → Operational Knowledge.
 * OKL never bypasses the UIP and never invents recommendations without
 * evidence citations.
 */

import type { CanonicalEntityRef } from "@/services/ial/types";
import type { FusionConfidence } from "@/services/ife/types";

export type OklPatternKind =
  | "REPEAT_OFFENDER"
  | "SUSPICIOUS_ROUTING"
  | "AIS_DARK_PATTERN"
  | "OWNERSHIP_LINK"
  | "CARGO_ANOMALY"
  | "MANIFEST_INCONSISTENCY"
  | "REVENUE_LEAKAGE"
  | "COMPLIANCE_VIOLATION"
  | "PORT_CONGESTION"
  | "CROSS_INVESTIGATION_LINK"
  | "HISTORICAL_BEHAVIOUR";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ConfidenceTier = "LOW" | "MEDIUM" | "HIGH";

/**
 * Confidence Pyramid — every operational conclusion carries all five
 * levels. Consumers render each level; officers see the breakdown.
 */
export interface ConfidencePyramid {
  /** Identity match confidence (from IFE identity clusters). */
  readonly identity: number; // 0..100
  /** Evidence completeness/freshness (from UIP.freshestSeconds + fields). */
  readonly evidence: number;
  /** Fusion confidence (from UIP.fused.confidence + contradictions). */
  readonly fusion: number;
  /** Pattern detector score (from detector's signals). */
  readonly pattern: number;
  /** Recommendation confidence (min of the above, discounted by conflicts). */
  readonly recommendation: number;
  readonly tier: ConfidenceTier;
  readonly explanation: string;
}

export interface OperationalRecommendation {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly urgency: "IMMEDIATE" | "PRIORITY" | "ROUTINE";
  /** Evidence ids from the UIP that support this recommendation. */
  readonly supportingEvidenceIds: ReadonlyArray<string>;
  /** Officer decision required before enforcement. Officer decides. */
  readonly requiresOfficerApproval: boolean;
  readonly confidence: number; // 0..100
}

export interface AlternativeExplanation {
  readonly label: string;
  readonly likelihood: "LOW" | "MEDIUM" | "HIGH";
  readonly rationale: string;
}

export interface ReasoningStep {
  readonly step: string;
  readonly detail?: string;
}

export interface OperationalPattern {
  readonly id: string;
  readonly kind: OklPatternKind;
  readonly name: string;
  readonly operationalImpact: string;
  readonly riskLevel: RiskLevel;
  readonly confidence: ConfidencePyramid;

  /** Canonical entity ids this pattern concerns. */
  readonly entities: ReadonlyArray<CanonicalEntityRef>;
  /** Evidence ids from the UIP that anchor the pattern. */
  readonly supportingEvidenceIds: ReadonlyArray<string>;
  /** Connector ids that contributed evidence. */
  readonly sourceConnectors: ReadonlyArray<string>;
  /** Contradictory evidence surfaced by the IFE. */
  readonly contradictoryEvidenceIds: ReadonlyArray<string>;
  /** Historical context — prior detections or similar patterns. */
  readonly historicalContext?: string;
  /** Alternative benign explanations the officer should weigh. */
  readonly alternatives: ReadonlyArray<AlternativeExplanation>;
  /** Recommended next actions — the officer decides. */
  readonly recommendations: ReadonlyArray<OperationalRecommendation>;
  /** Machine-readable reasoning trace. */
  readonly reasoning: ReadonlyArray<ReasoningStep>;
  /** Whether this pattern crosses an active investigation. */
  readonly investigationIds?: ReadonlyArray<string>;

  readonly detectedAt: string;
  readonly provenance: {
    readonly uipId: string;
    readonly fusedPackageId: string;
    readonly detector: OklPatternKind;
  };
}

export interface OperationalKnowledgePackage {
  readonly id: string;
  readonly createdAt: string;
  readonly uipId: string;
  readonly patterns: ReadonlyArray<OperationalPattern>;
  readonly summary: {
    readonly total: number;
    readonly byRisk: Record<RiskLevel, number>;
    readonly byKind: Partial<Record<OklPatternKind, number>>;
    readonly topRecommendation?: OperationalRecommendation;
    readonly overallConfidence: ConfidencePyramid;
  };
}

export interface OklHistoricalHint {
  readonly entityId: string;
  readonly patternKind: OklPatternKind;
  readonly count: number;
  readonly lastSeen: string;
}

export interface OklInvestigationHint {
  readonly investigationId: string;
  readonly entityIds: ReadonlyArray<string>;
}

/** Rough confidence-tier assignment. */
export function tierFromScore(score: number): ConfidenceTier {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/** Map an IFE FusionConfidence to a 0..100 score. */
export function fusionToScore(fc: FusionConfidence): number {
  if (fc === "HIGH") return 85;
  if (fc === "MEDIUM") return 60;
  return 30;
}
