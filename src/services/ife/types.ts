/**
 * Intelligence Fusion Engine (IFE) — canonical types.
 *
 * The IFE sits between the Intelligence Acquisition Layer (IAL) and the
 * Operational Intelligence Engine (OIE). It consumes an `EvidencePackage`
 * from the IAL — a bag of validated, normalised records from many
 * providers — and produces a single `FusedEvidencePackage` in which every
 * entity has exactly one canonical record, every conflict is surfaced (not
 * silently overwritten), and every field carries an OC-001 confidence
 * grade with an explanation.
 *
 * Design rules:
 *   1. Deterministic. Given the same inputs the IFE produces the same
 *      canonical record and the same contradiction report.
 *   2. Never silently overwrites conflicts — every disagreement produces
 *      a `Contradiction` entry.
 *   3. Source-agnostic beyond the ranking table — new providers only need
 *      a row in `DEFAULT_SOURCE_PROFILE`.
 *   4. OIE never sees raw duplicates; it only sees the fused package.
 */
import type {
  CanonicalEntityRef,
  ConnectorId,
  EvidenceConflict,
  EvidenceFieldValue,
  EvidenceGrade,
  EvidencePackage,
  NormalizedEvidence,
  SourceAttribution,
} from "@/services/ial/types";

export type FusionConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Per-provider ranking used by the fusion rules. All numbers are 0..1
 *  except `authority`, which is a categorical bucket promoted to a
 *  numeric weight inside the engine. */
export interface SourceProfile {
  readonly connectorId: ConnectorId;
  /** Government/regulator > classification society > commercial > OSINT. */
  readonly authority: "government" | "regulator" | "official" | "commercial" | "osint";
  /** Historical reliability, 0..1 — how often this provider has agreed
   *  with corroborating sources historically. */
  readonly reliability: number;
  /** Coverage breadth, 0..1 — how many evidence kinds this provider
   *  meaningfully reports on. */
  readonly coverage: number;
  /** Typical latency, milliseconds — freshness/timeliness proxy. */
  readonly latencyMsP50: number;
  /** Typical completeness of a record, 0..1 — fraction of expected
   *  fields the provider populates. */
  readonly completeness: number;
}

export interface FusedFieldValue {
  readonly field: string;
  readonly value: EvidenceFieldValue;
  readonly confidence: FusionConfidence;
  readonly grade: EvidenceGrade;
  /** Evidence records that support the accepted value. */
  readonly supportingEvidenceIds: ReadonlyArray<string>;
  /** Providers that supplied the accepted value. */
  readonly supportingSources: ReadonlyArray<ConnectorId>;
  /** Providers that disagreed with the accepted value. */
  readonly dissentingSources: ReadonlyArray<ConnectorId>;
  /** Human-readable rationale for the confidence grade. */
  readonly explanation: string;
  /** Timeline of prior values for this field. */
  readonly timeline: ReadonlyArray<FusedFieldTimelineEntry>;
}

export interface FusedFieldTimelineEntry {
  readonly value: EvidenceFieldValue;
  readonly observedAt: string;
  readonly source: ConnectorId;
  readonly evidenceId: string;
  readonly status: "latest" | "previous" | "historical" | "superseded";
}

export interface FusedEntityRecord {
  readonly entity: CanonicalEntityRef;
  readonly fields: ReadonlyArray<FusedFieldValue>;
  /** Confidence for the record as a whole — the min over field grades,
   *  discounted by contradictions. */
  readonly confidence: FusionConfidence;
  /** OC-001 badge for the record as a whole. */
  readonly grade: EvidenceGrade;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly explanation: string;
}

export interface Contradiction {
  readonly entity: CanonicalEntityRef;
  readonly field: string;
  readonly severity: "info" | "warn" | "critical";
  readonly values: ReadonlyArray<{
    readonly value: EvidenceFieldValue;
    readonly source: ConnectorId;
    readonly grade: EvidenceGrade;
    readonly evidenceId: string;
    readonly observedAt: string;
    readonly accepted: boolean;
  }>;
  readonly resolution:
    | "official-source-preferred"
    | "majority-agreement"
    | "highest-authority"
    | "most-recent"
    | "unresolved";
  readonly explanation: string;
}

export interface ContradictionReport {
  readonly contradictions: ReadonlyArray<Contradiction>;
  readonly evidenceStrength: FusionConfidence;
  readonly missing: ReadonlyArray<string>;
  readonly unknowns: ReadonlyArray<string>;
  readonly summary: string;
}

export interface FusedSourceAttribution extends SourceAttribution {
  readonly agreementScore: number;
  readonly weight: number;
}

export interface FusedEvidencePackage {
  readonly id: string;
  readonly createdAt: string;
  readonly sourcePackageId: string;

  /** Exactly one canonical record per resolved entity. */
  readonly canonical: ReadonlyArray<FusedEntityRecord>;
  /** All contradictions surfaced during correlation. */
  readonly contradictions: ReadonlyArray<Contradiction>;
  /** Ranked sources with the weight applied during fusion. */
  readonly sources: ReadonlyArray<FusedSourceAttribution>;
  /** Contradiction report the OIE can render verbatim. */
  readonly report: ContradictionReport;
  /** Evidence kinds requested but never returned by any provider. */
  readonly missing: ReadonlyArray<string>;
  /** Composite confidence for the whole package. */
  readonly confidence: FusionConfidence;
  /** Composite OC-001 grade for the whole package. */
  readonly grade: EvidenceGrade;

  /** Statistics useful for the OIE briefing. */
  readonly stats: {
    readonly inputRecords: number;
    readonly canonicalEntities: number;
    readonly contradictions: number;
    readonly sourcesQueried: number;
    readonly sourcesResponded: number;
    readonly averageFreshnessSeconds: number;
  };
}

/** Anything the fusion engine will accept as input. */
export type FusionInput =
  | EvidencePackage
  | {
      readonly records: ReadonlyArray<NormalizedEvidence>;
      readonly sources?: ReadonlyArray<SourceAttribution>;
      readonly conflicting?: ReadonlyArray<EvidenceConflict>;
      readonly missing?: ReadonlyArray<string>;
      readonly canonicalEntities?: ReadonlyArray<CanonicalEntityRef>;
    };
