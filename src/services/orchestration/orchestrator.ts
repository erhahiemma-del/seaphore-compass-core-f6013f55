/**
 * LAYER 2.1 — Copilot Orchestrator (control plane).
 *
 * Coordinates the entire pipeline: Intent → Scheduler → Fusion → Reasoning →
 * Briefing → Persistence → Event Bus. NEVER reasons or retrieves. Distinct
 * from the Reasoning Engine (2.1 CRITICAL SEPARATION).
 */
import { classifyIntent } from "./intent-classifier";
import { ensureSession, appendHistory } from "./context-manager";
import { scheduleRetrievals } from "./scheduler";
import { fuseEvidence } from "./evidence-fusion";
import { reason, computeConfidenceMatrix } from "./reasoning-engine";
import { buildBriefing } from "./briefing-builder";
import { emitEvent } from "./event-bus";
import { supabase } from "@/integrations/supabase/client";
import { PERF_BUDGETS } from "./constants";
import { hashQuery } from "@/services/ife/registry";
import type { Briefing, OfficerQuery } from "./types";

export async function orchestrate(query: OfficerQuery): Promise<Briefing> {
  const started = performance.now();
  const session = ensureSession(query);

  // 1. Intent
  const intent = classifyIntent(query);

  // 2. Schedule specialist retrievals in parallel
  const results = await scheduleRetrievals(intent, query, intent.mode);
  await emitEvent({
    event_type: "evidence.collected",
    payload: { intent: intent.mode, sources: results.length },
    emitted_by: query.officer_id,
  });

  // 3. Fuse
  const fused = fuseEvidence(results);

  // 4. Confidence matrix + reasoning
  const matrix = computeConfidenceMatrix(fused);
  const assessment = await reason(intent, fused, matrix);

  // 5. Build the Intelligence Contract — stamp canonical UIP id so every
  //    downstream artifact references the same evidence set.
  const uipId = `uip_${hashQuery(query.query, session.session_id)}`;
  const briefing: Briefing = {
    ...buildBriefing({
      query: { ...query, session_id: session.session_id },
      intent,
      fused,
      assessment,
      matrix,
      latency_ms: Math.round(performance.now() - started),
      model_used: "lovable-ai:gemini",
    }),
    source_uip_id: uipId,
  };

  // 6. Persist — best-effort. In dev-bypass (no session) RLS blocks the
  // insert; we keep the pipeline moving so the briefing still renders.
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session) {
      const { error } = await supabase.from("intel_briefings").insert({
        id: briefing.id,
        session_id: briefing.session_id ?? null,
        officer_id: briefing.officer_id,
        query: briefing.query,
        workspace: briefing.workspace ?? null,
        investigation_id: briefing.investigation_id ?? null,
        mode: briefing.mode,
        classification: briefing.classification as never,
        sections: briefing.sections as never,
        intelligence_status: briefing.intelligence_status,
        sources_queried: briefing.sources_queried,
        sources_responded: briefing.sources_responded,
        sources_corroborated: briefing.sources_corroborated,
        confidence_matrix: briefing.confidence_matrix as never,
        latency_ms: briefing.latency_ms,
        model_used: briefing.model_used,
      });
      if (error) console.warn("[orchestrator] persist briefing failed:", error.message);
    }
  } catch (err) {
    console.warn("[orchestrator] persist briefing threw:", err);
  }


  await emitEvent({
    event_type: "briefing.generated",
    payload: {
      briefing_id: briefing.id,
      mode: briefing.mode,
      confidence: briefing.confidence_matrix.composite,
      latency_ms: briefing.latency_ms,
      within_budget: briefing.latency_ms <= PERF_BUDGETS[briefing.mode].max,
    },
    emitted_by: query.officer_id,
  });

  appendHistory(session.session_id, query.query, briefing);
  return briefing;
}
