/**
 * Sprint 7 · Evidence Fusion Engine — shared types.
 * Layers: 2.9 (Evidence Grades) · 2.10 (Fusion) · 2.11 (Confidence Formula).
 *
 * All fusion transforms are IMMUTABLE. Every derived record keeps a `raw`
 * pointer back to the untouched source value so precision loss from
 * normalisation (units, currencies, dates) is auditable.
 */

/** Canonical (lower-case) evidence grades produced by Sprint 6 agents. */
export const EVIDENCE_GRADES = [
  "verified",
  "corroborated",
  "observed",
  "reported",
  "inferred",
  "unconfirmed",
] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

/** Layer 2.9 — canonical grade weights (0..1). */
export const GRADE_WEIGHT: Readonly<Record<EvidenceGrade, number>> = Object.freeze({
  verified: 1.0,
  corroborated: 0.9,
  observed: 0.8,
  reported: 0.5,
  inferred: 0.3,
  unconfirmed: 0.0,
});

/** Layer 2.11 — source authority weights (0..1). Higher = more authoritative. */
export const AUTHORITY_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  CAC: 1.0,
  IMO: 1.0,
  IMO_GISIS: 1.0,
  OpenSanctions: 0.95,
  Customs: 0.95,
  CUSTOMS_DB: 0.95,
  MANIFEST_DB: 0.9,
  CERTIFICATE_REGISTRY: 0.9,
  PORT_STATE: 0.85,
  AIS_STREAM: 0.85,
  CONTAINER_DB: 0.8,
  EVIDENCE_LIBRARY: 0.75,
  DOCUMENT_STORE: 0.75,
  HISTORICAL_DB: 0.6,
  PATTERN_ENGINE: 0.55,
  INVOICE_DB: 0.85,
});
export const DEFAULT_AUTHORITY = 0.7;

/**
 * Normalised evidence atom consumed by the fusion layers.
 * `raw` preserves the original agent-emitted value verbatim.
 */
export interface NormalizedEvidence {
  readonly id: string;
  readonly agent: string;
  readonly sourceSystem: string;
  readonly entityIds: readonly string[];
  /** Attribute path this evidence speaks to (e.g. "revenue.declared"). */
  readonly attribute: string;
  /** Canonicalised value used for conflict/dedup comparison. */
  readonly value: string | number | boolean | null;
  /** Optional canonical unit for numeric values (e.g. "USD", "TEU"). */
  readonly unit: string | null;
  readonly grade: EvidenceGrade;
  /** ISO-8601 UTC timestamp. */
  readonly collectedAt: string;
  /** SHA-256 of the canonicalised claim (source + attribute + value). */
  readonly contentHash: string;
  /** Original agent-emitted record for audit. */
  readonly raw: unknown;
}

export interface ScoredEvidence extends NormalizedEvidence {
  readonly authority: number;
  readonly recency: number;
  readonly gradeWeight: number;
  /** Fused confidence = gradeWeight × authority × recency (0..1). */
  readonly confidence: number;
  /** Ids of items merged into this record (dedup). Always includes self. */
  readonly mergedFrom: readonly string[];
  /** Ids of items this record contradicts. */
  readonly conflictsWith: readonly string[];
}

export interface EvidenceConflict {
  readonly attribute: string;
  readonly entityId: string;
  readonly a: ScoredEvidence;
  readonly b: ScoredEvidence;
  readonly reason: string;
}

export interface FusionMetrics {
  readonly inputCount: number;
  readonly normalizedCount: number;
  readonly dedupedCount: number;
  readonly duplicateCount: number;
  readonly conflictCount: number;
  readonly sourcesQueried: number;
  readonly agentsReporting: number;
  readonly generatedAt: string;
  readonly durationMs: number;
}

/** Final envelope handed to the Reasoning Engine (Sprint 8). */
export interface FusedEvidenceBundle {
  readonly ranked: readonly ScoredEvidence[];
  readonly conflicts: readonly EvidenceConflict[];
  readonly metrics: FusionMetrics;
}
