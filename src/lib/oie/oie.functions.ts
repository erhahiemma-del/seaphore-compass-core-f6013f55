/**
 * OIE server function — the single RPC officers' UI calls when
 * authenticated. Wraps the entire 8-module pipeline and injects the
 * live reasoning provider (Gemini / GPT / Claude) so the model runs
 * server-side with `LOVABLE_API_KEY`.
 *
 * Returns a discriminated union: either a clarify turn or a full
 * operational briefing. The client renders both.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runOIE } from "@/services/oie/engine";
import { DEFAULT_PROVIDER_ID, type ReasoningProviderId } from "@/services/oie/reasoning-provider";
import { invokeReasoningProvider } from "@/services/oie/provider-runtime.server";
import type { OfficerQuery, Workspace } from "@/services/orchestration";

interface OIEInput {
  query: string;
  session_id?: string;
  moduleHint?: string;
  providerId?: ReasoningProviderId;
  mission?: Record<string, unknown>;
  context?: {
    investigation_id?: string;
    vessel?: string;
    port?: string;
    workspace?: Workspace;
  };
}

export const runOIEFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: OIEInput) => {
    if (!data || typeof data.query !== "string" || data.query.trim().length === 0) {
      throw new Error("query is required");
    }
    if (data.query.length > 4_000) throw new Error("query too long (>4000 chars)");
    return data;
  })
  .handler(async ({ data, context }) => {
    const officerQuery: OfficerQuery = {
      query: data.query,
      session_id: data.session_id,
      officer_id: context.userId,
      moduleHint: data.moduleHint,
      mission: data.mission,
      context: data.context,
    };

    const providerId = data.providerId ?? DEFAULT_PROVIDER_ID;
    const result = await runOIE(
      { query: officerQuery, providerId },
      (briefing, missionSummary, plan) =>
        invokeReasoningProvider(providerId, briefing, missionSummary, plan),
      { supabase: context.supabase },
    );

    if (result.kind === "clarify") {
      return {
        kind: "clarify" as const,
        clarification: result.clarification,
        interpreted: {
          intent: result.interpreted.intent,
          domains: result.interpreted.domains,
          ambiguous: result.interpreted.ambiguous,
        },
        latency_ms: result.latencyMs,
      };
    }

    return {
      kind: "briefing" as const,
      briefing_id: result.briefing.id,
      classification: result.briefing.classification,
      sections: result.briefing.sections,
      intelligence_status: result.briefing.intelligence_status,
      sources_queried: result.briefing.sources_queried,
      sources_responded: result.briefing.sources_responded,
      sources_corroborated: result.briefing.sources_corroborated,
      confidence_matrix: result.briefing.confidence_matrix,
      mode: result.briefing.mode,
      latency_ms: result.briefing.latency_ms,
      humanResponse: result.humanResponse,
      plan: {
        primarySkill: result.plan.primarySkill.id,
        supportingSkills: result.plan.supportingSkills.map((s) => s.id),
        followUps: result.plan.followUps,
      },
      provider: result.provider,
    };
  });
