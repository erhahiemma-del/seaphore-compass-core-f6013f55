/**
 * OIE server function — the single RPC officers' UI calls.
 *
 * Wraps the entire 8-module pipeline behind Supabase auth. Emits the
 * same shape the existing Copilot UI consumes (`briefing` mapped
 * through `adaptBriefing`) PLUS the operational `humanResponse`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runOIE } from "@/services/oie/engine";
import type { ReasoningProviderId } from "@/services/oie/reasoning-provider";
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

    const result = await runOIE({ query: officerQuery, providerId: data.providerId });
    return {
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
      provider: result.provider,
    };
  });
