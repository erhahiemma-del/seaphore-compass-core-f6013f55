/**
 * SPRINT INT-01B — Entity Intelligence Engine (EIE) · public API.
 *
 * The reusable entity layer beneath Cargo, Manifest, Container, Revenue
 * and Trade Intelligence. Derives from the Canonical UIP; never fetches.
 */
export * from "./types";
export {
  deriveEntityType,
  resolveDuplicates,
  nameSimilarity,
  normalizeName,
  extractIdentityKeys,
  NAME_SIMILARITY_THRESHOLD,
  type ResolutionResult,
} from "./resolution";
export { deriveRelationships, type RelationshipAssertion } from "./relationships";
export { buildTimeline } from "./timeline";
export { EntityRegistry, buildEntityRegistry, type EntitySearchOptions } from "./registry";
export { buildEntityProfile, profileGrade, type BuildProfileOptions } from "./profile";
export {
  buildEntityGraphView,
  type EntityGraphView,
  type GraphViewNode,
  type GraphViewOptions,
} from "./graph";
export {
  answerEntityQuestion,
  classifyEntityQuestion,
  resolveSubject,
  type EntityAnswer,
  type EntityQuestionIntent,
} from "./copilot";
export { computeEieMetrics } from "./metrics";
