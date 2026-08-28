/**
 * GIP — Shared geospatial types.
 *
 * Core vocabulary for the Live Command Map. Kept dependency-free and
 * engine-agnostic: nothing here imports a map library, so these types are
 * safe to use from services, server code, React components, and tests.
 *
 * Sprint G5.5.1 — infrastructure only. Types describe *shape and transport*,
 * never intelligence. Scoring, attention ranking, and situation assessment
 * belong to OSAE (`@/services/osae`) and are referenced here only as
 * optional, externally-populated fields.
 */
import type { MapScopeId, MapStylePaletteName } from "./constants";
import type { MapSelection, OperatingMode } from "./selection";
import type { MapFilters } from "./vessel-filter";

/** A WGS84 coordinate pair in MapLibre/GeoJSON order: `[lon, lat]`. */
export type LonLat = readonly [number, number];

/** A geographic bounding box, `[[west, south], [east, north]]`. */
export type BoundingBox = readonly [LonLat, LonLat];

/**
 * Which rendering perspective is active.
 *
 * Named for the officer's mental model, per the Command Edition (R7):
 * "Operational View" (2D) and "Terrain Perspective" (3D) — never "MapLibre"
 * or "Cesium", which are implementation details.
 */
/**
 * How the map draws. Not what it is for — see `OperatingMode` for that,
 * and `MapInteractionMode` for how the officer is working.
 *
 * `GLOBE` is a projection, not a third map. It runs on the same MapLibre
 * instance through `setProjection`, so the camera, the selection, the
 * layers and the focused subject all survive the switch — an officer who
 * spins out to see a long-range approach comes back to the same picture
 * they left.
 */
export type ViewMode = "2D" | "3D" | "GLOBE";

/**
 * How the officer is working the map.
 *
 * A third axis, deliberately separate from both `ViewMode` (how it
 * draws) and `OperatingMode` (what it is for). The three answer
 * different questions and vary independently: an officer can be in the
 * PORT lens, in 3D, filtering — and none of those choices implies
 * either of the others.
 *
 * Merging any two would recreate the vocabulary drift this codebase has
 * already paid for once, where one name carried two meanings and a
 * consumer could not tell which it had.
 *
 *   LIVE          the current picture, as it is reporting
 *   FILTER        narrowing that picture to a question
 *   ANALYSIS      density, patterns and comparison over a period
 *   REPLAY        historical playback
 *   INTELLIGENCE  evidence, relationships and investigation context
 */
export type MapInteractionMode = "LIVE" | "FILTER" | "ANALYSIS" | "REPLAY" | "INTELLIGENCE";

export const MAP_INTERACTION_MODES: readonly MapInteractionMode[] = [
  "LIVE",
  "FILTER",
  "ANALYSIS",
  "REPLAY",
  "INTELLIGENCE",
] as const;

export const MAP_INTERACTION_MODE_LABELS: Readonly<Record<MapInteractionMode, string>> = {
  LIVE: "Live",
  FILTER: "Filter",
  ANALYSIS: "Analysis",
  REPLAY: "Replay",
  INTELLIGENCE: "Intelligence",
};

/** Risk bands recognised by the map. Mirrors the keys of `RISK_COLORS`. */
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "CLEAN";

/** Vessel classifications used for filtering. */
export type VesselType = "CONTAINER" | "TANKER" | "BULK" | "VEHICLE" | "OTHER";

/*
 * Filter state lives with the predicate that reads it.
 *
 * It was declared here and evaluated nowhere, which is how it came to
 * describe four dimensions with no reader for any of them. Keeping the
 * shape next to `matchesFilters` means a dimension cannot be added to the
 * type without landing in front of the code that has to honour it.
 */
export type { ArrivalWindow, MapFilters, PositionAgeWindow } from "./vessel-filter";

/**
 * The complete, serialisable state of the operational map.
 *
 * This is the single shared context every map surface reads from and writes
 * to via the Shared Geospatial Service. It is intentionally a plain data
 * object so it can be snapshotted, diffed, persisted to the URL, and
 * asserted against in tests.
 */
export interface MapState {
  /** Rendering perspective. 2D/3D only — see `operatingMode` for context. */
  readonly viewMode: ViewMode;
  /**
   * How the map presents itself.
   *
   * Shared state rather than a component prop, which is what it was: a
   * prop meant the officer could not choose, the choice could not
   * survive a reload, and a shared link carried someone else's lighting.
   * It is a presentation decision and changes nothing about what is
   * observed.
   */
  readonly presentationMode: MapStylePaletteName;
  /**
   * The intelligence context the officer is working in.
   *
   * Deliberately separate from `viewMode`: one is what the map is *for*,
   * the other is how it draws. Overloading a single field would recreate
   * the vocabulary drift G6.0 removed from the orchestration layer.
   */
  readonly operatingMode: OperatingMode;
  /** How the officer is working the map. Independent of lens and view. */
  readonly interactionMode: MapInteractionMode;
  /**
   * How far the camera may travel.
   *
   * Shared state rather than a component's own, because it is a property
   * of the picture the officer is looking at: it has to survive a
   * reload, a route change and a pasted link, exactly like `center` and
   * `zoom`. It previously lived in one component's `useState`, which
   * meant only that surface could leave the West African bounds and the
   * choice was lost the moment anything remounted.
   *
   * Defaults to `global`. Nigeria remains the opening *view* — that is
   * `center`/`zoom` — but it is no longer a wall.
   */
  readonly scope: MapScopeId;
  readonly center: LonLat;
  readonly zoom: number;
  readonly pitch: number;
  readonly bearing: number;
  /**
   * What the officer currently has open, across every selectable kind.
   *
   * The single source of truth for selection. `selectedEntityId` and
   * `selectedEntityImo` below are derived from this and exist only for
   * un-migrated readers.
   */
  readonly selection: MapSelection | null;
  /**
   * @deprecated Derived from `selection`. Read `selection` instead.
   * Removed once every consumer has migrated.
   */
  readonly selectedEntityId: string | null;
  /**
   * @deprecated Derived from `selection`. Read `selection` instead.
   * Non-null only when the selection is a vessel carrying an IMO.
   */
  readonly selectedEntityImo: string | null;
  /**
   * Vessels the current answer is about.
   *
   * Shared state rather than a component's own, for the same reason the
   * camera is: a result an officer is looking at must survive a remount
   * and be visible to every surface at once. Empty means no answer is on
   * screen and the map draws normally.
   *
   * Presentation only. It records which vessels a question returned, and
   * asserts nothing about them.
   */
  readonly approachHighlight: readonly string[];
  /** Logical layer keys currently switched on. See the Layer Registry. */
  readonly activeLayers: readonly string[];
  /**
   * Per-layer opacity overrides, keyed by logical layer id, 0–1.
   *
   * Sparse on purpose: a layer absent from this map renders at its own default,
   * so the common case costs nothing to store or serialise.
   */
  readonly layerOpacity: Readonly<Record<string, number>>;
  /**
   * Intelligence providers currently switched on, by source id.
   *
   * Owned by SGS like every other map preference, so a shared link carries
   * the officer's source selection with it.
   */
  readonly enabledSources: readonly string[];
  readonly filters: MapFilters;
  /** ISO timestamp when replaying history; `null` means "live". */
  readonly timelinePosition: string | null;
  readonly timelinePlaying: boolean;
  /** Officer-drawn investigation area, as a GeoJSON polygon ring. */
  readonly investigationArea: GeoJsonPolygon | null;
  readonly missionId: string | null;
}

/**
 * Minimal structural GeoJSON polygon.
 *
 * Declared locally rather than depending on `@types/geojson` so this module
 * stays dependency-free. Structurally compatible with `GeoJSON.Polygon`.
 */
export interface GeoJsonPolygon {
  readonly type: "Polygon";
  /** Array of linear rings; each ring is an array of `[lon, lat]` positions. */
  readonly coordinates: ReadonlyArray<ReadonlyArray<LonLat>>;
}

/** Minimal structural GeoJSON point. */
export interface GeoJsonPoint {
  readonly type: "Point";
  readonly coordinates: LonLat;
}

/** A GeoJSON feature carrying typed properties. */
export interface GeoJsonFeature<G, P> {
  readonly type: "Feature";
  readonly id?: string;
  readonly geometry: G;
  readonly properties: P;
}

/** A GeoJSON feature collection carrying typed properties. */
export interface GeoJsonFeatureCollection<G, P> {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<GeoJsonFeature<G, P>>;
}

/** Unsubscribe handle returned by every subscription in this domain. */
export type Unsubscribe = () => void;
