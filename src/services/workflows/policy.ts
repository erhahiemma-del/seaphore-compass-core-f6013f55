/**
 * Sprint 9 · Policy Engine interface (Layer 2.14).
 *
 * Sprint 10 will supply the full policy logic; this sprint defines the
 * interface and ships a role-based default that the Workflow Engine calls
 * before every execution. Denials are recorded in the audit log as
 * `denied` transitions — no side effects run.
 */
import type { OfficerContext, WorkflowId } from "./types";

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface PolicyEngine {
  can(
    officer: OfficerContext,
    workflow: WorkflowId,
    input: Readonly<Record<string, unknown>>,
  ): PolicyDecision;
}

/** Default role matrix — Sprint 10 will replace with policy DSL. */
const ROLE_MATRIX: Readonly<Record<WorkflowId, ReadonlyArray<OfficerContext["role"]>>> =
  Object.freeze({
    open_investigation: ["administrator", "director", "officer"],
    notify_customs: ["administrator", "director", "officer"],
    request_manifest: ["administrator", "director", "officer", "analyst"],
    assign_officer: ["administrator", "director"],
    freeze_clearance: ["administrator", "director"],
  });

export const defaultPolicyEngine: PolicyEngine = {
  can(officer, workflow) {
    const allowed = ROLE_MATRIX[workflow].includes(officer.role);
    return allowed
      ? { allowed: true }
      : {
          allowed: false,
          reason: `Role '${officer.role}' is not permitted to trigger '${workflow}'.`,
        };
  },
};
