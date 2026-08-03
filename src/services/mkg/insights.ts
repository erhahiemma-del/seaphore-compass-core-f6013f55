/**
 * MKG — Graph insights for OSAE / Copilot / Executive Briefs.
 *
 * Pure functions over a `MaritimeKnowledgeGraph`. Each insight is
 * explainable — it returns the concrete nodes, edges, and provenance
 * that justify it. No thresholds are hidden.
 */
import type { MaritimeKnowledgeGraph } from "./graph";
import type { MkgEdge, MkgNode, MkgPath } from "./types";

export interface EntitySummary {
  readonly node: MkgNode;
  readonly directNeighbors: number;
  readonly connectorsCiting: ReadonlyArray<string>;
  readonly relationshipsByType: Readonly<Record<string, number>>;
  readonly sanctionsHits: ReadonlyArray<MkgNode>;
  readonly incidents: ReadonlyArray<MkgNode>;
  readonly inspections: ReadonlyArray<MkgNode>;
  readonly owners: ReadonlyArray<MkgNode>;
  readonly ports: ReadonlyArray<MkgNode>;
  readonly cargoes: ReadonlyArray<MkgNode>;
  readonly hasContradictions: boolean;
}

export function summariseEntity(
  graph: MaritimeKnowledgeGraph,
  entityId: string,
): EntitySummary | null {
  const node = graph.getNode(entityId);
  if (!node) return null;
  const neighbours = graph.neighbors(entityId);
  const relationshipsByType: Record<string, number> = {};
  const connectors = new Set<string>();
  const bucket = (kind: MkgNode["kind"]): MkgNode[] =>
    neighbours.filter((n) => n.neighbor.kind === kind).map((n) => n.neighbor);

  for (const { edge } of neighbours) {
    relationshipsByType[edge.type] = (relationshipsByType[edge.type] ?? 0) + 1;
    for (const s of edge.sources) connectors.add(s);
  }
  for (const p of node.provenance) connectors.add(p.connectorId);

  return {
    node,
    directNeighbors: neighbours.length,
    connectorsCiting: Array.from(connectors).sort(),
    relationshipsByType,
    sanctionsHits: bucket("sanction"),
    incidents: bucket("incident"),
    inspections: bucket("inspection"),
    owners: neighbours
      .filter(
        (n) => n.edge.type === "OWNS" || n.edge.type === "OPERATES" || n.edge.type === "MANAGES",
      )
      .map((n) => n.neighbor),
    ports: bucket("port"),
    cargoes: bucket("cargo"),
    hasContradictions: node.hasContradictions,
  };
}

/**
 * Hidden relationships: pairs of nodes with no direct edge but reachable
 * via ≤ maxDepth hops through a shared intermediary. Useful for
 * "vessel A and vessel B share the same beneficial owner two hops away"
 * style intelligence questions.
 */
export interface HiddenLink {
  readonly a: string;
  readonly b: string;
  readonly path: MkgPath;
  readonly rationale: string;
}

export function findHiddenLinks(
  graph: MaritimeKnowledgeGraph,
  seedId: string,
  maxDepth = 3,
): ReadonlyArray<HiddenLink> {
  const seed = graph.getNode(seedId);
  if (!seed) return [];
  const directIds = new Set(graph.neighbors(seedId).map((n) => n.neighbor.id));
  const paths = graph.traverse(seedId, { maxDepth });
  const out: HiddenLink[] = [];
  for (const p of paths) {
    if (p.hops < 2) continue;
    const target = p.nodeIds[p.nodeIds.length - 1];
    if (target === seedId) continue;
    if (directIds.has(target)) continue;
    const intermediary = graph.getNode(p.nodeIds[Math.floor(p.nodeIds.length / 2)]);
    out.push({
      a: seedId,
      b: target,
      path: p,
      rationale: intermediary
        ? `Indirect link via ${intermediary.label} (${intermediary.kind})`
        : "Indirect link via shared intermediary",
    });
  }
  return out;
}

/**
 * Conflicting identities: nodes where the IFE flagged contradictions,
 * OR nodes with ALIAS_OF edges coming from multiple identity schemes
 * with LOW-grade provenance. Officers must resolve these manually.
 */
export interface ConflictingIdentity {
  readonly node: MkgNode;
  readonly reason: string;
  readonly evidenceCount: number;
}

export function findConflictingIdentities(
  graph: MaritimeKnowledgeGraph,
): ReadonlyArray<ConflictingIdentity> {
  const out: ConflictingIdentity[] = [];
  for (const node of graph.getAllNodes()) {
    if (node.hasContradictions) {
      out.push({
        node,
        reason: "IFE surfaced field-level contradictions on this entity",
        evidenceCount: node.provenance.length,
      });
      continue;
    }
    const aliasEdges = graph
      .neighbors(node.id)
      .filter((n) => n.edge.type === "ALIAS_OF" && n.edge.toId === node.id);
    if (
      aliasEdges.length >= 2 &&
      aliasEdges.some((a) => a.edge.grade === "REPORTED" || a.edge.grade === "INFERRED")
    ) {
      out.push({
        node,
        reason: `Multiple id schemes merged with < CORROBORATED confidence (${aliasEdges.length} aliases)`,
        evidenceCount: node.provenance.length,
      });
    }
  }
  return out;
}

/**
 * Copilot-friendly traversal answer: a plain-English description of the
 * shortest evidence-backed path between two entities, with citations.
 */
export function describePath(graph: MaritimeKnowledgeGraph, path: MkgPath): string {
  if (path.nodeIds.length === 0) return "";
  const segments: string[] = [];
  for (let i = 0; i < path.edgeIds.length; i += 1) {
    const edge = graph.getEdge(path.edgeIds[i]);
    const from = graph.getNode(path.nodeIds[i]);
    const to = graph.getNode(path.nodeIds[i + 1]);
    if (!edge || !from || !to) continue;
    segments.push(`${from.label} —[${edge.type} · ${edge.grade}]→ ${to.label}`);
  }
  return segments.join(" ; ");
}

export function edgeCitations(edge: MkgEdge): ReadonlyArray<string> {
  return edge.provenance.map(
    (p) => `${p.sourceName} (${p.evidenceId}) · ${p.grade} · ${p.observedAt}`,
  );
}
