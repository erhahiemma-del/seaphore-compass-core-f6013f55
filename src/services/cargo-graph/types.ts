/**
 * SPRINT CAP-03 — Cargo Knowledge Graph (CKG) · canonical types.
 *
 * The CKG is the relational projection of CAPABILITY.CARGO v1.0
 * (`docs/capabilities/CARGO_CAPABILITY_v1.md`). It sits beside the
 * Maritime Knowledge Graph and obeys the same invariants:
 *
 *   Canonical UIP evidence → CKG builder → nodes + edges (+ provenance)
 *                              → query facade → OIE / Copilot / workspace
 *
 * Rules inherited from the frozen frameworks, none of them negotiable:
 *
 *   1. Every node is a Canonical UIP entity. Cargo sub-types are NOT new
 *      `EntityKind`s — they are `EntityKind = "cargo"` disambiguated by id
 *      namespace (`cargo:manifest:*`, `cargo:bol:*`, ...). The v1.0 freeze
 *      is preserved exactly.
 *   2. Nothing enters the graph without provenance. No evidence record,
 *      no node; no asserting record, no edge.
 *   3. An edge inherits the OC-001 grade of the evidence that asserted it.
 *      Two providers asserting the same edge is what produces
 *      CORROBORATED — the builder never upgrades a grade on its own.
 *   4. The graph derives; it never fetches. No provider code lives here.
 */
import type { ConnectorId, EvidenceGrade } from "@/services/ial/types";

/**
 * Officer-facing role of a node in the cargo chain. This is a *derived
 * label*, not a new canonical entity kind — it is computed from the
 * canonical id namespace plus the evidence kind.
 */
export type CargoNodeRole =
  | "company"
  | "shipment"
  | "manifest"
  | "bill-of-lading"
  | "container"
  | "cargo-item"
  | "commodity"
  | "hs-code"
  | "voyage"
  | "vessel"
  | "port"
  | "port-call"
  | "inspection"
  | "revenue"
  | "investigation";

/** The canonical CAP-03 chain, top to bottom. Used for ordering, gap
 *  detection and officer-facing chain rendering. */
export const CARGO_CHAIN: ReadonlyArray<CargoNodeRole> = [
  "company",
  "shipment",
  "manifest",
  "bill-of-lading",
  "container",
  "cargo-item",
  "commodity",
  "voyage",
  "vessel",
  "port",
  "inspection",
  "revenue",
  "investigation",
];

/** Canonical edge vocabulary — the CAP-01 edge list extended with the
 *  inspection / revenue / investigation tail mandated by CAP-03. */
export type CargoEdgeType =
  // trade parties
  | "shipped_by"
  | "consigned_to"
  | "carried_by"
  | "filed_by"
  // documentary chain
  | "declared_for"
  | "lodged_at"
  | "contains"
  | "covers"
  | "stows"
  | "is_commodity"
  | "classified_as"
  | "declares"
  // movement
  | "has_leg"
  | "occurs_at"
  | "moved_at"
  | "operated_by"
  // enforcement tail
  | "inspected_by"
  | "subject_of_inspection"
  | "assesses"
  | "generates_revenue"
  | "part_of_investigation";

export interface CargoProvenance {
  readonly connectorId: ConnectorId;
  readonly sourceName: string;
  readonly evidenceId: string;
  readonly observedAt: string;
  readonly grade: EvidenceGrade;
}

export interface CargoGraphNode {
  /** Canonical UIP entity id, e.g. `cargo:bol:MSCU:BL-88213`. */
  readonly id: string;
  /** Canonical UIP entity kind — never invented. */
  readonly kind: "vessel" | "company" | "person" | "port" | "cargo" | "voyage";
  /** Derived chain role from the id namespace. */
  readonly role: CargoNodeRole;
  readonly label: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly grade: EvidenceGrade;
  readonly provenance: ReadonlyArray<CargoProvenance>;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export interface CargoGraphEdge {
  /** Deterministic: `${type}::${fromId}->${toId}`. */
  readonly id: string;
  readonly type: CargoEdgeType;
  readonly fromId: string;
  readonly toId: string;
  /** Why this relationship exists, in officer language. */
  readonly explanation: string;
  readonly grade: EvidenceGrade;
  readonly provenance: ReadonlyArray<CargoProvenance>;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** 0..1 corroboration weight — grows with distinct supporting sources. */
  readonly weight: number;
}

export interface CargoPath {
  readonly nodeIds: ReadonlyArray<string>;
  readonly edgeIds: ReadonlyArray<string>;
  readonly hops: number;
  /** Weakest grade along the path — a chain is only as strong as its
   *  weakest evidenced link. */
  readonly grade: EvidenceGrade;
  /** Officer-readable rendering of the path. */
  readonly narrative: string;
}

export interface CargoRelatedEntity {
  readonly node: CargoGraphNode;
  readonly hops: number;
  readonly viaEdgeTypes: ReadonlyArray<CargoEdgeType>;
  readonly grade: EvidenceGrade;
  readonly reason: string;
}

export interface CargoTimelineEvent {
  readonly at: string;
  readonly nodeId: string;
  readonly role: CargoNodeRole;
  readonly label: string;
  readonly description: string;
  readonly grade: EvidenceGrade;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly evidenceIds: ReadonlyArray<string>;
}

export interface CargoChainStep {
  readonly role: CargoNodeRole;
  readonly nodes: ReadonlyArray<CargoGraphNode>;
  /** True when no evidence reached this rung of the chain. */
  readonly missing: boolean;
}

export interface CargoInvestigationContext {
  readonly focusId: string;
  readonly focus: CargoGraphNode | null;
  readonly chain: ReadonlyArray<CargoChainStep>;
  readonly related: ReadonlyArray<CargoRelatedEntity>;
  readonly timeline: ReadonlyArray<CargoTimelineEvent>;
  /** Chain rungs with no evidence — stated openly, never inferred away. */
  readonly gaps: ReadonlyArray<CargoNodeRole>;
  readonly evidenceCount: number;
  readonly sources: ReadonlyArray<ConnectorId>;
  /** Weakest grade across the reconstructed context. */
  readonly grade: EvidenceGrade;
  readonly summary: ReadonlyArray<string>;
}

export interface CargoGraphStats {
  readonly nodes: number;
  readonly edges: number;
  readonly byRole: Readonly<Record<string, number>>;
  readonly byEdgeType: Readonly<Record<string, number>>;
  readonly sources: ReadonlyArray<ConnectorId>;
  readonly evidenceRecords: number;
}
