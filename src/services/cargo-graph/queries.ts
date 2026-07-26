/**
 * SPRINT CAP-03 — Cargo Knowledge Graph · query interface.
 *
 * This is the ONLY surface OIE, the Copilot and the workspace use to read
 * the cargo graph. It supports the four mandated query classes:
 *
 *   1. Relationship traversal      → `traverse`, `pathsBetween`
 *   2. Related entity discovery    → `relatedEntities`
 *   3. Investigation context       → `investigationContext`
 *   4. Timeline reconstruction     → `timeline`
 *
 * Every result carries provenance and an OC-001 grade. A path is graded
 * at its WEAKEST link — a chain is only as strong as its weakest
 * evidenced hop. Gaps are reported explicitly; the query layer never
 * infers a missing rung of the chain into existence.
 */
import type { ConnectorId, EvidenceGrade } from "@/services/ial/types";
import type { CargoKnowledgeGraph } from "./graph";
import { CARGO_EDGE_LABEL, CARGO_ROLE_LABEL, weakestGrade } from "./model";
import {
  CARGO_CHAIN,
  type CargoChainStep,
  type CargoEdgeType,
  type CargoGraphEdge,
  type CargoGraphNode,
  type CargoInvestigationContext,
  type CargoNodeRole,
  type CargoPath,
  type CargoRelatedEntity,
  type CargoTimelineEvent,
} from "./types";

export interface CargoTraversalOptions {
  readonly maxDepth?: number;
  readonly roles?: ReadonlyArray<CargoNodeRole>;
  readonly edgeTypes?: ReadonlyArray<CargoEdgeType>;
  readonly maxResults?: number;
}

export interface CargoGraphQuery {
  readonly graph: CargoKnowledgeGraph;
  node(id: string): CargoGraphNode | null;
  search(term: string, limit?: number): ReadonlyArray<CargoGraphNode>;
  traverse(fromId: string, opts?: CargoTraversalOptions): ReadonlyArray<CargoPath>;
  pathsBetween(
    fromId: string,
    toId: string,
    opts?: CargoTraversalOptions,
  ): ReadonlyArray<CargoPath>;
  relatedEntities(
    id: string,
    opts?: CargoTraversalOptions,
  ): ReadonlyArray<CargoRelatedEntity>;
  timeline(id: string, opts?: CargoTraversalOptions): ReadonlyArray<CargoTimelineEvent>;
  investigationContext(
    id: string,
    opts?: CargoTraversalOptions,
  ): CargoInvestigationContext;
}

export function createCargoGraphQuery(graph: CargoKnowledgeGraph): CargoGraphQuery {
  const narrate = (nodeIds: ReadonlyArray<string>, edgeIds: ReadonlyArray<string>): string => {
    const parts: string[] = [];
    for (let i = 0; i < edgeIds.length; i += 1) {
      const edge = graph.getEdge(edgeIds[i]);
      const from = graph.getNode(nodeIds[i]);
      const to = graph.getNode(nodeIds[i + 1]);
      if (!edge || !from || !to) continue;
      if (i === 0) parts.push(from.label);
      parts.push(`—[${CARGO_EDGE_LABEL[edge.type]}]→ ${to.label}`);
    }
    return parts.join(" ");
  };

  interface Frame {
    nodeId: string;
    nodePath: string[];
    edgePath: string[];
    grades: EvidenceGrade[];
    edgeTypes: CargoEdgeType[];
  }

  function bfs(fromId: string, opts: CargoTraversalOptions): Frame[] {
    const maxDepth = opts.maxDepth ?? 3;
    const maxResults = opts.maxResults ?? 200;
    if (!graph.getNode(fromId)) return [];
    const out: Frame[] = [];
    const queue: Frame[] = [
      { nodeId: fromId, nodePath: [fromId], edgePath: [], grades: [], edgeTypes: [] },
    ];
    const seen = new Set([fromId]);
    while (queue.length && out.length < maxResults) {
      const frame = queue.shift()!;
      if (frame.edgePath.length > 0) out.push(frame);
      if (frame.edgePath.length >= maxDepth) continue;
      for (const { edge, node } of graph.neighbours(frame.nodeId)) {
        if (opts.edgeTypes && !opts.edgeTypes.includes(edge.type)) continue;
        if (opts.roles && !opts.roles.includes(node.role)) continue;
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        queue.push({
          nodeId: node.id,
          nodePath: [...frame.nodePath, node.id],
          edgePath: [...frame.edgePath, edge.id],
          grades: [...frame.grades, edge.grade],
          edgeTypes: [...frame.edgeTypes, edge.type],
        });
      }
    }
    return out;
  }

  const toPath = (f: Frame): CargoPath => ({
    nodeIds: f.nodePath.slice(),
    edgeIds: f.edgePath.slice(),
    hops: f.edgePath.length,
    grade: weakestGrade(f.grades),
    narrative: narrate(f.nodePath, f.edgePath),
  });

  return {
    graph,

    node(id) {
      return graph.getNode(id) ?? null;
    },

    search(term, limit = 10) {
      const q = term.trim().toLowerCase();
      if (!q) return [];
      return graph
        .allNodes()
        .filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, limit);
    },

    traverse(fromId, opts = {}) {
      return bfs(fromId, opts).map(toPath);
    },

    pathsBetween(fromId, toId, opts = {}) {
      const maxDepth = opts.maxDepth ?? 4;
      const maxResults = opts.maxResults ?? 10;
      if (!graph.getNode(fromId) || !graph.getNode(toId) || fromId === toId) return [];
      const results: CargoPath[] = [];
      const visited = new Set([fromId]);
      const walk = (
        nodeId: string,
        nodePath: string[],
        edgePath: string[],
        grades: EvidenceGrade[],
      ): void => {
        if (results.length >= maxResults) return;
        if (nodeId === toId && edgePath.length > 0) {
          results.push({
            nodeIds: nodePath.slice(),
            edgeIds: edgePath.slice(),
            hops: edgePath.length,
            grade: weakestGrade(grades),
            narrative: narrate(nodePath, edgePath),
          });
          return;
        }
        if (edgePath.length >= maxDepth) return;
        for (const { edge, node } of graph.neighbours(nodeId)) {
          if (visited.has(node.id)) continue;
          if (opts.edgeTypes && !opts.edgeTypes.includes(edge.type)) continue;
          visited.add(node.id);
          walk(node.id, [...nodePath, node.id], [...edgePath, edge.id], [...grades, edge.grade]);
          visited.delete(node.id);
        }
      };
      walk(fromId, [fromId], [], []);
      return results.sort((a, b) =>
        a.hops !== b.hops ? a.hops - b.hops : a.narrative.localeCompare(b.narrative),
      );
    },

    relatedEntities(id, opts = {}) {
      const limit = opts.maxResults ?? 25;
      const best = new Map<string, CargoRelatedEntity>();
      for (const frame of bfs(id, { ...opts, maxResults: 400 })) {
        const node = graph.getNode(frame.nodeId);
        if (!node) continue;
        const existing = best.get(node.id);
        if (existing && existing.hops <= frame.edgePath.length) continue;
        best.set(node.id, {
          node,
          hops: frame.edgePath.length,
          viaEdgeTypes: frame.edgeTypes.slice(),
          grade: weakestGrade(frame.grades),
          reason: `${CARGO_ROLE_LABEL[node.role]} reached in ${frame.edgePath.length} hop${
            frame.edgePath.length === 1 ? "" : "s"
          } via ${frame.edgeTypes.map((t) => CARGO_EDGE_LABEL[t]).join(" → ")}.`,
        });
      }
      return Array.from(best.values())
        .sort((a, b) => (a.hops !== b.hops ? a.hops - b.hops : a.node.label.localeCompare(b.node.label)))
        .slice(0, limit);
    },

    timeline(id, opts = {}) {
      const focus = graph.getNode(id);
      if (!focus) return [];
      const nodes: CargoGraphNode[] = [focus];
      for (const rel of this.relatedEntities(id, { ...opts, maxResults: 60 })) {
        nodes.push(rel.node);
      }
      const events: CargoTimelineEvent[] = [];
      for (const node of nodes) {
        for (const p of node.provenance) {
          events.push({
            at: p.observedAt,
            nodeId: node.id,
            role: node.role,
            label: node.label,
            description: `${CARGO_ROLE_LABEL[node.role]} observed by ${p.sourceName}.`,
            grade: p.grade,
            sources: [p.connectorId],
            evidenceIds: [p.evidenceId],
          });
        }
      }
      for (const edge of graph.allEdges()) {
        if (!nodes.some((n) => n.id === edge.fromId || n.id === edge.toId)) continue;
        events.push({
          at: edge.lastSeen || edge.firstSeen,
          nodeId: edge.fromId,
          role: graph.getNode(edge.fromId)?.role ?? "shipment",
          label: edge.explanation,
          description: `Relationship "${CARGO_EDGE_LABEL[edge.type]}" asserted by ${edge.sources.join(
            ", ",
          )}.`,
          grade: edge.grade,
          sources: edge.sources,
          evidenceIds: edge.provenance.map((p) => p.evidenceId),
        });
      }
      return events
        .sort((a, b) => (a.at === b.at ? a.nodeId.localeCompare(b.nodeId) : a.at.localeCompare(b.at)))
        .slice(0, opts.maxResults ?? 100);
    },

    investigationContext(id, opts = {}) {
      const focus = graph.getNode(id) ?? null;
      if (!focus) {
        return {
          focusId: id,
          focus: null,
          chain: CARGO_CHAIN.map((role) => ({ role, nodes: [], missing: true })),
          related: [],
          timeline: [],
          gaps: CARGO_CHAIN.slice(),
          evidenceCount: 0,
          sources: [],
          grade: "UNKNOWN",
          summary: [
            `No Canonical UIP evidence describes ${id}. The Cargo Knowledge Graph reports the absence rather than inferring a chain.`,
          ],
        };
      }

      const related = this.relatedEntities(id, { maxDepth: opts.maxDepth ?? 4, maxResults: 60 });
      const inScope: CargoGraphNode[] = [focus, ...related.map((r) => r.node)];

      const chain: CargoChainStep[] = CARGO_CHAIN.map((role) => {
        const nodes = inScope.filter((n) => n.role === role);
        return { role, nodes, missing: nodes.length === 0 };
      });
      const gaps = chain.filter((s) => s.missing).map((s) => s.role);

      const evidenceIds = new Set<string>();
      const sources = new Set<ConnectorId>();
      const grades: EvidenceGrade[] = [];
      for (const n of inScope) {
        for (const p of n.provenance) {
          evidenceIds.add(p.evidenceId);
          sources.add(p.connectorId);
          grades.push(p.grade);
        }
      }

      const timeline = this.timeline(id, { maxDepth: opts.maxDepth ?? 4, maxResults: 60 });
      const grade = weakestGrade(grades);

      const summary: string[] = [
        `${CARGO_ROLE_LABEL[focus.role]} ${focus.label} is connected to ${related.length} related entit${
          related.length === 1 ? "y" : "ies"
        } across ${evidenceIds.size} evidence record${evidenceIds.size === 1 ? "" : "s"}.`,
        `Supporting sources: ${sources.size > 0 ? Array.from(sources).sort().join(", ") : "none"}. Weakest supporting grade: ${grade}.`,
      ];
      summary.push(
        gaps.length === 0
          ? "Every rung of the cargo chain is evidenced for this context."
          : `Chain gaps with no evidence: ${gaps.map((g) => CARGO_ROLE_LABEL[g]).join(", ")}. These are reported, not inferred.`,
      );
      summary.push(
        "The graph presents relationships and their provenance. The officer decides what they mean.",
      );

      return {
        focusId: id,
        focus,
        chain,
        related,
        timeline,
        gaps,
        evidenceCount: evidenceIds.size,
        sources: Array.from(sources).sort(),
        grade,
        summary,
      };
    },
  };
}

/** Citation lines for a set of edges — used by OIE and the Copilot so a
 *  graph claim always renders with its evidence. */
export function cargoEdgeCitations(edges: ReadonlyArray<CargoGraphEdge>): ReadonlyArray<string> {
  const out = new Set<string>();
  for (const e of edges) {
    for (const p of e.provenance) {
      out.add(`${p.sourceName} · ${p.evidenceId} · ${p.observedAt} · ${p.grade}`);
    }
  }
  return Array.from(out).sort();
}
