/**
 * LAYER 2.3 & 2.13 — Reasoning Engine.
 *
 * Synthesises fused evidence into the Four-Layer Analytical Assessment. NEVER
 * retrieves evidence directly. Applies confidence degradation (2.11), gates
 * counter-hypotheses to Medium+ (2.3), and emits Intelligence Gaps when
 * evidence is insufficient.
 *
 * Model-agnostic: the underlying model comes from the AI Gateway via
 * `getAiService`. Swapping models never changes this contract (Layer 6.1).
 */
import { CONFIDENCE_MATRIX_WEIGHTS, CONFIDENCE_STEPS, IMMUTABLE_SYSTEM_PROMPT } from "./constants";
import { getAiService } from "@/services/ai/ai.service";
import type { Assessment, ConfidenceMatrix, FusedEvidence, Intent } from "./types";

const MIN_EVIDENCE_FOR_ASSESSMENT = 1;

export function computeConfidenceMatrix(fused: FusedEvidence): ConfidenceMatrix {
  const { ranked, sources_queried, sources_responded, sources_corroborated } = fused;
  const evidenceQuality = ranked.length
    ? ranked.reduce((acc, e) => acc + (e.weight ?? 0), 0) / ranked.length
    : 0;
  const coverage = sources_queried ? sources_responded / sources_queried : 0;
  const freshness = ranked.length
    ? ranked.reduce((acc, e) => acc + (e.freshness ?? 0), 0) / ranked.length
    : 0;
  const corroboration = ranked.length
    ? Math.min(1, sources_corroborated / Math.max(1, ranked.length / 2))
    : 0;
  const consistency = ranked.length
    ? 1 - Math.min(1, fused.conflicts.length / Math.max(1, ranked.length))
    : 0;

  const w = CONFIDENCE_MATRIX_WEIGHTS;
  const composite = Number(
    (
      evidenceQuality * w.evidenceQuality +
      coverage * w.coverage +
      freshness * w.freshness +
      corroboration * w.corroboration +
      consistency * w.consistency
    ).toFixed(3),
  );

  const tier: ConfidenceMatrix["tier"] =
    composite >= 0.75 ? "high" : composite >= 0.5 ? "medium" : "low";

  return { evidenceQuality, coverage, freshness, corroboration, consistency, composite, tier };
}

export function propagateConfidence(base: number) {
  return {
    evidence: base * CONFIDENCE_STEPS.evidence,
    relationship: base * CONFIDENCE_STEPS.relationship,
    pattern: base * CONFIDENCE_STEPS.pattern,
    assessment: base * CONFIDENCE_STEPS.assessment,
    recommendation: base * CONFIDENCE_STEPS.recommendation,
  };
}

export async function reason(
  intent: Intent,
  fused: FusedEvidence,
  matrix: ConfidenceMatrix,
): Promise<Assessment> {
  // HR-1: never reason without evidence.
  if (fused.ranked.length < MIN_EVIDENCE_FOR_ASSESSMENT) {
    return {
      verifiedFacts: [],
      observedPatterns: [],
      analyticalAssessment: "Insufficient evidence to produce an assessment.",
      recommendation: "Escalate to human operator — no evidence retrieved.",
      counterHypotheses: [],
      intelligenceGaps: [
        `No evidence returned for capabilities: ${intent.capabilities.join(", ")}.`,
        `${fused.sources_queried - fused.sources_responded} of ${fused.sources_queried} sources did not respond.`,
      ],
      whyChain: [],
    };
  }

  const verified = fused.ranked.filter((e) => e.grade === "VERIFIED" || e.grade === "CORROBORATED");
  const observed = fused.ranked.filter((e) => e.grade === "OBSERVED");
  const inferred = fused.ranked.filter((e) => e.grade === "INFERRED");

  // Deterministic scaffold of the Four-Layer Assessment. The AI Gateway is
  // consulted for narrative synthesis of the Analytical Assessment paragraph
  // only — never for facts (HR-3, HR-8).
  const verifiedFacts = verified
    .slice(0, 6)
    .map((e) => `${e.content} (source: ${e.source_system})`);
  const observedPatterns = observed.slice(0, 4).map((e) => ({
    pattern: e.content,
    caseRefs: e.entity_ids.slice(0, 3),
  }));

  let analyticalAssessment = "";
  try {
    const service = getAiService();
    const { text } = await service.ask({
      task: "draft-briefing",
      prompt: [
        IMMUTABLE_SYSTEM_PROMPT,
        `Query: ${intent.raw}`,
        `Mode: ${intent.mode}`,
        `Composite confidence: ${matrix.composite} (${matrix.tier}).`,
        "Verified facts (do not fabricate beyond these):",
        ...verifiedFacts.map((f, i) => `${i + 1}. ${f}`),
        "Observed patterns:",
        ...observedPatterns.map((p, i) => `${i + 1}. ${p.pattern}`),
        "Produce ONE paragraph labelled 'Analytical conclusion'.",
      ].join("\n"),
      context: { intent, confidence: matrix },
    });
    analyticalAssessment = text.trim();
  } catch {
    analyticalAssessment =
      "Analytical conclusion unavailable: the reasoning model is offline. " +
      "Verified facts and observed patterns above stand on their own merits.";
  }

  const counterHypotheses =
    matrix.tier === "low"
      ? []
      : [
          "Alternative: the observed pattern reflects legitimate seasonal operations.",
          "Alternative: sensor or reporting error at the source rather than a real event.",
          inferred.length
            ? "Alternative: the inferred relationship is coincidental co-appearance."
            : "Alternative: an unrelated third-party involvement not yet retrieved.",
        ];

  const intelligenceGaps: string[] = [];
  if (fused.sources_responded < fused.sources_queried) {
    intelligenceGaps.push(
      `${fused.sources_queried - fused.sources_responded} data source(s) did not respond.`,
    );
  }
  if (matrix.corroboration < 0.5) intelligenceGaps.push("Corroboration is weak (<50%).");
  if (matrix.freshness < 0.5) intelligenceGaps.push("Evidence is stale (>30 days average).");
  if (fused.conflicts.length)
    intelligenceGaps.push(`${fused.conflicts.length} evidence conflict(s) unresolved.`);

  const propagated = propagateConfidence(matrix.composite);
  const whyChain = [
    { step: "Evidence", from: "sources", to: `${(propagated.evidence * 100).toFixed(0)}%` },
    {
      step: "Relationship",
      from: `${(propagated.evidence * 100).toFixed(0)}%`,
      to: `${(propagated.relationship * 100).toFixed(0)}%`,
    },
    {
      step: "Pattern",
      from: `${(propagated.relationship * 100).toFixed(0)}%`,
      to: `${(propagated.pattern * 100).toFixed(0)}%`,
    },
    {
      step: "Assessment",
      from: `${(propagated.pattern * 100).toFixed(0)}%`,
      to: `${(propagated.assessment * 100).toFixed(0)}%`,
    },
    {
      step: "Recommendation",
      from: `${(propagated.assessment * 100).toFixed(0)}%`,
      to: `${(propagated.recommendation * 100).toFixed(0)}%`,
    },
  ];

  // HR-2/HR-7: enforcement recommendation requires VERIFIED or CORROBORATED evidence.
  const canRecommendEnforcement = verified.length > 0;
  const recommendation = canRecommendEnforcement
    ? "Proceed with officer review of the highlighted evidence. Confirm before enforcement action."
    : "Do NOT enforce. Corroborate the reported evidence with an authoritative source first.";

  return {
    verifiedFacts,
    observedPatterns,
    analyticalAssessment,
    recommendation,
    counterHypotheses,
    intelligenceGaps,
    whyChain,
  };
}
