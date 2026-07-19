/**
 * LAYER 0 — PRODUCT PRINCIPLES (THE CONSTITUTION)
 * LAYER 1 — PRODUCT PHILOSOPHY
 * LAYER 6 — AI & PROMPT CONTRACTS (immutable system prompt)
 *
 * These constants are IMMUTABLE. Every feature, prompt, API and UI decision
 * in the Intelligence Orchestration Engine must satisfy them.
 */

export const PRINCIPLES = [
  "Evidence before inference. No assessment without supporting evidence.",
  "Officer owns the decision. The AI never replaces officer judgment.",
  "Every recommendation is explainable. The system shows its reasoning chain.",
  "Confidence is earned, never assumed. It degrades through each reasoning step.",
  "Intelligence improves through corroboration. Single-source claims are flagged.",
] as const;

export const NON_NEGOTIABLE_RULES = [
  "Never fabricate evidence. If data does not exist, the system says so explicitly.",
  "Never recommend enforcement without verified or corroborated evidence.",
  "Never use AI inference as evidence. Analytical conclusions are labeled as such.",
  "Never overwrite officer judgment. Agree/Disagree/Modify/Dismiss is final.",
  "Never merge evidence grades. VERIFIED + REPORTED ≠ CORROBORATED.",
  "Every action is auditable. Who, what, when and why is permanently logged.",
  "Every entity is traceable. Every claim links to a source.",
  "Every assessment is reproducible. Same query + same data = same briefing.",
  "Operational safety overrides AI certainty. When in doubt, escalate to human.",
  "Never persist inferred relationships as verified. Officer approval or corroboration is required.",
] as const;

/** LAYER 6.3 — System Prompt (Immutable). Copy verbatim from spec. */
export const IMMUTABLE_SYSTEM_PROMPT =
  `You are the NIMASA Copilot Reasoning Engine. You are one component of a larger Intelligence Orchestration Engine. You do not chat. You do not retrieve evidence. You do not speculate. You receive ranked evidence from the Evidence Fusion Engine and produce structured analytical output.

Reasoning Policy:
1. Always retrieve before reasoning. (You receive evidence; you do not fetch it.)
2. Never reason without evidence. If evidence is insufficient, return Intelligence Gaps.
3. Prefer corroborated evidence over single-source claims.
4. Prefer structured data over unstructured text.
5. Use historical cases only as supporting evidence.
6. Never use AI inference as evidence. Label all conclusions as analytical.
7. Never overwrite officer judgment.
8. Confidence degrades through each reasoning step.
9. Counter-hypotheses are mandatory for medium+ confidence.
10. Operational safety overrides analytical certainty.

Guardrails:
- Never fabricate entities, evidence, or relationships.
- Never merge evidence grades.
- Never infer ownership without supporting evidence.
- Never recommend enforcement without VERIFIED or CORROBORATED evidence.` as const;

/** LAYER 2.9 — Evidence Grades canonical weights and colors. */
export const EVIDENCE_GRADES = {
  VERIFIED: { weight: 1.0, color: "hsl(var(--success))", label: "Verified" },
  CORROBORATED: { weight: 0.9, color: "hsl(var(--teal, 174 65% 40%))", label: "Corroborated" },
  OBSERVED: { weight: 0.8, color: "hsl(var(--info, 210 90% 55%))", label: "Observed" },
  REPORTED: { weight: 0.5, color: "hsl(var(--warning))", label: "Reported" },
  INFERRED: { weight: 0.3, color: "hsl(var(--accent))", label: "Inferred" },
  UNKNOWN: { weight: 0.0, color: "hsl(var(--muted-foreground))", label: "Unknown" },
} as const;

/** LAYER 2.11 — Confidence degradation ladder through reasoning steps. */
export const CONFIDENCE_STEPS = {
  evidence: 0.95,
  relationship: 0.9,
  pattern: 0.84,
  assessment: 0.79,
  recommendation: 0.73,
} as const;

/** LAYER 2.12 — Intelligence Confidence Matrix weights. */
export const CONFIDENCE_MATRIX_WEIGHTS = {
  evidenceQuality: 0.3,
  coverage: 0.2,
  freshness: 0.25,
  corroboration: 0.15,
  consistency: 0.1,
} as const;

/** LAYER 5.4 — Performance budgets (ms). */
export const PERF_BUDGETS = {
  lookup: { target: 2000, max: 3000 },
  assessment: { target: 5000, max: 7000 },
  investigation: { target: 8000, max: 12000 },
  forecast: { target: 12000, max: 15000 },
} as const;

/** LAYER 5.6 — Quality metric targets. */
export const QUALITY_TARGETS = {
  hallucinationRatePct: 0.5,
  evidenceAttributionPct: 100,
  assessmentAccuracyPct: 85,
} as const;
