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
import { MAP_DEFAULTS, MAP_SCOPES, ZOOM_LIMITS, type MapScopeId } from "./constants";
import { layerRegistry, MISSION_PRESETS, type LayerRegistry } from "./layer-registry";
import { defaultEnabledSourceIds } from "./vessel-source";
import {
  OPERATING_MODES,
  decodeSelection,
  encodeSelection,
  modeForSelection,
  selectionFromLegacy,
  type MapSelection,
  type OperatingMode,
} from "./selection";
import { MAP_INTERACTION_MODES } from "./types";
import { EMPTY_FILTERS } from "./vessel-filter";
import type {
  LonLat,
  MapFilters,
  MapInteractionMode,
  MapState,
  Unsubscribe,
  ViewMode,
} from "./types";

/**
 * Default filter state — everything unfiltered.
 *
 * Re-exported from the filter module rather than restated, so a new
 * dimension cannot be added to the predicate and forgotten here, leaving
 * the map to start in a state the predicate does not recognise.
 */
export const DEFAULT_FILTERS: MapFilters = EMPTY_FILTERS;

/** Build the initial map state. */
export function createDefaultMapState(registry: LayerRegistry = layerRegistry): MapState {
  return {
    viewMode: "2D",
    operatingMode: "NATIONAL",
    // The current picture, as it is reporting. Every other interaction
    // mode is something the officer chooses to do to it.
    interactionMode: "LIVE",
    /*
     * Global by default.
     *
     * The opening *view* is unchanged — `center` and `zoom` below still
     * frame the Gulf of Guinea, which stays Seaphore's home
     * intelligence context. What changes is that it is no longer also a
     * boundary: an officer can now zoom out to Africa and pan to any
     * ocean without the camera refusing.
     *
     * The previous `regional` default did not merely restrict panning.
     * Its bounds were narrower than the viewport at zoom 5, so the
     * camera froze completely: measured on the running map, every pan
     * target returned the same coordinate, including a request to
     * return to Nigeria's own centre.
     */
    scope: "global",
    center: MAP_DEFAULTS.center,
    zoom: MAP_DEFAULTS.zoom,
    pitch: 0,
    bearing: 0,
    selection: null,
    selectedEntityId: null,
    selectedEntityImo: null,
    activeLayers: registry.defaultActiveLayers(),
    layerOpacity: {},
    enabledSources: defaultEnabledSourceIds(),
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

    /*
     * Hydrate from the URL here, not in a component effect.
     *
     * `update()` mirrors state into the address bar, and this service is
     * a module singleton constructed before React mounts. Any early
     * write — a camera echo, a layer toggle — therefore *overwrote* the
     * incoming query string before the effect that was supposed to read
     * it ever ran. A shared link's scope survived being pasted and then
     * vanished on the next reload, which is exactly how the regression
     * presented.
     *
     * Reading at construction closes that race for every parameter, not
     * just scope. `loadFromURL` is idempotent, so the existing effect
     * remains harmless.
     */
    if (this.urlSync && typeof window !== "undefined") {
      this.loadFromURL();
    }
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
  /**
   * Retired ids are resolved here rather than at each caller.
   *
   * Mission Modes, the map presets and a shared URL all name layer sets,
   * and several were written before two layers were renamed. Normalising
   * at the one place layer sets are written means none of those callers
   * has to be edited to keep working — which matters most for the
   * Mission Mode definitions, where the layer list is incidental to a
   * frozen surface.
   */
  setActiveLayers(layerIds: readonly string[]): void {
    const resolved = layerIds
      .map((id) => this.registry.resolveId(id))
      .filter((id) => this.registry.has(id));
    this.update({ activeLayers: [...new Set(resolved)] });
  }

  /** Turn one layer on or off. Unknown ids are ignored. */
  toggleLayer(layerId: string): void {
    const id = this.registry.resolveId(layerId);
    if (!this.registry.has(id)) return;
    const active = new Set(this.state.activeLayers);
    if (active.has(id)) active.delete(id);
    else active.add(id);
    this.setActiveLayers([...active]);
  }

  /** Turn an intelligence provider on or off by source id. */
  toggleSource(sourceId: string): void {
    const enabled = new Set(this.state.enabledSources);
    if (enabled.has(sourceId)) enabled.delete(sourceId);
    else enabled.add(sourceId);
    this.update({ enabledSources: [...enabled] });
  }

  /** Whether a provider is currently switched on. */
  isSourceEnabled(sourceId: string): boolean {
    return this.state.enabledSources.includes(sourceId);
  }

  /** Replace the enabled provider set outright. */
  setEnabledSources(sourceIds: readonly string[]): void {
    this.update({ enabledSources: [...new Set(sourceIds)] });
  }

  /**
   * Set a layer's opacity, 0-1. Passing `null` clears the override so the
   * layer returns to its own default.
   */
  setLayerOpacity(layerId: string, opacity: number | null): void {
    if (!this.registry.has(layerId)) return;
    const next = { ...this.state.layerOpacity };
    if (opacity === null) delete next[layerId];
    else next[layerId] = Math.min(1, Math.max(0, opacity));
    this.update({ layerOpacity: next });
  }

  /** Current opacity for a layer, or 1 when no override is set. */
  layerOpacity(layerId: string): number {
    return this.state.layerOpacity[layerId] ?? 1;
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

  /**
   * Set the current selection, across any selectable kind.
   *
   * The legacy `selectedEntityId`/`selectedEntityImo` fields are derived
   * here and nowhere else, so they cannot drift from `selection`. There
   * is one source of truth; those two are projections of it.
   *
   * Selecting an object that implies a mode also switches to it —
   * clicking a port *is* the officer asking for port mode, and making
   * them then change mode by hand would be asking twice. Kinds that
   * imply no mode leave the current one alone rather than forcing a
   * context change on the officer.
   */
  select(selection: MapSelection | null): void {
    const implied = modeForSelection(selection);
    this.update({
      selection,
      selectedEntityId: selection?.id ?? null,
      selectedEntityImo: selection?.kind === "vessel" ? (selection.imo ?? null) : null,
      ...(implied ? { operatingMode: implied } : {}),
    });
  }

  /**
   * Select an entity by id.
   *
   * @deprecated Vessel-only shim retained for un-migrated callers. Use
   * {@link select} with an explicit `MapSelection`.
   */
  selectEntity(entityId: string | null, imo: string | null = null): void {
    this.select(selectionFromLegacy(entityId, imo));
  }

  clearSelection(): void {
    this.select(null);
  }

  /**
   * Switch the intelligence context.
   *
   * Distinct from {@link switchView}, which changes 2D/3D rendering.
   */
  /**
   * How the officer is working the map.
   *
   * Separate from `setOperatingMode` and `switchView` on purpose: the
   * lens, the projection and the interaction are three independent
   * choices, and a setter that quietly moved another axis would make one
   * control answer for two.
   */
  setInteractionMode(interactionMode: MapInteractionMode): void {
    this.update({ interactionMode });
  }

  setOperatingMode(operatingMode: OperatingMode): void {
    this.update({ operatingMode });
  }

  /**
   * Change how far the camera may travel.
   *
   * Scope is a constructor argument to MapLibre, so the host remounts
   * the map when this changes. That is why it belongs here rather than
   * in a component: the remount must be driven by the same state a
   * shared link restores.
   */
  setScope(scope: MapScopeId): void {
    this.update({ scope });
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
    const opacityEntries = Object.entries(state.layerOpacity);
    if (opacityEntries.length > 0) {
      params.set("opacity", opacityEntries.map(([id, value]) => `${id}:${value}`).join(","));
    }
    /*
     * Pitch and bearing, only when the camera is not level.
     *
     * Omitted at zero so the ordinary link stays as short as it has
     * always been, and so a shared strategic view carries no camera
     * clutter. Both are needed: pitch because M2.6 makes it meaningful,
     * and bearing because `dragRotate` has always been enabled, so a
     * rotated map was already shareable in principle and silently was
     * not.
     */
    if (state.pitch !== 0) params.set("pitch", state.pitch.toFixed(1));
    if (state.bearing !== 0) params.set("bearing", state.bearing.toFixed(1));
    if (state.enabledSources.length > 0) params.set("sources", state.enabledSources.join(","));
    if (state.operatingMode !== "NATIONAL") params.set("mode", state.operatingMode);
    // `imode`, not `mode` — the two axes must not collide in one key.
    if (state.interactionMode !== "LIVE") params.set("imode", state.interactionMode);
    // Only when it differs from the default, so the common link stays short.
    if (state.scope !== "global") params.set("scope", state.scope);
    const encoded = encodeSelection(state.selection);
    if (encoded) params.set("sel", encoded);
    // `vessel` is retained so links shared before the selection model
    // landed still open on the right vessel.
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
      /*
       * Clamped to the absolute range across every scope, not to the
       * regional one.
       *
       * This state is shared and serialised into links, so it cannot
       * assume which surface will open it: a link captured on a global
       * map at zoom 2 must survive, and clamping it to the regional
       * minimum of 4 would silently rewrite where the sender was
       * looking. Each scope still enforces its own narrower range at
       * the renderer, which is the layer that can actually stop a
       * gesture.
       */
      patch.zoom = clamp(zoom, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
    }

    /*
     * Pitch and bearing.
     *
     * Clamped rather than rejected, so a link carrying a value from a
     * future scope — or a hand-edited one — opens on a usable camera
     * instead of being silently dropped. A non-numeric value *is*
     * dropped: there is no sensible reading of "pitch=north", and
     * leaving the default is the safe direction. Pitch tops out at
     * MapLibre's own 60, not the automatic policy's 50, because a
     * manually tilted camera is entitled to be steeper than the ramp.
     */
    const pitch = Number.parseFloat(params.get("pitch") ?? "");
    if (Number.isFinite(pitch)) patch.pitch = clamp(pitch, 0, 60);

    const bearing = Number.parseFloat(params.get("bearing") ?? "");
    if (Number.isFinite(bearing)) patch.bearing = ((bearing % 360) + 360) % 360;

    const layers = params.get("layers");
    if (layers !== null) {
      const known = [
        ...new Set(
          layers
            .split(",")
            .map((id) => id.trim())
            // A link saved before a layer was renamed still names the old
            // id. Resolving here rather than rejecting means the officer
            // gets the layer they shared, not a quietly shorter map.
            .map((id) => this.registry.resolveId(id))
            .filter((id) => id.length > 0 && this.registry.has(id)),
        ),
      ];
      // An explicit empty list is meaningful ("hide everything"); a list of
      // entirely unknown ids is not, and is ignored.
      if (known.length > 0 || layers.trim() === "") patch.activeLayers = known;
    }

    const opacity = params.get("opacity");
    if (opacity) {
      const parsed: Record<string, number> = {};
      for (const entry of opacity.split(",")) {
        const [id, raw] = entry.split(":");
        const value = Number.parseFloat(raw ?? "");
        if (id && this.registry.has(id) && Number.isFinite(value)) {
          parsed[id] = Math.min(1, Math.max(0, value));
        }
      }
      if (Object.keys(parsed).length > 0) patch.layerOpacity = parsed;
    }

    const sources = params.get("sources");
    if (sources !== null) {
      patch.enabledSources = sources
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }

    // `sel` is authoritative; `vessel` is the pre-selection-model form and
    // only applies when no `sel` was present, so a modern link never has
    // its selection overwritten by the legacy parameter.
    const selection = decodeSelection(params.get("sel"));
    if (selection) {
      patch.selection = selection;
      patch.selectedEntityId = selection.id;
      patch.selectedEntityImo = selection.kind === "vessel" ? (selection.imo ?? null) : null;
    } else {
      const vessel = params.get("vessel");
      if (vessel) {
        patch.selection = { kind: "vessel", id: vessel, imo: vessel };
        patch.selectedEntityId = vessel;
        patch.selectedEntityImo = vessel;
      }
    }

    const mode = params.get("mode");
    if (mode && (OPERATING_MODES as readonly string[]).includes(mode)) {
      patch.operatingMode = mode as OperatingMode;
    }

    /*
     * Validated against its own vocabulary, like every other restored
     * value. A URL is untrusted input even when it is only naming a
     * mode, and an unrecognised name leaves the axis at its default
     * rather than putting the map into a state that does not exist.
     */
    const interaction = params.get("imode");
    if (interaction && (MAP_INTERACTION_MODES as readonly string[]).includes(interaction)) {
      patch.interactionMode = interaction as MapInteractionMode;
    }

    // Unknown scope names are ignored rather than defaulted-to-regional:
    // a truncated link must not silently re-cage the map.
    const scope = params.get("scope");
    if (scope && scope in MAP_SCOPES) {
      patch.scope = scope as MapScopeId;
    }

    const mission = params.get("mission");
    if (mission) patch.missionId = mission;

    const view = params.get("view");
    if (view === "2D" || view === "3D" || view === "GLOBE") patch.viewMode = view;

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
    if (key === "enabledSources") {
      const listA = a as readonly string[];
      const listB = b as readonly string[];
      if (listA.length !== listB.length || listA.some((id, i) => id !== listB[i])) return true;
      continue;
    }
    if (key === "layerOpacity") {
      const mapA = a as Record<string, number>;
      const mapB = b as Record<string, number>;
      const keysA = Object.keys(mapA);
      const keysB = Object.keys(mapB);
      if (keysA.length !== keysB.length) return true;
      if (keysA.some((k) => mapA[k] !== mapB[k])) return true;
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
