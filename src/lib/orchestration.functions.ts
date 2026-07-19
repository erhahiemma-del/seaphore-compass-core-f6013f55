/**
 * LAYER 5.2 — API Contract.
 * POST /api/copilot/query — exposed as a TanStack server function (RPC).
 *
 * Request:  { query, session_id?, context: { investigation_id?, vessel?, port?, workspace? } }
 * Response: { briefing_id, classification, sections[], intelligence_status,
 *             sources_queried, sources_responded, sources_corroborated }
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  orchestrate,
  captureOverride,
  evaluatePolicy,
  recordActionUsage,
  type Permission,
} from "@/services/orchestration";

interface QueryInput {
  query: string;
  session_id?: string;
  context?: {
    investigation_id?: string;
    vessel?: string;
    port?: string;
    workspace?: "ownership" | "revenue" | "compliance" | "evidence" | "vessel" | "port";
  };
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
    const briefing = await orchestrate({
      query: data.query,
      session_id: data.session_id,
      officer_id: context.userId,
      context: data.context,
    });
    // API contract: return exactly the fields specified in 5.2
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
  });

interface OverrideInput {
  briefing_id: string;
  decision: "agree" | "disagree" | "modify" | "dismiss";
  justification?: string;
  modifications?: Record<string, unknown>;
}

export const copilotOverrideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: OverrideInput) => {
    if (!d?.briefing_id) throw new Error("briefing_id required");
    if (!["agree", "disagree", "modify", "dismiss"].includes(d.decision))
      throw new Error("invalid decision");
    return d;
  })
  .handler(async ({ data, context }) =>
    captureOverride({
      briefing_id: data.briefing_id,
      officer_id: context.userId,
      decision: data.decision,
      justification: data.justification,
      modifications: data.modifications,
    }),
  );

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
    });
    if (decision.allow && data.record) {
      await recordActionUsage(context.userId, data.permission);
    }
    return decision;
  });
