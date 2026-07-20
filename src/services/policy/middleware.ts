/**
 * Sprint 10 · Server-function middleware — policy gate for workflow triggers.
 *
 * Attach to any `createServerFn` that triggers a workflow. Reads officer +
 * workflow + input from the validated request payload, runs
 * `PolicyEngine.evaluate()`, and either throws with a structured 403 body
 * or forwards the decision on `context.policy` to the handler.
 */
import { createMiddleware } from "@tanstack/react-start";
import { PolicyEngine, defaultPolicyEngine } from "./engine";
import type { Decision } from "./decision";
import type { ApprovalToken } from "./escalation";
import type { OfficerContext, WorkflowId } from "@/services/workflows";

export interface PolicyPayload {
  readonly workflow: WorkflowId;
  readonly officer: OfficerContext;
  readonly input: Readonly<Record<string, unknown>>;
  readonly approval?: ApprovalToken;
}

export class PolicyDeniedError extends Error {
  constructor(public readonly decision: Decision) {
    super(`[${decision.outcome}] ${decision.reason}`);
    this.name = "PolicyDeniedError";
  }
}

/** Build middleware bound to an engine instance (default: singleton). */
export function requirePolicy(engine: PolicyEngine = defaultPolicyEngine) {
  return createMiddleware({ type: "function" }).server(async ({ next, data }) => {
    const payload = data as PolicyPayload;
    const decision = engine.evaluate(payload);
    if (!decision.allowed) throw new PolicyDeniedError(decision);
    return next({ context: { policy: decision } });
  });
}
