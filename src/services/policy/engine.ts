/**
 * Sprint 10 · Policy Engine.
 *
 * Evaluation order:
 *   1. Permission check   (RBAC)                → deny_permission
 *   2. Escalation check   (approval required)   → escalate | proceed
 *   3. Conflict check     (existing case/hold)  → conflict
 *   4. Rate-limit check   (sliding hour window) → rate_limited
 *   5. Otherwise                                → allow (hit counter)
 *
 * The engine implements the Sprint 9 `PolicyEngine` interface so it can be
 * dropped into the WorkflowEngine constructor. It ALSO exposes `evaluate()`
 * returning the rich `Decision` for UI affordances (tooltips, Request
 * Approval, cooldown, conflict banners).
 */
import type { OfficerContext, WorkflowId } from "@/services/workflows";
import type {
  PolicyDecision as WorkflowPolicyDecision,
  PolicyEngine as WorkflowPolicyEngine,
} from "@/services/workflows/policy";
import { createMemoryDecisionAuditLog, type DecisionAuditLog } from "./audit";
import { noopConflictDetector, type ConflictDetector } from "./conflicts";
import type { Decision } from "./decision";
import { approvalSatisfies, escalationFor, type ApprovalToken } from "./escalation";
import { WORKFLOW_PERMISSION } from "./permissions";
import {
  createMemoryRateLimitStore,
  keyFor,
  limitFor,
  WINDOW_MS,
  type RateLimitStore,
} from "./rate-limit";
import { roleHas, type Role } from "./roles";

export interface PolicyEvaluationRequest {
  readonly workflow: WorkflowId;
  readonly officer: OfficerContext;
  readonly input: Readonly<Record<string, unknown>>;
  readonly approval?: ApprovalToken;
}

export interface PolicyEngineDeps {
  rateLimits?: RateLimitStore;
  conflicts?: ConflictDetector;
  audit?: DecisionAuditLog;
  now?: () => Date;
}

export class PolicyEngine implements WorkflowPolicyEngine {
  private readonly rl: RateLimitStore;
  private readonly conflicts: ConflictDetector;
  readonly audit: DecisionAuditLog;
  private readonly now: () => Date;

  constructor(deps: PolicyEngineDeps = {}) {
    this.rl = deps.rateLimits ?? createMemoryRateLimitStore();
    this.conflicts = deps.conflicts ?? noopConflictDetector;
    this.audit = deps.audit ?? createMemoryDecisionAuditLog();
    this.now = deps.now ?? (() => new Date());
  }

  /** Full evaluation with rich outcome for UI. */
  evaluate(req: PolicyEvaluationRequest): Decision {
    const at = this.now();
    const atIso = at.toISOString();
    const permission = WORKFLOW_PERMISSION[req.workflow];
    const role = req.officer.role as Role;
    const base = {
      workflow: req.workflow,
      permission,
      officerId: req.officer.officerId,
      at: atIso,
    } as const;

    // 1. RBAC
    if (!roleHas(role, permission)) {
      return this.record({
        ...base,
        outcome: "deny_permission",
        allowed: false,
        reason: `Role '${role}' lacks ${permission}.`,
      });
    }

    // 2. Escalation
    const rule = escalationFor(req.workflow, role);
    if (rule && !approvalSatisfies(rule, req.approval)) {
      return this.record({
        ...base,
        outcome: "escalate",
        allowed: false,
        reason: `${req.workflow} requires approval from ${rule.approverRoles.join("/")} for role '${role}'.`,
        meta: { approverRoles: rule.approverRoles },
      });
    }

    // 3. Conflicts
    const conflict = this.conflicts.detect({
      workflow: req.workflow,
      officer: req.officer,
      input: req.input,
    });
    if (conflict) {
      return this.record({
        ...base,
        outcome: "conflict",
        allowed: false,
        reason: conflict.explanation,
        meta: { conflictWith: conflict.conflictWith },
      });
    }

    // 4. Rate limit — check without mutating; only hit on allow.
    const key = keyFor(req.officer.officerId, req.workflow);
    const nowMs = at.getTime();
    const limit = limitFor(req.workflow);
    const current = this.rl.count(key, nowMs, WINDOW_MS);
    if (current >= limit) {
      return this.record({
        ...base,
        outcome: "rate_limited",
        allowed: false,
        reason: `Hourly limit ${limit} reached for ${req.workflow}. Try again shortly.`,
        meta: { limit, current, windowMs: WINDOW_MS },
      });
    }

    // 5. Allow — commit a hit.
    this.rl.hit(key, nowMs, WINDOW_MS);
    return this.record({
      ...base,
      outcome: "allow",
      allowed: true,
      reason: "Policy allows.",
      meta: { limit, current: current + 1 },
    });
  }

  /** Sprint 9 compatibility. */
  can(
    officer: OfficerContext,
    workflow: WorkflowId,
    input: Readonly<Record<string, unknown>>,
  ): WorkflowPolicyDecision {
    const d = this.evaluate({ workflow, officer, input });
    return d.allowed ? { allowed: true } : { allowed: false, reason: `[${d.outcome}] ${d.reason}` };
  }

  /** UI helper — non-mutating probe used to render tooltips and buttons. */
  probe(req: PolicyEvaluationRequest): Decision {
    // Save + restore rate-limit state by using count(), never hit().
    const at = this.now();
    const permission = WORKFLOW_PERMISSION[req.workflow];
    const role = req.officer.role as Role;
    const base = {
      workflow: req.workflow,
      permission,
      officerId: req.officer.officerId,
      at: at.toISOString(),
    } as const;
    if (!roleHas(role, permission)) {
      return {
        ...base,
        outcome: "deny_permission",
        allowed: false,
        reason: `Role '${role}' lacks ${permission}.`,
      };
    }
    const rule = escalationFor(req.workflow, role);
    if (rule && !approvalSatisfies(rule, req.approval)) {
      return {
        ...base,
        outcome: "escalate",
        allowed: false,
        reason: `Requires ${rule.approverRoles.join("/")} approval.`,
        meta: { approverRoles: rule.approverRoles },
      };
    }
    const conflict = this.conflicts.detect({
      workflow: req.workflow,
      officer: req.officer,
      input: req.input,
    });
    if (conflict)
      return {
        ...base,
        outcome: "conflict",
        allowed: false,
        reason: conflict.explanation,
        meta: { conflictWith: conflict.conflictWith },
      };
    const limit = limitFor(req.workflow);
    const current = this.rl.count(
      keyFor(req.officer.officerId, req.workflow),
      at.getTime(),
      WINDOW_MS,
    );
    if (current >= limit) {
      return {
        ...base,
        outcome: "rate_limited",
        allowed: false,
        reason: `Hourly limit ${limit} reached.`,
        meta: { limit, current },
      };
    }
    return {
      ...base,
      outcome: "allow",
      allowed: true,
      reason: "Policy allows.",
      meta: { limit, current },
    };
  }

  private record(d: Decision): Decision {
    const frozen = Object.freeze({ ...d });
    this.audit.append(frozen);
    return frozen;
  }
}

export const defaultPolicyEngine = new PolicyEngine();
