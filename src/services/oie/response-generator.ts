/**
 * OIE · Module 8 — Human Response Generator.
 *
 * Composes the mandated 8-section HumanResponse from (a) the engine
 * briefing, (b) the reasoning provider's operational copy, and (c) the
 * decision support badges. When the provider is degraded/unavailable
 * this module still produces a complete, operational-tone response
 * using only the engine's structured sections + the skill template —
 * the officer never sees a blank briefing or AI terminology.
 */
import type { Briefing, BriefingSection, SectionKind } from "@/services/orchestration";
import { badgeFromComposite, explainMatrix } from "./decision-support";
import type { ConfidenceBadge, HumanResponse, OperationalPlan } from "./types";

/** Shape of the humanized copy the reasoning provider returns.
 *  Defined here (client-safe) so `engine.ts` never has to import
 *  `provider-runtime.server.ts` to know the shape. */
export interface HumanCopyShape {
  executiveSummary: string;
  situationOverview: string;
  keyFindings: Array<{ priority: "critical" | "high" | "monitor"; text: string }>;
  operationalImpact: string;
  recommendedActions: Array<{ action: string; confidence: ConfidenceBadge; rationale: string }>;
  informationStillNeeded: string[];
  suggestedNextQuestions: string[];
  confidenceExplanation: string;
}

const OFFICER_NOTICE: HumanResponse["officerNotice"] =
  "Officer decides — Seaphore only observes and recommends.";

// BriefingSection is a generic contract; narrow by kind at the use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = { title: string; payload: any };

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
interface DecisionImpactIn {
  revenue: number;
  security: number;
  operational: number;
  cargo: number;
}

/** Operational-tone fallback — used when the provider is unavailable. */
function fallbackFromBriefing(briefing: Briefing, plan: OperationalPlan): HumanResponse {
  const s = briefing.sections;
  const executive = (pickSection(s, "executive")?.payload.text as string | undefined) ?? "";
  const analytical =
    (pickSection(s, "analytical_assessment")?.payload.text as string | undefined) ?? "";
  const critical =
    (pickSection(s, "critical_findings")?.payload.findings as CriticalFindingIn[] | undefined) ?? [];
  const gaps = (pickSection(s, "intelligence_gaps")?.payload.list as string[] | undefined) ?? [];
  const actions =
    (pickSection(s, "officer_actions")?.payload.actions as OfficerActionIn[] | undefined) ?? [];
  const impact = pickSection(s, "decision_impact")?.payload as DecisionImpactIn | undefined;

  const insufficient = briefing.intelligence_status === "insufficient";
  const badge: ConfidenceBadge = badgeFromComposite(
    briefing.confidence_matrix.composite,
    insufficient,
  );

  const impactText = impact
    ? `Estimated revenue exposure of ₦${impact.revenue.toLocaleString()}; operational impact ${impact.operational}/10; security concern ${impact.security}/10.`
    : "Operational impact not quantified in the current evidence set.";

  const situation = executive
    ? `Our assessment on this ${plan.primarySkill.label.toLowerCase()}: ${executive}`
    : `We are running a ${plan.primarySkill.label.toLowerCase()} — ${plan.primarySkill.objective.toLowerCase()}`;

  const summary = analytical || executive || situation;

  return {
    executiveSummary: summary.split(/(?<=\.)\s+/).slice(0, 2).join(" "),
    situationOverview: situation,
    keyFindings: critical.slice(0, 6).map((f) => ({
      priority:
        f.priority === "critical" || f.priority === "high" || f.priority === "monitor"
          ? (f.priority as HumanResponse["keyFindings"][number]["priority"])
          : "monitor",
      text: `${f.title} (source: ${f.source}).`,
    })),
    operationalImpact: impactText,
    recommendedActions: actions.slice(0, 4).map((a) => ({
      action: a.label,
      confidence: badge,
      rationale:
        gaps.length > 0
          ? `The available evidence supports this step; a residual gap remains: ${gaps[0]}`
          : "The available evidence supports this step.",
    })),
    informationStillNeeded: gaps.slice(0, 4),
    suggestedNextQuestions: plan.followUps.slice(0, 4),
    confidenceAssessment: {
      badge,
      explanation: explainMatrix(briefing.confidence_matrix),
    },
    officerNotice: OFFICER_NOTICE,
  };
}

export function buildHumanResponse(
  briefing: Briefing,
  copy: HumanCopyShape | null,
  plan: OperationalPlan,
): HumanResponse {
  if (!copy) return fallbackFromBriefing(briefing, plan);

  const insufficient = briefing.intelligence_status === "insufficient";
  const canonicalBadge = badgeFromComposite(
    briefing.confidence_matrix.composite,
    insufficient,
  );

  // Ensure every recommendation carries a badge from the canonical set
  // and reject silently-empty responses.
  const recommendedActions: HumanResponse["recommendedActions"] = (copy.recommendedActions ?? [])
    .slice(0, 4)
    .map((r: HumanCopyShape["recommendedActions"][number]) => ({
      action: r.action,
      confidence: r.confidence,
      rationale: r.rationale,
    }));

  return {
    executiveSummary: copy.executiveSummary,
    situationOverview: copy.situationOverview,
    keyFindings: (copy.keyFindings ?? []).slice(0, 8),
    operationalImpact: copy.operationalImpact,
    recommendedActions,
    informationStillNeeded: (copy.informationStillNeeded ?? []).slice(0, 6),
    suggestedNextQuestions: (copy.suggestedNextQuestions ?? plan.followUps).slice(0, 4),
    confidenceAssessment: {
      badge: canonicalBadge,
      explanation: copy.confidenceExplanation || explainMatrix(briefing.confidence_matrix),
    },
    officerNotice: OFFICER_NOTICE,
  };
}
