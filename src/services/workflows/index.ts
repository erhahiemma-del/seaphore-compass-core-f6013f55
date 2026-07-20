/**
 * Sprint 9 · Workflow Engine — public API.
 * Layer 5.3 · Layer 2.14. "Officer decides."
 */
export * from "./types";
export { WorkflowEngine, type EngineDeps } from "./engine";
export { HANDLERS } from "./handlers";
export { defaultPolicyEngine, type PolicyDecision, type PolicyEngine } from "./policy";
export { canTransition, assertTransition, isTerminal } from "./state-machine";
export {
  createMemoryStore,
  createMemoryAuditLog,
  type AuditLog,
  type WorkflowStore,
} from "./store";
export { createMemoryQueue, type Queue, type QueueJob, type QueueOptions } from "./queue";
export { createMockAdapters, type MockAdapters, type AdapterFailurePlan } from "./adapters";
