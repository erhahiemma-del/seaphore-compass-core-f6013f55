/**
 * OIE · Playbook Engine — deterministic evaluator.
 *
 * Given a Playbook and the current briefing, produces the operational
 * response overlay: recommendations, confidence badge, gaps, follow-ups
 * and reasoning notes. Never talks to a model. Pure function.
 */
import type {
  Briefing,
  BriefingSection,
  ConfidenceMatrix,
  SectionKind,
} from "@/services/orchestration";
import type { ConfidenceBadge, OperationalMission } from "../types";
import type {
  Playbook,
  PlaybookContext,
  PlaybookEvaluation,
  PlaybookFinding,
} from "./types";

const DEFAULT_MATRIX: ConfidenceMatrix = {
  evidenceQuality: 0,
  coverage: 0,
  freshness: 0,
  corroboration: 0,
  consistency: 0,
  composite: 0,
  tier: "low",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = { title: string; payload: any };

function pickSection(sections: BriefingSection[], kind: SectionKind): AnyPayload | undefined {
  return sections.find((s) => s?.kind === kind) as AnyPayload | undefined;
}

export function buildPlaybookContext(
  briefing: Briefing,
  mission?: OperationalMission,
): PlaybookContext {
  const sections = Array.isArray(briefing?.sections) ? briefing.sections : [];
  const critical = (pickSection(sections, "critical_findings")?.payload?.findings ??
    []) as PlaybookFinding[];
  const gaps = (pickSection(sections, "intelligence_gaps")?.payload?.list ?? []) as string[];
  const impact = pickSection(sections, "decision_impact")?.payload as
    | PlaybookContext["decisionImpact"]
    | undefined;
  const sourcesPayload = pickSection(sections, "evidence_sources")?.payload as
    | Partial<PlaybookContext["sources"]>
    | undefined;

  return {
    briefing,
    criticalFindings: critical,
    gaps,
    matrix: briefing?.confidence_matrix ?? DEFAULT_MATRIX,
    intelligenceStatus: (briefing?.intelligence_status ??
      "partial") as PlaybookContext["intelligenceStatus"],
    sources: {
      queried: sourcesPayload?.queried ?? briefing?.sources_queried ?? 0,
      responded: sourcesPayload?.responded ?? briefing?.sources_responded ?? 0,
      corroborated: sourcesPayload?.corroborated ?? briefing?.sources_corroborated ?? 0,
    },
    decisionImpact: impact,
    mission,
  };
}

/**
 * Count mandatory evidence items that appear (by loose keyword match)
 * in the briefing's Critical Findings or Verified Evidence sections.
 * Deterministic — used to decide whether reasoning may proceed.
 */
function countMandatoryEvidenceCovered(
  briefing: Briefing,
  mandatory: string[],
): { covered: number; missing: string[] } {
  const sections = Array.isArray(briefing?.sections) ? briefing.sections : [];
  const critical = (pickSection(sections, "critical_findings")?.payload?.findings ??
    []) as PlaybookFinding[];
  const verified = (pickSection(sections, "verified_evidence")?.payload?.items ??
    []) as string[];
  const haystack = [
    ...critical.map((f) => `${f?.title ?? ""} ${f?.source ?? ""}`),
    ...verified,
  ]
    .join(" \n ")
    .toLowerCase();
  const missing: string[] = [];
  let covered = 0;
  for (const item of mandatory) {
    const needle = item.toLowerCase();
    const keywords = needle.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const hit = keywords.length === 0
      ? haystack.includes(needle)
      : keywords.some((k) => haystack.includes(k));
    if (hit) covered += 1;
    else missing.push(item);
  }
  return { covered, missing };
}

function pickBand(playbook: Playbook, ctx: PlaybookContext): {
  badge: ConfidenceBadge;
  explanation: string;
} {
  for (const band of playbook.confidenceBands) {
    try {
      if (band.when(ctx)) {
        return { badge: band.badge, explanation: band.explanation(ctx) };
      }
    } catch {
      // Rule failed to evaluate — skip and continue.
    }
  }
  // Fallback — never leave the officer without a badge.
  return {
    badge: "Insufficient Evidence",
    explanation:
      "Playbook confidence bands did not resolve; treat this briefing as unverified until corroborated.",
  };
}

/**
 * Run a Playbook against a briefing. Pure and deterministic — never
 * calls a model, never throws for individual rule failures.
 */
export function evaluatePlaybook(
  playbook: Playbook,
  briefing: Briefing,
  mission?: OperationalMission,
): PlaybookEvaluation {
  const ctx = buildPlaybookContext(briefing, mission);
  const appliedRuleIds: string[] = [];

  // Evidence sufficiency.
  const { covered, missing } = countMandatoryEvidenceCovered(
    briefing,
    playbook.requiredEvidence.mandatory,
  );
  const insufficientEvidence = covered < playbook.requiredEvidence.minimumBeforeReasoning;
  const evidenceLimitations = missing.map(
    (m) => `Mandatory evidence unavailable: ${m}. The SOP requires this before firm conclusions.`,
  );

  // Validation rules — recorded but never thrown.
  const validationNotes: string[] = [];
  for (const rule of playbook.validationRules) {
    try {
      const fired = rule.when ? rule.when(ctx) : true;
      if (!fired) continue;
      appliedRuleIds.push(rule.id);
      validationNotes.push(rule.onFail);
    } catch {
      /* skip */
    }
  }

  // Reasoning rules → notes.
  const reasoningNotes: string[] = [];
  for (const rule of playbook.reasoningRules) {
    try {
      const fired = rule.when ? rule.when(ctx) : true;
      if (!fired) continue;
      appliedRuleIds.push(rule.id);
      reasoningNotes.push(rule.note(ctx));
    } catch {
      /* skip */
    }
  }

  // Confidence band — determined *before* recommendations so we can stamp actions.
  const bandChosen = insufficientEvidence
    ? {
        badge: "Insufficient Evidence" as ConfidenceBadge,
        explanation: `SOP requires ≥${playbook.requiredEvidence.minimumBeforeReasoning} mandatory evidence items; only ${covered} are corroborated. Explain the gap rather than infer.`,
      }
    : pickBand(playbook, ctx);

  // Recommendation rules → deterministic actions.
  const recommendedActions: PlaybookEvaluation["recommendedActions"] = [];
  for (const rule of playbook.recommendations) {
    try {
      if (!rule.when(ctx)) continue;
      appliedRuleIds.push(rule.id);
      recommendedActions.push({
        action: rule.action,
        priority: rule.priority,
        confidence: bandChosen.badge,
        rationale: rule.rationale(ctx),
      });
    } catch {
      /* skip */
    }
  }

  // Escalations.
  const escalations: string[] = [];
  for (const rule of playbook.escalationRules) {
    try {
      if (!rule.when(ctx)) continue;
      appliedRuleIds.push(rule.id);
      escalations.push(`${rule.action} → route to ${rule.route}.`);
    } catch {
      /* skip */
    }
  }

  // Gaps: baseline + runtime + validation.
  const gapSet = new Set<string>();
  for (const g of ctx.gaps) if (g && typeof g === "string") gapSet.add(g);
  for (const g of playbook.baselineInformationGaps) gapSet.add(g);
  for (const g of validationNotes) gapSet.add(g);
  for (const g of evidenceLimitations) gapSet.add(g);

  return {
    playbookId: playbook.skillId,
    recommendedActions,
    informationStillNeeded: Array.from(gapSet).slice(0, 8),
    suggestedNextQuestions: playbook.followUps.slice(0, 4),
    confidence: bandChosen,
    reasoningNotes,
    appliedRuleIds,
    evidenceLimitations,
    escalations,
    insufficientEvidence,
  };
}
