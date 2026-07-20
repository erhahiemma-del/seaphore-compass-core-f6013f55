/**
 * Sprint 7 · Evidence Fusion Engine — public API.
 * Layer 2.10 (Fusion) · Layer 2.11 (Confidence) · Layer 2.9 (Grades).
 *
 * The fusion engine reconciles raw evidence — it NEVER reasons about meaning.
 * "Evidence first. Explainable always. Officer decides."
 */
export * from "./types";
export { RawEvidenceSchema, FusedEvidenceBundleSchema } from "./schemas";
export type { RawEvidence } from "./schemas";
export { normalizeOne, normalizeMany } from "./normalize";
export { score, scoreAll, recencyScore, authorityScore } from "./confidence";
export { dedupe } from "./dedupe";
export { detectConflicts } from "./conflicts";
export { rank } from "./rank";
export { agentResultsToRawEvidence } from "./adapters";
export { fuse, fuseAgentResults } from "./pipeline";
