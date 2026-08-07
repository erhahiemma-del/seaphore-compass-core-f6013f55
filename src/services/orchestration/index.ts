/**
 * Public barrel for the Intelligence Orchestration Engine.
 * Consumers (UI, server functions, tests) should ONLY import from this file.
 */
export * from "./types";
export * from "./constants";
export { WORKSPACE_CONTRACTS, type PanelId, type WorkspaceContract } from "./workspace-contracts";

/* ── G6.0 · adaptive intelligence layer ────────────────────────── */

// Query understanding — the one authoritative reading of a question.
// `classifyIntent` projects this into mode/capabilities/workspace, so
// nothing downstream needs to call it directly.
export {
  classifyOfficerIntent,
  planRetrieval,
  resolveContextPolicy,
  resolveEntities,
  resolveTimeWindow,
  toIceIntent,
  understand,
  type ContextPolicy,
  type DatasetId,
  type OfficerIntent,
  type QueryScope,
  type QueryUnderstanding,
  type ResolvedEntity,
  type TimeWindow,
  type WorkspaceMode,
} from "./understanding";

export {
  ambientEntityOf,
  describeMission,
  openMission,
  type MissionContext,
} from "./mission-context";

export { planWorkspace, type SearchTransparency, type WorkspacePlan } from "./workspace-planner";

export {
  buildExecutiveBrief,
  type BriefFinding,
  type EvidenceSummary,
  type ExecutiveBriefV2,
  type RecommendedAction,
  type SummaryLine,
} from "./executive-brief";

export { classifyIntent, type ClassifyOptions } from "./intent-classifier";
export { CAPABILITY_REGISTRY, agentsForCapabilities } from "./capability-registry";
export { orchestrate, type OrchestrationDeps } from "./orchestrator";
export { captureOverride, overrideWorkflowEngine } from "./override-gate";
export {
  evaluatePolicy,
  recordActionUsage,
  workflowForPermission,
  canonicalPolicyEngine,
  type Permission,
  type PolicyDecision,
} from "./policy-engine";
export { emitEvent } from "./event-bus";
