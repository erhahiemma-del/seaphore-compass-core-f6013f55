/**
 * OIE · Module 8 — Human Response Generator.
 *
 * Composes the final `HumanResponse` from (a) the engine briefing,
 * (b) the Reasoning Provider's operational copy, and (c) the Decision
 * Support badges. When the provider is degraded/unavailable, this
 * module still produces a complete response using only the engine's
 * structured sections — the officer never sees a blank briefing.
 */
import type { Briefing, BriefingSection, SectionKind } from "@/services/orchestration";
import { badgeFromComposite, explainMatrix } from "./decision-support";
import type { HumanCopy } from "./provider-runtime.server";
import type { ConfidenceBadge, HumanResponse } from "./types";

const OFFICER_NOTICE: HumanResponse["officerNotice"] =
  "Officer decides — Seaphore only observes and recommends.";

// The BriefingSection type is generic on SectionKind but not a discriminated
// union, so a same-typed narrow isn't possible; we cast the payload at the
// use site (mirrors `adapt-briefing.ts`).
type AnyPayload = { title: string; payload: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function pickSection(sections: BriefingSection[], kind: SectionKind): AnyPayload | undefined {
  return sections.find((s) => s.kind === kind) as AnyPayload | undefined;
}

interface CriticalFindingIn {
  priority: string;
  title: string;
  source: string;
}
interface OfficerActionIn {
  id: string;
  label: string;
}

function fallbackFromBriefing(briefing: Briefing): HumanResponse {
  const s = briefing.sections;
  const executive = (pickSection(s, "executive")?.payload.text as string | undefined) ?? "";
  const analytical =
    (pickSection(s, "analytical_assessment")?.payload.text as string | undefined) ?? "";
  const verified = (pickSection(s, "verified_evidence")?.payload.items as string[] | undefined) ?? [];
  const critical =
    (pickSection(s, "critical_findings")?.payload.findings as CriticalFindingIn[] | undefined) ?? [];
  const gaps = (pickSection(s, "intelligence_gaps")?.payload.list as string[] | undefined) ?? [];
  const nextQ = (pickSection(s, "next_questions")?.payload.questions as string[] | undefined) ?? [];
  const actions =
    (pickSection(s, "officer_actions")?.payload.actions as OfficerActionIn[] | undefined) ?? [];
  const impact = pickSection(s, "decision_impact")?.payload as
    | { revenue: number; security: number; operational: number; cargo: number }
    | undefined;

  const insufficient = briefing.intelligence_status === "insufficient";
  const badge: ConfidenceBadge = badgeFromComposite(
    briefing.confidence_matrix.composite,
    insufficient,
  );

  const impactSummary = impact
    ? `Revenue exposure ${impact.revenue.toLocaleString()}, operational impact ${impact.operational}/10, security ${impact.security}/10.`
    : "Impact not quantified in this briefing.";

  return {
    situationOverview:
      executive ||
      "Observations available; awaiting officer direction on the specific line of enquiry.",
    verifiedFacts: verified,
    analyticalAssessment:
      analytical ||
      "Assessment pending — the engine returned observations without a consolidated analytical statement.",
    keyFindings: critical.map((f) => ({
      priority:
        f.priority === "critical" || f.priority === "high" || f.priority === "monitor"
          ? f.priority
          : "monitor",
      text: `${f.title} (source: ${f.source})`,
    })),
    recommendations: actions.slice(0, 4).map((a) => ({
      action: a.label,
      confidence: badge,
      rationale: gaps.length > 0 ? `Some intelligence gaps remain: ${gaps[0]}` : "Consistent with observed evidence.",
    })),
    confidenceAssessment: {
      badge,
      explanation: explainMatrix(briefing.confidence_matrix),
    },
    operationalImpact: impactSummary,
    nextQuestions: nextQ.slice(0, 4),
    officerNotice: OFFICER_NOTICE,
  };
}

export function buildHumanResponse(
  briefing: Briefing,
  copy: HumanCopy | null,
): HumanResponse {
  if (!copy) return fallbackFromBriefing(briefing);

  const insufficient = briefing.intelligence_status === "insufficient";
  const badge = badgeFromComposite(briefing.confidence_matrix.composite, insufficient);

  return {
    situationOverview: copy.situationOverview,
    verifiedFacts: copy.verifiedFacts,
    analyticalAssessment: copy.analyticalAssessment,
    keyFindings: copy.keyFindings,
    recommendations: copy.recommendations,
    confidenceAssessment: {
      badge,
      explanation: copy.confidenceExplanation || explainMatrix(briefing.confidence_matrix),
    },
    operationalImpact: copy.operationalImpact,
    nextQuestions: copy.nextQuestions.slice(0, 4),
    officerNotice: OFFICER_NOTICE,
  };
}
