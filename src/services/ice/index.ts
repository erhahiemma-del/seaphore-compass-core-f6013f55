/**
 * Intelligence Correlation Engine (ICE) — public surface.
 *
 * Between the Intelligence Acquisition Layer (IAL) and the Operational
 * Intelligence Engine (OIE). The OIE consumes exactly one
 * `IntelligencePackage` per query — canonical entities, one value per
 * field, every conflict surfaced, every explanation reproducible from
 * the database.
 */

export * from "./types";
export { runIce } from "./engine";
export { planQuery } from "./planner";
export { classifyIntent } from "./intent";
export { buildMatrix, groupByField, freshnessScore } from "./correlation";
export { detectConflicts, valuesEqual } from "./conflict";
export { detectCorroborations } from "./corroboration";
export { applyFreshnessDecay } from "./freshness";
export { applyTrustWeights } from "./source-trust";
export { scoreEvidence, cellKey } from "./scoring";
export { fuseIntelligence, FUSION_POLICY_VERSION } from "./fusion";
export { explainAll } from "./explainability";
export { generateRecommendations } from "./recommendations";
export { buildProvenanceChain, buildQueryProvenance } from "./provenance";
export type { ProvenanceChain } from "./provenance";
export { trustFor, AVERAGE_TRUST } from "./trust-registry";
export {
  FIELD_ALIASES, FIELD_CATEGORY, FRESHNESS_MAX_HOURS, CRITICAL_FIELDS,
  fieldQuality, freshnessMaxHrs, classifySeverity,
} from "./field-config";
