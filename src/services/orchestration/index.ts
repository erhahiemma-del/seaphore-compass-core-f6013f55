/**
 * Public barrel for the Intelligence Orchestration Engine.
 * Consumers (UI, server functions, tests) should ONLY import from this file.
 */
export * from "./types";
export * from "./constants";
export { WORKSPACE_CONTRACTS } from "./workspace-contracts";
export { CAPABILITY_REGISTRY, agentsForCapabilities } from "./capability-registry";
export { orchestrate } from "./orchestrator";
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
