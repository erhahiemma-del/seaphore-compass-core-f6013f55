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
import type { ViewMode } from "./types";
import type { MapEventBus } from "./event-bus";
import type { MapStylePaletteName } from "./constants";
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

import type { FacilityFeatureCollection } from "@/services/registry/facility-features";

export interface MapRendererMountOptions {
  /** Element the map attaches to. Must be laid out before mounting. */
  readonly container: HTMLElement;
  /** Basemap style URL. */
  readonly style: string;
  /** Presentation palette applied to the basemap after it loads. */
  readonly palette?: MapStylePaletteName;
  readonly center: LonLat;
  readonly zoom: number;
  /**
   * Initial camera tilt and rotation, in degrees.
   *
   * Part of the mount for the same reason `center` and `zoom` are: it is
   * the pose the map opens at, and there is no later moment at which it
   * can be applied. The camera-follow subscription cannot do it — it
   * runs before `mount()` resolves, finds the renderer not ready, and
   * returns; nothing writes again until the state next changes. A link
   * carrying a tilted camera therefore opened flat until these existed.
   *
   * Optional, so every pre-M2.6 caller keeps the level camera it always
   * had.
   */
  readonly pitch?: number;
  readonly bearing?: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Panning limit, or `null`/absent for unrestricted. */
  readonly maxBounds: BoundingBox | null;
  /**
   * Area the graticule is generated over.
   *
   * Distinct from `maxBounds`, which may be null. Absent falls back to
   * `maxBounds`, which is what every pre-M2 caller relies on.
   */
  readonly extent?: BoundingBox;
  /**
   * Chrome to attach. Absent means the full command set, so existing
   * callers keep their current appearance without change.
   */
  readonly controls?: MapControlOptions;
  /**
   * Graticule intervals for this extent, coarsest first.
   *
   * Scope-dependent: one-degree lines are useful across Nigerian waters
   * and unreadable across a hemisphere. Absent keeps the regional set.
   */
  readonly graticuleSteps?: readonly number[];
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

  /**
   * Switch how the world is projected.
   *
   * `GLOBE` is a projection on the same map instance, not a second map.
   * Everything the officer has established — camera, selection, layers,
   * filters, focus — is state this renderer never owned, so none of it
   * is touched by the switch.
   *
   * A renderer with no projection support implements this as a no-op
   * rather than throwing: the officer's choice is recorded in `MapState`
   * either way, and a stub that refused would make the control appear
   * broken rather than unsupported.
   */
  setProjection(view: ViewMode): void;
  /**
   * Repaint the map in a different presentation mode.
   *
   * Swaps the basemap style document on the mounted instance and
   * reinstalls the operational layers over it. Not a remount: the map,
   * its camera, its selection and the shared state all survive, because
   * a lighting choice must not cost the officer their place.
   */
  setPresentation(palette: MapStylePaletteName): void;

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
   * Replace the maritime infrastructure drawn from the facility registry.
   *
   * Optional because the registry loads lazily and a renderer built
   * before it arrives is still a valid renderer — the stub implementation
   * has nothing to draw on. Callers must tolerate its absence rather than
   * assume a facility layer exists.
   */
  setFacilityData?(collection: FacilityFeatureCollection): void;

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
   * Replace the voyage overlay: resolved endpoints.
   *
   * Endpoints only. Nothing connects an origin to a destination,
   * because the passage between them is not known — see
   * `voyage-render.ts`.
   *
   * Optional and additive, like `setLayerOpacity` — the G5.5.1 contract
   * is unchanged and adapters written against it stay valid. Callers
   * feature-detect.
   *
   * Typed as `unknown` at this seam on purpose. The voyage collections
   * live in `voyage-render.ts`, which imports the domain model; naming
   * them here would pull the voyage domain into the engine contract,
   * and the renderer's job is to draw GeoJSON, not to know what a
   * voyage is.
   */
  setVoyageData?(endpoints: unknown): void;

  /**
   * Replace the intelligence-finding indicator overlay.
   *
   * A full replacement of an independent source. Findings change when an
   * officer decides something, not many times a second, so the
   * incremental vessel path is not the right shape here — and reusing the
   * vessel source would put officer work inside the fleet's identity.
   */
  setFindingIndicators?(features: unknown): void;

  /**
   * Replace the port Digital Twin infrastructure overlay.
   *
   * Optional and additive (Phase 4B), like every other seam here. The
   * collection arrives already decided: which twin is open, and which of
   * its layers the officer has switched on, are domain questions answered
   * in `port-twin.ts`. A renderer with no twin support simply omits the
   * method and the officer keeps the flat operational map.
   *
   * Typed as `unknown` for the same reason as the voyage seam — naming the
   * collection would pull the port domain into the engine contract.
   */
  setPortInfrastructure?(features: unknown): void;

  /**
   * Mark one port as selected, or clear the selection with `null`.
   *
   * Optional and additive (M2.5), like everything else at this seam.
   * Keyed by UN/LOCODE because that is the port's stable identity
   * across the reference collection, the gazetteer and the voyage
   * records — a database row id would only be recognised by one of them.
   *
   * Separate from a click handler on purpose: a selection restored from
   * a shared URL never involved a click, and must light the same ring
   * as one that did.
   */
  setSelectedPort?(locode: string | null): void;

  /**
   * Hand pitch back to the automatic perspective policy.
   *
   * Optional and additive (M2.6). Derives the target from the current
   * zoom and preserves centre, zoom and bearing — see `perspective.ts`.
   * A renderer with no perspective model simply omits it.
   */
  resetPerspective?(): void;

  /** Which owner currently decides pitch. Optional (M2.6). */
  getPitchOwner?(): "automatic" | "manual";

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
   * Project a geographic position to container pixels, for anchoring DOM
   * overlays (contextual popups) to map features. Optional: a renderer
   * that cannot project causes callers to fall back to a fixed corner.
   */
  project?(position: LonLat): { readonly x: number; readonly y: number } | null;

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
