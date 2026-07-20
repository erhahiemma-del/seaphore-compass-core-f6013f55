/**
 * Sprint 8 · Reasoning Engine — public API.
 * Layer 6 (AI & Prompt Contracts) · Layer 2.3 (Reasoning Policy) · Layer 2.11.
 *
 * The engine reasons over ranked evidence — never over the database, never
 * over free web content. "Evidence first. Explainable always. Officer decides."
 */
export * from "./types";
export {
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_FINGERPRINT,
} from "./system-prompt";
export { workspaceOverlay } from "./workspace-prompts";
export {
  propagate,
  anchorFromEvidence,
  bandOf,
  requiresCounterHypothesis,
  SPEC_LADDER,
  STEP_RATIO,
} from "./confidence";
export {
  LlmResponseSchema,
  ReasoningResponseSchema,
  AssessmentSchema,
  RecommendationSchema,
  WhyChainStepSchema,
  CounterHypothesisSchema,
  PropagationSchema,
} from "./contract";
export type { LlmResponse } from "./contract";
export { fallbackChain, selectTier, type ModelRegistry } from "./model-registry";
export { createMockModel } from "./mock-model";
export { reason, type EngineOptions } from "./engine";
