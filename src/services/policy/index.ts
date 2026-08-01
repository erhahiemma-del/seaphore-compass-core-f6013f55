/**
 * Sprint 10 · Policy Engine — public API.
 * Layer 2.14 · Layer 5.3.
 */
export { PERMISSIONS, WORKFLOW_PERMISSION, type Permission } from "./permissions";
export { ROLE_PERMISSIONS, roleHas, type Role } from "./roles";
export { escalationFor, approvalSatisfies, type ApprovalToken } from "./escalation";
export {
  createMemoryRateLimitStore,
  DEFAULT_LIMIT,
  HOURLY_LIMITS,
  WINDOW_MS,
  limitFor,
  keyFor,
  type RateLimitStore,
} from "./rate-limit";
export {
  noopConflictDetector,
  createMemoryConflictDetector,
  type ConflictDetector,
  type ConflictSubject,
  type ConflictFinding,
} from "./conflicts";
export { createMemoryDecisionAuditLog, type DecisionAuditLog } from "./audit";
export { isAllowed, type Decision, type DecisionOutcome } from "./decision";
export {
  PolicyEngine,
  defaultPolicyEngine,
  type PolicyEngineDeps,
  type PolicyEvaluationRequest,
} from "./engine";
export { requirePolicy, PolicyDeniedError, type PolicyPayload } from "./middleware";
