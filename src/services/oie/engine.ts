/**
 * OIE · engine — the 8-module operational pipeline (client-safe).
 *
 * Every stage is defensively wrapped: if any single module throws or
 * returns malformed data we log the technical detail to the developer
 * console and continue with a valid, operational-tone fallback. The
 * officer never sees a JavaScript error — worst case they see a
 * degraded briefing that says the evidence stack could not respond.
 */
import type {
  Briefing,
  BriefingSection,
  ConfidenceMatrix,
  OfficerQuery,
  SectionKind,
} from "@/services/orchestration";
import { orchestrate, type OrchestrationDeps } from "@/services/orchestration";

import { interpretQuery } from "./query-interpreter";
import { resolvePronouns, isBareSkillPick } from "./conversation-resolver";
import { buildMission } from "./mission-builder";
import { needsClarification, buildClarification } from "./clarifier";
import { planSkills } from "./planner";
import { badgeFromComposite } from "./decision-support";
import { buildHumanResponse, type HumanCopyShape } from "./response-generator";
import type {
  HumanResponse,
  InterpretedQuery,
  OIERequest,
  OIEResult,
  OperationalMission,
  OperationalPlan,
} from "./types";
import { SKILLS } from "./skills-registry";
import {
  DEFAULT_PROVIDER_ID,
  getProviderMeta,
  type ReasoningProviderId,
} from "./reasoning-provider";
import { findPlaybook, evaluatePlaybook } from "./playbooks";

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

/* -------------------------------------------------------------------------- */
/*  Defensive guards — every stage returns a complete, valid object.          */
/* -------------------------------------------------------------------------- */

function logStageFailure(stage: string, err: unknown, ctx?: Record<string, unknown>) {
  // Developer-console only — officer never sees these details.
  // eslint-disable-next-line no-console
  console.error(`[OIE] ${stage} failed`, err, ctx ?? {});
}

const DEFAULT_MATRIX: ConfidenceMatrix = {
  evidenceQuality: 0,
  coverage: 0,
  freshness: 0,
  corroboration: 0,
  consistency: 0,
  composite: 0,
  tier: "low",
};

function safeMatrix(m: unknown): ConfidenceMatrix {
  const src = (m ?? {}) as Partial<ConfidenceMatrix>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const tier: ConfidenceMatrix["tier"] =
    src.tier === "high" || src.tier === "medium" ? src.tier : "low";
  return {
    evidenceQuality: num(src.evidenceQuality),
    coverage: num(src.coverage),
    freshness: num(src.freshness),
    corroboration: num(src.corroboration),
    consistency: num(src.consistency),
    composite: num(src.composite),
    tier,
  };
}

function newBriefingId(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return g?.randomUUID?.() ?? `brf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a valid Briefing when the orchestrator throws or returns malformed data. */
function buildDegradedBriefing(
  query: OfficerQuery,
  interpreted: InterpretedQuery,
  reason: string,
): Briefing {
  const matrix = DEFAULT_MATRIX;
  const sections: BriefingSection[] = [
    {
      kind: "classification",
      title: interpreted.mode.toUpperCase(),
      payload: { typeBadge: interpreted.mode, matrix, evidenceStrength: "weak" },
    },
    {
      kind: "executive",
      title: "Executive Assessment",
      payload: {
        text:
          "Our intelligence collection stack could not corroborate this request from the connected sources. We are presenting a structured briefing based on the officer's query only.",
      },
    },
    {
      kind: "intelligence_gaps",
      title: "Intelligence Gaps",
      payload: {
        list: ["External evidence sources did not respond in time.", reason],
      },
    },
    {
      kind: "evidence_sources",
      title: "Evidence Sources",
      payload: { queried: 0, responded: 0, corroborated: 0 },
    },
    {
      kind: "next_questions",
      title: "Next Questions",
      payload: {
        questions: [
          "Retry the query in a moment",
          "Narrow the request to a specific vessel or port",
          "Open the relevant Intelligence Centre directly",
        ],
      },
    },
  ];
  return {
    id: newBriefingId(),
    session_id: query?.session_id,
    officer_id: query?.officer_id ?? "00000000-0000-0000-0000-000000000000",
    query: interpreted.resolved || interpreted.raw || query?.query || "(empty query)",
    workspace: query?.context?.workspace,
    investigation_id: query?.context?.investigation_id,
    mode: interpreted.mode,
    classification: { typeBadge: interpreted.mode, matrix, evidenceStrength: "weak" },
    sections,
    intelligence_status: "insufficient",
    sources_queried: 0,
    sources_responded: 0,
    sources_corroborated: 0,
    confidence_matrix: matrix,
    latency_ms: 0,
    model_used: "degraded-fallback",
  };
}

/** Ensure any Briefing coming out of the orchestrator is renderable. */
function normaliseBriefing(b: Briefing | null | undefined, fallback: Briefing): Briefing {
  if (!b || typeof b !== "object") return fallback;
  const matrix = safeMatrix(
    (b as Briefing).confidence_matrix ?? (b as Briefing).classification?.matrix,
  );
  const classification =
    b.classification && typeof b.classification === "object"
      ? {
          typeBadge: b.classification.typeBadge ?? fallback.classification.typeBadge,
          matrix: safeMatrix(b.classification.matrix ?? matrix),
          evidenceStrength: b.classification.evidenceStrength ?? "weak",
        }
      : fallback.classification;
  return {
    ...fallback,
    ...b,
    id: b.id ?? fallback.id,
    query: b.query ?? fallback.query,
    mode: b.mode ?? fallback.mode,
    sections: Array.isArray(b.sections)
      ? b.sections.filter((s) => s && typeof s === "object")
      : [],
    classification,
    confidence_matrix: matrix,
    intelligence_status: b.intelligence_status ?? fallback.intelligence_status,
    sources_queried: typeof b.sources_queried === "number" ? b.sources_queried : 0,
    sources_responded: typeof b.sources_responded === "number" ? b.sources_responded : 0,
    sources_corroborated:
      typeof b.sources_corroborated === "number" ? b.sources_corroborated : 0,
    latency_ms: typeof b.latency_ms === "number" ? b.latency_ms : 0,
    model_used: b.model_used ?? fallback.model_used,
  };
}

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
 * renderer displays the operational 8-section HumanResponse. Fully
 * defensive: malformed sections are skipped rather than thrown.
 */
function patchBriefingWithHumanResponse(
  briefing: Briefing,
  human: HumanResponse,
  plan: OperationalPlan,
): Briefing {
  const sections = Array.isArray(briefing.sections) ? briefing.sections : [];
  const clone: Briefing = { ...briefing, sections: sections.map((s) => ({ ...s })) };

  const set = (kind: SectionKind, payload: unknown) => {
    try {
      const idx = clone.sections.findIndex((s) => s?.kind === kind);
      if (idx >= 0) {
        clone.sections[idx] = { ...clone.sections[idx], payload } as BriefingSection;
      } else {
        clone.sections.push({ kind, title: kind, payload } as BriefingSection);
      }
    } catch (err) {
      logStageFailure("patchBriefing.set", err, { kind });
    }
  };

  set("executive", {
    text: [human.executiveSummary, human.situationOverview].filter(Boolean).join("\n\n"),
  });

  set("analytical_assessment", {
    text: [
      human.operationalImpact,
      `Confidence: ${human.confidenceAssessment.badge}. ${human.confidenceAssessment.explanation}`,
    ]
      .filter(Boolean)
      .join(" "),
  });

  set("critical_findings", {
    findings: (human.keyFindings ?? []).map((f, i) => ({
      priority: f.priority,
      title: f.text,
      grade:
        (f.citations?.[0]?.grade as
          | "VERIFIED"
          | "CORROBORATED"
          | "OBSERVED"
          | "REPORTED"
          | "INFERRED"
          | "UNKNOWN") ?? "OBSERVED",
      source: f.citations?.[0]?.source ?? plan.primarySkill.label,
      id: `${briefing.id}-kf-${i}`,
      citations: (f.citations ?? []).map((c) => ({
        id: c.id,
        source: c.source,
        grade: c.grade,
        hash: c.hash,
        excerpt: c.excerpt,
        collected_at: c.collectedAt,
      })),
    })),
  });

  set("officer_actions", {
    actions: (human.recommendedActions ?? []).map((r, i) => ({
      id: `${briefing.id}-ra-${i}`,
      label: `${r.action} — ${r.confidence}`,
    })),
  });

  set("intelligence_gaps", { list: human.informationStillNeeded ?? [] });
  set("next_questions", { questions: human.suggestedNextQuestions ?? [] });

  return clone;
}

/** Runs `fn`; if it throws, logs and returns `fallback`. */
function safeSync<T>(stage: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    logStageFailure(stage, err);
    return fallback;
  }
}

async function safeAsync<T>(stage: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logStageFailure(stage, err);
    return fallback;
  }
}

const STUB_INTERPRETED: InterpretedQuery = {
  raw: "",
  resolved: "",
  intent: "ambiguous",
  mode: "assessment",
  domains: [],
  entities: [],
  reasoning: "",
  ambiguous: true,
};

export async function runOIE(
  req: OIERequest,
  providerCall: ProviderCall = nullProviderCall,
  deps: OrchestrationDeps = {},
): Promise<OIEResult> {
  const started = Date.now();
  const q: OfficerQuery = req?.query ?? ({} as OfficerQuery);
  const providerId: ReasoningProviderId =
    (req?.providerId as ReasoningProviderId) ?? DEFAULT_PROVIDER_ID;
  const providerMeta = safeSync(
    "providerMeta",
    () => getProviderMeta(providerId),
    {
      id: providerId,
      label: String(providerId),
      available: false,
      gatewayModel: undefined,
    } as ReturnType<typeof getProviderMeta>,
  );

  try {
    if (!q || typeof q.query !== "string" || q.query.trim().length === 0) {
      return {
        kind: "clarify",
        clarification: {
          question: "What line of enquiry should we open?",
          options: SKILLS.slice(0, 6).map((s) => ({
            id: s.id,
            label: s.label,
            hint: s.description,
          })),
        },
        interpreted: { ...STUB_INTERPRETED },
        latencyMs: Date.now() - started,
      };
    }

    // Stage 1 — mission (pre) for conversation history.
    const rawMission = (q.mission ?? {}) as Record<string, unknown>;
    const preMission = safeSync(
      "buildMission.pre",
      () =>
        buildMission(
          {
            investigationId: q.context?.investigation_id,
            workspace: q.context?.workspace,
            raw: rawMission,
          },
          { ...STUB_INTERPRETED, raw: q.query, resolved: q.query },
        ),
      {
        investigationId: q.context?.investigation_id,
        workspace: q.context?.workspace,
        conversation: [],
      } as OperationalMission,
    );

    // Stage 2 — bare-skill rewrite + pronoun resolution.
    const bareRewrite = safeSync("bareSkillPick", () => isBareSkillPick(q.query), null);
    let queryText = q.query;
    const priorAnchor = preMission.lastEntity;
    if (bareRewrite && priorAnchor) queryText = `${bareRewrite} ${priorAnchor.value}`;

    const resolution = safeSync(
      "resolvePronouns",
      () => resolvePronouns(queryText, preMission.conversation ?? []),
      { resolved: queryText, changed: false } as ReturnType<typeof resolvePronouns>,
    );
    const anchor = resolution.anchor ?? priorAnchor;

    // Stage 3 — Query Interpreter.
    const interpreted = safeSync(
      "interpretQuery",
      () =>
        interpretQuery(q.query, {
          anchor,
          resolvedQuery: resolution.resolved,
        }),
      { ...STUB_INTERPRETED, raw: q.query, resolved: q.query },
    );

    // Stage 4 — Mission Builder (full).
    const mission = safeSync(
      "buildMission.full",
      () =>
        buildMission(
          {
            investigationId: q.context?.investigation_id,
            workspace: q.context?.workspace,
            raw: rawMission,
          },
          interpreted,
        ),
      preMission,
    );

    // Stage 5 — Clarifier.
    if (safeSync("needsClarification", () => needsClarification(interpreted), false)) {
      return {
        kind: "clarify",
        clarification: safeSync(
          "buildClarification",
          () => buildClarification(interpreted),
          {
            question: "What line of enquiry should we open?",
            options: SKILLS.slice(0, 6).map((s) => ({
              id: s.id,
              label: s.label,
              hint: s.description,
            })),
          },
        ),
        interpreted,
        latencyMs: Date.now() - started,
      };
    }

    // Stage 6 — Planner.
    const plan = safeSync(
      "planSkills",
      () => planSkills(interpreted),
      {
        interpreted,
        primarySkill: SKILLS.find((s) => s.id === "executive_briefing") ?? SKILLS[0],
        supportingSkills: [],
        capabilities: [],
        followUps: [],
      } as OperationalPlan,
    );

    // Stage 7 — Evidence Collector (orchestrator). Never crash the pipeline.
    const fallbackBriefing = buildDegradedBriefing(
      q,
      interpreted,
      "Orchestrator returned no evidence.",
    );

    // Sticky-subject propagation: when the interpreter carried an
    // anchor forward (officer did NOT name a new subject this turn),
    // inject that anchor into the orchestrator context AND append it
    // to the resolved query text so downstream retrieval and reasoning
    // both stay locked on the same vessel/company/port. The moment the
    // officer names a different subject, interpreted.anchor is
    // undefined and this branch is skipped.
    const stickyAnchor = interpreted.anchor;
    const anchorContext: Record<string, string> = {};
    let anchoredQuery = interpreted.resolved || q.query;
    if (stickyAnchor) {
      const alreadyMentioned = new RegExp(
        `\\b${stickyAnchor.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(anchoredQuery);
      if (!alreadyMentioned) {
        anchoredQuery = `${anchoredQuery} (regarding ${stickyAnchor.value})`;
      }
      if (stickyAnchor.type === "vessel" || stickyAnchor.type === "imo" || stickyAnchor.type === "mmsi") {
        if (!q.context?.vessel) anchorContext.vessel = stickyAnchor.value;
      } else if (stickyAnchor.type === "port") {
        if (!q.context?.port) anchorContext.port = stickyAnchor.value;
      } else if (stickyAnchor.type === "company") {
        if (!(q.context as Record<string, unknown> | undefined)?.company)
          anchorContext.company = stickyAnchor.value;
      }
    }

    const rawBriefing = await safeAsync(
      "orchestrate",
      () =>
        orchestrate({
          ...q,
          query: anchoredQuery,
          moduleHint: q.moduleHint ?? plan.primarySkill.id,
          context: {
            ...(q.context ?? {}),
            ...anchorContext,
            workspace: q.context?.workspace ?? mission.workspace,
          },
        }),
      fallbackBriefing,
    );
    const briefing = normaliseBriefing(rawBriefing, fallbackBriefing);

    // Stage 8 — Reasoning Provider.
    const invocation = await safeAsync(
      "providerCall",
      () => providerCall(briefing, summariseMission(mission), plan),
      {
        copy: null,
        degraded: true,
        reason: "Reasoning provider unavailable — using structured fallback.",
      } as ProviderInvocationResult,
    );

    // Stage 9 — Response Generator.
    const humanResponse = safeSync(
      "buildHumanResponse",
      () => buildHumanResponse(briefing, invocation.copy, plan),
      buildHumanResponse(briefing, null, plan),
    );

    // Canonical badge invariant.
    try {
      const canonicalBadge = badgeFromComposite(
        briefing.confidence_matrix.composite,
        briefing.intelligence_status === "insufficient",
      );
      humanResponse.confidenceAssessment.badge = canonicalBadge;
      humanResponse.recommendedActions = (humanResponse.recommendedActions ?? []).map((r) => ({
        ...r,
        confidence: canonicalBadge,
      }));
    } catch (err) {
      logStageFailure("canonicalBadge", err);
    }

    // Stage 9.5 — Playbook Engine overlay.
    // Deterministic SOP rules override the reasoning provider's
    // recommendations and confidence explanation. The playbook never
    // introduces facts; it only reshapes what the officer sees so
    // every investigation is repeatable regardless of the brain used.
    safeSync(
      "applyPlaybook",
      () => {
        const playbook = findPlaybook(plan.primarySkill.id);
        if (!playbook) return;
        const evaluation = evaluatePlaybook(playbook, briefing, mission);

        if (evaluation.recommendedActions.length > 0) {
          humanResponse.recommendedActions = evaluation.recommendedActions.map((r) => ({
            action: r.action,
            confidence: r.confidence,
            rationale: r.rationale,
          }));
        }
        if (evaluation.informationStillNeeded.length > 0) {
          humanResponse.informationStillNeeded = evaluation.informationStillNeeded;
        }
        if (evaluation.suggestedNextQuestions.length > 0) {
          humanResponse.suggestedNextQuestions = evaluation.suggestedNextQuestions;
        }
        humanResponse.confidenceAssessment = {
          badge: evaluation.confidence.badge,
          explanation: evaluation.confidence.explanation,
        };
      },
      undefined,
    );

    const patchedBriefing = safeSync(
      "patchBriefing",
      () => patchBriefingWithHumanResponse(briefing, humanResponse, plan),
      briefing,
    );


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
  } catch (err) {
    // Catastrophic fallback — should be unreachable because every stage is
    // already guarded, but we NEVER let the OIE throw to the officer.
    logStageFailure("runOIE.catastrophic", err, { query: q?.query });
    const interpreted: InterpretedQuery = {
      ...STUB_INTERPRETED,
      raw: q?.query ?? "",
      resolved: q?.query ?? "",
    };
    const briefing = buildDegradedBriefing(
      q,
      interpreted,
      "Copilot pipeline is temporarily degraded. Please retry.",
    );
    const plan: OperationalPlan = {
      interpreted,
      primarySkill: SKILLS.find((s) => s.id === "executive_briefing") ?? SKILLS[0],
      supportingSkills: [],
      capabilities: [],
      followUps: [],
    };
    const humanResponse = buildHumanResponse(briefing, null, plan);
    return {
      kind: "briefing",
      briefing,
      humanResponse,
      plan,
      provider: { id: providerMeta.id, label: providerMeta.label, degraded: true },
      latencyMs: Date.now() - started,
    };
  }
}
