/**
 * Maritime Knowledge Graph (MKG) — canonical types.
 *
 * Golden Rule: One entity. One graph. One source of truth. Every
 * relationship must be explainable and evidence-backed.
 *
 * The MKG sits DOWNSTREAM of the Intelligence Fusion Engine (IFE).
 *
 *   IAL evidence → IFE (identity resolution + fusion + OSAE overlay)
 *                     → Unified Intelligence Package
 *                        → MKG (nodes + edges + traversal)
 *                           → OSAE / OIE / Copilot briefs
 *
 * The MKG never re-derives identity — it consumes the canonical entity
 * ids emitted by the IFE identity resolver. It never re-computes OSAE
 * priority. It never inspects raw connector payloads. Its only job is to
 * project the fused, evidence-backed relational picture the officer can
 * traverse and Copilot can reason over.
 *
 * Every node and every edge carries:
 *   • the OC-001 grade of the supporting evidence,
 *   • the connector(s) that supplied the evidence,
 *   • the concrete evidence-record ids that back the claim,
 *   • timestamps for first-seen and last-seen.
 *
 * Nothing is fabricated. If a claim has no evidence, it does not enter
 * the graph.
 */
import type {
  CanonicalEntityRef,
  ConnectorId,
  EntityKind,
  EvidenceGrade,
} from "@/services/ial/types";

/** Extended graph-side entity kinds. Backwards-compatible with the IAL
 *  `EntityKind` — the graph ALSO carries relational-only kinds that
 *  connectors surface as fields today (manifest, sanctions list, incident,
 *  inspection). Those are minted deterministically from evidence — never
 *  invented. */
export type MkgNodeKind =
  | EntityKind // vessel · company · person · port · cargo · voyage
  | "manifest"
  | "sanction"
  | "inspection"
  | "incident";

export type MkgEdgeType =
  // Ownership / control
  | "OWNS"
  | "OPERATES"
  | "MANAGES"
  | "REGISTERED_IN"
  | "FLAGGED_BY"
  | "DIRECTOR_OF"
  | "OFFICER_OF"
  | "ASSOCIATED_WITH"
  // Movement / voyage
  | "CALLS_AT"
  | "DEPARTED_FROM"
  | "ARRIVED_AT"
  | "PERFORMED_VOYAGE"
  | "SAILED_UNDER"
  // Cargo / manifest
  | "CARRIED"
  | "LISTED_ON_MANIFEST"
  | "CONSIGNED_TO"
  | "CONSIGNED_BY"
  // Compliance
  | "SANCTIONED_BY"
  | "SUBJECT_OF_INSPECTION"
  | "SUBJECT_OF_INCIDENT"
  | "IMPLICATED_WITH"
  // Identity (why two ids collapsed)
  | "ALIAS_OF";

export interface MkgProvenance {
  readonly connectorId: ConnectorId;
  readonly sourceName: string;
  readonly evidenceId: string;
  readonly observedAt: string; // ISO 8601
  readonly grade: EvidenceGrade;
}

export interface MkgNode {
  /** Canonical entity id from the IFE. e.g. `vessel:imo:9438291`. */
  readonly id: string;
  readonly kind: MkgNodeKind;
  readonly label: string;
  /** Every alias id that resolved into this node (identity cluster). */
  readonly aliases: ReadonlyArray<string>;
  /** Flat attribute bag — deterministic keys per kind (imo, mmsi, flag,
   *  country, unlocode, portOfCall, ...). Never raw connector payloads. */
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  /** Composite OC-001 grade for the node — the strongest grade of any
   *  supporting evidence, degraded when contradictions exist. */
  readonly grade: EvidenceGrade;
  /** True when the IFE surfaced ≥ 1 contradiction touching this entity. */
  readonly hasContradictions: boolean;
  readonly provenance: ReadonlyArray<MkgProvenance>;
  readonly firstSeen: string; // ISO 8601
  readonly lastSeen: string; // ISO 8601
}

export interface MkgEdge {
  /** Deterministic: `${type}::${fromId}->${toId}`. */
  readonly id: string;
  readonly type: MkgEdgeType;
  readonly fromId: string;
  readonly toId: string;
  readonly directed: boolean;
  /** Human-readable rationale for the relationship. */
  readonly explanation: string;
  readonly grade: EvidenceGrade;
  /** Every evidence record that supports this edge. */
  readonly provenance: ReadonlyArray<MkgProvenance>;
  /** Distinct connector ids that supplied supporting evidence. */
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** 0..1 relational weight. Higher = stronger corroboration. */
  readonly weight: number;
}

export interface MkgSnapshot {
  readonly nodes: ReadonlyArray<MkgNode>;
  readonly edges: ReadonlyArray<MkgEdge>;
  readonly generatedAt: string;
  readonly stats: {
    readonly nodes: number;
    readonly edges: number;
    readonly byKind: Readonly<Record<string, number>>;
    readonly byEdgeType: Readonly<Record<string, number>>;
    readonly connectors: ReadonlyArray<ConnectorId>;
  };
}

/** Result of a bounded traversal. */
export interface MkgPath {
  readonly nodeIds: ReadonlyArray<string>;
  readonly edgeIds: ReadonlyArray<string>;
  readonly grade: EvidenceGrade;
  readonly hops: number;
}

export function refToNodeId(ref: CanonicalEntityRef): string {
  return ref.id;
}
