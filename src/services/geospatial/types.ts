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
export type ViewMode = "2D" | "3D";

/** Risk bands recognised by the map. Mirrors the keys of `RISK_COLORS`. */
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "CLEAN";

/** Vessel classifications used for filtering. */
export type VesselType = "CONTAINER" | "TANKER" | "BULK" | "VEHICLE" | "OTHER";

/** Arrival windows offered by the filter panel. */
export type ArrivalWindow = "ALL" | "TODAY" | "24H" | "48H" | "WEEK";

/** Filter state applied to the operational picture. */
export interface MapFilters {
  readonly riskLevel: "ALL" | Exclude<RiskLevel, "UNKNOWN" | "CLEAN">;
  readonly vesselType: "ALL" | VesselType;
  readonly destination: "ALL" | string;
  readonly arrivalWindow: ArrivalWindow;
}

/**
 * The complete, serialisable state of the operational map.
 *
 * This is the single shared context every map surface reads from and writes
 * to via the Shared Geospatial Service. It is intentionally a plain data
 * object so it can be snapshotted, diffed, persisted to the URL, and
 * asserted against in tests.
 */
export interface MapState {
  readonly viewMode: ViewMode;
  readonly center: LonLat;
  readonly zoom: number;
  readonly pitch: number;
  readonly bearing: number;
  /** Canonical entity id of the current selection, if any. */
  readonly selectedEntityId: string | null;
  /** IMO of the selected vessel, when the selection is a vessel. */
  readonly selectedEntityImo: string | null;
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
