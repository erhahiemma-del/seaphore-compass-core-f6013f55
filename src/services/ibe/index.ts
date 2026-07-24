/**
 * IBE · Intelligence Behaviour Engine (public entry).
 *
 * Wraps an OIE result with the *behavioural* layer that turns the
 * Copilot from a Q&A assistant into a senior maritime intelligence
 * officer. IBE never bypasses OIE and never invents evidence — it
 * only reshapes tone, injects proactive nudges, maintains
 * hypotheses, adapts to the officer's persona and closes every turn
 * with an operational next step.
 *
 * Contract:
 *   in : (query, missionCtx, oieResult)
 *   out: same OIEResult (unchanged for downstream renderers) plus an
 *        `ibe` field carrying the behavioural overlay AND a rewritten
 *        `briefing.sections`/`humanResponse` so the existing
 *        AdaptiveBriefing renderer surfaces the officer-facing copy
 *        without any UI change.
 */
import type {
  Briefing,
  BriefingSection,
  SectionKind,
} from "@/services/orchestration";
import type { HumanResponse, OIEResult } from "@/services/oie/types";
import type { MissionContext } from "@/stores/mission-context.store";
import { useMissionContextStore } from "@/stores/mission-context.store";

import { inferInvestigationStage, inferPersona } from "./mission-awareness";
import { think } from "./think";
import { personaLead } from "./personality";
import { acknowledgement, coachingLines, naturaliseConfidence } from "./presence";
import { scanForNudges } from "./proactive";
import { deriveHypotheses, readMissionHypotheses } from "./hypotheses";
import { initiativeCloser, initiativeQuestions } from "./initiative";
import { enforceResponseContract, type ResponseContract } from "./response-contract";
import type {
  IbeContext,
  IbeHypothesis,
  IbeResult,
  IbeThought,
  ProactiveNudge,
} from "./types";

export type {
  IbeContext,
  IbeHypothesis,
  IbeResult,
  IbeThought,
  ProactiveNudge,
} from "./types";
export type { ResponseContract, ResponseContractCheck, ResponseContractStep } from "./response-contract";

interface EnhanceInput {
  query: string;
  mission: MissionContext | null;
  result: OIEResult;
}

function rewriteHumanResponse(
  hr: HumanResponse,
  ctx: IbeContext,
  thought: IbeThought,
  nudges: ProactiveNudge[],
  hypotheses: IbeHypothesis[],
): HumanResponse {
  const ack = acknowledgement(ctx, thought);
  const lead = personaLead(ctx.persona, hr);
  const exec = [ack, lead].filter(Boolean).join(" ").trim() || hr.executiveSummary;

  const coachFindings = coachingLines(ctx, thought).map((text) => ({
    priority: "monitor" as const,
    text,
    citations: [],
  }));
  const nudgeFindings = nudges.map((n) => ({
    priority: n.priority,
    text: n.text,
    citations: [],
  }));
  const hypothesisFindings = hypotheses.slice(0, 3).map((h) => ({
    priority: "monitor" as const,
    text: `Working hypothesis (${h.confidence}) — ${h.statement}${
      h.nextEvidenceNeeded[0] ? ` Next: ${h.nextEvidenceNeeded[0]}.` : ""
    }`,
    citations: [],
  }));

  const keyFindings = [
    ...nudgeFindings,
    ...(hr.keyFindings ?? []),
    ...hypothesisFindings,
    ...coachFindings,
  ].slice(0, 8);

  const questions = initiativeQuestions(ctx, thought, hypotheses, hr.suggestedNextQuestions);

  return {
    ...hr,
    executiveSummary: exec,
    keyFindings,
    confidenceAssessment: {
      badge: hr.confidenceAssessment?.badge ?? "Insufficient Evidence",
      explanation: naturaliseConfidence(hr, thought),
    },
    informationStillNeeded: Array.from(
      new Set([...(hr.informationStillNeeded ?? []), ...thought.missing]),
    ).slice(0, 6),
    suggestedNextQuestions: questions,
  };
}

/** Patch the Briefing.sections so the existing renderer picks IBE copy. */
function patchBriefingSections(briefing: Briefing, hr: HumanResponse, closer: string): Briefing {
  const sections = (briefing.sections ?? []).map((s) => ({ ...s }));
  const set = (kind: SectionKind, payload: unknown) => {
    const idx = sections.findIndex((s) => s?.kind === kind);
    if (idx >= 0) sections[idx] = { ...sections[idx], payload } as BriefingSection;
    else sections.push({ kind, title: kind, payload } as BriefingSection);
  };
  set("executive", {
    text: [hr.executiveSummary, hr.situationOverview].filter(Boolean).join("\n\n"),
  });
  set("analytical_assessment", {
    text: [hr.operationalImpact, hr.confidenceAssessment.explanation, closer]
      .filter(Boolean)
      .join(" "),
  });
  set("critical_findings", {
    findings: (hr.keyFindings ?? []).map((f, i) => ({
      priority: f.priority,
      title: f.text,
      grade: (f.citations?.[0]?.grade ?? "OBSERVED") as
        | "VERIFIED"
        | "CORROBORATED"
        | "OBSERVED"
        | "REPORTED"
        | "INFERRED"
        | "UNKNOWN",
      source: f.citations?.[0]?.source ?? "Copilot behavioural layer",
      id: `${briefing.id}-ibe-kf-${i}`,
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
  set("next_questions", { questions: hr.suggestedNextQuestions ?? [] });
  set("intelligence_gaps", { list: hr.informationStillNeeded ?? [] });
  return { ...briefing, sections };
}

/**
 * Wrap an OIE result in the Intelligence Behaviour Engine. Safe to call
 * on either a clarify or briefing turn; clarify turns are returned
 * unchanged since there is no evidence to reshape yet.
 */
export function enhanceWithIBE(input: EnhanceInput): IbeResult {
  const { query, mission, result } = input;

  const ctx: IbeContext = {
    persona: inferPersona(mission),
    stage: inferInvestigationStage(mission),
    mission,
    priorTurnCount: mission?.conversation?.length ?? 0,
    hasPriorFindings: (mission?.evidence?.length ?? 0) > 0,
  };

  if (result.kind === "clarify") {
    const thought = think(query, ctx, result);
    const stubHr: HumanResponse = {
      executiveSummary: "",
      situationOverview: "",
      operationalImpact: "",
      keyFindings: [],
      confidenceAssessment: { badge: "Insufficient Evidence", explanation: "" },
      informationStillNeeded: [],
      suggestedNextQuestions: [],
    } as unknown as HumanResponse;
    const enforcedClarify = enforceResponseContract({
      query,
      ctx,
      oie: result,
      thought,
      nudges: [],
      hypotheses: readMissionHypotheses(mission),
      humanResponse: stubHr,
      closer: "Give me the missing detail and I'll open the investigation.",
    });
    return {
      ...result,
      ibe: {
        thought,
        persona: ctx.persona,
        stage: ctx.stage,
        hypotheses: readMissionHypotheses(mission),
        nudges: [],
        acknowledgement: acknowledgement(ctx, thought),
        closer: enforcedClarify.closer,
        contract: enforcedClarify.contract,
      },
    };
  }

  const thought = think(query, ctx, result);
  const nudges = scanForNudges(mission, result);
  const hypotheses = deriveHypotheses(query, result, readMissionHypotheses(mission));
  const rewritten = rewriteHumanResponse(result.humanResponse, ctx, thought, nudges, hypotheses);
  const rawCloser = initiativeCloser(ctx, thought, hypotheses);
  const enforced = enforceResponseContract({
    query,
    ctx,
    oie: result,
    thought,
    nudges,
    hypotheses,
    humanResponse: rewritten,
    closer: rawCloser,
  });
  const patched = patchBriefingSections(result.briefing, enforced.humanResponse, enforced.closer);

  return {
    ...result,
    briefing: patched,
    humanResponse: enforced.humanResponse,
    ibe: {
      thought,
      persona: ctx.persona,
      stage: ctx.stage,
      hypotheses,
      nudges,
      acknowledgement: acknowledgement(ctx, thought),
      closer: enforced.closer,
      humanResponse: enforced.humanResponse,
      contract: enforced.contract,
    },
  };
}

/**
 * Persist IBE hypotheses onto the active mission context so the next
 * turn (and other Copilot surfaces) see the same working list.
 */
export function persistHypotheses(missionId: string | null, hypotheses: IbeHypothesis[]): void {
  if (!missionId || hypotheses.length === 0) return;
  try {
    useMissionContextStore.getState().setMissionSlice(missionId, "hypotheses", hypotheses);
  } catch {
    // best-effort — persistence must never break the render path
  }
}
