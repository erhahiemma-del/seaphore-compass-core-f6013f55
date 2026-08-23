/**
 * Earth Observation — public API.
 *
 * Non-cooperative maritime sensing: Sentinel-1 SAR detections, the AIS
 * Gap Engine, and the Dark Contact Correlation Engine.
 *
 * ## Two rules this domain exists to hold
 *
 * 1. **No detection is ever identified as a specific vessel.** Identity
 *    is returned as ranked `CandidateIdentity` hypotheses with evidence,
 *    and even the top one is a correlation between two observations.
 *
 * 2. **Sentinel-1 is not a live feed.** Every scene, detection and event
 *    carries its acquisition time, and `dataAgeMs` is recomputed at read
 *    time rather than cached.
 *
 * The Copernicus credentials and STAC endpoint are never reachable from
 * the browser — see `@/lib/server/eo.server`.
 */
export type {
  AisGap,
  AisMatchStatus,
  AisReport,
  CandidateIdentity,
  CorrelationEvidence,
  CorrelationResult,
  DetectorProvenance,
  GeoJsonPolygon,
  MaritimeEvent,
  MaritimeEventType,
  Polarisation,
  SarDetection,
  SarScene,
  SensorId,
  Sentinel1Mode,
} from "./types";

export {
  clearShipDetector,
  detectShips,
  getShipDetector,
  registerShipDetector,
  unavailableDetector,
  type DetectionRun,
  type ShipDetector,
} from "./detector";

export {
  DEFAULT_GAP_THRESHOLD_SEC,
  findAisGaps,
  gapCouldReach,
  gapCoversInstant,
  haversineM,
  reachableRadiusM,
  type GapOptions,
} from "./ais-gap";

export {
  DEFAULT_AIS_WINDOW_MS,
  aisWindowFor,
  bboxAround,
  clearAisHistoryProvider,
  describeCoverage,
  getAisHistoryProvider,
  queryAisAroundAcquisition,
  registerAisHistoryProvider,
  supportsUnmatchedConclusion,
  type AisCoverage,
  type AisHistoryProvider,
  type AisHistoryResult,
  type BoundingBox,
} from "./ais-history";

export {
  AisProviderRegistry,
  AisProviderRegistryError,
  DATALASTIC_ENTRY,
  SEAVANTAGE_ENTRY,
  aisProviderRegistry,
  describeAisAvailability,
  type AisProviderCapabilities,
  type AisProviderEntry,
  type AisProviderStatus,
  type UnverifiedCapabilities,
} from "./ais-providers";

export {
  CANDIDATE_FLOOR,
  MATCH_THRESHOLD,
  correlateDetection,
  correlateDetections,
  type CorrelateOptions,
} from "./correlation";

export {
  STRONG_DETECTION_CONFIDENCE,
  TIGHT_GEOMETRY_FRACTION,
  byConsequence,
  classifyDetection,
  classifyGaps,
  dataAgeMs,
  describeDataAge,
  type ClassifyOptions,
} from "./events";

export { sweep, type EoSweepResult, type SweepOptions } from "./pipeline";
