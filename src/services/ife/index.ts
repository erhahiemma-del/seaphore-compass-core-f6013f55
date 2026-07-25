/**
 * Intelligence Fusion Engine (IFE) — public entry point.
 *
 * The IFE is the ONLY layer that transforms multi-provider evidence from
 * the Intelligence Acquisition Layer (IAL) into the single canonical
 * evidence package the Operational Intelligence Engine (OIE) consumes.
 *
 * Callers (OIE evidence collector, orchestrator, tests):
 *   1. Never mix raw IAL records with fused records.
 *   2. Read contradictions/missing/unknowns from `report`, not from IAL
 *      `EvidencePackage.conflicting` (which is upstream and less
 *      resolved).
 *   3. Treat `confidence` / `grade` as the authoritative composite the
 *      OIE briefing must display.
 */
export * from "./types";
export { fuseEvidence, isEvidencePackage } from "./engine";
export { DEFAULT_SOURCE_PROFILE, profileFor, sourceWeight, isOfficialSource } from "./source-ranking";
export { correlate } from "./correlator";
export { detectDisagreements } from "./conflict-detector";
export { fuseField, toCandidate } from "./fusion-rules";
export { buildCanonicalRecord } from "./canonical-builder";
export { buildContradictionReport } from "./report";
export { packageConfidence } from "./confidence-engine";
export { resolveIdentities } from "./identity-resolver";
export type { IdentityCluster, IdentityResolution } from "./identity-resolver";
export { buildUnifiedIntelligencePackage } from "./unified";
export type { UnifiedIntelligencePackage, BuildUnifiedInput } from "./unified";
export {
  registerUip,
  getUip,
  getUipByQueryHash,
  listUipIds,
  hashQuery,
  __resetUipRegistry,
  type UnifiedPackageId,
} from "./registry";
