/**
 * LAYER 5.2 — Copilot API Contract (canonical server functions).
 *
 * Every Copilot RPC crosses this boundary. Consolidation:
 *  • Hardening   — `hardening.copilotLimiter` (token bucket, 30 burst / 30 per min)
 *  • Observability — `observability.tracer.startQuery(...)` wraps the pipeline
 *  • Policy       — canonical `defaultPolicyEngine` gates every officer action
 *  • Workflow     — canonical `WorkflowEngine` executes approved actions
 *  • Audit        — every override + workflow transition is persisted
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  orchestrate,
  captureOverride,
  evaluatePolicy,
  recordActionUsage,
  workflowForPermission,
  overrideWorkflowEngine,
  type MissionContext,
  type Permission,
} from "@/services/orchestration";
import { defaultPolicyEngine, type ApprovalToken } from "@/services/policy";
import type { OfficerContext, WorkflowId, WorkflowRecord } from "@/services/workflows";
import { hardening } from "@/services/hardening";
import { observability } from "@/services/observability";

interface QueryInput {
  query: string;
  session_id?: string;
  context?: {
    investigation_id?: string;
    vessel?: string;
    port?: string;
    workspace?: "ownership" | "revenue" | "compliance" | "evidence" | "vessel" | "port";
  };
  /**
   * The canonical mission context — what the officer currently has open.
   *
   * Supersedes the loose `context.vessel` / `context.port` /
   * `context.investigation_id` fields above, which named a subject
   * without saying what kind it was. Those are retained for
   * un-migrated callers; when both are present this one wins, because
   * only this shape carries enough for the context policy to decide
   * whether the subject may reach the query at all.
   */
  mission_context?: MissionContext | null;
}

export const copilotQueryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: QueryInput) => {
    if (!data || typeof data.query !== "string" || data.query.trim().length === 0) {
      throw new Error("query is required");
    }
    if (data.query.length > 4_000) throw new Error("query too long (>4000 chars)");
    return data;
  })
  .handler(async ({ data, context }) => {
    // Hardening: per-officer token bucket at the request boundary.
    const limitKey = `copilot:${context.userId}`;
    const rl = hardening.copilotLimiter.take(limitKey);
    if (!rl.allowed) {
      throw new Error(
        `[copilot] rate limit exceeded — retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`,
      );
    }

    // Observability: single trace across the pipeline (Layer 5.4 budgets).
    const trace = observability.tracer.startQuery({
      officerId: context.userId,
      intent: "copilot.query",
      queryText: data.query,
      workspace: data.context?.workspace,
    });

    try {
      const briefing = await trace.stage("total", () =>
        orchestrate(
          {
            query: data.query,
            session_id: data.session_id,
            officer_id: context.userId,
            context: data.context,
          },
          {
            // Pass the authenticated server client so intel_briefings and
            // orchestration_events persist under the officer's auth context
            // (Sprint 2.1A — canonical UIP as system of record).
            supabase: context.supabase,
            // The canonical mission context. Offered, never imposed:
            // `classifyIntent` applies it only when the query's own
            // context policy resolves to `inherit`, so a fleet or company
            // question cannot be narrowed by whatever the officer has
            // open. Null when nothing is open, which is the normal state.
            missionContext: data.mission_context ?? null,
          },
        ),
      );

      trace.finish({ ok: true });
      return {
        briefing_id: briefing.id,
        classification: briefing.classification,
        sections: briefing.sections,
        intelligence_status: briefing.intelligence_status,
        sources_queried: briefing.sources_queried,
        sources_responded: briefing.sources_responded,
        sources_corroborated: briefing.sources_corroborated,
        confidence_matrix: briefing.confidence_matrix,
        mode: briefing.mode,
        latency_ms: briefing.latency_ms,
      };
    } catch (err) {
      trace.recordError(err, "total");
      trace.finish({ ok: false });
      throw err;
    }
  });

interface OverrideInput {
  briefing_id: string;
  decision: "agree" | "disagree" | "modify" | "dismiss";
  justification?: string;
  modifications?: Record<string, unknown>;
  officer_name?: string;
  officer_role?: OfficerContext["role"];
  workflow?: {
    workflow: WorkflowId;
    input: Record<string, unknown>;
    approval?: ApprovalToken;
  };
}

/** Plain DTO for the RPC boundary — WorkflowRecord contains readonly types. */
function toRecordDto(r: WorkflowRecord) {
  return {
    id: r.id,
    workflow: r.workflow,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
    error: r.error,
  };
}

export const copilotOverrideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: OverrideInput) => {
    if (!d?.briefing_id) throw new Error("briefing_id required");
    if (!["agree", "disagree", "modify", "dismiss"].includes(d.decision))
      throw new Error("invalid decision");
    return d;
  })
  .handler(async ({ data, context }) => {
    const result = await captureOverride({
      briefing_id: data.briefing_id,
      officer_id: context.userId,
      officer_name: data.officer_name,
      officer_role: data.officer_role,
      decision: data.decision,
      justification: data.justification,
      modifications: data.modifications,
      workflow: data.workflow,
      supabase: context.supabase,
    });
    return {
      id: result.id,
      workflow: result.workflow
        ? {
            dispatched: result.workflow.dispatched,
            outcome: result.workflow.outcome,
            reason: result.workflow.reason,
            record: result.workflow.record ? toRecordDto(result.workflow.record) : undefined,
          }
        : undefined,
    };
  });

interface PolicyCheckInput {
  permission: Permission;
  workspace?: string;
  investigation_id?: string;
  record?: boolean;
}

export const copilotPolicyCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: PolicyCheckInput) => {
    if (!d?.permission) throw new Error("permission required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const decision = await evaluatePolicy({
      officer_id: context.userId,
      permission: data.permission,
      workspace: data.workspace,
      investigation_id: data.investigation_id,
      supabase: context.supabase,
    });
    if (decision.allow && data.record) {
      await recordActionUsage(context.userId, data.permission, {
        supabase: context.supabase,
      });
    }
    return decision;
  });

interface ExecuteWorkflowInput {
  permission: Permission;
  input: Record<string, unknown>;
  officer_name?: string;
  officer_role?: OfficerContext["role"];
  correlationId?: string;
  approval?: ApprovalToken;
}

/**
 * Canonical "Officer Action" entry point.
 * UI → Policy → Workflow → Audit, in a single validated call.
 */
export const copilotExecuteWorkflowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ExecuteWorkflowInput) => {
    if (!d?.permission) throw new Error("permission required");
    if (!d?.input || typeof d.input !== "object") throw new Error("input required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const workflow = workflowForPermission(data.permission);
    const officer: OfficerContext = {
      officerId: context.userId,
      officerName: data.officer_name ?? "officer",
      role: data.officer_role ?? "officer",
    };

    // 1. Canonical policy check (RBAC + escalation + memory rate limit).
    const decision = defaultPolicyEngine.evaluate({
      workflow,
      officer,
      input: data.input,
      approval: data.approval,
    });
    if (!decision.allowed) {
      return { dispatched: false, outcome: decision.outcome, reason: decision.reason };
    }

    // 2. Persistent per-day usage record for long-window auditing.
    await recordActionUsage(context.userId, data.permission, {
      supabase: context.supabase,
    }).catch(() => undefined);

    // 3. Canonical workflow dispatch.
    const record = await overrideWorkflowEngine.trigger({
      workflow,
      officer,
      input: data.input,
      correlationId: data.correlationId,
    });
    return {
      dispatched: true,
      outcome: decision.outcome,
      record: toRecordDto(record),
    };
  });
