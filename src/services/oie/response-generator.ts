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
  keyFindings: Array<{
    priority: "critical" | "high" | "monitor";
    text: string;
    /** Evidence IDs (from the engine output) that support this finding. */
    citationIds?: string[];
  }>;
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
  grade?: string;
  citations?: Array<{
    id: string;
    source: string;
    grade: string;
    hash?: string;
    excerpt?: string;
    collected_at?: string;
  }>;
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

function normaliseCitations(
  f: CriticalFindingIn,
): import("./types").EvidenceCitation[] {
  if (f.citations && f.citations.length > 0) {
    return f.citations.map((c) => ({
      id: c.id,
      source: c.source,
      grade: (c.grade as import("./types").EvidenceCitation["grade"]) ?? "OBSERVED",
      hash: c.hash,
      excerpt: c.excerpt,
      collectedAt: c.collected_at,
    }));
  }
  // Fall back to a synthetic citation derived from the finding itself so the
  // officer always sees at least one traceable source label.
  return [
    {
      id: `syn-${f.source}-${f.title.slice(0, 24)}`,
      source: f.source,
      grade: (f.grade as import("./types").EvidenceCitation["grade"]) ?? "OBSERVED",
      excerpt: f.title,
    },
  ];
}

const SAFE_MATRIX = {
  evidenceQuality: 0,
  coverage: 0,
  freshness: 0,
  corroboration: 0,
  consistency: 0,
  composite: 0,
  tier: "low" as const,
};

/** Operational-tone fallback — used when the provider is unavailable. */
function fallbackFromBriefing(briefing: Briefing, plan: OperationalPlan): HumanResponse {
  const s = Array.isArray(briefing?.sections) ? briefing.sections : [];
  const executive = (pickSection(s, "executive")?.payload?.text as string | undefined) ?? "";
  const analytical =
    (pickSection(s, "analytical_assessment")?.payload?.text as string | undefined) ?? "";
  const critical =
    (pickSection(s, "critical_findings")?.payload?.findings as CriticalFindingIn[] | undefined) ?? [];
  const gaps = (pickSection(s, "intelligence_gaps")?.payload?.list as string[] | undefined) ?? [];
  const actions =
    (pickSection(s, "officer_actions")?.payload?.actions as OfficerActionIn[] | undefined) ?? [];
  const impact = pickSection(s, "decision_impact")?.payload as DecisionImpactIn | undefined;

  const matrix = briefing?.confidence_matrix ?? SAFE_MATRIX;
  const insufficient = briefing?.intelligence_status === "insufficient";
  const badge: ConfidenceBadge = badgeFromComposite(matrix.composite ?? 0, insufficient);

  const impactText = impact
    ? `Estimated revenue exposure of ₦${Number(impact.revenue ?? 0).toLocaleString()}; operational impact ${impact.operational ?? 0}/10; security concern ${impact.security ?? 0}/10.`
    : "Operational impact not quantified in the current evidence set.";

  const skillLabel = plan?.primarySkill?.label ?? "operational assessment";
  const skillObjective = plan?.primarySkill?.objective ?? "assemble the operational picture.";
  const situation = executive
    ? `Our assessment on this ${skillLabel.toLowerCase()}: ${executive}`
    : `We are running a ${skillLabel.toLowerCase()} — ${skillObjective.toLowerCase()}`;

  const summary = analytical || executive || situation;

  return {
    executiveSummary: summary.split(/(?<=\.)\s+/).slice(0, 2).join(" "),
    situationOverview: situation,
    keyFindings: critical.slice(0, 6).map((f) => ({
      priority:
        f?.priority === "critical" || f?.priority === "high" || f?.priority === "monitor"
          ? (f.priority as HumanResponse["keyFindings"][number]["priority"])
          : "monitor",
      text: `${f?.title ?? "Finding"} (source: ${f?.source ?? "internal"}).`,
      citations: normaliseCitations(f ?? { priority: "monitor", title: "", source: "internal" }),
    })),
    operationalImpact: impactText,
    recommendedActions: actions.slice(0, 4).map((a) => ({
      action: a?.label ?? "Review",
      confidence: badge,
      rationale:
        gaps.length > 0
          ? `The available evidence supports this step; a residual gap remains: ${gaps[0]}`
          : "The available evidence supports this step.",
    })),
    informationStillNeeded: gaps.slice(0, 4),
    suggestedNextQuestions: (plan?.followUps ?? []).slice(0, 4),
    confidenceAssessment: {
      badge,
      explanation: explainMatrix(matrix),
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

  const matrix = briefing?.confidence_matrix ?? SAFE_MATRIX;
  const insufficient = briefing?.intelligence_status === "insufficient";
  const canonicalBadge = badgeFromComposite(matrix.composite ?? 0, insufficient);

  const recommendedActions: HumanResponse["recommendedActions"] = (copy.recommendedActions ?? [])
    .slice(0, 4)
    .map((r) => ({
      action: r?.action ?? "Review",
      confidence: r?.confidence ?? canonicalBadge,
      rationale: r?.rationale ?? "",
    }));

  const sections = Array.isArray(briefing?.sections) ? briefing.sections : [];
  const underlyingCritical =
    (pickSection(sections, "critical_findings")?.payload?.findings as
      | CriticalFindingIn[]
      | undefined) ?? [];
  const citationIndex = new Map<string, import("./types").EvidenceCitation>();
  for (const f of underlyingCritical) {
    for (const c of f?.citations ?? []) {
      if (!c?.id) continue;
      citationIndex.set(c.id, {
        id: c.id,
        source: c.source,
        grade: (c.grade as import("./types").EvidenceCitation["grade"]) ?? "OBSERVED",
        hash: c.hash,
        excerpt: c.excerpt,
        collectedAt: c.collected_at,
      });
    }
  }

  const keyFindings: HumanResponse["keyFindings"] = (copy.keyFindings ?? [])
    .slice(0, 8)
    .map((kf, i) => {
      const resolved = (kf?.citationIds ?? [])
        .map((id) => citationIndex.get(id))
        .filter((c): c is import("./types").EvidenceCitation => Boolean(c));
      const citations =
        resolved.length > 0
          ? resolved
          : underlyingCritical[i]
            ? normaliseCitations(underlyingCritical[i])
            : [];
      return {
        priority: kf?.priority ?? "monitor",
        text: kf?.text ?? "",
        citations,
      };
    });

  return {
    executiveSummary: copy.executiveSummary ?? "",
    situationOverview: copy.situationOverview ?? "",
    keyFindings,
    operationalImpact: copy.operationalImpact ?? "",
    recommendedActions,
    informationStillNeeded: (copy.informationStillNeeded ?? []).slice(0, 6),
    suggestedNextQuestions: (copy.suggestedNextQuestions ?? plan?.followUps ?? []).slice(0, 4),
    confidenceAssessment: {
      badge: canonicalBadge,
      explanation: copy.confidenceExplanation || explainMatrix(matrix),
    },
    officerNotice: OFFICER_NOTICE,
  };
}
