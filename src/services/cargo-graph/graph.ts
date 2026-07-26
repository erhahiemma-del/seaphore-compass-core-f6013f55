/**
 * SPRINT CAP-03 — Cargo Knowledge Graph · store + builder.
 *
 * The graph is pure data: deterministic upsert, evidence-preserving
 * merge, bounded traversal. It is built exclusively from Canonical UIP
 * evidence (`NormalizedEvidence`) — never from a provider payload, never
 * from mock data, never from a UI component.
 *
 * Invariants (identical to the MKG, restated because they are load-bearing):
 *   1. Nodes merge by canonical entity id; attributes and provenance
 *      accumulate and the node grade is recomputed from ALL supporting
 *      evidence on every write.
 *   2. Edges merge by (type, from, to). A second source STRENGTHENS an
 *      edge — it never overwrites it.
 *   3. `provenance.length > 0` is enforced on every write. No evidence,
 *      no claim.
 */
import type { ConnectorId, EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import { CARGO_EDGE_LABEL, CARGO_REL_BINDINGS, cargoRoleOf, strongestGrade } from "./model";
import type {
  CargoEdgeType,
  CargoGraphEdge,
  CargoGraphNode,
  CargoGraphStats,
  CargoNodeRole,
  CargoProvenance,
} from "./types";

const minIso = (a: string, b: string) => (a < b ? a : b);
const maxIso = (a: string, b: string) => (a > b ? a : b);

export interface UpsertCargoNode {
  readonly id: string;
  readonly kind: CargoGraphNode["kind"];
  readonly label: string;
  readonly role?: CargoNodeRole;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly provenance: ReadonlyArray<CargoProvenance>;
}

export interface UpsertCargoEdge {
  readonly type: CargoEdgeType;
  readonly fromId: string;
  readonly toId: string;
  readonly explanation?: string;
  readonly provenance: ReadonlyArray<CargoProvenance>;
}

export interface CargoNeighbour {
  readonly edge: CargoGraphEdge;
  readonly node: CargoGraphNode;
}

export class CargoKnowledgeGraph {
  private nodes = new Map<string, CargoGraphNode>();
  private edges = new Map<string, CargoGraphEdge>();
  private adj = new Map<string, Set<string>>();
  private evidenceIds = new Set<string>();

  // ───────────────────────────── writes ─────────────────────────────

  upsertNode(input: UpsertCargoNode): CargoGraphNode {
    if (input.provenance.length === 0) {
      throw new Error("[CKG] upsertNode requires at least one provenance entry");
    }
    const existing = this.nodes.get(input.id);
    const provenance = dedupe([...(existing?.provenance ?? []), ...input.provenance]);
    const observedAts = provenance.map((p) => p.observedAt);
    const node: CargoGraphNode = {
      id: input.id,
      kind: input.kind,
      role: input.role ?? existing?.role ?? cargoRoleOf(input.id, input.kind),
      label: input.label || existing?.label || input.id,
      attributes: { ...(existing?.attributes ?? {}), ...(input.attributes ?? {}) },
      grade: strongestGrade(provenance.map((p) => p.grade)),
      provenance,
      firstSeen: observedAts.reduce((a, v) => (a ? minIso(a, v) : v), ""),
      lastSeen: observedAts.reduce((a, v) => (a ? maxIso(a, v) : v), ""),
    };
    this.nodes.set(node.id, node);
    if (!this.adj.has(node.id)) this.adj.set(node.id, new Set());
    for (const p of input.provenance) this.evidenceIds.add(p.evidenceId);
    return node;
  }

  upsertEdge(input: UpsertCargoEdge): CargoGraphEdge | null {
    if (input.provenance.length === 0) {
      throw new Error("[CKG] upsertEdge requires at least one provenance entry");
    }
    if (input.fromId === input.toId) return null;
    if (!this.nodes.has(input.fromId) || !this.nodes.has(input.toId)) return null;

    const id = `${input.type}::${input.fromId}->${input.toId}`;
    const existing = this.edges.get(id);
    const provenance = dedupe([...(existing?.provenance ?? []), ...input.provenance]);
    const sources = Array.from(new Set(provenance.map((p) => p.connectorId))).sort();
    const observedAts = provenance.map((p) => p.observedAt);
    const edge: CargoGraphEdge = {
      id,
      type: input.type,
      fromId: input.fromId,
      toId: input.toId,
      explanation:
        existing?.explanation ??
        input.explanation ??
        `${this.nodes.get(input.fromId)!.label} ${CARGO_EDGE_LABEL[input.type]} ${
          this.nodes.get(input.toId)!.label
        }`,
      grade: strongestGrade(provenance.map((p) => p.grade)),
      provenance,
      sources,
      firstSeen: observedAts.reduce((a, v) => (a ? minIso(a, v) : v), ""),
      lastSeen: observedAts.reduce((a, v) => (a ? maxIso(a, v) : v), ""),
      weight: Math.min(
        0.99,
        1 - 1 / (1 + sources.length) + Math.min(0.15, provenance.length * 0.01),
      ),
    };
    this.edges.set(edge.id, edge);
    this.adj.get(edge.fromId)!.add(edge.id);
    this.adj.get(edge.toId)!.add(edge.id);
    return edge;
  }

  // ───────────────────────────── reads ──────────────────────────────

  getNode(id: string): CargoGraphNode | undefined {
    return this.nodes.get(id);
  }
  getEdge(id: string): CargoGraphEdge | undefined {
    return this.edges.get(id);
  }
  allNodes(): ReadonlyArray<CargoGraphNode> {
    return Array.from(this.nodes.values());
  }
  allEdges(): ReadonlyArray<CargoGraphEdge> {
    return Array.from(this.edges.values());
  }
  nodesByRole(role: CargoNodeRole): ReadonlyArray<CargoGraphNode> {
    return this.allNodes().filter((n) => n.role === role);
  }

  /** Direct neighbours, following edges in either direction. */
  neighbours(id: string): ReadonlyArray<CargoNeighbour> {
    const out: CargoNeighbour[] = [];
    for (const eid of this.adj.get(id) ?? []) {
      const edge = this.edges.get(eid);
      if (!edge) continue;
      const other = this.nodes.get(edge.fromId === id ? edge.toId : edge.fromId);
      if (other) out.push({ edge, node: other });
    }
    return out.sort((a, b) => a.edge.id.localeCompare(b.edge.id));
  }

  stats(): CargoGraphStats {
    const byRole: Record<string, number> = {};
    for (const n of this.allNodes()) byRole[n.role] = (byRole[n.role] ?? 0) + 1;
    const byEdgeType: Record<string, number> = {};
    const sources = new Set<ConnectorId>();
    for (const e of this.allEdges()) {
      byEdgeType[e.type] = (byEdgeType[e.type] ?? 0) + 1;
      for (const s of e.sources) sources.add(s);
    }
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      byRole,
      byEdgeType,
      sources: Array.from(sources).sort(),
      evidenceRecords: this.evidenceIds.size,
    };
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adj.clear();
    this.evidenceIds.clear();
  }
}

// ─────────────────────────────── builder ─────────────────────────────

export interface BuildCargoGraphResult {
  readonly graph: CargoKnowledgeGraph;
  /** Evidence records that carried no usable entity — reported, not hidden. */
  readonly skipped: number;
  /** `rel.*` references pointing at entities no evidence described. */
  readonly danglingRefs: ReadonlyArray<string>;
}

/**
 * Build the Cargo Knowledge Graph from Canonical UIP evidence.
 *
 * Two passes: nodes first (so an edge can never reference a node that no
 * evidence created), then relationships from the frozen `rel.*` binding
 * table.
 */
export function buildCargoGraph(
  evidence: ReadonlyArray<NormalizedEvidence>,
): BuildCargoGraphResult {
  const graph = new CargoKnowledgeGraph();
  let skipped = 0;
  const dangling = new Set<string>();

  const prov = (e: NormalizedEvidence): CargoProvenance => ({
    connectorId: e.source,
    sourceName: e.sourceName,
    evidenceId: e.id,
    observedAt: e.observedAt,
    grade: e.grade,
  });

  // Pass 1 — nodes.
  for (const e of evidence) {
    const ref = e.entity;
    if (!ref?.id) {
      skipped += 1;
      continue;
    }
    graph.upsertNode({
      id: ref.id,
      kind: ref.kind,
      label: ref.label ?? ref.id,
      attributes: attributesOf(e),
      provenance: [prov(e)],
    });
    // Referenced entities become nodes only when a label-bearing reference
    // exists; otherwise they are minted as bare canonical ids so the chain
    // is not silently broken.
    for (const b of CARGO_REL_BINDINGS) {
      const target = refId(e.fields[b.field]);
      if (!target) continue;
      graph.upsertNode({
        id: target,
        kind: kindOfId(target),
        label: target,
        provenance: [prov(e)],
      });
    }
  }

  // Pass 2 — relationships.
  for (const e of evidence) {
    const from = e.entity?.id;
    if (!from) continue;
    for (const b of CARGO_REL_BINDINGS) {
      const target = refId(e.fields[b.field]);
      if (!target) continue;
      if (!graph.getNode(target)) {
        dangling.add(target);
        continue;
      }
      const edge = graph.upsertEdge({
        type: b.type,
        fromId: b.reverse ? target : from,
        toId: b.reverse ? from : target,
        provenance: [prov(e)],
      });
      if (!edge && from !== target) dangling.add(target);
    }
  }

  return { graph, skipped, danglingRefs: Array.from(dangling).sort() };
}

// ─────────────────────────────── helpers ─────────────────────────────

function dedupe(entries: ReadonlyArray<CargoProvenance>): ReadonlyArray<CargoProvenance> {
  const seen = new Set<string>();
  const out: CargoProvenance[] = [];
  for (const e of entries) {
    const key = `${e.connectorId}::${e.evidenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) =>
    a.observedAt !== b.observedAt
      ? a.observedAt.localeCompare(b.observedAt)
      : a.evidenceId.localeCompare(b.evidenceId),
  );
  return out;
}

function refId(value: unknown): string | null {
  return typeof value === "string" && value.includes(":") ? value : null;
}

function kindOfId(id: string): CargoGraphNode["kind"] {
  const prefix = id.split(":")[0]?.toLowerCase();
  switch (prefix) {
    case "vessel":
      return "vessel";
    case "company":
      return "company";
    case "person":
      return "person";
    case "port":
      return "port";
    case "voyage":
      return "voyage";
    default:
      return "cargo";
  }
}

/** Scalar, officer-meaningful fields only — never raw provider payloads
 *  and never `rel.*` pointers (those become edges, not attributes). */
function attributesOf(
  e: NormalizedEvidence,
): Readonly<Record<string, string | number | boolean>> {
  const out: Record<string, string | number | boolean> = {
    evidenceKind: e.kind,
  };
  for (const [k, v] of Object.entries(e.fields)) {
    if (k.startsWith("rel.")) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export type { EvidenceGrade };
