/**
 * LAYER 2.8 — Briefing Builder.
 *
 * Assembles the Intelligence Contract from ranked evidence and the
 * Four-Layer Assessment. Assembly rules (spec):
 *  - Omit sections with no data. Never render empty cards.
 *  - Executive Assessment + Officer Actions are mandatory except in Lookup.
 *  - Relationship Graph and Timeline are conditional.
 *  - Counter-hypotheses only render when confidence >= Medium.
 */
import type {
  Assessment,
  Briefing,
  BriefingMode,
  BriefingSection,
  ConfidenceMatrix,
  FusedEvidence,
  Intent,
  OfficerQuery,
  Workspace,
} from "./types";
import { WORKSPACE_CONTRACTS } from "./workspace-contracts";

function evidenceStrength(m: ConfidenceMatrix): Briefing["classification"]["evidenceStrength"] {
  if (m.evidenceQuality >= 0.75) return "strong";
  if (m.evidenceQuality >= 0.45) return "moderate";
  return "weak";
}

export function buildBriefing(args: {
  query: OfficerQuery;
  intent: Intent;
  fused: FusedEvidence;
  assessment: Assessment;
  matrix: ConfidenceMatrix;
  latency_ms: number;
  model_used: string;
}): Briefing {
  const { query, intent, fused, assessment, matrix, latency_ms, model_used } = args;
  const mode: BriefingMode = intent.mode;
  const workspace: Workspace | undefined = intent.workspace;

  const sections: BriefingSection[] = [];

  // 5. Classification banner
  sections.push({
    kind: "classification",
    title: intent.mode.toUpperCase(),
    payload: {
      typeBadge: intent.mode,
      matrix,
      evidenceStrength: evidenceStrength(matrix),
    },
  });

  // 6. Executive Assessment (mandatory except lookup)
  if (mode !== "lookup") {
    sections.push({
      kind: "executive",
      title: "Executive Assessment",
      payload: { text: assessment.analyticalAssessment },
    });
  }

  // 7. Why This Matters — causal chain from why-chain
  if (assessment.whyChain.length) {
    sections.push({
      kind: "why_this_matters",
      title: "Why This Matters",
      payload: { chain: assessment.whyChain },
    });
  }

  // 8. Critical Findings — derived from top verified/inferred items.
  //    Each finding carries a citation back to the source evidence so the
  //    officer can independently verify which record supports it.
  const findings = fused.ranked.slice(0, 5).map((e) => ({
    priority: e.grade === "VERIFIED" ? "immediate" : e.grade === "OBSERVED" ? "today" : "monitor",
    title: (e.content || "").slice(0, 90),
    grade: e.grade,
    source: e.source_system,
    citations: [
      {
        id: e.id,
        source: e.source_system,
        grade: e.grade,
        hash: e.hash_sha256,
        excerpt: (e.content || "").slice(0, 160),
        collected_at: e.collected_at,
      },
    ],
  }));
  if (findings.length)
    sections.push({ kind: "critical_findings", title: "Critical Findings", payload: { findings } });

  // 9. Verified Evidence
  if (assessment.verifiedFacts.length) {
    sections.push({
      kind: "verified_evidence",
      title: "Verified Evidence",
      payload: { items: assessment.verifiedFacts },
    });
  }

  // 10. Observed Patterns
  if (assessment.observedPatterns.length) {
    sections.push({
      kind: "observed_patterns",
      title: "Observed Patterns",
      payload: { patterns: assessment.observedPatterns },
    });
  }

  // 11. Analytical Assessment (labelled)
  if (assessment.analyticalAssessment) {
    sections.push({
      kind: "analytical_assessment",
      title: "Analytical Conclusion",
      payload: { text: assessment.analyticalAssessment },
    });
  }

  // 12. Explainability Chain (collapsible)
  if (assessment.whyChain.length) {
    sections.push({
      kind: "explainability_chain",
      title: "Why Chain",
      payload: { chain: assessment.whyChain },
    });
  }

  // 13. Counter-Hypotheses — only when confidence >= Medium (spec 2.3)
  if (matrix.tier !== "low" && assessment.counterHypotheses.length) {
    sections.push({
      kind: "counter_hypotheses",
      title: "Counter-Hypotheses",
      payload: { list: assessment.counterHypotheses },
    });
  }

  // 14. Intelligence Gaps
  if (assessment.intelligenceGaps.length) {
    sections.push({
      kind: "intelligence_gaps",
      title: "Intelligence Gaps",
      payload: { list: assessment.intelligenceGaps },
    });
  }

  // 15. Decision Impact
  sections.push({
    kind: "decision_impact",
    title: "Decision Impact",
    payload: {
      revenue: matrix.composite,
      security: matrix.corroboration,
      operational: matrix.coverage,
      cargo: matrix.freshness,
    },
  });

  // 16. Decision Required
  if (mode === "investigation" || mode === "assessment") {
    sections.push({
      kind: "decision_required",
      title: "Decision Required",
      payload: {
        deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
        risk: matrix.tier,
      },
    });
  }

  // 17. Officer Actions — from workspace contract (mandatory except lookup)
  if (mode !== "lookup") {
    const workspaceActions = workspace ? WORKSPACE_CONTRACTS[workspace].actions : [];
    sections.push({
      kind: "officer_actions",
      title: "Officer Actions",
      payload: { actions: workspaceActions },
    });
  }

  // 19. Evidence Sources trust panel
  sections.push({
    kind: "evidence_sources",
    title: "Evidence Sources",
    payload: {
      queried: fused.sources_queried,
      responded: fused.sources_responded,
      corroborated: fused.sources_corroborated,
    },
  });

  // 20. Next Intelligence Questions
  const nextQuestions = deriveNextQuestions(intent, assessment);
  if (nextQuestions.length) {
    sections.push({
      kind: "next_questions",
      title: "Next Questions",
      payload: { questions: nextQuestions },
    });
  }

  const intelligence_status =
    fused.sources_responded === 0
      ? "insufficient"
      : fused.sources_responded < fused.sources_queried
        ? "partial"
        : "complete";

  return {
    id: crypto.randomUUID(),
    session_id: query.session_id,
    officer_id: query.officer_id,
    query: query.query,
    workspace,
    investigation_id: query.context?.investigation_id,
    mode,
    classification: {
      typeBadge: mode,
      matrix,
      evidenceStrength: evidenceStrength(matrix),
    },
    sections,
    intelligence_status,
    sources_queried: fused.sources_queried,
    sources_responded: fused.sources_responded,
    sources_corroborated: fused.sources_corroborated,
    confidence_matrix: matrix,
    latency_ms,
    model_used,
  };
}

function deriveNextQuestions(intent: Intent, assessment: Assessment): string[] {
  const q: string[] = [];
  if (assessment.intelligenceGaps.length)
    q.push(`Corroborate the ${intent.capabilities[0]?.toLowerCase().replace(/_/g, " ")} finding`);
  if (intent.entities.length) q.push(`Show relationship network for ${intent.entities[0].value}`);
  q.push("What historical cases match this pattern?");
  return q.slice(0, 4);
}
