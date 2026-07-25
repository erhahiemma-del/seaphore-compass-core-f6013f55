/**
 * Maritime Knowledge Graph (MKG) — public entry point.
 *
 * Golden Rule: One entity. One graph. One source of truth. Every
 * relationship must be explainable and evidence-backed.
 *
 * Consumers:
 *   • OSAE / OIE  — read node summaries and traversal paths for briefs.
 *   • Copilot     — answer multi-hop intelligence questions via
 *                   `graph.findPaths(a, b)` and `summariseEntity(...)`.
 *   • UI          — render the interactive graph at /knowledge-graph.
 *
 * The MKG is written to exclusively by `ingestUnifiedPackage`, which
 * consumes an IFE `UnifiedIntelligencePackage`. Never write raw
 * connector records directly.
 */
export * from "./types";
export {
  MaritimeKnowledgeGraph,
  strongestGrade,
  degrade,
  type UpsertNodeInput,
  type UpsertEdgeInput,
  type TraversalOptions,
} from "./graph";
export { ingestUnifiedPackage, type IngestResult, type IngestOptions } from "./ingest";
export {
  summariseEntity,
  findHiddenLinks,
  findConflictingIdentities,
  describePath,
  edgeCitations,
  type EntitySummary,
  type HiddenLink,
  type ConflictingIdentity,
} from "./insights";
export { useMkgStore } from "./store";
