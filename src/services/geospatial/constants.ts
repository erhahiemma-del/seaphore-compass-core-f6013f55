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
 * The deepest zoom the imagery service is asked for.
 *
 * Coverage is not uniform and cannot be: it is photography, and it ends
 * at different depths in different places. Measured across the Nigerian
 * ports and Rotterdam, real tiles run to 18–20 depending on location.
 *
 * Past this the source is overzoomed rather than queried — MapLibre
 * stretches the deepest tile it holds instead of requesting one that may
 * not exist. That keeps the ground continuous at tactical zoom, and it
 * is a property of the service rather than of any port, so no location
 * is special-cased.
 *
 * Declared here, above the viewport defaults, because the camera ceiling
 * is derived from it and a constant cannot be read before it exists.
 */
export const GEOGRAPHIC_CONTEXT_MAX_ZOOM = 19;

/**
 * How deep the camera is allowed to go.
 *
 * Derived from what the ground can actually show rather than chosen. The
 * imagery service is queried to {@link GEOGRAPHIC_CONTEXT_MAX_ZOOM} and
 * overzoomed past it — MapLibre stretches the deepest real tile — so one
 * level beyond the query ceiling still shows the place rather than an
 * empty frame.
 *
 * It had been 18 since the map was first built and had never been
 * anything else — a level shallower than the imagery could already
 * serve, so an officer inspecting a berth hit a wall the ground had not
 * reached. Deriving it means the two cannot drift apart: raising the
 * imagery ceiling raises the camera with it, and neither can be changed
 * in ignorance of the other.
 */
export const MAX_CAMERA_ZOOM = GEOGRAPHIC_CONTEXT_MAX_ZOOM + 1;

/**
 * Map viewport defaults — Gulf of Guinea, Nigerian operational area.
 *
 * Unchanged by M2. These are the `regional` scope's values, kept as
 * their own export so every existing consumer reads exactly what it
 * always did; see {@link MAP_SCOPES} for the scope model built around
 * them.
 */
export const MAP_DEFAULTS = {
  /**
   * [lon, lat] — the Nigerian port estate, with the Gulf beneath it.
   *
   * Was [3.5, 4.5], which framed open water south-west of Lagos. On
   * Mission Control's map panel — wide and short at roughly 619×434 —
   * that put Onne and Calabar outside the eastern edge entirely and left
   * Apapa, Tin Can and Lekki about 40px from the top, underneath the
   * layer-chip overlay. Four of the six major ports were unreachable at
   * the opening view, which read as "the ports are missing" rather than
   * "the camera is looking somewhere else".
   *
   * This centres the estate itself: it spans lon 3.32–8.32, lat
   * 4.72–6.43, and at zoom 6 all six sit inside the frame on both the
   * Mission Control panel and the full-bleed Maritime Command surface,
   * with the Lagos cluster clear of the chrome. The Gulf still occupies
   * the lower half, so the sea remains the theatre.
   */
  center: [5.8, 5.5] as readonly [number, number],
  zoom: 6,
  minZoom: 4,
  maxZoom: MAX_CAMERA_ZOOM,
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
 * High-detail geographic context for tactical zoom.
 *
 * The vector basemap's source stops at zoom 14. Past that MapLibre
 * overzooms one tile, so the picture does not merely stop improving — it
 * empties, because a smaller viewport holds fewer of the same features.
 * Measured at Onne: 1409 features at zoom 8, 41 at zoom 17, with water
 * reaching zero. The harbour itself stopped being drawn.
 *
 * Imagery is the only thing that adds geometry past that ceiling. It is
 * GEOGRAPHIC CONTEXT and nothing else: shoreline, jetties, terminals and
 * buildings as they were when the tile was captured. A ship visible in a
 * tile is not an observation — Seaphore did not see it, cannot date it,
 * and must never present it as a position. Live operational data
 * continues to come only from the vessel, incident and investigation
 * layers, which draw above this.
 */
/*
 * `blankTile=false` is load-bearing, not a tuning parameter.
 *
 * Beyond its coverage the service does not fail — it succeeds, returning
 * HTTP 200 with a valid JPEG that is a flat grey card reading "Map data
 * not yet available". Measured: 2.5 KB at every location past coverage,
 * against 5–24 KB for real imagery, and `200 image/jpeg` in both cases.
 *
 * Nothing downstream could tell the two apart. MapLibre had no error to
 * detect, so it painted the card; the raster layer is fully opaque from
 * zoom 15.5, so the card covered the vector geography underneath. An
 * officer zooming into a harbour watched the map turn grey and print an
 * error message across itself — the deeper they looked, the less they
 * could see.
 *
 * With this parameter the same request returns 404 instead. MapLibre
 * draws nothing for that tile and the vector geography beneath shows
 * through, which is the honest answer: no imagery here, the map
 * continues. Verified against the live service — placeholders became
 * 404, and real imagery at Apapa z17 and Rotterdam z20 was untouched.
 */
export const GEOGRAPHIC_CONTEXT_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false";

/** Attribution the imagery requires. Shown in the map's attribution control. */
export const GEOGRAPHIC_CONTEXT_ATTRIBUTION = "Imagery © Esri";

/**
 * The deepest zoom the imagery service is asked for.
 *
 * Coverage is not uniform and cannot be: it is photography, and it ends
 * at different depths in different places. Measured across the Nigerian
 * ports and Rotterdam, real tiles run to 18–20 depending on location.
 *
 * Past this the source is overzoomed rather than queried — MapLibre
 * stretches the deepest tile it holds instead of requesting one that may
 * not exist. That keeps the ground continuous at tactical zoom, and it
 * is a property of the service rather than of any port, so no location
 * is special-cased.
 */
/**
 * Where the vector source stops carrying new geometry.
 *
 * Read from its own TileJSON rather than assumed.
 */
export const VECTOR_SOURCE_MAX_ZOOM = 14;

/** Zoom at which geographic context begins to appear, and is fully opaque. */
export const GEOGRAPHIC_CONTEXT_ZOOM = { fadeIn: 13, full: 15.5 } as const;

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
    // Mirrors MAP_DEFAULTS.center — see the note there for why the port
    // estate rather than the water south-west of it.
    center: [5.8, 5.5],
    zoom: 6,
    minZoom: 4,
    maxZoom: MAX_CAMERA_ZOOM,
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
    maxZoom: MAX_CAMERA_ZOOM,
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
/**
 * What the canonical camera writer will accept.
 *
 * This is the real ceiling. `setCamera` clamps every request against it,
 * so a scope's own `maxZoom` only governs the wheel — anything arriving
 * through `navigateTo`, a URL, a coordinate or a control was silently
 * cut to 18 here regardless of what the map instance allowed.
 *
 * Derived from {@link MAX_CAMERA_ZOOM} so the clamp and the map cannot
 * disagree. They already had: the ceiling sat a level below what the
 * imagery could serve, and an officer asking for zoom 20 over Apapa was
 * given 18 with no indication that the request had been altered.
 */
export const ZOOM_LIMITS = { min: 1, max: MAX_CAMERA_ZOOM } as const;

/**
 * The three ways an officer reads this map.
 *
 * Named bands rather than bare numbers scattered through paint
 * expressions, because the same three thresholds govern labels, borders,
 * the graticule, the EEZ, port symbols and vessel symbols — and when
 * they were written out per-layer they disagreed. Every zoom ramp added
 * or changed in M2.5 anchors on these.
 *
 * The bands answer different questions:
 *
 *   world        Where is activity, globally?      1 → 3.5
 *   regional     What is the pattern here?       3.5 → 8
 *   operational  What is this individual thing?     8 → 18
 *
 * `worldMax` and `regionalMax` are fractional so a ramp can cross a
 * boundary as a fade rather than a step. A layer that genuinely needs to
 * appear at once uses `["step", …]` against the same number.
 */
export const ZOOM_BANDS = {
  worldMin: 1,
  worldMax: 3.5,
  regionalMin: 3.5,
  regionalMax: 8,
  operationalMin: 8,
  /*
   * Follows the camera ceiling.
   *
   * The bands have to span the whole navigable range or the deepest
   * stretch of a descent is styled by a ramp that ended before the
   * officer did — labels, borders and symbols all holding values chosen
   * for a shallower map.
   */
  operationalMax: MAX_CAMERA_ZOOM,
} as const;

/**
 * Which band a zoom level falls in.
 *
 * Exported so the legend and any panel can describe the current view in
 * the same words the paint expressions are tuned around, instead of
 * inventing a fourth vocabulary for the same three ideas.
 */
export type ZoomBand = "world" | "regional" | "operational";

export function zoomBandFor(zoom: number): ZoomBand {
  if (!Number.isFinite(zoom)) return "world";
  if (zoom < ZOOM_BANDS.worldMax) return "world";
  if (zoom < ZOOM_BANDS.regionalMax) return "regional";
  return "operational";
}

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
  /**
   * 3D building extrusion fill.
   *
   * Part of the land family on purpose: a building is geography, not
   * intelligence, and must never read as an entity. Declared on the
   * palette interface because the map style is now palette-driven, so a
   * theme that omitted it would fail to render extrusions rather than
   * silently falling back.
   */
  readonly buildingExtrusion: string;
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
  /**
   * Extruded building mass.
   *
   * A shade above `landUrban` so buildings separate from the ground they
   * stand on, and no further: they are the quietest thing the map draws
   * on purpose. Deliberately sharing the land family rather than
   * introducing a new hue — a building is geography, not intelligence,
   * and must never read as an entity.
   */
  buildingExtrusion: "#243447",
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
/**
 * How the map presents itself.
 *
 * A presentation choice, not a claim about data. The three modes repaint
 * water, land, boundaries and label contrast for different working
 * conditions — a lit operations room, a darkened one, and a night watch
 * where screen glare carries into the bridge. None of them changes what
 * is observed, which is why adding one is design work rather than a
 * statement Seaphore has to be able to defend.
 *
 * `maritime` and `institutional` are retained as the historical names so
 * existing callers and stored state keep working; the officer-facing
 * labels live in `PRESENTATION_MODES`.
 */
export type MapStylePaletteName = "maritime" | "institutional" | "night-operations";

/** The presentation modes, in the order the control offers them. */
export const PRESENTATION_MODES: readonly {
  readonly id: MapStylePaletteName;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    id: "institutional",
    label: "Institutional",
    description: "Light command surface. The default for daylight operations.",
  },
  {
    id: "maritime",
    label: "Maritime Dark",
    description: "Dark operational environment for a low-light room.",
  },
  {
    id: "night-operations",
    label: "Night Operations",
    description: "Near-black ground with high-contrast operational colour, for a night watch.",
  },
] as const;

/**
 * Night Operations palette.
 *
 * Built for contrast against a near-black ground rather than for
 * prettiness: the ocean sits barely above the page so operational colour
 * carries, and land is separated by value rather than hue. Restrained
 * deliberately — a night watch needs to read a chart at low luminance,
 * not look at a heads-up display.
 */
export const NIGHT_OPS_PALETTE: MaritimePalette = {
  ocean: "#061525",
  oceanShallow: "#0A2036",
  land: "#0B1622",
  landUrban: "#111F2E",
  buildingExtrusion: "#16283A",
  coastline: "#2C6B87",
  waterway: "#1B4560",
  seaLabel: "#4E7E96",
  placeLabel: "#8FA6B8",
  labelHalo: "#030712",
  boundary: "#22384A",
  graticule: "#1E3446",
  voyageRelationship: "#8B6FC7",
  voyageOrigin: "#00E5FF",
  voyageDestination: "#36D399",
} as const;

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
  /*
   * One step down from `landUrban`, not up.
   *
   * On the dark palette buildings sit slightly above the ground they
   * stand on; on a light ground the same separation has to run the other
   * way or the extrusion disappears into the page. Still inside the land
   * family, and still the quietest thing the map draws.
   *
   * Matched to the dark palette's separation rather than chosen by eye,
   * so both themes grant a building the same amount of presence:
   *
   *   dark    landUrban #1D2937 : building #243447   = 1.163
   *   light   landUrban #EFF3F7 : building #DAE3EC   = 1.164
   *
   * The first light value tried, #E2E9F0, sat at 1.098 — directionally
   * right but flatter than the house standard, which on a near-white
   * ground is where an extrusion stops reading as a separate object.
   * Ports remain far louder at 3.86 against this, and the coastline at
   * 2.55, so nothing operational is competed with.
   */
  buildingExtrusion: "#DAE3EC",
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
    /*
     * NPA handbook, transcribed from degrees and decimal minutes:
     * 06°25.7'N → 6.428333, 003°20.530'E → 3.342167.
     *
     * Replaces [3.3167, 6.4333], which was a coarser reference carried
     * since M1. The handbook position sits about 2.8 km east of it, which
     * moves Tin Can *closer* to Apapa — 8.8 km rather than 11.6 — and
     * that is the correct direction: the two complexes genuinely share
     * the Lagos harbour approach. The label placement strategy has to
     * absorb the proximity rather than the coordinate being loosened to
     * make room for it.
     */
    lat: 6.428333,
    lon: 3.342167,
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
/**
 * Geographic sea labels drawn by Seaphore rather than the basemap.
 *
 * Orientation, not intelligence. The basemap's own `water_name` layer is
 * restyled and let in early (see `map-style.ts`), but it does not carry
 * the Gulf of Guinea at the zooms this map is read at, and the officer
 * needs to know which water they are looking at.
 *
 * The position is a label anchor over open water, not a feature centroid:
 * it names an area, so it is placed where the text reads clearly rather
 * than at any computed centre. Offshore of the Bight of Bonny, roughly
 * 80 km out, so the word never sits over Nigerian land — and east of
 * centre, because the map panel's own data-state card occupies the lower
 * left and a label behind it is a label nobody reads.
 */
export const SEA_LABELS: readonly {
  readonly id: string;
  readonly name: string;
  readonly position: readonly [number, number];
}[] = [{ id: "gulf-of-guinea", name: "Gulf of Guinea", position: [7.0, 3.8] }];

export const LAYER_IDS = {
  vessels: "vessels-layer",
  /** Selection ring drawn beneath the vessel symbols. */
  vesselSelection: "vessel-selection-layer",
  vesselLabels: "vessel-labels-layer",
  vesselClusters: "vessel-clusters-layer",
  clusterCount: "cluster-count-layer",
  /*
   * Traffic density — where vessels are, and nothing else.
   *
   * Its own layer rather than a mode of `riskHeatmap`, because the two
   * answer different questions and share no input. Risk weights on
   * `attentionScore`; this weights on one vessel, one unit. A busy
   * anchorage is dense and unremarkable, and a single dark hull can be
   * the most important thing on the map — collapsing them into one
   * gradient would make both unreadable.
   */
  trafficDensity: "traffic-density-layer",
  ports: "ports-layer",
  portLabels: "port-labels-layer",
  portAnchorage: "port-anchorage-layer",
  /**
   * Hover and selection ring for ports.
   *
   * The counterpart of {@link vesselSelection}. Ports and vessels share
   * one interaction language, so they get structurally parallel layers
   * rather than each growing its own convention.
   */
  portSelection: "port-selection-layer",
  seaLabels: "sea-labels-layer",
  /** High-detail geographic context, revealed at tactical zoom. */
  geographicContext: "geographic-context-layer",
  /**
   * Confidence ring, drawn beneath a vessel.
   *
   * Its own layer rather than a paint rule on the vessel symbol,
   * because confidence and risk are independent axes and a single
   * symbol cannot carry two rings.
   */
  vesselConfidence: "vessel-confidence-layer",
  /** Intelligence badges (investigation, risk, alert) attached to a vessel. */
  vesselIntelligence: "vessel-intelligence-layer",
  /**
   * Attention ring for an unresolved operational alert.
   *
   * Its own layer rather than a mode of an existing one. Alert state is
   * a fifth axis — a vessel can be risky, unconfident, selected,
   * highlighted by a query and alerting, all at once, and every one of
   * those has to remain readable. Overloading risk colour or icon size
   * with alert state would delete an axis to show another.
   */
  vesselAlertRing: "vessel-alert-ring-layer",
  /** Severity glyph pinned above the hull of an alerting vessel. */
  vesselAlertBadge: "vessel-alert-badge-layer",
  portAnchorageSymbol: "port-anchorage-symbol-layer",
  /** Elevation halo drawn beneath a major port symbol. */
  portHalo: "port-halo-layer",
  /** Verified anchorage areas: indicative extent, symbol and label. */
  /*
   * Maritime infrastructure from the facility registry — ports,
   * terminals, jetties, offshore and gas facilities the registry locates
   * in its own right. Three layers, because precision is drawn rather
   * than described: a ring beneath states how well the position is
   * known, the point states what the facility is, and the label names it.
   */
  /*
   * One trio per zoom tier, because the tier gate has to live in each
   * layer's static `minzoom`. MapLibre accepts `["zoom"]` only as the
   * direct input to an outer `interpolate` or `step` — nested inside a
   * `case` test it rejects the whole layer, which is how the first
   * attempt at this silently drew nothing.
   */
  facilityRingT1: "facility-ring-t1-layer",
  facilityRingT2: "facility-ring-t2-layer",
  facilityRingT3: "facility-ring-t3-layer",
  facilitiesT1: "facilities-t1-layer",
  facilitiesT2: "facilities-t2-layer",
  facilitiesT3: "facilities-t3-layer",
  facilityLabelsT1: "facility-labels-t1-layer",
  facilityLabelsT2: "facility-labels-t2-layer",
  facilityLabelsT3: "facility-labels-t3-layer",
  anchorageExtent: "anchorage-extent-layer",
  anchorages: "anchorages-layer",
  anchorageLabels: "anchorage-labels-layer",
  eezBoundary: "eez-boundary-layer",
  /** Jurisdictional wash inside the EEZ outline. */
  eezFill: "eez-fill-layer",
  /**
   * Extruded buildings, from the basemap's own geometry.
   *
   * Drawn beneath every maritime layer, including the graticule, so that
   * nothing operational can ever be occluded by geographic context.
   */
  buildings: "buildings-layer",
  /** Latitude/longitude reference lines. */
  graticule: "graticule-layer",
  voyageEndpoints: "voyage-endpoints-layer",
  /**
   * The selected vessel's recorded movement, when a source holds one.
   *
   * Its own layer rather than a property of the vessel symbol, so the
   * track can sit beneath the fleet without the vessel ever being drawn
   * under its own history.
   */
  vesselTrack: "vessel-track-layer",
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

/**
 * The palette a named theme resolves to.
 *
 * One mapping, beside the palettes it names, so a caller cannot pair the
 * institutional theme with the maritime palette by writing the ternary
 * slightly differently. Both palettes satisfy `MaritimePalette`, which
 * stays the single source of truth for what a map colour *means* —
 * adding a token obliges every theme to answer for it.
 */
export function paletteFor(name: MapStylePaletteName | undefined): MaritimePalette {
  if (name === "institutional") return LIGHT_MARITIME_PALETTE;
  if (name === "night-operations") return NIGHT_OPS_PALETTE;
  return MARITIME_PALETTE;
}

/**
 * Basemap style document each mode is painted over.
 *
 * Night Operations shares the dark basemap rather than needing one of its
 * own: `applyMaritimeStyle` repaints water, land, boundaries and labels
 * from the palette, so the mode is a colour decision and not a second
 * network dependency.
 */
export function basemapStyleFor(name: MapStylePaletteName | undefined): string {
  return name === "institutional" ? LIGHT_BASEMAP_STYLE : BASEMAP_STYLE;
}

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
