/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A — Maritime Intelligence Core (MIC) · Public API
 * ─────────────────────────────────────────────────────────────────────
 *
 *  ALL MIC consumers import from this file only.
 *  Never import from mic/container, mic/registries, or mic/types directly.
 *
 *  Pipeline position:
 *    IAL → IFE → MIC → Canonical UIP → OIE → Copilot → MIBC
 * ─────────────────────────────────────────────────────────────────────
 */

// ── Types (the vocabulary every MIC consumer needs) ──────────────────
export type {
  // Confidence
  MicConfidenceTier,
  // Citations
  MicCitation,
  // Statements
  MicStatementCategory,
  MicStatement,
  // Timeline
  MicTimelineEventKind,
  MicTimelineEvent,
  // Risk
  MicRiskIndicatorKind,
  MicRiskIndicator,
  MicRiskBand,
  MicRiskRegistryEntry,
  // Registry entries
  MicEntityRegistryEntry,
  MicRelationshipRegistryEntry,
  MicEvidenceRegistryEntry,
  MicConfidenceRegistryEntry,
  MicGraphRegistryEntry,
  MicReasoningRegistryEntry,
  // Process result
  MicProcessResult,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────
export {
  MIC_CONFIDENCE_THRESHOLDS,
  micTierFromScore,
  micScoreFromGrade,
  micBandFromScore,
  citationFromEvidence,
} from "./types";

// ── Container (DI root) ───────────────────────────────────────────────
export { MicContainer, mic } from "./container";
export type { MicContainerOptions } from "./container";

// ── Factory ──────────────────────────────────────────────────────────
export { createMicContainer, createMicContainerWithClock } from "./factory";

// ── Registries (direct access needed by tests and admin surfaces) ─────
export {
  MicEntityRegistry,
  MicRelationshipRegistry,
  MicEvidenceRegistry,
  MicConfidenceRegistry,
  MicTimelineRegistry,
  MicGraphRegistry,
  MicRiskRegistry,
  MicReasoningRegistry,
} from "./registries";

// ── Bootstrap integration ─────────────────────────────────────────────
export { processMicBootstrap } from "./bootstrap";
export type { MicBootstrapResult } from "./bootstrap";

// ── Telemetry ─────────────────────────────────────────────────────────
export type {
  MicExecutionTelemetry,
  MicTelemetrySink,
  MicExecutionOutcome,
  MicPipelineStage,
} from "./telemetry/types";
export { ConsoleSink, CapturingSink, CompositeSink } from "./telemetry/sinks";
export { globalMicSink, mioCaptureSink } from "./telemetry-registry";
// ── Feature flag ─────────────────────────────────────────────────────
export { isMicEnabled, setMicEnabled, resetMicFlag, getMicFlagState } from "./feature-flag";
export type { MicFlagState } from "./feature-flag";

// ── Intelligence Object Model (INT-01B) ─────────────────────────────
export type {
  IntelligenceObjectKind,
  IntelligenceObjectBase,
  IntelligenceObject,
  AttributesForKind,
  VesselAttributes,
  VoyageAttributes,
  PortAttributes,
  CargoAttributes,
  ManifestAttributes,
  ContainerAttributes,
  CompanyAttributes,
  PersonAttributes,
  DirectorAttributes,
  OwnerAttributes,
  OrganisationAttributes,
  SanctionAttributes,
  InspectionAttributes,
  IncidentAttributes,
  DocumentAttributes,
  SatelliteObservationAttributes,
  WeatherEventAttributes,
  LocationAttributes,
  InsuranceAttributes,
  ClassificationSocietyAttributes,
} from "./entities/types";
export {
  INTELLIGENCE_OBJECT_KINDS,
  IntelligenceObjectRegistry,
  buildIntelligenceObjects,
} from "./entities";
