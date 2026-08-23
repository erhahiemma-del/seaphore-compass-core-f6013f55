/**
 * Sprint 10 · Policy decision contract.
 *
 * Every evaluation returns a `Decision`. The Workflow Engine's Sprint 9
 * `PolicyEngine.can()` interface only understands allow/deny — the adapter
 * in `engine.ts` maps `escalate | rate_limited | conflict` to `deny` with a
 * descriptive reason, while still preserving the full decision in the audit
 * log so UIs can render "Request Approval", cooldown, or conflict states.
 */
import type { WorkflowId } from "@/services/workflows";
import type { Permission } from "./permissions";

export type DecisionOutcome =
  "allow" | "deny_permission" | "escalate" | "rate_limited" | "conflict";

export interface Decision {
  readonly outcome: DecisionOutcome;
  readonly allowed: boolean;
  readonly reason: string;
  readonly workflow: WorkflowId;
  readonly permission: Permission;
  readonly officerId: string;
  readonly at: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export function isAllowed(d: Decision): boolean {
  return d.outcome === "allow";
}
