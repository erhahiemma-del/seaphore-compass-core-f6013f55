/**
 * Predictive Intelligence Engine — public surface.
 *
 * Consumers (OSAE, Copilot, UI) MUST import from this module. Do NOT reach
 * into detectors or baselines directly.
 *
 * Golden Rule: Predict early. Explain every prediction. Learn continuously.
 * Never make a prediction without evidence.
 */
export { PredictiveIntelligenceEngine, getPie } from "./engine";
export type { PieIngestInput } from "./engine";
export { usePieStore } from "./store";
export type {
  Prediction,
  PredictionCategory,
  PredictionCycle,
  PredictionEvidenceCitation,
  PredictionFactor,
  PredictionHorizon,
  PredictionSeverity,
  AlternativeHypothesis,
} from "./types";
