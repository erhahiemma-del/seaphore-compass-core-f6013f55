/**
 * Maritime Knowledge Graph — in-memory graph store with deterministic
 * upsert, evidence-preserving merge, and bounded traversal.
 *
 * The graph is pure data — no I/O, no async, no store side-effects. A
 * higher layer (the Zustand store in `./store.ts`, or a caller) owns the
 * lifecycle.
 *
 * Invariants:
 *   1. `upsertNode` merges by canonical id. Aliases, attributes, and
 *      provenance accumulate. The node grade is recomputed on every
 *      write from ALL supporting evidence.
 *   2. `upsertEdge` merges by (type, from, to). Adding the same edge from
 *      a second connector STRENGTHENS it — it never overwrites. Weight
 *      grows with distinct-connector corroboration; grade is the
 *      strongest supporting grade (degraded when the edge is contested).
 *   3. Nothing enters the graph without provenance. `provenance` is
 *      required on every write.
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type {
  MkgEdge,
  MkgEdgeType,
  MkgNode,
  MkgNodeKind,
  MkgPath,
  MkgProvenance,
  MkgSnapshot,
} from "./types";

const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};
const GRADE_BY_RANK: EvidenceGrade[] = [
  "UNKNOWN",
  "INFERRED",
  "REPORTED",
  "OBSERVED",
  "CORROBORATED",
  "VERIFIED",
];

function strongestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  let best = 0;
  for (const g of grades) {
    const r = GRADE_RANK[g] ?? 0;
    if (r > best) best = r;
  }
  return GRADE_BY_RANK[best];
}

function degrade(g: EvidenceGrade, steps: number): EvidenceGrade {
  const r = Math.max(0, (GRADE_RANK[g] ?? 0) - steps);
  return GRADE_BY_RANK[r];
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}
function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

export interface UpsertNodeInput {
  readonly id: string;
  readonly kind: MkgNodeKind;
  readonly label: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly hasContradictions?: boolean;
  readonly provenance: ReadonlyArray<MkgProvenance>;
}

export interface UpsertEdgeInput {
  readonly type: MkgEdgeType;
  readonly fromId: string;
  readonly toId: string;
  readonly directed?: boolean;
  readonly explanation: string;
  readonly provenance: ReadonlyArray<MkgProvenance>;
}

export interface TraversalOptions {
  readonly maxDepth?: number; // default 3
  readonly kinds?: ReadonlyArray<MkgNodeKind>;
  readonly edgeTypes?: ReadonlyArray<MkgEdgeType>;
  readonly maxPaths?: number; // default 25
}

export class MaritimeKnowledgeGraph {
  private nodes = new Map<string, MkgNode>();
  private edges = new Map<string, MkgEdge>();
  /** Adjacency: nodeId → Set<edgeId>. Undirected — traversal walks both. */
  private adj = new Map<string, Set<string>>();

  // ─────────────────────────────── writes ────────────────────────────

  upsertNode(input: UpsertNodeInput): MkgNode {
    if (input.provenance.length === 0) {
      throw new Error("[MKG] upsertNode requires at least one provenance entry");
    }
    const existing = this.nodes.get(input.id);
    const now = new Date().toISOString();

    const mergedProvenance = dedupeProvenance([
      ...(existing?.provenance ?? []),
      ...input.provenance,
    ]);
    const aliases = Array.from(
      new Set([...(existing?.aliases ?? []), ...(input.aliases ?? [])]),
    ).filter((a) => a !== input.id);
    const attributes = { ...(existing?.attributes ?? {}), ...(input.attributes ?? {}) };
    const grade = strongestGrade(mergedProvenance.map((p) => p.grade));
    const hasContradictions =
      (existing?.hasContradictions ?? false) || Boolean(input.hasContradictions);
    const finalGrade = hasContradictions ? degrade(grade, 1) : grade;

    const observedAts = mergedProvenance.map((p) => p.observedAt);
    const firstSeen = observedAts.reduce(
      (acc, v) => (acc ? minIso(acc, v) : v),
      existing?.firstSeen ?? "",
    );
    const lastSeen = observedAts.reduce(
      (acc, v) => (acc ? maxIso(acc, v) : v),
      existing?.lastSeen ?? "",
    );

    const node: MkgNode = {
      id: input.id,
      kind: input.kind,
      label: input.label || existing?.label || input.id,
      aliases,
      attributes,
      grade: finalGrade,
      hasContradictions,
      provenance: mergedProvenance,
      firstSeen: firstSeen || now,
      lastSeen: lastSeen || now,
    };
    this.nodes.set(node.id, node);
    if (!this.adj.has(node.id)) this.adj.set(node.id, new Set());
    return node;
  }

  upsertEdge(input: UpsertEdgeInput): MkgEdge {
    if (input.provenance.length === 0) {
      throw new Error("[MKG] upsertEdge requires at least one provenance entry");
    }
    if (input.fromId === input.toId) {
      throw new Error(`[MKG] refusing self-loop on ${input.fromId}`);
    }
    if (!this.nodes.has(input.fromId) || !this.nodes.has(input.toId)) {
      throw new Error(
        `[MKG] upsertEdge references unknown node(s): ${input.fromId} -> ${input.toId}`,
      );
    }
    const id = `${input.type}::${input.fromId}->${input.toId}`;
    const existing = this.edges.get(id);

    const mergedProvenance = dedupeProvenance([
      ...(existing?.provenance ?? []),
      ...input.provenance,
    ]);
    const sources = Array.from(new Set(mergedProvenance.map((p) => p.connectorId)));
    const grade = strongestGrade(mergedProvenance.map((p) => p.grade));
    // Weight: 1 - 1/(1 + distinct-connector count) capped at 0.95, plus a
    // small bump for record count. Deterministic, monotonic with corroboration.
    const weight = Math.min(
      0.99,
      1 - 1 / (1 + sources.length) + Math.min(0.15, mergedProvenance.length * 0.01),
    );
    const observedAts = mergedProvenance.map((p) => p.observedAt);
    const firstSeen = observedAts.reduce((acc, v) => (acc ? minIso(acc, v) : v), "");
    const lastSeen = observedAts.reduce((acc, v) => (acc ? maxIso(acc, v) : v), "");

    const edge: MkgEdge = {
      id,
      type: input.type,
      fromId: input.fromId,
      toId: input.toId,
      directed: input.directed ?? true,
      explanation: existing?.explanation ?? input.explanation,
      grade,
      provenance: mergedProvenance,
      sources,
      firstSeen,
      lastSeen,
      weight,
    };
    this.edges.set(edge.id, edge);
    this.adj.get(input.fromId)!.add(edge.id);
    this.adj.get(input.toId)!.add(edge.id);
    return edge;
  }

  // ─────────────────────────────── reads ─────────────────────────────

  getNode(id: string): MkgNode | undefined {
    return this.nodes.get(id);
  }
  getEdge(id: string): MkgEdge | undefined {
    return this.edges.get(id);
  }
  getAllNodes(): ReadonlyArray<MkgNode> {
    return Array.from(this.nodes.values());
  }
  getAllEdges(): ReadonlyArray<MkgEdge> {
    return Array.from(this.edges.values());
  }
  size(): { nodes: number; edges: number } {
    return { nodes: this.nodes.size, edges: this.edges.size };
  }

  /** Direct neighbours of a node, following edges in either direction. */
  neighbors(id: string): ReadonlyArray<{ edge: MkgEdge; neighbor: MkgNode }> {
    const out: { edge: MkgEdge; neighbor: MkgNode }[] = [];
    const eids = this.adj.get(id);
    if (!eids) return out;
    for (const eid of eids) {
      const edge = this.edges.get(eid);
      if (!edge) continue;
      const otherId = edge.fromId === id ? edge.toId : edge.fromId;
      const other = this.nodes.get(otherId);
      if (other) out.push({ edge, neighbor: other });
    }
    return out;
  }

  /**
   * Bounded BFS traversal from `startId`. Returns every reachable node
   * within `maxDepth` hops with the path back to the start. Deterministic
   * ordering — hop first, then edge id.
   */
  traverse(startId: string, opts: TraversalOptions = {}): ReadonlyArray<MkgPath> {
    const maxDepth = opts.maxDepth ?? 3;
    const maxPaths = opts.maxPaths ?? 200;
    if (!this.nodes.has(startId)) return [];

    const paths: MkgPath[] = [];
    interface Frame {
      nodeId: string;
      nodePath: string[];
      edgePath: string[];
      grades: EvidenceGrade[];
    }
    const queue: Frame[] = [{ nodeId: startId, nodePath: [startId], edgePath: [], grades: [] }];
    const seen = new Set<string>([startId]);

    while (queue.length && paths.length < maxPaths) {
      const frame = queue.shift()!;
      if (frame.nodePath.length > 1) {
        paths.push({
          nodeIds: frame.nodePath.slice(),
          edgeIds: frame.edgePath.slice(),
          grade: strongestGrade(frame.grades),
          hops: frame.edgePath.length,
        });
      }
      if (frame.edgePath.length >= maxDepth) continue;

      const nbrs = this.neighbors(frame.nodeId)
        .slice()
        .sort((a, b) => a.edge.id.localeCompare(b.edge.id));
      for (const { edge, neighbor } of nbrs) {
        if (opts.edgeTypes && !opts.edgeTypes.includes(edge.type)) continue;
        if (opts.kinds && !opts.kinds.includes(neighbor.kind)) continue;
        if (seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        queue.push({
          nodeId: neighbor.id,
          nodePath: [...frame.nodePath, neighbor.id],
          edgePath: [...frame.edgePath, edge.id],
          grades: [...frame.grades, edge.grade],
        });
      }
    }
    return paths;
  }

  /**
   * All simple paths (no repeated nodes) between two nodes up to
   * `maxDepth` hops. Bounded to `maxPaths` results.
   */
  findPaths(fromId: string, toId: string, opts: TraversalOptions = {}): ReadonlyArray<MkgPath> {
    const maxDepth = opts.maxDepth ?? 4;
    const maxPaths = opts.maxPaths ?? 25;
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return [];
    if (fromId === toId) return [];

    const results: MkgPath[] = [];
    const walk = (
      nodeId: string,
      nodePath: string[],
      edgePath: string[],
      grades: EvidenceGrade[],
      visited: Set<string>,
    ): void => {
      if (results.length >= maxPaths) return;
      if (nodeId === toId && nodePath.length > 1) {
        results.push({
          nodeIds: nodePath.slice(),
          edgeIds: edgePath.slice(),
          grade: strongestGrade(grades),
          hops: edgePath.length,
        });
        return;
      }
      if (edgePath.length >= maxDepth) return;

      const nbrs = this.neighbors(nodeId)
        .slice()
        .sort((a, b) => a.edge.id.localeCompare(b.edge.id));
      for (const { edge, neighbor } of nbrs) {
        if (visited.has(neighbor.id)) continue;
        if (opts.edgeTypes && !opts.edgeTypes.includes(edge.type)) continue;
        if (opts.kinds && neighbor.id !== toId && !opts.kinds.includes(neighbor.kind)) continue;
        visited.add(neighbor.id);
        walk(
          neighbor.id,
          [...nodePath, neighbor.id],
          [...edgePath, edge.id],
          [...grades, edge.grade],
          visited,
        );
        visited.delete(neighbor.id);
      }
    };
    const start = new Set<string>([fromId]);
    walk(fromId, [fromId], [], [], start);
    // Deterministic: shortest first, then edge sequence lexicographic.
    results.sort((a, b) =>
      a.hops !== b.hops ? a.hops - b.hops : a.edgeIds.join("|").localeCompare(b.edgeIds.join("|")),
    );
    return results;
  }

  toSnapshot(): MkgSnapshot {
    const nodes = this.getAllNodes();
    const edges = this.getAllEdges();
    const byKind: Record<string, number> = {};
    for (const n of nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    const byEdgeType: Record<string, number> = {};
    const connectors = new Set<string>();
    for (const e of edges) {
      byEdgeType[e.type] = (byEdgeType[e.type] ?? 0) + 1;
      for (const s of e.sources) connectors.add(s);
    }
    return {
      nodes,
      edges,
      generatedAt: new Date().toISOString(),
      stats: {
        nodes: nodes.length,
        edges: edges.length,
        byKind,
        byEdgeType,
        connectors: Array.from(connectors).sort() as never,
      },
    };
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adj.clear();
  }
}

function dedupeProvenance(entries: ReadonlyArray<MkgProvenance>): ReadonlyArray<MkgProvenance> {
  const seen = new Set<string>();
  const out: MkgProvenance[] = [];
  for (const e of entries) {
    const key = `${e.connectorId}::${e.evidenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  // Deterministic order: by observedAt then evidenceId.
  out.sort((a, b) =>
    a.observedAt !== b.observedAt
      ? a.observedAt.localeCompare(b.observedAt)
      : a.evidenceId.localeCompare(b.evidenceId),
  );
  return out;
}

export { strongestGrade, degrade };
