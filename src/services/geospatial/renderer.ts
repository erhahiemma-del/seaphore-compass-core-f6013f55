/**
 * GIP — Map renderer contract.
 *
 * The seam between the geospatial domain and whatever draws the picture.
 * Everything above this interface — SGS, the layer registry, the update
 * engine, the layer panel — is engine-agnostic and fully testable without a
 * canvas, a WebGL context, or a map library.
 *
 * Sprint G5.5.1 ships this contract plus a stub adapter. Adding
 * `maplibre-gl` later means implementing {@link MapRenderer} in a new
 * adapter and injecting it; no consumer of this interface changes.
 *
 * Contract rules for implementors:
 *   - `mount` is the only async operation; everything else is synchronous
 *     and must be safe to call before `mount` resolves (queue or no-op).
 *   - User interaction is reported on the {@link MapEventBus}, never via
 *     callbacks passed into these methods.
 *   - `destroy` must release the GL context and all listeners; a destroyed
 *     renderer is not reusable.
 */
import type { MapEventBus } from "./event-bus";
import type { BoundingBox, GeoJsonFeatureCollection, GeoJsonPoint, LonLat } from "./types";
import type { VesselFeature, VesselFeatureProperties } from "./vessel";

/** Camera pose. */
export interface MapCamera {
  readonly center: LonLat;
  readonly zoom: number;
  readonly pitch: number;
  readonly bearing: number;
}

/** Everything a renderer needs to attach itself to the DOM. */
/**
 * Map chrome the renderer attaches.
 *
 * Presentation only — every field here changes what the officer sees, not
 * what the map knows. A surface that hides the scale bar is still reading
 * the same state from the same service.
 *
 * Attribution is deliberately absent: CARTO and OpenStreetMap require it,
 * so it is not something a caller may switch off.
 */
export interface MapControlOptions {
  /** Zoom buttons. Default true. */
  readonly navigation?: boolean;
  /** Compass/bearing reset within the navigation control. Default true. */
  readonly compass?: boolean;
  /** Nautical scale bar. Default true. */
  readonly scale?: boolean;
}

export interface MapRendererMountOptions {
  /** Element the map attaches to. Must be laid out before mounting. */
  readonly container: HTMLElement;
  /** Basemap style URL. */
  readonly style: string;
  readonly center: LonLat;
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly maxBounds: BoundingBox;
  /**
   * Chrome to attach. Absent means the full command set, so existing
   * callers keep their current appearance without change.
   */
  readonly controls?: MapControlOptions;
}

/** A collection of vessel point features, ready to hand to the engine. */
export type VesselFeatureCollection = GeoJsonFeatureCollection<
  GeoJsonPoint,
  VesselFeatureProperties
>;

/**
 * A map rendering engine.
 *
 * Implemented by the MapLibre adapter (2D Operational View) and, from G7, a
 * Cesium adapter (3D Terrain Perspective).
 */
export interface MapRenderer {
  /** Stable adapter identifier, e.g. `"maplibre"`, `"stub"`. */
  readonly id: string;

  /** Attach to the DOM and load the basemap. Resolves once drawable. */
  mount(options: MapRendererMountOptions): Promise<void>;

  /** Tear down. Safe to call when not mounted; not reusable afterwards. */
  destroy(): void;

  /** Whether the engine has finished mounting. */
  isReady(): boolean;

  /** Move the camera. Partial poses leave the other axes untouched. */
  setCamera(camera: Partial<MapCamera>): void;

  /** Current camera pose, or null before mount. */
  getCamera(): MapCamera | null;

  /**
   * Show or hide one render-engine layer. Ids come from the Layer Registry's
   * `resolveVisibility`, never from a component.
   */
  setLayerVisibility(renderLayerId: string, visible: boolean): void;

  /** Replace the entire vessel source. Used for the periodic full refresh. */
  setVesselData(collection: VesselFeatureCollection): void;

  /**
   * Apply an incremental batch without replacing the whole source.
   *
   * This is what keeps a live map from re-rendering thousands of features
   * because one AIS report arrived. Implementations that cannot patch
   * in place may fall back to `setVesselData`, but must not drop updates.
   */
  patchVessels(batch: VesselRenderBatch): void;

  /** Register vessel sprite variants (risk colours, selected, stale). */
  loadVesselIcons(): Promise<void>;

  /**
   * Set a render layer's opacity, 0–1.
   *
   * Optional and additive (G5.5.2): the G5.5.1 contract is unchanged, so
   * adapters written against it remain valid. Callers must feature-detect.
   */
  setLayerOpacity?(renderLayerId: string, opacity: number): void;

  /** Animate the camera to fit a bounding box. Optional (G5.5.2). */
  fitBounds?(bounds: BoundingBox, options?: { padding?: number; duration?: number }): void;

  /** Animate the camera to a position. Optional (G5.5.2). */
  flyTo?(center: LonLat, zoom?: number): void;

  /**
   * Currently visible bounds, for deciding whether a target is already on
   * screen. Optional like the other camera helpers: a renderer that
   * cannot report bounds simply causes the camera policy to fall back on
   * moving, which is the safe direction.
   */
  getVisibleBounds?(): BoundingBox | null;

  /**
   * Frames rendered per second, sampled by the adapter. `null` when the
   * adapter does not measure. Optional (G5.5.2).
   */
  getFps?(): number | null;
}

/** An incremental change set handed to the renderer. */
export interface VesselRenderBatch {
  readonly added: readonly VesselFeature[];
  readonly updated: readonly VesselFeature[];
  /** IMOs to drop. */
  readonly removed: readonly string[];
}

/** Shared construction options for adapters. */
export interface MapRendererDependencies {
  /** Bus interaction and lifecycle events are published on. */
  readonly bus: MapEventBus;
}
