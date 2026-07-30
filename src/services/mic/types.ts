/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A — Maritime Intelligence Core (MIC) · Foundation Types
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Canonical type vocabulary for the entire MIC. Every other MIC module
 *  imports from here — never from each other's internals.
 *
 *  Design rules:
 *    1. Types only. No logic, no classes, no side effects.
 *    2. Extends existing IAL / IFE / MKG types — never replaces them.
 *    3. Every type is readonly — the MIC is immutable at the type boundary.
 *    4. Nothing here imports from services outside mic/ except the three
 *       upstream contracts: IAL types, IFE types, MKG types.
 *
 *  Pipeline position:
 *    IAL → IFE → [MIC sits here] → Canonical UIP → OIE → Copilot → MIBC
 * ─────────────────────────────────────────────────────────────────────
 */
import type { EvidenceGrade, NormalizedEvidence, ConnectorId } from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { MkgNode, MkgEdge, MkgSnapshot } from "@/services/mkg/types";

// ─── Re-export upstream types so MIC consumers have one import ────────
export type { EvidenceGrade, NormalizedEvidence, ConnectorId };
export type { UnifiedIntelligencePackage };
export type { MkgNode, MkgEdge, MkgSnapshot };

// ─────────────────────────────────────────────────────────────────────
//  CONFIDENCE MODEL  (INT-01F foundation)
// ─────────────────────────────────────────────────────────────────────

/**
 * Four-tier confidence vocabulary used throughout the MIC.
 * Distinct from IFE's three-tier FusionConfidence — the MIC adds VERY_HIGH
 * for multi-source corroborated, freshly-verified intelligence.
 */
export type MicConfidenceTier = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

/** Canonical numeric band → tier mapping (open to future tuning). */
export const MIC_CONFIDENCE_THRESHOLDS = {
  VERY_HIGH: 0.85,
  HIGH: 0.65,
  MEDIUM: 0.40,
  LOW: 0.00,
} as const;

export function micTierFromScore(score: number): MicConfidenceTier {
  if (score >= MIC_CONFIDENCE_THRESHOLDS.VERY_HIGH) return "VERY_HIGH";
  if (score >= MIC_CONFIDENCE_THRESHOLDS.HIGH)      return "HIGH";
  if (score >= MIC_CONFIDENCE_THRESHOLDS.MEDIUM)    return "MEDIUM";
  return "LOW";
}

/** Map an IAL EvidenceGrade to a numeric confidence score. */
export function micScoreFromGrade(grade: EvidenceGrade): number {
  const GRADE_SCORE: Record<EvidenceGrade, number> = {
    VERIFIED:     0.95,
    CORROBORATED: 0.80,
    OBSERVED:     0.65,
    REPORTED:     0.45,
    INFERRED:     0.30,
    UNKNOWN:      0.10,
  };
  return GRADE_SCORE[grade] ?? 0.10;
}

// ─────────────────────────────────────────────────────────────────────
//  EVIDENCE CITATION
// ─────────────────────────────────────────────────────────────────────

/**
 * The atomic provenance unit. Every MIC conclusion carries at least one.
 * Never fabricated — always derived from NormalizedEvidence records.
 */
export interface MicCitation {
  readonly evidenceId: string;
  readonly connectorId: ConnectorId;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;
  readonly observedAt: string;        // ISO 8601
  /** Human-readable excerpt from the evidence record. */
  readonly excerpt: string;
}

/** Build a citation from a NormalizedEvidence record. */
export function citationFromEvidence(ev: NormalizedEvidence): MicCitation {
  return {
    evidenceId: ev.id,
    connectorId: ev.source as ConnectorId,
    sourceName: ev.sourceName,
    grade: ev.grade,
    observedAt: ev.observedAt,
    excerpt: ev.excerpt ?? `${ev.kind} record from ${ev.sourceName}`,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  INTELLIGENCE STATEMENT
// ─────────────────────────────────────────────────────────────────────

/**
 * An atomic, evidence-backed assertion the Copilot can state verbatim.
 * Replaces "here is vessel data" with "this vessel changed flag three
 * times in 18 months (VERIFIED, Equasis + IMO GISIS)."
 */
export type MicStatementCategory =
  | "identity"
  | "ownership"
  | "management"
  | "registration"
  | "movement"
  | "port-activity"
  | "cargo"
  | "sanctions"
  | "compliance"
  | "inspection"
  | "incident"
  | "satellite"
  | "environmental"
  | "risk"
  | "relationship"
  | "financial"
  | "timeline";

export interface MicStatement {
  readonly id: string;
  readonly text: string;              // plain English, officer-facing
  readonly category: MicStatementCategory;
  readonly grade: EvidenceGrade;
  readonly confidence: MicConfidenceTier;
  readonly citations: ReadonlyArray<MicCitation>;
  readonly nodeIds: ReadonlyArray<string>;   // graph nodes this statement touches
  readonly edgeIds: ReadonlyArray<string>;   // graph edges this statement touches
}

// ─────────────────────────────────────────────────────────────────────
//  REGISTRY ENTRY SHAPES  (one per registry, INT-01A scope)
// ─────────────────────────────────────────────────────────────────────

/** Base fields every registry entry carries. */
interface MicRegistryEntry {
  readonly id: string;
  readonly registeredAt: string;       // ISO 8601
  readonly lastUpdatedAt: string;      // ISO 8601
  readonly revision: number;           // monotonically increasing
}

// Entity Registry
export interface MicEntityRegistryEntry extends MicRegistryEntry {
  readonly kind: MkgNode["kind"];
  readonly canonicalId: string;
  readonly label: string;
  readonly aliases: ReadonlyArray<string>;
  readonly confidence: MicConfidenceTier;
  readonly grade: EvidenceGrade;
  readonly citations: ReadonlyArray<MicCitation>;
  /** Ids of all UIP packages that contributed evidence about this entity. */
  readonly sourceUipIds: ReadonlyArray<string>;
}

// Relationship Registry
export interface MicRelationshipRegistryEntry extends MicRegistryEntry {
  readonly edgeId: string;             // MKG edge id
  readonly type: MkgEdge["type"];
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly confidence: MicConfidenceTier;
  readonly grade: EvidenceGrade;
  readonly citations: ReadonlyArray<MicCitation>;
  readonly explanation: string;
}

// Evidence Registry
export interface MicEvidenceRegistryEntry extends MicRegistryEntry {
  readonly evidenceId: string;         // NormalizedEvidence.id
  readonly connectorId: ConnectorId;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;
  readonly kind: NormalizedEvidence["kind"];
  readonly entityId: string;
  readonly observedAt: string;
  readonly uipId: string;              // which UIP this came through
}

// Confidence Registry
export interface MicConfidenceRegistryEntry extends MicRegistryEntry {
  readonly subjectId: string;          // entity or relationship id
  readonly subjectKind: "entity" | "relationship" | "statement";
  readonly score: number;              // 0..1
  readonly tier: MicConfidenceTier;
  readonly components: ReadonlyArray<{
    readonly factor: string;
    readonly contribution: number;
    readonly explanation: string;
  }>;
}

// Timeline Registry
export type MicTimelineEventKind =
  | "ownership-change" | "flag-change" | "port-visit" | "ais-dark" | "ais-resume"
  | "satellite-observation" | "sanctions-listing" | "sanctions-removal"
  | "cargo-movement" | "inspection" | "inspection-fail" | "incident"
  | "voyage-start" | "voyage-end" | "certificate-issued" | "certificate-expired"
  | "name-change" | "class-change" | "insurance-change";

export interface MicTimelineEvent extends MicRegistryEntry {
  readonly kind: MicTimelineEventKind;
  readonly label: string;
  readonly description: string;
  readonly entityId: string;
  readonly relatedEntityIds: ReadonlyArray<string>;
  readonly occurredAt: string;
  readonly citations: ReadonlyArray<MicCitation>;
  readonly grade: EvidenceGrade;
  readonly significance: "low" | "medium" | "high" | "critical";
}

// Risk Registry
export type MicRiskIndicatorKind =
  | "ownership-churn" | "ais-dark-activity" | "sanctions-hit" | "sanctions-proximity"
  | "shared-directors" | "high-risk-jurisdiction" | "cargo-inconsistency"
  | "insurance-gap" | "satellite-anomaly" | "manifest-discrepancy"
  | "repeated-inspection-fail" | "flag-of-convenience" | "frequent-flag-change"
  | "unsafe-behaviour" | "repeated-incident" | "cargo-risk" | "jurisdiction-risk";

export interface MicRiskIndicator {
  readonly kind: MicRiskIndicatorKind;
  readonly label: string;
  readonly score: number;              // 0..1 raw contribution
  readonly weight: number;             // fixed weight
  readonly points: number;             // score × weight × 100
  readonly rationale: string;
  readonly citations: ReadonlyArray<MicCitation>;
  readonly nodeIds: ReadonlyArray<string>;
  readonly confidence: MicConfidenceTier;
}

export type MicRiskBand = "low" | "elevated" | "high" | "critical";

export function micBandFromScore(score: number): MicRiskBand {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "elevated";
  return "low";
}

export interface MicRiskRegistryEntry extends MicRegistryEntry {
  readonly entityId: string;
  readonly entityLabel: string;
  readonly entityKind: MkgNode["kind"];
  readonly score: number;              // 0..100
  readonly band: MicRiskBand;
  readonly confidence: MicConfidenceTier;
  readonly indicators: ReadonlyArray<MicRiskIndicator>;
  readonly narrative: string;          // Copilot-ready plain-English summary
  readonly computedAt: string;
}

// Graph Registry
export interface MicGraphRegistryEntry extends MicRegistryEntry {
  readonly uipId: string;
  readonly nodes: number;
  readonly edges: number;
  readonly primaryEntityId: string | null;
}

// Reasoning Registry
export interface MicReasoningRegistryEntry extends MicRegistryEntry {
  readonly sessionId: string;
  readonly query: string;
  readonly primaryEntityId: string | null;
  readonly statements: ReadonlyArray<MicStatement>;
  readonly confidence: MicConfidenceTier;
  readonly grade: EvidenceGrade;
  readonly uipId: string;
}

// ─────────────────────────────────────────────────────────────────────
//  MIC PROCESSING RESULT  (what process() returns)
// ─────────────────────────────────────────────────────────────────────

export interface MicProcessResult {
  /** The original UIP — unchanged. */
  readonly uip: UnifiedIntelligencePackage;
  /** Graph snapshot after ingesting the UIP. */
  readonly graphSnapshot: MkgSnapshot;
  /** Entity registry entries produced/updated from this UIP. */
  readonly entities: ReadonlyArray<MicEntityRegistryEntry>;
  /** Relationship registry entries produced/updated from this UIP. */
  readonly relationships: ReadonlyArray<MicRelationshipRegistryEntry>;
  /** Evidence registry entries from this UIP's rawEvidence. */
  readonly evidence: ReadonlyArray<MicEvidenceRegistryEntry>;
  /** Confidence registry entries for entities and relationships. */
  readonly confidence: ReadonlyArray<MicConfidenceRegistryEntry>;
  /** Timeline events minted from this UIP. */
  readonly timeline: ReadonlyArray<MicTimelineEvent>;
  /** Risk registry entries for every entity. */
  readonly risk: ReadonlyArray<MicRiskRegistryEntry>;
  /** Stats for this processing run. */
  readonly stats: {
    readonly entitiesRegistered: number;
    readonly relationshipsRegistered: number;
    readonly evidenceRegistered: number;
    readonly timelineEvents: number;
    readonly riskProfilesComputed: number;
    readonly processingMs: number;
  };
}
