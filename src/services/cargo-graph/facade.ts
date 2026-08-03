/**
 * SPRINT CAP-03 — Cargo Knowledge Graph · OIE + Copilot facade.
 *
 * OIE and the Copilot never touch the graph store directly. They call
 * these four named operations, each of which returns an officer-readable
 * answer plus the citations that back it. This keeps the IBE 9-step
 * response contract satisfiable: every claim the Copilot renders can be
 * traced to evidence ids.
 *
 * The facade is deliberately read-only. It cannot fetch, cannot mutate,
 * and cannot invent an entity that no evidence described.
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import { buildCargoGraph } from "./graph";
import { CARGO_ROLE_LABEL } from "./model";
import { cargoEdgeCitations, createCargoGraphQuery, type CargoGraphQuery } from "./queries";
import type { CargoGraphEdge } from "./types";

export type CargoGraphOperation =
  | "relationship-traversal"
  | "related-entity-discovery"
  | "investigation-context"
  | "timeline-reconstruction";

export interface CargoGraphAnswer {
  readonly operation: CargoGraphOperation;
  readonly focusId: string;
  /** Officer-readable lines. Never a raw object dump. */
  readonly lines: ReadonlyArray<string>;
  /** `source · evidenceId · observedAt · grade` citation lines. */
  readonly citations: ReadonlyArray<string>;
  /** Structured payload for UI rendering. */
  readonly data: unknown;
  /** True when the graph holds no evidence for the focus entity. */
  readonly empty: boolean;
}

export interface CargoGraphFacade {
  readonly query: CargoGraphQuery;
  traverse(focusId: string, maxDepth?: number): CargoGraphAnswer;
  related(focusId: string, maxDepth?: number): CargoGraphAnswer;
  context(focusId: string): CargoGraphAnswer;
  timeline(focusId: string): CargoGraphAnswer;
}

/** Build the graph from Canonical UIP evidence and expose the facade. */
export function cargoGraphFromEvidence(
  evidence: ReadonlyArray<NormalizedEvidence>,
): CargoGraphFacade {
  const { graph } = buildCargoGraph(evidence);
  return cargoGraphFacade(createCargoGraphQuery(graph));
}

export function cargoGraphFacade(query: CargoGraphQuery): CargoGraphFacade {
  const edgesOf = (edgeIds: ReadonlyArray<string>): CargoGraphEdge[] =>
    edgeIds.map((id) => query.graph.getEdge(id)).filter((e): e is CargoGraphEdge => Boolean(e));

  const missing = (focusId: string, operation: CargoGraphOperation): CargoGraphAnswer => ({
    operation,
    focusId,
    lines: [
      `The Cargo Knowledge Graph holds no evidence for ${focusId}.`,
      "Nothing is inferred in its place — acquire cargo evidence for this entity first.",
    ],
    citations: [],
    data: null,
    empty: true,
  });

  return {
    query,

    traverse(focusId, maxDepth = 3) {
      if (!query.node(focusId)) return missing(focusId, "relationship-traversal");
      const paths = query.traverse(focusId, { maxDepth, maxResults: 40 });
      const citations = cargoEdgeCitations(paths.flatMap((p) => edgesOf(p.edgeIds)));
      return {
        operation: "relationship-traversal",
        focusId,
        lines: [
          `${paths.length} evidenced relationship path${paths.length === 1 ? "" : "s"} within ${maxDepth} hops of ${focusId}.`,
          ...paths
            .slice(0, 12)
            .map((p) => `${p.narrative} (${p.hops} hop${p.hops === 1 ? "" : "s"}, ${p.grade})`),
        ],
        citations,
        data: paths,
        empty: paths.length === 0,
      };
    },

    related(focusId, maxDepth = 3) {
      if (!query.node(focusId)) return missing(focusId, "related-entity-discovery");
      const related = query.relatedEntities(focusId, { maxDepth, maxResults: 30 });
      return {
        operation: "related-entity-discovery",
        focusId,
        lines: [
          `${related.length} related entit${related.length === 1 ? "y" : "ies"} discovered from ${focusId}.`,
          ...related
            .slice(0, 15)
            .map(
              (r) =>
                `${CARGO_ROLE_LABEL[r.node.role]} · ${r.node.label} — ${r.reason} (${r.grade})`,
            ),
        ],
        citations: Array.from(
          new Set(
            related.flatMap((r) =>
              r.node.provenance.map(
                (p) => `${p.sourceName} · ${p.evidenceId} · ${p.observedAt} · ${p.grade}`,
              ),
            ),
          ),
        ).sort(),
        data: related,
        empty: related.length === 0,
      };
    },

    context(focusId) {
      const ctx = query.investigationContext(focusId, { maxDepth: 4 });
      return {
        operation: "investigation-context",
        focusId,
        lines: [
          ...ctx.summary,
          ...ctx.chain
            .filter((s) => !s.missing)
            .map(
              (s) =>
                `${CARGO_ROLE_LABEL[s.role]}: ${s.nodes
                  .map((n) => n.label)
                  .slice(0, 5)
                  .join(", ")}`,
            ),
        ],
        citations: Array.from(
          new Set(
            [ctx.focus, ...ctx.related.map((r) => r.node)]
              .filter(Boolean)
              .flatMap((n) =>
                n!.provenance.map(
                  (p) => `${p.sourceName} · ${p.evidenceId} · ${p.observedAt} · ${p.grade}`,
                ),
              ),
          ),
        ).sort(),
        data: ctx,
        empty: ctx.focus === null,
      };
    },

    timeline(focusId) {
      if (!query.node(focusId)) return missing(focusId, "timeline-reconstruction");
      const events = query.timeline(focusId, { maxDepth: 4, maxResults: 60 });
      return {
        operation: "timeline-reconstruction",
        focusId,
        lines: [
          `${events.length} evidenced event${events.length === 1 ? "" : "s"} reconstructed for ${focusId}.`,
          ...events.slice(0, 20).map((e) => `${e.at} — ${e.label}: ${e.description} (${e.grade})`),
        ],
        citations: Array.from(
          new Set(
            events.flatMap((e) =>
              e.evidenceIds.map((id) => `${e.sources.join(", ")} · ${id} · ${e.at} · ${e.grade}`),
            ),
          ),
        ).sort(),
        data: events,
        empty: events.length === 0,
      };
    },
  };
}
