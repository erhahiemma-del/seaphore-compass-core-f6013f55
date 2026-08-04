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
  vesselHeadings: "vessel-headings-layer",
  vesselLabels: "vessel-labels-layer",
  vesselClusters: "vessel-clusters-layer",
  clusterCount: "cluster-count-layer",
  ports: "ports-layer",
  portLabels: "port-labels-layer",
  portAnchorage: "port-anchorage-layer",
  eezBoundary: "eez-boundary-layer",
  aisTrack: "ais-track-layer",
  aisTrackDark: "ais-track-dark-layer",
  riskHeatmap: "risk-heatmap-layer",
  revenueHeat: "revenue-heatmap-layer",
  investigArea: "investigation-area-layer",
  weatherOverlay: "weather-layer",
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
