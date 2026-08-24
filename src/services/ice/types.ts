/**
 * Intelligence Correlation Engine (ICE) — canonical types.
 *
 * ICE sits between the IAL (Intelligence Acquisition Layer) and the OIE
 * (Operational Intelligence Engine). It never fetches evidence itself —
 * it consumes `NormalizedEvidence` from the IAL and produces one
 * `IntelligencePackage` per query.
 *
 * The OIE receives exactly one canonical package regardless of how many
 * providers contributed.
 */

import type { CanonicalEntityRef, ConnectorId, NormalizedEvidence } from "@/services/ial/types";

export type FieldCategory =
  | "IDENTITY"
  | "POSITION"
  | "VOYAGE"
  | "OWNERSHIP"
  | "CARGO"
  | "COMPLIANCE"
  | "SANCTIONS"
  | "WEATHER"
  | "OTHER";

export type CellStatus =
  | "VERIFIED"
  | "CORROBORATED"
  | "CONFLICT_MAJORITY"
  | "CONFLICT_MINORITY"
  | "SINGLE_SOURCE"
  | "MISSING"
  | "NEEDS_REVIEW";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type CorroborationLevel = "PARTIAL" | "STRONG" | "VERIFIED";

export type ConfidenceLevel =
  | "OBSERVED"
  | "DECLARED"
  | "INFERRED"
  | "CORROBORATED"
  | "VERIFIED"
  | "AUDITED";

export type RiskTier = "T0" | "T1" | "T2" | "T3";

export type Priority = "P1" | "P2" | "P3" | "P4" | "INFO";

export type Intent =
  | "FACT_LOOKUP"
  | "INVESTIGATION"
  | "COMPLIANCE_CHECK"
  | "OWNERSHIP_TRACE"
  | "VOYAGE_ANALYSIS"
  | "SANCTIONS_SCREEN"
  | "OTHER";

export interface IceQueryInput {
  readonly text: string;
  readonly entity?: CanonicalEntityRef;
  readonly officerId?: string;
  readonly riskTier?: RiskTier;
}

export interface QueryPlan {
  readonly queryId: string;
  readonly text: string;
  readonly intent: Intent;
  readonly entity?: CanonicalEntityRef;
  readonly riskTier: RiskTier;
  readonly selected: ReadonlyArray<ConnectorId>;
  readonly skipped: ReadonlyArray<{ source: ConnectorId; reason: string }>;
}

export interface MatrixCell {
  readonly canonicalId: string;
  readonly fieldName: string;
  readonly sourceId: ConnectorId;
  readonly normalizedValue: unknown;
  readonly originalValue?: unknown;
  readonly originalUnit?: string;
  trustScore: number;
  freshnessAgeHrs: number;
  freshnessScore: number;
  corroborationScore: number;
  completenessScore: number;
  qualityScore: number;
  evidenceScore: number;
  conflictPenalty: number;
  cellStatus: CellStatus;
  tags: string[];
  readonly retrievedAt: string;
  readonly rawHash?: string;
  readonly sourceUrl?: string;
  readonly evidenceId: string;
}

export interface ConflictRow {
  readonly canonicalId: string;
  readonly fieldName: string;
  readonly majorityValue: unknown;
  readonly majoritySources: ReadonlyArray<ConnectorId>;
  readonly minorityValue: unknown;
  readonly minoritySources: ReadonlyArray<ConnectorId>;
  readonly severity: Severity;
  readonly isCriticalField: boolean;
  readonly ageDifferentialHrs: number;
}

export interface CorroborationRow {
  readonly canonicalId: string;
  readonly fieldName: string;
  readonly agreedValue: unknown;
  readonly agreeingSources: ReadonlyArray<ConnectorId>;
  readonly agreementCount: number;
  readonly weightedConfidence: number;
  readonly level: CorroborationLevel;
}

export interface FusedField {
  readonly canonicalId: string;
  readonly fieldName: string;
  readonly fusedValue: unknown;
  readonly winningSource: ConnectorId | null;
  readonly winningEvidenceScore: number;
  readonly confidence: number; // 0..1
  readonly confidenceLevel: ConfidenceLevel;
  readonly cellStatus: CellStatus;
  readonly hasConflict: boolean;
  readonly hasMissingData: boolean;
  readonly requiresOfficerReview: boolean;
  readonly explanationText: string;
  readonly fusionPolicyVersion: string;
}

export interface Recommendation {
  readonly priority: Priority;
  readonly recommendation: string;
  readonly triggerCondition: string;
  readonly triggerDetail: Record<string, unknown>;
}

/** The final artefact the OIE consumes — one per ICE query. */
export interface IntelligencePackage {
  readonly plan: QueryPlan;
  readonly evidence: ReadonlyArray<NormalizedEvidence>;
  readonly matrix: ReadonlyArray<MatrixCell>;
  readonly conflicts: ReadonlyArray<ConflictRow>;
  readonly corroborations: ReadonlyArray<CorroborationRow>;
  readonly fused: ReadonlyArray<FusedField>;
  readonly recommendations: ReadonlyArray<Recommendation>;
  readonly canonicalEntities: ReadonlyArray<CanonicalEntityRef>;
  readonly completedAt: string;
}
