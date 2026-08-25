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
 * Authority that depends on *what* is being claimed, not only who claims it.
 *
 * {@link AUTHORITY_WEIGHT} ranks a source once, globally. That is the
 * right shape for a document store and the wrong shape for a maritime
 * picture, where the question "how much do we trust this source" has no
 * single answer: OpenSanctions is authoritative about a designation and
 * knows nothing about where a ship is; an AIS feed is the reverse.
 * Ranking them on one scale makes a sanctions provider compete with a
 * position provider for a position, which neither would claim to win.
 *
 * Keyed by attribute *prefix*, so `vessel.position` also governs
 * `vessel.position.lat` without an entry per leaf. The longest matching
 * prefix wins, and anything unmatched falls through to the global table —
 * so this is purely additive and every existing score is unchanged until
 * an attribute is deliberately listed here.
 *
 * Absence is meaningful: a source with no entry under an attribute is
 * not being demoted, it simply has no property-specific opinion recorded
 * and keeps its global weight.
 */
export const ATTRIBUTE_AUTHORITY: Readonly<Record<string, Readonly<Record<string, number>>>> =
  Object.freeze({
    /** Where a vessel is. AIS providers lead; nobody else has standing. */
    "vessel.position": Object.freeze({
      AIS_STREAM: 0.9,
      Datalastic: 0.88,
      SeaVantage: 0.88,
      // A sanctions or trade source reporting a position is repeating
      // something it was told, not observing it.
      OpenSanctions: 0.3,
      TradeAtlas: 0.25,
      Volza: 0.25,
    }),
    /** Historical track. Same providers, and provenance matters more. */
    "vessel.track": Object.freeze({
      Datalastic: 0.88,
      SeaVantage: 0.88,
      AIS_STREAM: 0.8,
      HISTORICAL_DB: 0.7,
    }),
    /** Designation and watchlist status. */
    "entity.sanctions": Object.freeze({
      OpenSanctions: 0.97,
      CAC: 0.6,
      // An AIS provider has no standing on whether an entity is listed.
      Datalastic: 0.2,
      SeaVantage: 0.2,
    }),
    /** Beneficial ownership and corporate control. */
    "entity.ownership": Object.freeze({
      CAC: 1.0,
      IMO_GISIS: 0.9,
      OpenSanctions: 0.85,
      Datalastic: 0.4,
    }),
    /**
     * Trade and cargo flows.
     *
     * Trade Atlas and Volza sit deliberately level. They are independent
     * providers of the same intelligence, and declaring either the primary
     * would bake a procurement decision into the scoring layer — the
     * evidence should decide, per claim, on freshness and grade.
     */
    "trade.flow": Object.freeze({
      TradeAtlas: 0.85,
      Volza: 0.85,
      CUSTOMS_DB: 0.95,
      MANIFEST_DB: 0.9,
    }),
  });

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
