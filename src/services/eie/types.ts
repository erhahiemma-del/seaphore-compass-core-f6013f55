/**
 * SPRINT INT-01B — Entity Intelligence Engine (EIE) · canonical types.
 *
 * The EIE is the reusable entity layer that sits between the Canonical
 * Unified Intelligence Package (UIP) and every entity-shaped capability:
 * Cargo, Manifest, Container, Revenue and Trade Intelligence.
 *
 *   IAL evidence → IFE (fusion) → Canonical UIP
 *                                   → EIE (registry · resolution ·
 *                                     relationships · timeline · profile)
 *                                      → MIC centres · OIE / Copilot · MIO
 *
 * Invariants inherited from the frozen frameworks:
 *
 *   1. Nothing enters the registry without evidence. No evidence record,
 *      no entity; no asserting record, no relationship.
 *   2. Every entity, relationship, timeline event and figure carries an
 *      OC-001 grade and the evidence ids that support it.
 *   3. The EIE derives; it never fetches. No provider code lives here.
 *   4. Entity merges are explained. A merge without a stated rule and the
 *      matching key is a Golden Rule violation.
 */
import type { ConnectorId, EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import type { ConfidenceTier } from "@/types/confidence.types";

/** The thirteen entity types the Entity Registry supports. */
export type EieEntityType =
  | "vessel"
  | "company"
  | "person"
  | "port"
  | "terminal"
  | "cargo"
  | "container"
  | "manifest"
  | "bill-of-lading"
  | "voyage"
  | "importer"
  | "exporter"
  | "consignee";

export const EIE_ENTITY_TYPES: ReadonlyArray<EieEntityType> = [
  "vessel",
  "company",
  "person",
  "port",
  "terminal",
  "cargo",
  "container",
  "manifest",
  "bill-of-lading",
  "voyage",
  "importer",
  "exporter",
  "consignee",
];

/** Canonical relationship vocabulary. Directed: source → target. */
export type EieRelationshipType =
  | "owns"
  | "manages"
  | "operates"
  | "director_of"
  | "associated_with"
  | "registered_in"
  | "flagged_by"
  | "called_at"
  | "performed_voyage"
  | "berthed_at"
  | "carried"
  | "stows"
  | "covers"
  | "declared_on"
  | "consigned_to"
  | "imported_by"
  | "exported_by"
  | "shipped_by"
  | "sanctioned_by"
  | "alias_of";

/** One evidence record supporting an entity, relationship or event. */
export interface EieEvidenceRef {
  readonly evidenceId: string;
  readonly connectorId: ConnectorId;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;
  readonly kind: NormalizedEvidence["kind"];
  readonly observedAt: string;
  readonly excerpt?: string;
}

/** An alternate identifier or name that resolved into an entity. */
export interface EieAlias {
  readonly value: string;
  /** Why this alias belongs to the entity — always stated. */
  readonly reason: string;
}

export interface EieTimelineEvent {
  readonly at: string;
  readonly entityId: string;
  readonly kind: NormalizedEvidence["kind"];
  readonly label: string;
  readonly description: string;
  readonly grade: EvidenceGrade;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly evidenceIds: ReadonlyArray<string>;
}

export interface EieRelationship {
  /** Deterministic: `${type}::${sourceId}->${targetId}`. */
  readonly id: string;
  readonly type: EieRelationshipType;
  readonly sourceId: string;
  readonly targetId: string;
  /** Officer-language reason the relationship exists. */
  readonly explanation: string;
  readonly grade: EvidenceGrade;
  /** 0..1 corroboration weight — grows with distinct supporting sources. */
  readonly confidence: number;
  readonly evidenceIds: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<ConnectorId>;
  /** Earliest observation of the relationship. */
  readonly timestamp: string;
  readonly lastSeen: string;
}

export interface EieEntity {
  /** Canonical entity id, e.g. `vessel:imo:9438291`. */
  readonly id: string;
  readonly type: EieEntityType;
  readonly label: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly aliases: ReadonlyArray<EieAlias>;
  /** Canonical ids that were merged into this entity by resolution. */
  readonly mergedIds: ReadonlyArray<string>;
  readonly grade: EvidenceGrade;
  readonly confidenceTier: ConfidenceTier;
  readonly evidence: ReadonlyArray<EieEvidenceRef>;
  readonly timeline: ReadonlyArray<EieTimelineEvent>;
  readonly relationshipIds: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export interface EieRisk {
  /** Null when no risk-bearing evidence exists — never a fabricated zero. */
  readonly score: number | null;
  readonly tier: "critical" | "high" | "medium" | "low" | "unknown";
  readonly grade: EvidenceGrade;
  readonly drivers: ReadonlyArray<{
    readonly label: string;
    readonly grade: EvidenceGrade;
    readonly evidenceIds: ReadonlyArray<string>;
  }>;
}

export interface EieRelatedEntity {
  readonly relationship: EieRelationship;
  readonly counterpart: EieEntity;
  /** True when the counterpart is the relationship target. */
  readonly outbound: boolean;
}

export interface EieInvestigationLink {
  readonly id: string;
  readonly title: string;
  readonly status?: string;
  readonly updatedAt?: string;
}

export interface EieEntityProfile {
  readonly entity: EieEntity;
  /** Officer-facing summary lines. Every line is evidence-derived. */
  readonly summary: ReadonlyArray<string>;
  readonly timeline: ReadonlyArray<EieTimelineEvent>;
  readonly related: ReadonlyArray<EieRelatedEntity>;
  readonly evidence: ReadonlyArray<EieEvidenceRef>;
  readonly risk: EieRisk;
  readonly investigations: ReadonlyArray<EieInvestigationLink>;
  /** Named gaps — what the platform does NOT know about this entity. */
  readonly gaps: ReadonlyArray<string>;
}

/** How two canonical ids collapsed into one entity. */
export type EieResolutionRule =
  | "imo"
  | "mmsi"
  | "container-number"
  | "bill-of-lading"
  | "company-registration"
  | "name-similarity";

export interface EieResolutionCluster {
  readonly canonicalId: string;
  readonly memberIds: ReadonlyArray<string>;
  readonly rule: EieResolutionRule;
  readonly key: string;
  readonly confidence: number;
  readonly explanation: string;
}

export interface EieIngestReport {
  readonly evidenceRecords: number;
  readonly entities: number;
  readonly relationships: number;
  readonly duplicatesResolved: number;
  readonly clusters: ReadonlyArray<EieResolutionCluster>;
}

/** MIO (observability) projection of the Entity Intelligence Engine. */
export interface EieMetrics {
  readonly entityCount: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly relationshipCount: number;
  readonly byRelationshipType: Readonly<Record<string, number>>;
  readonly duplicatesResolved: number;
  readonly resolutionByRule: Readonly<Record<string, number>>;
  readonly evidenceRecords: number;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly grade: EvidenceGrade;
  /** Most recently evidenced entities — the entity activity feed. */
  readonly activity: ReadonlyArray<{
    readonly entityId: string;
    readonly label: string;
    readonly type: EieEntityType;
    readonly events: number;
    readonly lastSeen: string;
    readonly grade: EvidenceGrade;
  }>;
}

const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};

const BY_RANK: ReadonlyArray<EvidenceGrade> = [
  "UNKNOWN",
  "INFERRED",
  "REPORTED",
  "OBSERVED",
  "CORROBORATED",
  "VERIFIED",
];

export function gradeRank(g: EvidenceGrade): number {
  return GRADE_RANK[g] ?? 0;
}

export function strongestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return BY_RANK[grades.reduce((best, g) => Math.max(best, gradeRank(g)), 0)];
}

export function weakestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return BY_RANK[grades.reduce((worst, g) => Math.min(worst, gradeRank(g)), 5)];
}

/** OC-001 grade → officer-facing confidence chip tier. */
export function gradeToTier(g: EvidenceGrade): ConfidenceTier {
  switch (g) {
    case "VERIFIED":
      return "verified";
    case "CORROBORATED":
    case "OBSERVED":
      return "observed";
    case "REPORTED":
    case "INFERRED":
      return "inferred";
    default:
      return "unconfirmed";
  }
}
