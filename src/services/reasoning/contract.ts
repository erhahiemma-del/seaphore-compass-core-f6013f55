/**
 * Sprint 8 · Response Contract (Layer 6.4) — Zod schema.
 *
 * The Reasoning Engine's structured JSON output is validated against this
 * schema. Retries fire on any validation failure. Kept flat + constraint-free
 * per AI-SDK structured-output guidance (bounds live in the prompt, clamped
 * in code post-parse).
 */
import { z } from "zod";
import { WORKSPACES } from "./types";

export const ConfidenceBandSchema = z.enum(["high", "medium", "low", "insufficient"]);

export const WhyChainStepSchema = z.object({
  step: z.number().int(),
  statement: z.string(),
  evidenceIds: z.array(z.string()),
  confidence: z.number(),
});

export const CounterHypothesisSchema = z.object({
  statement: z.string(),
  likelihood: z.number(),
  refutingEvidenceIds: z.array(z.string()),
});

export const AssessmentSchema = z.object({
  statement: z.string(),
  confidence: z.number(),
  band: ConfidenceBandSchema,
});

export const RecommendationSchema = z.object({
  action: z.string(),
  confidence: z.number(),
  rationale: z.string(),
});

export const PropagationSchema = z.object({
  evidence: z.number(),
  relationship: z.number(),
  pattern: z.number(),
  assessment: z.number(),
  recommendation: z.number(),
});

/**
 * Raw shape the LLM must emit. `citations`, `propagation`, `officerNotice`,
 * `model`, `workspace` are set/enforced by the engine after parsing, so they
 * are optional here — this keeps the model contract minimal.
 */
export const LlmResponseSchema = z.object({
  assessment: AssessmentSchema,
  recommendation: RecommendationSchema,
  whyChain: z.array(WhyChainStepSchema),
  counterHypotheses: z.array(CounterHypothesisSchema),
  citations: z.array(z.string()).optional(),
});
export type LlmResponse = z.infer<typeof LlmResponseSchema>;

export const ReasoningResponseSchema = z.object({
  workspace: z.enum(WORKSPACES),
  assessment: AssessmentSchema,
  recommendation: RecommendationSchema,
  whyChain: z.array(WhyChainStepSchema),
  counterHypotheses: z.array(CounterHypothesisSchema),
  propagation: PropagationSchema,
  citations: z.array(z.string()),
  officerNotice: z.string(),
  model: z.object({
    modelId: z.string(),
    tier: z.enum(["tier1", "tier2", "tier3"]),
    retries: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    usedFallback: z.boolean(),
  }),
});
