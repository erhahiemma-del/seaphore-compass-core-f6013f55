/**
 * Sprint 9 · Workflow Engine — shared types.
 * Layer 5.3 (Workflow Contracts) · Layer 2.14 (Policy Engine).
 *
 * Every officer action is a workflow. Workflows are async, auditable, and
 * gated by the Policy Engine. Execution is stateful — the engine stores a
 * `WorkflowRecord` per run and emits an audit entry on every transition.
 */

/** The five Sprint 9 workflows. Extend the union to add new officer actions. */
export const WORKFLOW_IDS = [
  "open_investigation",
  "notify_customs",
  "request_manifest",
  "assign_officer",
  "freeze_clearance",
] as const;
export type WorkflowId = (typeof WORKFLOW_IDS)[number];

export type WorkflowStatus = "pending" | "running" | "completed" | "failed" | "retrying" | "denied";

export interface OfficerContext {
  readonly officerId: string;
  readonly officerName: string;
  readonly role: "administrator" | "director" | "officer" | "analyst";
}

export interface WorkflowTrigger {
  readonly workflow: WorkflowId;
  readonly officer: OfficerContext;
  readonly input: Readonly<Record<string, unknown>>;
  /** Optional client-provided correlation id (case, alert, briefing). */
  readonly correlationId?: string;
}

export interface WorkflowRecord {
  readonly id: string;
  readonly workflow: WorkflowId;
  readonly officer: OfficerContext;
  readonly input: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly status: WorkflowStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface AuditEntry {
  readonly at: string;
  readonly runId: string;
  readonly workflow: WorkflowId;
  readonly officerId: string;
  readonly from: WorkflowStatus | null;
  readonly to: WorkflowStatus;
  readonly attempt: number;
  readonly message: string;
}
