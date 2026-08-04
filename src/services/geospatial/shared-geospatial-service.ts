/**
 * GIP — Shared Geospatial Service (SGS).
 *
 * The single shared context for the operational map. Every surface — the map
 * canvas, the layer panel, the filter panel, the timeline, and later the
 * Operational Dock — reads state from here and writes changes back here.
 * No surface holds its own copy, which is what keeps the 2D view, the URL,
 * and every panel in agreement.
 *
 * Responsibilities:
 *   1. Hold the canonical {@link MapState}.
 *   2. Notify subscribers when it genuinely changes.
 *   3. Serialise to and from the URL so an officer can share a view.
 *
 * Explicit non-responsibilities: it does not fetch, score, rank, or render.
 * It is a state container with a URL adapter.
 *
 * Sprint G5.5.1 — infrastructure only.
 */
import { MAP_DEFAULTS } from "./constants";
import { layerRegistry, MISSION_PRESETS, type LayerRegistry } from "./layer-registry";
import type { LonLat, MapFilters, MapState, Unsubscribe, ViewMode } from "./types";

/** Default filter state — everything unfiltered. */
export const DEFAULT_FILTERS: MapFilters = {
  riskLevel: "ALL",
  vesselType: "ALL",
  destination: "ALL",
  arrivalWindow: "ALL",
};

/** Build the initial map state. */
export function createDefaultMapState(registry: LayerRegistry = layerRegistry): MapState {
  return {
    viewMode: "2D",
    center: MAP_DEFAULTS.center,
    zoom: MAP_DEFAULTS.zoom,
    pitch: 0,
    bearing: 0,
    selectedEntityId: null,
    selectedEntityImo: null,
    activeLayers: registry.defaultActiveLayers(),
    filters: DEFAULT_FILTERS,
    timelinePosition: null,
    timelinePlaying: false,
    investigationArea: null,
    missionId: null,
  };
}

/** Injection points. Every dependency is optional and replaceable in tests. */
export interface SharedGeospatialServiceOptions {
  readonly initialState?: Partial<MapState>;
  readonly registry?: LayerRegistry;
  /**
   * Whether to mirror state into `window.location`. Defaults to true in the
   * browser; always inert during SSR.
   */
  readonly urlSync?: boolean;
}

export class SharedGeospatialService {
  private state: MapState;
  private readonly subscribers = new Set<(state: MapState) => void>();
  private readonly registry: LayerRegistry;
  private readonly urlSync: boolean;

  constructor(options: SharedGeospatialServiceOptions = {}) {
    this.registry = options.registry ?? layerRegistry;
    this.urlSync = options.urlSync ?? true;
    this.state = { ...createDefaultMapState(this.registry), ...options.initialState };
  }

  /** Current state. Returned by value so callers cannot mutate the interior. */
  get(): MapState {
    return this.state;
  }

  /**
   * Apply a partial update.
   *
   * No-op updates are dropped before notifying: a `moveend` that reports the
   * same centre must not wake every subscriber, or panning becomes a render
   * storm. Comparison is shallow, with structural checks for the two
   * composite fields.
   */
  update(patch: Partial<MapState>): void {
    const next: MapState = { ...this.state, ...patch };
    if (!hasChanged(this.state, next)) return;
    this.state = next;
    this.notify();
    this.syncToURL();
  }

  /**
   * Subscribe to state changes. The handler is invoked immediately with
   * current state so subscribers never render an empty first frame.
   * Returns an idempotent unsubscribe handle.
   */
  subscribe(handler: (state: MapState) => void): Unsubscribe {
    this.subscribers.add(handler);
    handler(this.state);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /** Switch between the Operational View (2D) and Terrain Perspective (3D). */
  switchView(viewMode: ViewMode): void {
    this.update({ viewMode });
  }

  /** Replace the active layer set, ignoring ids the registry does not know. */
  setActiveLayers(layerIds: readonly string[]): void {
    this.update({ activeLayers: layerIds.filter((id) => this.registry.has(id)) });
  }

  /** Turn one layer on or off. Unknown ids are ignored. */
  toggleLayer(layerId: string): void {
    if (!this.registry.has(layerId)) return;
    const active = new Set(this.state.activeLayers);
    if (active.has(layerId)) active.delete(layerId);
    else active.add(layerId);
    this.setActiveLayers([...active]);
  }

  /** Whether a layer is currently switched on. */
  isLayerActive(layerId: string): boolean {
    return this.state.activeLayers.includes(layerId);
  }

  /**
   * Apply a mission preset's layer bundle. Returns false for an unknown
   * preset so callers can surface the mistake rather than silently no-op.
   */
  applyPreset(presetId: string): boolean {
    const preset = MISSION_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return false;
    this.setActiveLayers(preset.layers);
    return true;
  }

  /** Select an entity. Pass `imo` when the entity is a vessel. */
  selectEntity(entityId: string | null, imo: string | null = null): void {
    this.update({ selectedEntityId: entityId, selectedEntityImo: imo });
  }

  clearSelection(): void {
    this.selectEntity(null, null);
  }

  /** Merge a partial filter change. */
  setFilters(patch: Partial<MapFilters>): void {
    this.update({ filters: { ...this.state.filters, ...patch } });
  }

  /** Move the camera. */
  setCamera(camera: { center?: LonLat; zoom?: number; pitch?: number; bearing?: number }): void {
    this.update(camera);
  }

  /** Restore defaults, keeping subscribers attached. */
  reset(): void {
    this.update(createDefaultMapState(this.registry));
  }

  /** Serialise the shareable subset of state to query parameters. */
  toSearchParams(): URLSearchParams {
    const state = this.state;
    const params = new URLSearchParams({
      view: state.viewMode,
      lat: state.center[1].toFixed(4),
      lon: state.center[0].toFixed(4),
      zoom: state.zoom.toFixed(1),
      layers: state.activeLayers.join(","),
    });
    if (state.selectedEntityImo) params.set("vessel", state.selectedEntityImo);
    if (state.missionId) params.set("mission", state.missionId);
    return params;
  }

  /**
   * Hydrate from query parameters.
   *
   * Every field is validated and silently skipped when malformed — a
   * hand-edited or truncated shared link must degrade to a usable map, never
   * throw. Accepts an explicit search string so it can be exercised in tests
   * and during SSR.
   */
  loadFromURL(search?: string): void {
    const raw = search ?? (typeof window === "undefined" ? "" : window.location.search);
    if (!raw) return;
    const params = new URLSearchParams(raw);
    // `MapState` is deeply readonly for consumers; the patch is assembled
    // locally before being handed to `update`, so strip readonly here only.
    const patch: { -readonly [K in keyof MapState]?: MapState[K] } = {};

    const lat = Number.parseFloat(params.get("lat") ?? "");
    const lon = Number.parseFloat(params.get("lon") ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lon) && isValidLonLat(lon, lat)) {
      patch.center = [lon, lat];
    }

    const zoom = Number.parseFloat(params.get("zoom") ?? "");
    if (Number.isFinite(zoom)) {
      patch.zoom = clamp(zoom, MAP_DEFAULTS.minZoom, MAP_DEFAULTS.maxZoom);
    }

    const layers = params.get("layers");
    if (layers !== null) {
      const known = layers
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && this.registry.has(id));
      // An explicit empty list is meaningful ("hide everything"); a list of
      // entirely unknown ids is not, and is ignored.
      if (known.length > 0 || layers.trim() === "") patch.activeLayers = known;
    }

    const vessel = params.get("vessel");
    if (vessel) patch.selectedEntityImo = vessel;

    const mission = params.get("mission");
    if (mission) patch.missionId = mission;

    const view = params.get("view");
    if (view === "2D" || view === "3D") patch.viewMode = view;

    if (Object.keys(patch).length > 0) this.update(patch);
  }

  /** Current subscriber count. Exposed for leak assertions in tests. */
  subscriberCount(): number {
    return this.subscribers.size;
  }

  private notify(): void {
    // Snapshot so a subscriber that unsubscribes during notification does not
    // disturb the batch in flight.
    for (const handler of [...this.subscribers]) handler(this.state);
  }

  private syncToURL(): void {
    if (!this.urlSync || typeof window === "undefined") return;
    if (typeof window.history?.replaceState !== "function") return;
    // Preserve the current pathname — the map may be mounted under a route
    // other than /maritime (embedded panels, future workspaces).
    const { pathname } = window.location;
    window.history.replaceState(null, "", `${pathname}?${this.toSearchParams().toString()}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isValidLonLat(lon: number, lat: number): boolean {
  return lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

/** Shallow equality with structural checks for the composite fields. */
function hasChanged(previous: MapState, next: MapState): boolean {
  if (previous === next) return false;
  const keys = Object.keys(next) as Array<keyof MapState>;
  for (const key of keys) {
    const a = previous[key];
    const b = next[key];
    if (a === b) continue;
    if (key === "center") {
      const [aLon, aLat] = a as LonLat;
      const [bLon, bLat] = b as LonLat;
      if (aLon !== bLon || aLat !== bLat) return true;
      continue;
    }
    if (key === "activeLayers") {
      const listA = a as readonly string[];
      const listB = b as readonly string[];
      if (listA.length !== listB.length || listA.some((id, i) => id !== listB[i])) return true;
      continue;
    }
    if (key === "filters") {
      const filtersA = a as MapFilters;
      const filtersB = b as MapFilters;
      if (
        filtersA.riskLevel !== filtersB.riskLevel ||
        filtersA.vesselType !== filtersB.vesselType ||
        filtersA.destination !== filtersB.destination ||
        filtersA.arrivalWindow !== filtersB.arrivalWindow
      ) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Process-wide SGS instance used by the operational map.
 * Construct a dedicated {@link SharedGeospatialService} in tests.
 */
export const sgs = new SharedGeospatialService();
