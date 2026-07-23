/**
 * OIE · engine — the 8-module operational pipeline (client-safe).
 *
 *   1. Query Interpreter        → structured intent + entities
 *   2. Conversation Resolver    → pronoun / anaphora resolution
 *   3. Mission Context Builder  → active investigation snapshot
 *   4. Clarifier                → short-circuits when the request is ambiguous
 *   5. Skills Registry          → catalogue of operational capabilities
 *   6. Operational Planner      → picks the primary + supporting skills
 *   7. Evidence Collector       → delegates to the existing orchestrator
 *   8. Reasoning Provider       → (injected) Gemini / GPT / Claude
 *   9. Decision Support         → confidence badges + explanation
 *  10. Response Generator       → operational-tone 8-section briefing
 *
 * This file has NO server-only imports so it stays client-bundle safe.
 * The reasoning provider is INJECTED (see `oie.functions.ts` for the
 * server path). When no provider is injected the engine still produces
 * a full, operational-tone response using the deterministic fallback.
 */
import type { Briefing, BriefingSection, OfficerQuery, SectionKind } from "@/services/orchestration";
import { orchestrate } from "@/services/orchestration";

import { interpretQuery } from "./query-interpreter";
import { resolvePronouns, isBareSkillPick } from "./conversation-resolver";
import { buildMission } from "./mission-builder";
import { needsClarification, buildClarification } from "./clarifier";
import { planSkills } from "./planner";
import { badgeFromComposite } from "./decision-support";
import { buildHumanResponse, type HumanCopyShape } from "./response-generator";
import type { HumanResponse, OIERequest, OIEResult, OperationalMission, OperationalPlan } from "./types";
import { DEFAULT_PROVIDER_ID, getProviderMeta, type ReasoningProviderId } from "./reasoning-provider";

export interface ProviderInvocationResult {
  copy: HumanCopyShape | null;
  degraded: boolean;
  reason?: string;
}
export type ProviderCall = (
  briefing: Briefing,
  missionSummary: string,
  plan: OperationalPlan,
) => Promise<ProviderInvocationResult>;

const nullProviderCall: ProviderCall = async () => ({
  copy: null,
  degraded: true,
  reason: "Operational response generated from structured evidence.",
});

function summariseMission(m: OperationalMission): string {
  const parts: string[] = [];
  if (m.investigationId) parts.push(`investigation ${m.investigationId}`);
  if (m.vesselRef) parts.push(`vessel ${m.vesselRef}`);
  if (m.voyageRef) parts.push(`voyage ${m.voyageRef}`);
  if (m.portRef) parts.push(`port ${m.portRef}`);
  if (m.companyRefs && m.companyRefs.length > 0)
    parts.push(`companies ${m.companyRefs.slice(0, 3).join(", ")}`);
  if (m.lastEntity) parts.push(`focus: ${m.lastEntity.type} ${m.lastEntity.value}`);
  return parts.join("; ");
}

/**
 * Patches the orchestration briefing so the existing AdaptiveBriefing
 * renderer displays the operational 8-section HumanResponse. This is a
 * one-way projection: the engine's structured evidence is preserved,
 * only the human-facing copy in the section payloads is replaced.
 */
function patchBriefingWithHumanResponse(
  briefing: Briefing,
  human: HumanResponse,
  plan: OperationalPlan,
): Briefing {
  const clone = { ...briefing, sections: briefing.sections.map((s) => ({ ...s })) };

  const set = (kind: SectionKind, payload: unknown) => {
    const idx = clone.sections.findIndex((s) => s.kind === kind);
    if (idx >= 0) {
      clone.sections[idx] = { ...clone.sections[idx], payload } as BriefingSection;
    }
  };

  // Executive → operational Executive Summary + Situation Overview
  set("executive", {
    text: [human.executiveSummary, human.situationOverview].filter(Boolean).join("\n\n"),
  });

  // Analytical assessment → Operational Impact + confidence explanation
  set("analytical_assessment", {
    text: [
      human.operationalImpact,
      `Confidence: ${human.confidenceAssessment.badge}. ${human.confidenceAssessment.explanation}`,
    ]
      .filter(Boolean)
      .join(" "),
  });

  // Critical findings → operational key findings (with their citations
  // preserved so officers can verify the source evidence for each one).
  set("critical_findings", {
    findings: human.keyFindings.map((f, i) => ({
      priority: f.priority,
      title: f.text,
      grade: (f.citations[0]?.grade as
        | "VERIFIED"
        | "CORROBORATED"
        | "OBSERVED"
        | "REPORTED"
        | "INFERRED"
        | "UNKNOWN") ?? "OBSERVED",
      source: f.citations[0]?.source ?? plan.primarySkill.label,
      id: `${briefing.id}-kf-${i}`,
      citations: f.citations.map((c) => ({
        id: c.id,
        source: c.source,
        grade: c.grade,
        hash: c.hash,
        excerpt: c.excerpt,
        collected_at: c.collectedAt,
      })),
    })),
  });

  // Officer actions → Recommended actions (with badge in the rationale)
  set("officer_actions", {
    actions: human.recommendedActions.map((r, i) => ({
      id: `${briefing.id}-ra-${i}`,
      label: `${r.action} — ${r.confidence}`,
    })),
  });

  // Intelligence gaps → Information still needed
  set("intelligence_gaps", { list: human.informationStillNeeded });

  // Next questions → Suggested next questions
  set("next_questions", { questions: human.suggestedNextQuestions });

  return clone;
}

export async function runOIE(
  req: OIERequest,
  providerCall: ProviderCall = nullProviderCall,
): Promise<OIEResult> {
  const started = Date.now();
  const q: OfficerQuery = req.query;

  // Build a minimal mission first (for conversation history only) — we
  // need the conversation BEFORE we can resolve pronouns.
  const rawMission = q.mission ?? {};
  const preMission = buildMission(
    {
      investigationId: q.context?.investigation_id,
      workspace: q.context?.workspace,
      raw: rawMission,
    },
    // temporary interpreted stub — replaced below
    { raw: q.query, resolved: q.query, intent: "ambiguous", mode: "assessment", domains: [], entities: [], reasoning: "", ambiguous: true },
  );

  // 1. Resolve bare-skill picks ("Manifest", "Ownership") using the
  //    last officer turn as the entity anchor.
  const bareRewrite = isBareSkillPick(q.query);
  let queryText = q.query;
  let priorAnchor = preMission.lastEntity;
  if (bareRewrite && priorAnchor) {
    queryText = `${bareRewrite} ${priorAnchor.value}`;
  }

  // 2. Resolve pronouns against the conversation history.
  const resolution = resolvePronouns(queryText, preMission.conversation);
  const anchor = resolution.anchor ?? priorAnchor;

  // 3. Interpret.
  const interpreted = interpretQuery(q.query, {
    anchor,
    resolvedQuery: resolution.resolved,
  });

  // 4. Build the full mission (now with the correct interpreted entity set).
  const mission = buildMission(
    {
      investigationId: q.context?.investigation_id,
      workspace: q.context?.workspace,
      raw: rawMission,
    },
    interpreted,
  );

  // 5. Clarify if ambiguous — short-circuit before touching the orchestrator.
  if (needsClarification(interpreted)) {
    return {
      kind: "clarify",
      clarification: buildClarification(interpreted),
      interpreted,
      latencyMs: Date.now() - started,
    };
  }

  // 6. Plan.
  const plan = planSkills(interpreted);

  // 7. Evidence Collector — delegate to the existing orchestration engine.
  const briefing: Briefing = await orchestrate({
    ...q,
    query: interpreted.resolved,
    moduleHint: q.moduleHint ?? plan.primarySkill.id,
    context: { ...(q.context ?? {}), workspace: q.context?.workspace ?? mission.workspace },
  });

  // 8. Reasoning Provider — humanize.
  const providerId: ReasoningProviderId =
    ((req.providerId as ReasoningProviderId) ?? DEFAULT_PROVIDER_ID);
  const providerMeta = getProviderMeta(providerId);
  const invocation = await providerCall(briefing, summariseMission(mission), plan);

  // 9–10. Decision Support + Response Generator.
  const humanResponse = buildHumanResponse(briefing, invocation.copy, plan);

  // Enforce the canonical confidence badge invariant.
  const canonicalBadge = badgeFromComposite(
    briefing.confidence_matrix.composite,
    briefing.intelligence_status === "insufficient",
  );
  humanResponse.confidenceAssessment.badge = canonicalBadge;
  humanResponse.recommendedActions = humanResponse.recommendedActions.map((r) => ({
    ...r,
    confidence: canonicalBadge,
  }));

  // Project the operational copy back into the briefing sections so the
  // existing Adaptive Briefing renderer displays the operational tone.
  const patchedBriefing = patchBriefingWithHumanResponse(briefing, humanResponse, plan);

  return {
    kind: "briefing",
    briefing: patchedBriefing,
    humanResponse,
    plan,
    provider: {
      id: providerMeta.id,
      label: providerMeta.label,
      degraded: invocation.degraded,
    },
    latencyMs: Date.now() - started,
  };
}
