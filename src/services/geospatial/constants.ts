/**
 * GIP — Map design-system constants.
 *
 * Single source of truth for every geospatial constant used by the Live
 * Command Map. Transcribed from the GIP Live Map Development Guide §2
 * ("Design System — Map Constants").
 *
 * Golden Rule for this module:
 *   Never hardcode a colour, coordinate, zoom level, or timing in a map
 *   component. Import it from here so a design-system change propagates
 *   automatically to every surface.
 *
 * This module is deliberately free of runtime dependencies — it is safe to
 * import from services, components, tests, and server code alike.
 */

/** Map viewport defaults — Gulf of Guinea, Nigerian operational area. */
export const MAP_DEFAULTS = {
  /** [lon, lat] — Gulf of Guinea. */
  center: [3.5, 4.5] as readonly [number, number],
  zoom: 6,
  minZoom: 4,
  maxZoom: 18,
  /**
   * Restricts panning to the West African region so officers cannot
   * navigate away from the operational area of responsibility.
   */
  maxBounds: [
    [-10, -4],
    [20, 14],
  ] as readonly [readonly [number, number], readonly [number, number]],
} as const;

/**
 * CARTO Dark Matter — free, key-less, maritime-appropriate dark basemap.
 * Fallback if CARTO is unavailable:
 *   https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json
 */
export const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Maritime figure–ground palette.
 *
 * CARTO Dark Matter paints land `#0e0e0e` and water `#2C353C` — about
 * nine percent luminance apart, with the land darker than the sea. For a
 * maritime picture that is the wrong way round: the ocean is the theatre
 * the officer is reading, and land is context. These values invert it,
 * so land reads as a solid neutral mass and the water reads as depth.
 *
 * ## No value here encodes a measurement
 *
 * The ocean is one flat colour at every location and every zoom. That is
 * deliberate. A colour that varied with position would be read as
 * bathymetry, and this repository holds no depth data — so a gradient
 * would be exactly the kind of invented fact the heading contract exists
 * to prevent. Depth stays unavailable until GEBCO or EMODnet is wired.
 */
export const MARITIME_PALETTE = {
  /** Open water. Flat by design — see above. */
  ocean: "#071B2E",
  /** Landmass. Deliberately lighter than the sea so land reads as solid. */
  land: "#16202B",
  /** Built-up land, a shade above the base so cities read at close zoom. */
  landUrban: "#1D2937",
  /** The land/water edge, drawn explicitly rather than left implicit. */
  coastline: "#3E6E8E",
  /** Rivers and estuaries — the Niger Delta is operationally significant. */
  waterway: "#22506E",
  /** Sea and ocean names. */
  seaLabel: "#6E93A8",
  /** Country, state and city names. */
  placeLabel: "#93A7B8",
  /** Halo behind every basemap label, matching the land tone. */
  labelHalo: "#0A121B",
  /** Land administrative boundaries. Dimmed — they are not maritime. */
  boundary: "#2A3948",
  /** Latitude/longitude graticule. Cool grey, never gold — see below. */
  graticule: "#2E4356",
} as const;

/**
 * Sky and horizon treatment.
 *
 * Pure rendering state: the sky is not a map feature and carries no
 * geographic claim whatsoever. Note that MapLibre only draws it when the
 * horizon is in frame, which requires a pitched camera — this
 * deployment runs `pitch: 0` with `pitchWithRotate: false`, so the
 * values below are wired and correct but not currently visible. They are
 * set anyway so that enabling pitch is a one-line change rather than a
 * design exercise.
 */
export const SKY_TREATMENT = {
  "sky-color": "#0A2338",
  "horizon-color": "#1B4A63",
  "fog-color": "#071B2E",
  "fog-ground-blend": 0.6,
  "horizon-fog-blend": 0.55,
  "sky-horizon-blend": 0.7,
  "atmosphere-blend": 0.6,
} as const;

/** Seaphore risk palette. CRITICAL and HIGH deliberately share one red. */
export const RISK_COLORS = {
  CRITICAL: "#C0392B",
  HIGH: "#C0392B",
  MEDIUM: "#D4890A",
  LOW: "#1A6B3A",
  UNKNOWN: "#4A5568",
  CLEAN: "#1A6B3A",
} as const;

/** Marker opacity by operational condition. */
export const RISK_OPACITY = {
  /** Vessel has fresh position data. */
  ACTIVE: 1.0,
  /** No position update for longer than {@link TIMING.staleThresholdMs}. */
  STALE: 0.5,
  /** Non-attention vessel while an attention set is active. */
  DIMMED: 0.35,
  /** Vessel in the priority/attention queue. */
  ATTENTION: 1.0,
} as const;

/** Vessel marker radii, in pixels. */
export const VESSEL_SIZES = {
  default: 7,
  attention: 10,
  selected: 11,
  cluster: 18,
} as const;

/** A NIMASA port of interest. */
export interface NimasaPort {
  readonly locode: string;
  readonly name: string;
  readonly shortName: string;
  readonly lat: number;
  readonly lon: number;
  readonly berths: number;
  /** Anchorage radius in kilometres. */
  readonly anchorageRadius: number;
}

/** The five NIMASA ports, WGS84. */
export const NIMASA_PORTS: Readonly<Record<string, NimasaPort>> = {
  NGAPAPA: {
    locode: "NGAPAPA",
    name: "Apapa (Lagos)",
    shortName: "APA",
    lat: 6.4281,
    lon: 3.4219,
    berths: 14,
    anchorageRadius: 3,
  },
  NGTIN: {
    locode: "NGTIN",
    name: "Tin Can Island",
    shortName: "TIN",
    lat: 6.4333,
    lon: 3.3167,
    berths: 10,
    anchorageRadius: 2,
  },
  NGWARR: {
    locode: "NGWARR",
    name: "Warri",
    shortName: "WAR",
    lat: 5.5167,
    lon: 5.75,
    berths: 6,
    anchorageRadius: 2,
  },
  NGCBQ: {
    locode: "NGCBQ",
    name: "Calabar",
    shortName: "CAL",
    lat: 4.95,
    lon: 8.3167,
    berths: 5,
    anchorageRadius: 1.5,
  },
  NGONNE: {
    locode: "NGONNE",
    name: "Onne",
    shortName: "ONN",
    lat: 4.7167,
    lon: 7.15,
    berths: 8,
    anchorageRadius: 2,
  },
} as const;

/** Valid NIMASA port LOCODEs. */
export type NimasaPortCode = keyof typeof NIMASA_PORTS;

/**
 * Simplified Nigerian EEZ bounding box, for fast containment checks only.
 * The full 200-nautical-mile polygon is loaded separately as GeoJSON.
 */
export const NIGERIA_EEZ_BBOX = {
  minLon: 2.5,
  maxLon: 9.5,
  minLat: 3.0,
  maxLat: 8.5,
} as const;

/**
 * Canonical MapLibre layer ids.
 *
 * These are *render* ids handed to the map engine. They are deliberately
 * distinct from the logical layer keys used by the Layer Registry, so the
 * registry can reorganise, group, or rename logical layers without changing
 * what the renderer draws. See `layer-registry.ts`.
 */
export const LAYER_IDS = {
  vessels: "vessels-layer",
  /** Selection ring drawn beneath the vessel symbols. */
  vesselSelection: "vessel-selection-layer",
  vesselLabels: "vessel-labels-layer",
  vesselClusters: "vessel-clusters-layer",
  clusterCount: "cluster-count-layer",
  ports: "ports-layer",
  portLabels: "port-labels-layer",
  portAnchorage: "port-anchorage-layer",
  eezBoundary: "eez-boundary-layer",
  /** Jurisdictional wash inside the EEZ outline. */
  eezFill: "eez-fill-layer",
  /** Latitude/longitude reference lines. */
  graticule: "graticule-layer",
  aisTrack: "ais-track-layer",
  aisTrackDark: "ais-track-dark-layer",
  riskHeatmap: "risk-heatmap-layer",
  revenueHeat: "revenue-heatmap-layer",
  investigArea: "investigation-area-layer",
  weatherOverlay: "weather-layer",
  /** Non-cooperative SAR detections, and the scene footprints they came from. */
  sarDetections: "sar-detections-layer",
  sarDetectionLabels: "sar-detection-labels-layer",
  sarSceneFootprints: "sar-scene-footprints-layer",
  /** Reachable-area circles for open AIS gaps. */
  darkContactAreas: "dark-contact-areas-layer",
} as const;

/**
 * Screen pixels per kilometre, at the Nigerian operational latitude.
 *
 * Web Mercator resolution is `156543.034 · cos(lat) / 2^zoom` metres per
 * pixel. The five NIMASA ports span 4.7°N–6.4°N, where `cos(lat)` varies
 * by under half a percent, so a single reference latitude is exact
 * enough for a display radius.
 *
 * Two anchors are all that is needed: the relationship is a power of two
 * in zoom, so a MapLibre `["exponential", 2]` interpolation between them
 * reproduces every intermediate zoom exactly rather than approximating.
 *
 * This exists so anchorage extents can be drawn at their real radius in
 * kilometres instead of a fixed pixel size that means a different
 * distance at every zoom level.
 */
export const PIXELS_PER_KM = {
  minZoom: 6,
  minZoomPixels: 0.411,
  maxZoom: 14,
  maxZoomPixels: 105.2,
} as const;

/** Operational timings, in milliseconds. */
export const TIMING = {
  /** Full position refresh interval. */
  positionRefreshMs: 60_000,
  /** No update for longer than this dims the vessel as stale. */
  staleThresholdMs: 600_000,
  /** Delay before a hover Quick Assessment appears. */
  hoverDelayMs: 500,
  /** One-time intro pulse on a newly promoted priority vessel. */
  animationIntroMs: 3_000,
  /** Situation-layer recalculation interval. */
  situationRefreshMs: 60_000,
} as const;
