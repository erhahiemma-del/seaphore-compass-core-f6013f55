/**
 * SPRINT CAP-03 — Cargo Knowledge Graph (CKG) · public entry point.
 *
 * Consumers:
 *   • OIE / Copilot  — `cargoGraphFacade` (four named graph operations)
 *   • Cargo Workspace — `useCargoGraph()` hook
 *
 * The graph is written to exclusively by `buildCargoGraph`, which
 * consumes Canonical UIP evidence. No provider code lives in this module
 * and none may be added to it.
 */
export * from "./types";
export {
  CARGO_EDGE_LABEL,
  CARGO_REL_BINDINGS,
  CARGO_ROLE_LABEL,
  cargoRoleOf,
  strongestGrade,
  weakestGrade,
  type RelBinding,
} from "./model";
export {
  CargoKnowledgeGraph,
  buildCargoGraph,
  type BuildCargoGraphResult,
  type CargoNeighbour,
  type UpsertCargoEdge,
  type UpsertCargoNode,
} from "./graph";
export {
  cargoEdgeCitations,
  createCargoGraphQuery,
  type CargoGraphQuery,
  type CargoTraversalOptions,
} from "./queries";
export {
  cargoGraphFacade,
  cargoGraphFromEvidence,
  type CargoGraphAnswer,
  type CargoGraphFacade,
  type CargoGraphOperation,
} from "./facade";
