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

/**
 * Map viewport defaults — Gulf of Guinea, Nigerian operational area.
 *
 * Unchanged by M2. These are the `regional` scope's values, kept as
 * their own export so every existing consumer reads exactly what it
 * always did; see {@link MAP_SCOPES} for the scope model built around
 * them.
 */
export const MAP_DEFAULTS = {
  /** [lon, lat] — Gulf of Guinea. */
  center: [3.5, 4.5] as readonly [number, number],
  zoom: 6,
  minZoom: 4,
  maxZoom: 18,
  /**
   * Restricts panning to the West African region so officers cannot
   * navigate away from the operational area of responsibility.
   *
   * Still the default everywhere. A surface that needs the world asks
   * for the `global` scope rather than this being loosened for all.
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
 * CARTO Positron — free, key-less light basemap for institutional overview
 * surfaces such as Mission Control. Operational command maps keep the dark
 * maritime default unless a caller explicitly opts into this style.
 */
export const LIGHT_BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/**
 * How far the map is allowed to travel.
 *
 * The map was built around one area of responsibility, and `maxBounds`
 * kept officers inside it — a real safeguard, not an accident. Global
 * journey intelligence needs Rotterdam and Singapore on the same canvas,
 * so the constraint becomes a *choice* rather than disappearing.
 *
 * `regional` reproduces the previous behaviour exactly, value for value,
 * and remains the default everywhere. A surface has to ask for `global`,
 * which is what keeps M1 and M1B's verified views unchanged.
 */
export interface MapScopeDefinition {
  readonly id: MapScopeId;
  readonly label: string;
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /**
   * Panning limit, or `null` for unrestricted.
   *
   * `null` is not "bounded by the whole world" — it is the absence of a
   * constraint. The difference is load-bearing: MapLibre's transform
   * cannot satisfy a `maxBounds` spanning ±180° at low zoom and throws
   * out of `constrainInternal` while computing its matrices, which
   * fails the whole mount.
   */
  readonly maxBounds: readonly [readonly [number, number], readonly [number, number]] | null;
  /**
   * The geographic area this scope covers.
   *
   * Always present, even when panning is unrestricted, because the
   * graticule has to be generated over something finite.
   */
  readonly extent: readonly [readonly [number, number], readonly [number, number]];
  /** Graticule intervals suited to this extent, coarsest first. */
  readonly graticuleSteps: readonly number[];
}

export type MapScopeId = "regional" | "global";

export const MAP_SCOPES: Readonly<Record<MapScopeId, MapScopeDefinition>> = {
  regional: {
    id: "regional",
    label: "Nigerian waters",
    center: [3.5, 4.5],
    zoom: 6,
    minZoom: 4,
    maxZoom: 18,
    maxBounds: [
      [-10, -4],
      [20, 14],
    ],
    extent: [
      [-10, -4],
      [20, 14],
    ],
    graticuleSteps: [10, 5, 1],
  },
  global: {
    id: "global",
    label: "Global",
    // Still centred on the Gulf of Guinea: a global map that opens on
    // the Atlantic mid-ocean would lose the operational area for no gain.
    center: [3.5, 4.5],
    zoom: 2,
    minZoom: 1,
    maxZoom: 18,
    /*
     * Unrestricted, not world-bounded.
     *
     * A `maxBounds` of ±180°/±85° looks like the right way to say
     * "everywhere", and it is not: MapLibre's transform tries to fit
     * that constraint inside the viewport, fails at low zoom, and
     * throws a null dereference out of `constrainInternal` while
     * computing its matrices — taking the entire mount with it. Global
     * scope means no panning constraint at all, which is also the more
     * honest reading of the word.
     */
    maxBounds: null,
    /*
     * Latitude stops at ±85, not ±90, for the graticule's extent. Web
     * Mercator diverges at the poles, so a parallel beyond 85.051129
     * has no finite position to draw at.
     */
    extent: [
      [-180, -85],
      [180, 85],
    ],
    /*
     * Ten-degree lines, uniformly.
     *
     * One-degree lines across a hemisphere are graph paper, so the
     * generator's span guard widens the finest interval to 10° at this
     * extent regardless. The declared set matters anyway, because it
     * also decides each line's *tag*, and the tag picks its opacity
     * ramp: with `[30, 10]` every thirtieth meridian tagged 30, fell
     * through to the finest ramp, and stayed invisible until zoom 7.5 —
     * a world graticule with a gap every third line.
     *
     * `[10, 5]` makes every emitted line tag as 10 and share the
     * coarse ramp, so the grid is continuous from zoom 1 outward.
     */
    graticuleSteps: [10, 5],
  },
} as const;

/**
 * Absolute zoom range across every scope.
 *
 * `MapState` is shared and serialised to the URL, so its clamp cannot
 * depend on which surface happens to be mounted — a link captured on a
 * global map must survive being opened anywhere. Each scope still
 * enforces its own narrower range at the renderer, which is the layer
 * that can actually stop a gesture.
 */
export const ZOOM_LIMITS = { min: 1, max: 18 } as const;

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
export interface MaritimePalette {
  readonly ocean: string;
  /**
   * Inshore water — lagoons, lakes, deltas and river polygons.
   *
   * A second tone, not a depth ramp. It is keyed off the basemap's own
   * water `class`, so the variation reports a distinction the source
   * actually makes; it never implies bathymetry, which remains unwired.
   */
  readonly oceanShallow: string;
  readonly land: string;
  readonly landUrban: string;
  readonly coastline: string;
  readonly waterway: string;
  readonly seaLabel: string;
  readonly placeLabel: string;
  readonly labelHalo: string;
  readonly boundary: string;
  readonly graticule: string;
  readonly voyageRelationship: string;
  readonly voyageOrigin: string;
  readonly voyageDestination: string;
}

export const MARITIME_PALETTE: MaritimePalette = {
  /** Open water. Flat by design — see above. */
  ocean: "#071B2E",
  /** Inshore water, one step off the open sea. */
  oceanShallow: "#0B2740",
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
  /**
   * Voyage marks.
   *
   * A violet used by nothing else on the map — not the gold EEZ, not the
   * grey graticule, not any risk band, not the teal of ports and
   * selection. Exclusivity is the point: a voyage endpoint is a record
   * from a manifest system, not an observation of a vessel, and it must
   * not be confusable with either the operational ports layer or a
   * vessel position.
   */
  voyageRelationship: "#8B6FC7",
  /** Voyage origin marker. */
  voyageOrigin: "#5E8CC2",
  /** Voyage destination marker. */
  voyageDestination: "#B78BD9",
} as const;
export type MapStylePaletteName = "maritime" | "institutional";

/**
 * Institutional light equivalent of the maritime palette.
 *
 * Still a flat, non-measurement basemap treatment: water, land and labels are
 * repainted for figure-ground fidelity only. No colour encodes bathymetry,
 * traffic density or risk.
 */
export const LIGHT_MARITIME_PALETTE: MaritimePalette = {
  /**
   * Open water. A medium cyan-blue so the sea reads as the theatre and the
   * land as context — still one flat tone at every location and zoom, because
   * no bathymetry source is wired and a varying sea would be read as depth.
   */
  ocean: "#69AAE3",
  /**
   * Inshore water — the lighter secondary tone from the approved
   * reference. Restrained, so the sea still reads as one body.
   */
  oceanShallow: "#7DB7E6",
  land: "#FAFCFD",
  landUrban: "#EFF3F7",
  coastline: "#5A93BC",
  waterway: "#7DB7E6",
  seaLabel: "#3C6B84",
  placeLabel: "#5C6E80",
  labelHalo: "#FFFFFF",
  boundary: "#C6D3DE",
  graticule: "#7FA8C4",
  voyageRelationship: "#7C6AA6",
  voyageOrigin: "#317EA8",
  voyageDestination: "#8D6DB3",
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

/**
 * How much weight a port carries in the national picture.
 *
 * `major` is one of the NPA port complexes; `secondary` is a terminal or
 * lesser facility. It decides symbol size and label priority, nothing
 * about activity — a quiet major port is still major.
 */
export type PortTier = "major" | "secondary";

/**
 * Where a position came from, carried rather than assumed.
 *
 * `npa-reference` — position published by the operator / NPA reference lists.
 * `chart-reference` — taken from published chart or pilotage reference text.
 * There is no `estimated` tier: an asset without a position is not listed.
 */
export type AssetVerification = "npa-reference" | "chart-reference";

/** A Nigerian port of interest. */
export interface NimasaPort {
  readonly locode: string;
  readonly name: string;
  readonly shortName: string;
  readonly lat: number;
  readonly lon: number;
  readonly berths: number;
  /** Anchorage radius in kilometres. */
  readonly anchorageRadius: number;
  readonly tier: PortTier;
  /** Nigerian state the complex sits in. */
  readonly state: string;
  readonly verification: AssetVerification;
}

/**
 * The Nigerian port complexes this map can represent, WGS84.
 *
 * The seven NPA port complexes. Positions are operator reference
 * positions, not surveyed berth coordinates, and `berths` is a reference
 * figure — never live capacity. Nothing here is geocoded from a name.
 */
export const NIMASA_PORTS: Readonly<Record<string, NimasaPort>> = {
  NGAPAPA: {
    locode: "NGAPAPA",
    name: "Lagos Port Complex — Apapa",
    shortName: "APAPA",
    lat: 6.4281,
    lon: 3.4219,
    berths: 14,
    anchorageRadius: 3,
    tier: "major",
    state: "Lagos",
    verification: "npa-reference",
  },
  NGTIN: {
    locode: "NGTIN",
    name: "Tin Can Island Port Complex",
    shortName: "TIN CAN",
    lat: 6.4333,
    lon: 3.3167,
    berths: 10,
    anchorageRadius: 2,
    tier: "major",
    state: "Lagos",
    verification: "npa-reference",
  },
  NGLEK: {
    locode: "NGLEK",
    name: "Lekki Deep Sea Port",
    shortName: "LEKKI",
    lat: 6.4247,
    lon: 4.0197,
    berths: 3,
    anchorageRadius: 2,
    tier: "major",
    state: "Lagos",
    verification: "npa-reference",
  },
  NGPHC: {
    locode: "NGPHC",
    name: "Rivers Port Complex — Port Harcourt",
    shortName: "RIVERS",
    lat: 4.7566,
    lon: 7.0125,
    berths: 9,
    anchorageRadius: 2,
    tier: "major",
    state: "Rivers",
    verification: "npa-reference",
  },
  NGONNE: {
    locode: "NGONNE",
    name: "Onne Port Complex",
    shortName: "ONNE",
    lat: 4.7167,
    lon: 7.15,
    berths: 8,
    anchorageRadius: 2,
    tier: "major",
    state: "Rivers",
    verification: "npa-reference",
  },
  NGWARR: {
    locode: "NGWARR",
    name: "Delta Port Complex — Warri",
    shortName: "WARRI",
    lat: 5.5167,
    lon: 5.75,
    berths: 6,
    anchorageRadius: 2,
    tier: "major",
    state: "Delta",
    verification: "npa-reference",
  },
  NGCBQ: {
    locode: "NGCBQ",
    name: "Calabar Port Complex",
    shortName: "CALABAR",
    lat: 4.95,
    lon: 8.3167,
    berths: 5,
    anchorageRadius: 1.5,
    tier: "major",
    state: "Cross River",
    verification: "npa-reference",
  },
} as const;

/**
 * A verified anchorage or pilotage waiting area.
 *
 * Reference positions for display and association only. Occupancy,
 * congestion and vessel counts are *not* properties of an anchorage —
 * they are observations, and they come from a connected feed or not at
 * all.
 */
export interface AnchorageArea {
  /** Canonical id, `NG-ANCH-…`. */
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** Indicative display radius in kilometres, never a surveyed limit. */
  readonly radiusKm: number;
  /** Port LOCODE this anchorage serves, when known. */
  readonly portId: string | null;
  /** Pilotage district, as published. */
  readonly district: string;
  readonly verification: AssetVerification;
  readonly source: string;
}

/**
 * Anchorage areas Seaphore can currently represent.
 *
 * Explicitly **not** an exhaustive national list — no source in the
 * repository claims completeness, so neither does this. Each entry
 * carries the district it belongs to and where the position came from.
 */
export const NIGERIAN_ANCHORAGES: Readonly<Record<string, AnchorageArea>> = {
  "NG-ANCH-LAGOS-INNER": {
    id: "NG-ANCH-LAGOS-INNER",
    name: "Lagos Inner Anchorage",
    lat: 6.4,
    lon: 3.3958,
    radiusKm: 2,
    portId: "NGAPAPA",
    district: "Lagos pilotage district",
    verification: "chart-reference",
    source: "NPA / published pilotage reference",
  },
  "NG-ANCH-LAGOS-FAIRWAY": {
    id: "NG-ANCH-LAGOS-FAIRWAY",
    name: "Lagos Fairway Anchorage",
    lat: 6.3167,
    lon: 3.3667,
    radiusKm: 4,
    portId: "NGAPAPA",
    district: "Lagos pilotage district",
    verification: "chart-reference",
    source: "NPA / published pilotage reference",
  },
  "NG-ANCH-BONNY": {
    id: "NG-ANCH-BONNY",
    name: "Bonny Anchorage",
    lat: 4.3667,
    lon: 7.1667,
    radiusKm: 5,
    portId: "NGPHC",
    district: "Bonny / Port Harcourt pilotage district",
    verification: "chart-reference",
    source: "NPA / published pilotage reference",
  },
  "NG-ANCH-ONNE": {
    id: "NG-ANCH-ONNE",
    name: "Onne Waiting Anchorage",
    lat: 4.5833,
    lon: 7.1583,
    radiusKm: 3,
    portId: "NGONNE",
    district: "Bonny / Port Harcourt pilotage district",
    verification: "chart-reference",
    source: "NPA / published pilotage reference",
  },
  "NG-ANCH-WARRI-ESCRAVOS": {
    id: "NG-ANCH-WARRI-ESCRAVOS",
    name: "Escravos Approach Anchorage (Warri)",
    lat: 5.5333,
    lon: 5.1,
    radiusKm: 4,
    portId: "NGWARR",
    district: "Warri pilotage district",
    verification: "chart-reference",
    source: "NPA / published pilotage reference",
  },
  "NG-ANCH-CALABAR": {
    id: "NG-ANCH-CALABAR",
    name: "Calabar Fairway Anchorage",
    lat: 4.5333,
    lon: 8.3167,
    radiusKm: 3,
    portId: "NGCBQ",
    district: "Calabar pilotage district",
    verification: "chart-reference",
    source: "NPA / published pilotage reference",
  },
};

/** Whether the anchorage registry claims national completeness. It does not. */
export const ANCHORAGE_REGISTRY_IS_EXHAUSTIVE = false;

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
  portAnchorageSymbol: "port-anchorage-symbol-layer",
  /** Elevation halo drawn beneath a major port symbol. */
  portHalo: "port-halo-layer",
  /** Verified anchorage areas: indicative extent, symbol and label. */
  anchorageExtent: "anchorage-extent-layer",
  anchorages: "anchorages-layer",
  anchorageLabels: "anchorage-labels-layer",

  eezBoundary: "eez-boundary-layer",
  /** Jurisdictional wash inside the EEZ outline. */
  eezFill: "eez-fill-layer",
  /** Latitude/longitude reference lines. */
  graticule: "graticule-layer",
  voyageEndpoints: "voyage-endpoints-layer",
  voyageEndpointLabels: "voyage-endpoint-labels-layer",
  aisTrack: "ais-track-layer",
  aisTrackDark: "ais-track-dark-layer",
  riskHeatmap: "risk-heatmap-layer",
  revenueHeat: "revenue-heatmap-layer",
  incidentReports: "incident-reports-layer",
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
