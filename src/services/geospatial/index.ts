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
  NIGERIA_EEZ_BBOX,
  NIMASA_PORTS,
  RISK_COLORS,
  RISK_OPACITY,
  TIMING,
  VESSEL_SIZES,
  type NimasaPort,
  type NimasaPortCode,
} from "./constants";

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
  type LayerDefinition,
  type LayerGroup,
  type LayerStatus,
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

export type {
  MapCamera,
  MapRenderer,
  MapRendererDependencies,
  MapRendererMountOptions,
  VesselFeatureCollection,
  VesselRenderBatch,
} from "./renderer";

export {
  MAPLIBRE_AVAILABLE,
  MapLibreRenderer,
  NIGERIA_BOUNDS,
} from "./renderers/maplibre-renderer";
export { StubMapRenderer } from "./renderers/stub-renderer";

export {
  VESSEL_SPRITE_SIZE,
  VESSEL_SPRITE_VARIANTS,
  buildVesselSprites,
  createPortDiamondImage,
  createVesselArrowImage,
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

export {
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
