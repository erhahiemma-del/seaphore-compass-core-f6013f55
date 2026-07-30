/**
 * LAYER 2.1 — Copilot Orchestrator (control plane).
 *
 * Coordinates the entire pipeline: Intent → Scheduler → IAL Bridge →
 * Identity Resolution → IFE Fusion → UIP → Reasoning → Briefing →
 * Persistence → Event Bus. NEVER reasons or retrieves.
 *
 * Slice 3 (Producer Swap): the legacy `evidence-fusion.ts` and the ad-hoc
 * `uip-adapter.ts` are gone. Evidence now flows through the canonical
 * pipeline:
 *
 *   RetrievalResult[]  (agents)
 *     → bridgeToIal          → NormalizedEvidence[] + SourceAttribution[]
 *     → buildUnifiedIntelligencePackage  (identity resolution + IFE fusion)
 *     → registerUip          (canonical SSOT — every downstream module
 *                             resolves the exact same evidence via getUip)
 *     → projectFusedView     (compat projection for the reasoning engine
 *                             and briefing builder)
 *
 * The briefing is stamped with `source_uip_id` so every downstream
 * capability — predictions, patterns, revenue leakage, evidence explorer,
 * OKL panels — reads the same fused package.
 */
import { classifyIntent } from "./intent-classifier";
import { ensureSession, appendHistory } from "./context-manager";
import { scheduleRetrievals } from "./scheduler";
import { bridgeToIal } from "./ial-bridge";
import { projectFusedView } from "./fused-view";
import { reason, computeConfidenceMatrix } from "./reasoning-engine";
import { buildBriefing } from "./briefing-builder";
import { emitEvent } from "./event-bus";
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import { PERF_BUDGETS } from "./constants";
import { hashQuery, registerUip, getUip } from "@/services/ife/registry";
import { buildUnifiedIntelligencePackage } from "@/services/ife/unified";
import { processMicBootstrap } from "@/services/mic/bootstrap";
import { isMicEnabled } from "@/services/mic/feature-flag";
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

  // 2. Schedule specialist retrievals in parallel — thread the authenticated
  //    client so every agent reads under the officer's auth context (RLS).
  const results = await scheduleRetrievals(intent, query, intent.mode, {
    supabase: deps.supabase,
  });
  const respondedCount = results.filter((r) => r.responded).length;
  const evidenceCount = results.reduce((n, r) => n + (r.evidence?.length ?? 0), 0);
  console.info("[orchestrator] retrieval", {
    officer: query.officer_id,
    authenticated: Boolean(deps.supabase),
    scheduled: results.length,
    responded: respondedCount,
    evidence: evidenceCount,
    errors: results.filter((r) => r.error).map((r) => `${r.agent}:${r.error}`),
  });
  await emitEvent(
    {
      event_type: "evidence.collected",
      payload: {
        intent: intent.mode,
        sources: results.length,
        responded: respondedCount,
        evidence: evidenceCount,
      },
      emitted_by: query.officer_id,
    },
    { supabase: deps.supabase },
  );

  // 3. IAL boundary — normalise every agent's evidence stream into the
  //    canonical Seaphore evidence contract.
  const { records, sources } = bridgeToIal(results);

  // 4. Canonical IFE — identity resolution + fusion produces the UIP.
  const uip = buildUnifiedIntelligencePackage({
    input: { records, sources },
  });

  // 4.5 Register the UIP so every downstream capability resolves the exact
  //     same evidence set via getUip(source_uip_id).
  const queryHash = hashQuery(query.query, session.session_id);
  const uipId = registerUip(uip, queryHash);
  const roundtrip = getUip(uipId);
  console.info("[uip] registered", {
    id: uipId,
    queryHash,
    records: uip.fused.stats.inputRecords,
    canonicalEntities: uip.fused.stats.canonicalEntities,
    identityClusters: uip.identity.length,
    contradictions: uip.fused.stats.contradictions,
    sourcesResponded: uip.fused.stats.sourcesResponded,
    retrievable: Boolean(roundtrip),
  });
  if (!roundtrip) {
    console.warn("[uip] REGISTRY MISS — getUip returned undefined for", uipId);
  }

  // 4.6 Maritime Intelligence Core — feature-flag-gated, failure-isolated.
  //     When MIC_ENABLED=false the block is skipped entirely and the pipeline
  //     continues exactly as it did before the MIC existed.
  //     When enabled: process() runs, telemetry emits, result is captured.
  //     On any failure: caught, logged, outcome=failed — pipeline continues.
  if (isMicEnabled()) {
    const micResult = processMicBootstrap(uip, uipId);
    console.info("[MIC] bootstrap", {
      executionId: micResult.executionId,
      outcome:     micResult.outcome,
      durationMs:  micResult.telemetry.totalDurationMs,
      entities:    micResult.telemetry.entitiesRegistered,
      evidence:    micResult.telemetry.evidenceRegistered,
      risk:        micResult.telemetry.riskProfilesComputed,
      timeline:    micResult.telemetry.timelineEvents,
      flag:        "enabled",
      warnings:    micResult.telemetry.warnings.length,
      errors:      micResult.telemetry.errors.length,
    });
  } else {
    console.info("[MIC] bootstrap skipped — MIC_ENABLED=false");
  }

  // 5. Compat projection for the reasoning engine + briefing builder.
  const fused = projectFusedView(results, uip);

  // 6. Confidence matrix + reasoning
  const matrix = computeConfidenceMatrix(fused);
  const assessment = await reason(intent, fused, matrix);

  // 7. Build the Intelligence Contract — stamp the canonical UIP id.
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

  // 8. Persist. When a server-side client is injected the write runs under
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
