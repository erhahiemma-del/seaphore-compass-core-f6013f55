/**
 * GIP — Geospatial domain public API.
 *
 * The Live Command Map foundation (Sprint G5.5.1). Import from this barrel
 * rather than reaching into individual modules, so internal reorganisation
 * stays invisible to consumers.
 *
 * Architecture, top to bottom:
 *
 *   Layer Panel / Map Canvas        ← React surfaces (`@/features/maritime`)
 *        │
 *   Shared Geospatial Service       ← canonical shared state + URL sync
 *   Layer Registry                  ← logical layers → render layer ids
 *   Map Event Bus                   ← typed interaction transport
 *   Vessel Update Engine            ← incremental diffing
 *        │
 *   MapRenderer (interface)         ← injection seam
 *        │
 *   MapLibreRenderer / StubRenderer ← engine adapters
 *
 * Data enters through {@link VesselSource}, never through a direct table or
 * connector read — see `vessel-source.ts` for the Golden Rule constraint.
 *
 * This domain contains no intelligence. Risk bands and attention scores are
 * carried as externally-populated fields owned by OSAE (`@/services/osae`).
 */

export {
  BASEMAP_STYLE,
  LAYER_IDS,
  MAP_DEFAULTS,
  MAP_SCOPES,
  MARITIME_PALETTE,
  ZOOM_BANDS,
  ZOOM_LIMITS,
  zoomBandFor,
  type ZoomBand,
  type MapScopeDefinition,
  type MapScopeId,
  NIGERIA_EEZ_BBOX,
  NIMASA_PORTS,
  PIXELS_PER_KM,
  RISK_COLORS,
  RISK_OPACITY,
  SKY_TREATMENT,
  TIMING,
  VESSEL_SIZES,
  type NimasaPort,
  type NimasaPortCode,
} from "./constants";

export {
  applyMaritimeStyle,
  coastlineLayer,
  planMaritimeStyle,
  COASTLINE_LAYER_ID,
  type MaritimeStyleResult,
  type StyleEdit,
  type StyleLayerSummary,
  type StyleTarget,
} from "./map-style";

export {
  isLocated,
  normalizePortCode,
  portGazetteer,
  LayeredPortGazetteer,
  NimasaPortGazetteer,
  UnLocodePortGazetteer,
  GAZETTEER_ASSET_URL,
  type GazetteerAsset,
  type PortGazetteer,
  type PortResolution,
  type PortWithoutPosition,
  type PositionPrecision,
  type ResolvedPort,
  type UnknownPort,
} from "./port-gazetteer";

export {
  looksLikeDatabaseId,
  toPortLink,
  PORT_LINK_NOTES,
  type JoinedPortRow,
  type PortLink,
  type PortLinkState,
} from "./port-link";

export {
  arrivalState,
  departureState,
  setUnknownVoyageStatusReporter,
  KNOWN_VOYAGE_STATUSES,
  type DatabaseVoyageStatus,
  hasDrawableRelationship,
  journeyIntelligence,
  scheduleProgress,
  toVoyage,
  toVoyageStatus,
  withObservedTrack,
  JOURNEY_INTELLIGENCE_LABELS,
  JOURNEY_INTELLIGENCE_NOTES,
  type JourneyIntelligence,
  type MilestoneState,
  type Voyage,
  type VoyageEndpoint,
  type VoyageLinks,
  type VoyageRowLike,
  type VoyageSchedule,
  type VoyageStatus,
} from "./voyage";

export {
  endpointCoverage,
  toVoyageEndpointCollection,
  voyageBounds,
  type EndpointCoverage,
  type VoyageEndpointCollection,
  type VoyageEndpointProperties,
  type VoyageEndpointRole,
} from "./voyage-render";

export {
  graticuleFeatures,
  graticuleOpacityExpression,
  GRATICULE_STEPS,
  type GraticuleCollection,
  type GraticuleLine,
} from "./graticule";

export type {
  ArrivalWindow,
  BoundingBox,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonPoint,
  GeoJsonPolygon,
  LonLat,
  MapFilters,
  MapState,
  RiskLevel,
  Unsubscribe,
  VesselType,
  ViewMode,
} from "./types";

export {
  MapEventBus,
  mapEventBus,
  type LayerVisibilityEvent,
  type MapClickEvent,
  type MapErrorEvent,
  type MapEventHandler,
  type MapEventMap,
  type MapEventName,
  type MapMoveEvent,
  type MapReadyEvent,
  type VesselClickEvent,
  type VesselHoverEvent,
  type VesselsAppliedEvent,
} from "./event-bus";

export {
  createDefaultLayerRegistry,
  DEFAULT_LAYERS,
  LAYER_GROUP_LABELS,
  LAYER_GROUP_ORDER,
  LayerRegistry,
  LayerRegistryError,
  layerRegistry,
  MISSION_PRESETS,
  DOMAIN_PRESETS,
  type LayerDefinition,
  type LayerGroup,
  type LayerStatus,
  type MapDomain,
  type MissionPreset,
} from "./layer-registry";

export {
  createDefaultMapState,
  DEFAULT_FILTERS,
  SharedGeospatialService,
  sgs,
  type SharedGeospatialServiceOptions,
} from "./shared-geospatial-service";

export {
  hasRenderableChange,
  isStale,
  normalizeHeading,
  positionAgeMs,
  riskColor,
  toVesselFeature,
  vesselIconId,
  vesselKey,
  vesselOpacity,
  type Vessel,
  type VesselFeature,
  type VesselFeatureProperties,
  type VesselIdentity,
  type VesselPosition,
  type VesselProvenance,
  type VesselRenderContext,
} from "./vessel";

export {
  diffVessels,
  EMPTY_DIFF,
  isEmptyDiff,
  VesselUpdateEngine,
  type VesselDiff,
  type VesselUpdateEngineOptions,
} from "./update-engine";

export { isComfortablyVisible, planCameraMove } from "./camera";
export type { CameraMovePlan } from "./camera";

export type {
  MapCamera,
  MapControlOptions,
  MapRenderer,
  MapRendererDependencies,
  MapRendererMountOptions,
  VesselFeatureCollection,
  VesselRenderBatch,
} from "./renderer";

export {
  INSTALLED_RENDER_LAYERS,
  MAPLIBRE_AVAILABLE,
  MapLibreRenderer,
  NIGERIA_BOUNDS,
} from "./renderers/maplibre-renderer";
export { StubMapRenderer } from "./renderers/stub-renderer";

export {
  VESSEL_SPRITE_COLORS,
  VESSEL_SPRITE_SIZE,
  buildVesselSprites,
  createPortDiamondImage,
  createVesselSilhouetteImage,
} from "./icons/vessel-arrow";

export {
  EmptyVesselSource,
  StaticVesselSource,
  clearVesselSources,
  defaultEnabledSourceIds,
  getVesselSource,
  isDescribable,
  listVesselSources,
  registerVesselSource,
  type DescribableVesselSource,
  type SourceHealthReport,
  type SourceStatus,
  type SourceType,
  type VesselQuery,
  type VesselSource,
  type VesselSourceDescriptor,
} from "./vessel-source";

export {
  GFW_SOURCE_ID,
  GFW_SOURCE_LABEL,
  GlobalFishingWatchVesselSource,
  type GfwSourceHealth,
  type GfwSourceStats,
  type GlobalFishingWatchVesselSourceOptions,
  registerGlobalFishingWatchSource,
  type VesselCitation,
} from "./sources/global-fishing-watch-source";

export { useMapSelector, useMapSessionStore, useMapState, type RendererStatus } from "./store";

export {
  validateBatch,
  validateObservation,
  type BatchValidationResult,
  type ValidationCode,
  type ValidationOptions,
  type ValidationReason,
  type ValidationResult,
  type ValidationSummary,
  type ValidationVerdict,
} from "./validation";

export {
  DEFAULT_FRESHNESS_THRESHOLDS,
  FRESHNESS_COLORS,
  FRESHNESS_LABELS,
  formatAge,
  freshnessBandForAge,
  freshnessBandForTimestamp,
  freshnessColor,
  freshnessDistribution,
  freshnessLabel,
  type FreshnessBand,
  type FreshnessThresholds,
} from "./freshness";

// What a map surface is entitled to claim about its own data.
export {
  DATA_STATE_LABELS,
  resolveMapDataState,
  type MapDataState,
  type MapDataStateInput,
  type MapDataStateResult,
} from "./data-state";

export {
  REPLAY_SPEEDS,
  ReplayPlayer,
  ReplayRecorder,
  type ReplayFrame,
  type ReplayPlayerOptions,
  type ReplayRecorderOptions,
  type ReplaySink,
  type ReplaySpeed,
  type ReplayState,
  type ReplayStatus,
} from "./replay";

export {
  contributionFrom,
  fuseObservation,
  fuseObservations,
  type FusedObservation,
  type FusionCitation,
  type FusionConflict,
  type FusionContribution,
  type FusionOptions,
} from "./fusion";

export { computeIntelligenceMetrics, type IntelligenceMetrics } from "./vessel-source";

export { describeFleet, summarizeFleet, type FleetSummary } from "./fleet-summary";

export {
  buildNationalPicture,
  describeMetric,
  inputsFromFleetSummary,
  metricFreshness,
  pictureCoverage,
  type Metric,
  type NationalPicture,
  type NationalPictureInputs,
} from "./national-picture";

export {
  LAYER_FRESHNESS_LABELS,
  LIVE_THRESHOLD_MS,
  isLive,
  resolveLayerState,
  type LayerFreshness,
  type LayerObservation,
  type LayerRuntimeState,
} from "./layer-registry";

export {
  OPERATING_MODES,
  OPERATING_MODE_DESCRIPTIONS,
  OPERATING_MODE_LABELS,
  decodeSelection,
  describeSelection,
  encodeSelection,
  isSameSelection,
  modeForSelection,
  selectionFromLegacy,
  selectionKey,
  type MapSelection,
  type MapSelectionKind,
  type OperatingMode,
} from "./selection";

export {
  classifyVessel,
  resolveHeading,
  vesselSpriteId,
  vesselSpriteIds,
  SUPPORTED_CATEGORIES,
  VESSEL_COLOR_KEYS,
  VESSEL_SILHOUETTES,
  VESSEL_VISUALS,
} from "./vessel-visual";
export type {
  ResolvedHeading,
  VesselColorKey,
  VesselSilhouette,
  VesselVisual,
  VesselVisualCategory,
} from "./vessel-visual";

/**
 * The M2.5 entity visual language.
 *
 * Exported as a whole because the legend, the renderer and the vessel
 * projection all read from it, and the point of the module is that they
 * read the *same* values — a partial re-export would invite a consumer
 * to define the missing half locally.
 */
export {
  CONFIDENCE_COLORS,
  CONFIDENCE_RING_STYLES,
  CONFIDENCE_TIERS,
  confidenceTierFor,
  ENTITY_KIND_LABELS,
  INTELLIGENCE_BADGE_OFFSETS,
  INTELLIGENCE_COLORS,
  INTELLIGENCE_LABELS,
  INTERACTION_COLORS,
  INTERACTION_RADII,
  interactionStateFor,
} from "./entity-visual";
export type {
  ConfidenceRingStyle,
  ConfidenceTier,
  EntityInteractionState,
  EntityKind,
  IntelligenceSignal,
} from "./entity-visual";

/**
 * M2.6 adaptive perspective policy.
 *
 * Pure, like `camera.ts` beside it: this decides how far the camera
 * tilts, that one decides whether it moves. The renderer is the only
 * code permitted to act on either.
 */
export {
  MAX_AUTOMATIC_PITCH,
  PITCH_EPSILON,
  PITCH_STOPS,
  isManualPitchGesture,
  pitchForZoom,
  planPerspective,
  planPerspectiveReset,
} from "./perspective";
export type { PerspectivePlan, PitchOwner } from "./perspective";
