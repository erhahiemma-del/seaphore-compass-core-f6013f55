/**
 * Sprint 10 · Escalation rules.
 *
 * Some workflows are permitted for a role but only via supervisor approval.
 * Example: an officer can freeze clearance ONLY with a director's approval
 * token; without it, the decision is `escalate` — the UI renders a
 * "Request Approval" button instead of a disabled state.
 *
 * An approval token is a signed handoff from a director/administrator; in
 * this sprint we accept an opaque string and validate its presence + role
 * matches the required tier. Sprint 12 replaces this with signed JWTs.
 */
import type { WorkflowId } from "@/services/workflows";
import type { Role } from "./roles";

export interface ApprovalToken {
  readonly grantedBy: string;
  readonly grantedByRole: Role;
  readonly grantedAt: string;
  readonly workflow: WorkflowId;
}

interface Rule {
  readonly workflow: WorkflowId;
  readonly requiresApprovalFor: ReadonlyArray<Role>;
  readonly approverRoles: ReadonlyArray<Role>;
}

const ESCALATION_RULES: ReadonlyArray<Rule> = Object.freeze([
  { workflow: "freeze_clearance", requiresApprovalFor: ["officer"], approverRoles: ["director", "administrator"] },
  { workflow: "assign_officer", requiresApprovalFor: ["officer"], approverRoles: ["director", "administrator"] },
]);

export function escalationFor(workflow: WorkflowId, role: Role): Rule | null {
  return ESCALATION_RULES.find((r) => r.workflow === workflow && r.requiresApprovalFor.includes(role)) ?? null;
}

export function approvalSatisfies(rule: Rule, token: ApprovalToken | undefined): boolean {
  if (!token) return false;
  if (token.workflow !== rule.workflow) return false;
  return rule.approverRoles.includes(token.grantedByRole);
}
