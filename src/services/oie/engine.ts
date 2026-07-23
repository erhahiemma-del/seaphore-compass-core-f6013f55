/**
 * OIE · engine — the 8-module operational pipeline.
 *
 *   1. Query Interpreter   → structured intent + entities
 *   2. Mission Context     → active investigation snapshot
 *   3. Skills Registry     → catalogue of operational capabilities
 *   4. Operational Planner → picks skills for this query
 *   5. Evidence Collector  → delegates to the existing orchestrator
 *                            (its scheduler/fusion/reasoning stack)
 *   6. Reasoning Provider  → Gemini / GPT / Claude (pluggable)
 *   7. Decision Support    → confidence badges + explanation
 *   8. Response Generator  → the final operational Human Response
 *
 * The engine returns BOTH the raw `Briefing` (so the existing Adaptive
 * Briefing renderer keeps working unchanged) AND a `HumanResponse`
 * (used by the new operational panel). Nothing in the UI or downstream
 * services has to change for a new reasoning provider — only this file
 * and `provider-runtime.server.ts` decide who thinks.
 */
import type { Briefing, OfficerQuery } from "@/services/orchestration";
import { orchestrate } from "@/services/orchestration";

import { interpretQuery } from "./query-interpreter";
import { buildMission } from "./mission-builder";
import { planSkills, planCapabilities } from "./planner";
import { badgeFromComposite } from "./decision-support";
import { buildHumanResponse } from "./response-generator";
import { getProviderMeta, DEFAULT_PROVIDER_ID, type ReasoningProviderId } from "./reasoning-provider";
import { invokeReasoningProvider } from "./provider-runtime.server";
import type { OIERequest, OIEResult, OperationalMission } from "./types";

function summariseMission(m: OperationalMission): string {
  const parts: string[] = [];
  if (m.investigationId) parts.push(`investigation ${m.investigationId}`);
  if (m.vesselRef) parts.push(`vessel ${m.vesselRef}`);
  if (m.voyageRef) parts.push(`voyage ${m.voyageRef}`);
  if (m.portRef) parts.push(`port ${m.portRef}`);
  if (m.companyRefs && m.companyRefs.length > 0)
    parts.push(`companies ${m.companyRefs.slice(0, 3).join(", ")}`);
  return parts.join("; ");
}

export async function runOIE(req: OIERequest): Promise<OIEResult> {
  const started = Date.now();
  const q: OfficerQuery = req.query;

  // 1. Interpret
  const interpreted = interpretQuery(q.query);

  // 2. Mission context
  const mission = buildMission(
    {
      investigationId: q.context?.investigation_id,
      workspace: q.context?.workspace,
      raw: q.mission,
    },
    interpreted,
  );

  // 3–4. Skills + plan
  const plan = planSkills(interpreted);
  const capabilities = planCapabilities(plan);

  // 5. Evidence Collector — delegate to the existing orchestration engine.
  //    The planner's capability bias rides on `moduleHint` for now; the
  //    intent-classifier already respects domains via keywords, so this
  //    keeps the downstream engine untouched.
  const briefing: Briefing = await orchestrate({
    ...q,
    moduleHint: q.moduleHint ?? interpreted.domains[0],
    context: { ...(q.context ?? {}), workspace: q.context?.workspace ?? mission.workspace },
  });

  // 6. Reasoning Provider — humanize the assessment.
  const providerId: ReasoningProviderId =
    (req.providerId as ReasoningProviderId) ?? DEFAULT_PROVIDER_ID;
  const providerMeta = getProviderMeta(providerId);
  const invocation = await invokeReasoningProvider(
    providerId,
    briefing,
    summariseMission(mission),
  );

  // 7–8. Decision Support + Human Response
  const humanResponse = buildHumanResponse(briefing, invocation.copy);

  // Enforce the confidence-badge invariant even if the provider drifted.
  const canonicalBadge = badgeFromComposite(
    briefing.confidence_matrix.composite,
    briefing.intelligence_status === "insufficient",
  );
  humanResponse.confidenceAssessment.badge = canonicalBadge;

  return {
    briefing,
    humanResponse,
    plan: { ...plan, requiresDecisionSupport: capabilities.length > 0 },
    provider: {
      id: providerMeta.id,
      label: providerMeta.label,
      degraded: invocation.degraded,
    },
    latencyMs: Date.now() - started,
  };
}
