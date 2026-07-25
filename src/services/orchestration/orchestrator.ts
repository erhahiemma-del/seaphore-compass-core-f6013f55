/**
 * LAYER 2.1 — Copilot Orchestrator (control plane).
 *
 * Coordinates the entire pipeline: Intent → Scheduler → Fusion → Reasoning →
 * Briefing → Persistence → Event Bus. NEVER reasons or retrieves.
 *
 * Slice 1 (Canonical UIP): after fusion the orchestrator builds a Unified
 * Intelligence Package, registers it in the UIP registry, and stamps the
 * briefing's source_uip_id with the registry id so every downstream
 * capability can resolve the exact same evidence set via getUip().
 */
import { classifyIntent } from "./intent-classifier";
import { ensureSession, appendHistory } from "./context-manager";
import { scheduleRetrievals } from "./scheduler";
import { fuseEvidence } from "./evidence-fusion";
import { reason, computeConfidenceMatrix } from "./reasoning-engine";
import { buildBriefing } from "./briefing-builder";
import { emitEvent } from "./event-bus";
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import { PERF_BUDGETS } from "./constants";
import { hashQuery, registerUip, getUip } from "@/services/ife/registry";
import { buildUipFromOrchestration } from "./uip-adapter";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Briefing, OfficerQuery } from "./types";

export interface OrchestrationDeps {
  /** Authenticated Supabase client (server-fn context). If omitted the
   *  browser client is used and persistence is best-effort. */
  supabase?: SupabaseClient;
}

export async function orchestrate(
  query: OfficerQuery,
  deps: OrchestrationDeps = {},
): Promise<Briefing> {
  const started = performance.now();
  const session = ensureSession(query);

  // 1. Intent
  const intent = classifyIntent(query);

  // 2. Schedule specialist retrievals in parallel
  const results = await scheduleRetrievals(intent, query, intent.mode);
  await emitEvent(
    {
      event_type: "evidence.collected",
      payload: { intent: intent.mode, sources: results.length },
      emitted_by: query.officer_id,
    },
    { supabase: deps.supabase },
  );

  // 3. Fuse
  const fused = fuseEvidence(results);

  // 3.5 Canonical UIP — build, register, and stamp source_uip_id.
  const queryHash = hashQuery(query.query, session.session_id);
  const uip = buildUipFromOrchestration({
    fused,
    queryHash,
    officerId: query.officer_id,
    query: query.query,
  });
  const uipId = registerUip(uip, queryHash);
  const roundtrip = getUip(uipId);
  console.info("[uip] registered", {
    id: uipId,
    queryHash,
    records: uip.fused.stats.inputRecords,
    canonicalEntities: uip.fused.stats.canonicalEntities,
    sourcesResponded: uip.fused.stats.sourcesResponded,
    retrievable: Boolean(roundtrip),
  });
  if (!roundtrip) {
    console.warn("[uip] REGISTRY MISS — getUip returned undefined for", uipId);
  }

  // 4. Confidence matrix + reasoning
  const matrix = computeConfidenceMatrix(fused);
  const assessment = await reason(intent, fused, matrix);

  // 5. Build the Intelligence Contract — stamp the canonical UIP id.
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

  // 6. Persist. When a server-side client is injected the write runs under
  //    the officer's auth context; otherwise fall back to the browser client
  //    when it has a live session (dev-bypass paths stay silent).
  try {
    const client = deps.supabase ?? browserSupabase;
    let canPersist = Boolean(deps.supabase);
    if (!canPersist) {
      const { data: sess } = await browserSupabase.auth.getSession();
      canPersist = Boolean(sess?.session);
    }
    if (canPersist) {
      const { error } = await client.from("intel_briefings").insert({
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
        source_uip_id: uipId,
      } as never);
      if (error) {
        console.warn("[orchestrator] persist briefing failed:", error.message);
      } else {
        console.info("[orchestrator] briefing persisted", {
          briefing_id: briefing.id,
          source_uip_id: uipId,
        });
      }
    } else {
      console.info("[orchestrator] persistence skipped (no session)");
    }
  } catch (err) {
    console.warn("[orchestrator] persist briefing threw:", err);
  }

  await emitEvent(
    {
      event_type: "briefing.generated",
      payload: {
        briefing_id: briefing.id,
        source_uip_id: uipId,
        mode: briefing.mode,
        confidence: briefing.confidence_matrix.composite,
        latency_ms: briefing.latency_ms,
        within_budget: briefing.latency_ms <= PERF_BUDGETS[briefing.mode].max,
      },
      emitted_by: query.officer_id,
    },
    { supabase: deps.supabase },
  );

  appendHistory(session.session_id, query.query, briefing);
  return briefing;
}
