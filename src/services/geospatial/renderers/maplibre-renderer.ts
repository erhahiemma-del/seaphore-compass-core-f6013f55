/**
 * GIP — MapLibre GL renderer (2D Operational View).
 *
 * The production rendering engine for the Maritime Common Operating Picture.
 * Implements the {@link MapRenderer} contract defined in Sprint G5.5.1 without
 * altering it, so every consumer above the seam — SGS, the layer registry, the
 * update engine, the panels — is unchanged by this sprint.
 *
 * ## Incremental rendering
 *
 * MapLibre 6 exposes `GeoJSONSource.updateData(diff)`, which applies per-feature
 * add/update/remove without re-parsing the collection. {@link patchVessels} maps
 * the update engine's diff straight onto it, so one moving vessel costs one
 * feature update — not a rebuild of the layer. This requires stable feature
 * ids, which the vessel model already provides (`id: imo`).
 *
 * `setVesselData` (full replacement) is reserved for the initial load and for
 * presentation-wide changes such as a new selection. Both paths are counted so
 * tests can assert the incremental path is actually being taken.
 *
 * ## Interaction
 *
 * All user interaction is published on the {@link MapEventBus}. This class
 * never calls into React, SGS, or any consumer directly.
 *
 * ## SSR
 *
 * `maplibre-gl` touches `window` at import time, so it is loaded through a
 * dynamic `import()` inside {@link mount} — never at module scope. This file is
 * therefore safe to import from server-rendered code.
 */
import {
  BASEMAP_STYLE,
  LAYER_IDS,
  SEA_LABELS,
  paletteFor,
  type MaritimePalette,
  PIXELS_PER_KM,
  RISK_COLORS,
  TIMING,
  ZOOM_BANDS,
} from "../constants";
import {
  CONFIDENCE_RING_STYLES,
  CONFIDENCE_TIERS,
  INTELLIGENCE_BADGE_OFFSETS,
  INTELLIGENCE_COLORS,
  INTERACTION_COLORS,
  type ConfidenceTier,
  type IntelligenceSignal,
} from "../entity-visual";
import { FRESHNESS_COLORS, FRESHNESS_LABELS, formatAge } from "../freshness";
import type { MapEventBus } from "../event-bus";
import { buildVesselSprites, createPortDiamondImage } from "../icons/vessel-arrow";
import { buildSymbolSprites, symbolSpriteId } from "../icons/symbol-sprites";
import { MAP_SYMBOLS } from "@/lib/map-symbols";
import { anchorageFeatureCollection, portFeatureCollection } from "../asset-features";
// Type-only: erased at build, so it adds nothing to the SSR graph.
type GeoJsonFeatureCollection = import("geojson").FeatureCollection;
import {
  applyMaritimeStyle,
  COASTLINE_LAYER_ID,
  type MaritimeStyleResult,
  type StyleTarget,
} from "../map-style";
import { graticuleFeatures, graticuleOpacityExpression } from "../graticule";
import {
  isManualPitchGesture,
  planPerspective,
  planPerspectiveReset,
  type PitchOwner,
} from "../perspective";
import type {
  MapCamera,
  MapRenderer,
  MapRendererDependencies,
  MapRendererMountOptions,
  VesselFeatureCollection,
  VesselRenderBatch,
} from "../renderer";
import type { BoundingBox, LonLat, ViewMode } from "../types";
import type { VesselFeature } from "../vessel";

/**
 * A `match` over the confidence tier carried by a feature.
 *
 * Generated from `CONFIDENCE_RING_STYLES` rather than written out, so a
 * tier cannot be added to the ladder and silently omitted from the map.
 * The fallback is the `unconfirmed` value: a feature whose tier string
 * is unrecognised is not evidenced, and drawing it as verified would be
 * the worst available failure.
 */
function confidenceMatch(
  pick: (style: (typeof CONFIDENCE_RING_STYLES)[ConfidenceTier]) => unknown,
) {
  return [
    "match",
    ["get", "confidenceTier"],
    ...CONFIDENCE_TIERS.flatMap((tier) => [tier, pick(CONFIDENCE_RING_STYLES[tier])]),
    pick(CONFIDENCE_RING_STYLES.unconfirmed),
    // Cast at the boundary, as every other generated expression in this
    // file does: MapLibre's paint types cannot express a `match` built
    // from a runtime-enumerated list, and widening the helper's input
    // types to satisfy them would lose the exhaustiveness that makes
    // this construction worth having.
  ] as never;
}

/** The signals an intelligence badge can carry, in badge-stacking order. */
const INTELLIGENCE_SIGNALS: readonly IntelligenceSignal[] = [
  "investigation",
  "risk",
  "alert",
] as const;

/**
 * A `match` over the intelligence signal carried by a feature.
 *
 * Same construction as {@link confidenceMatch}: enumerated from the
 * signal union so a new signal cannot be added without the map gaining a
 * branch for it. The fallback is `investigation`'s value and is
 * unreachable in practice — the layer is filtered to features that carry
 * a recognised signal — but MapLibre requires a `match` to be total.
 */
function intelligenceMatch(pick: (signal: IntelligenceSignal) => unknown) {
  return [
    "match",
    ["get", "intelligenceSignal"],
    ...INTELLIGENCE_SIGNALS.flatMap((signal) => [signal, pick(signal)]),
    pick("investigation"),
  ] as never;
}

/** Source ids owned by this renderer. */
const SOURCE_IDS = {
  vessels: "vessels",
  ports: "ports",
  anchorages: "anchorages",
  incidentReports: "incident-reports",
  weatherAlerts: "weather-alerts",
  eez: "nigeria-eez",
  graticule: "graticule",
  seaLabels: "sea-labels",
  voyageEndpoints: "voyage-endpoints",
  investigationArea: "investigation-area",
} as const;

/**
 * Source id of the basemap's own vector tiles, per its style document.
 *
 * The building extrusion reads from this rather than from a source of
 * our own: the geometry and its heights are already in the tiles the map
 * is downloading anyway, so 3D buildings cost no new dependency, no new
 * licence, and no additional request.
 */
const BASEMAP_SOURCE_ID = "carto";

/**
 * Zoom at which the basemap first carries building geometry.
 *
 * Measured, not assumed: querying the live source at Lagos returns 0
 * features at zooms 10–12, 4 at zoom 13, and 183 at zoom 14. Below 13
 * the layer would render nothing whatever it was told to do.
 */
const BUILDING_MINZOOM = 13;

/**
 * Duration of a perspective pitch ease, in milliseconds.
 *
 * Long enough to read as a deliberate settling rather than a snap, short
 * enough that it has finished before the officer's next gesture. It runs
 * after the camera has stopped, so it never competes with a movement in
 * progress.
 */
const PERSPECTIVE_EASE_MS = 280;

/** Static asset paths. */
const ASSETS = {
  eez: "/geojson/nigeria-eez.geojson",
} as const;

/** Fallback basemap when the primary style fails to load. */
const FALLBACK_BASEMAP = "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";

/**
 * Every render layer {@link MapLibreRenderer.installSourcesAndLayers}
 * adds, in install order.
 *
 * Exported because the layer registry's promise — that a layer marked
 * `ready` actually draws — is only checkable against this list. The
 * registry is asserted against it in the unit tests, and the renderer
 * checks itself against it at runtime; see `verifyInstalledLayers`.
 */
/**
 * How long a style may take before the mount says it is stuck.
 *
 * Long enough that a slow connection on a cold cache is not accused of
 * failing; short enough that nobody stares at an empty canvas wondering
 * whether the data is simply sparse.
 */
const STYLE_LOAD_STALL_MS = 12_000;

export const INSTALLED_RENDER_LAYERS: readonly string[] = [
  LAYER_IDS.buildings,
  LAYER_IDS.graticule,
  LAYER_IDS.seaLabels,
  LAYER_IDS.voyageEndpoints,
  LAYER_IDS.voyageEndpointLabels,
  LAYER_IDS.eezFill,
  LAYER_IDS.eezBoundary,
  LAYER_IDS.portAnchorage,
  LAYER_IDS.portAnchorageSymbol,
  LAYER_IDS.anchorageExtent,
  LAYER_IDS.anchorages,
  LAYER_IDS.anchorageLabels,
  LAYER_IDS.portHalo,
  LAYER_IDS.portSelection,
  LAYER_IDS.ports,
  LAYER_IDS.portLabels,
  LAYER_IDS.riskHeatmap,
  LAYER_IDS.vesselConfidence,
  LAYER_IDS.vesselSelection,
  LAYER_IDS.vessels,
  LAYER_IDS.vesselIntelligence,
  LAYER_IDS.vesselLabels,
  LAYER_IDS.incidentReports,
  LAYER_IDS.weatherOverlay,
  LAYER_IDS.investigArea,
] as const;

/** Bounding box framing Nigeria and its maritime approaches. */
export const NIGERIA_BOUNDS: BoundingBox = [
  [2.2, 1.5],
  [9.2, 7.2],
] as const;

/** True once this adapter draws with a real engine. */
export const MAPLIBRE_AVAILABLE = true;

/**
 * Development-only record of what the basemap restyling actually did.
 *
 * `applyMaritimeStyle` is pure and unit-tested, but whether it is
 * correctly *wired* — and whether CARTO still ships the layers it looks
 * for — is a runtime question, and the map instance is deliberately not
 * reachable from the page. This publishes the outcome, never the map,
 * so a browser check can confirm the ocean really is the colour we
 * chose rather than inferring it from a screenshot.
 *
 * The same pattern and the same reasoning as `recordCameraDecision` in
 * `MapCanvas`. `import.meta.env.DEV` compiles it out of production
 * entirely, so nothing here widens the production surface.
 */
function publishStyleDiagnostics(map: MapLibreMap, result: MaritimeStyleResult): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  try {
    const read = (layerId: string, property: string) =>
      map.getLayer(layerId) ? map.getPaintProperty(layerId, property as never) : null;
    (window as typeof window & { __seaphoreMapStyle?: unknown }).__seaphoreMapStyle = {
      ...result,
      ocean: read("water", "fill-color"),
      land: read("background", "background-color"),
      coastlinePresent: Boolean(map.getLayer(COASTLINE_LAYER_ID)),
      installed: Object.values(LAYER_IDS).filter((id) => Boolean(map.getLayer(id))),
      at: Date.now(),
    };
  } catch {
    // Diagnostics must never affect the mount.
  }
}

// Type-only imports are fully erased by TypeScript and never resolved at
// runtime, so they are safe here. The *value* import stays dynamic, inside
// `mount`, because maplibre-gl touches `window` at module scope.
type MapLibreMap = import("maplibre-gl").Map;
type MapLibrePopup = import("maplibre-gl").Popup;
type MapLibreGeoJSONSource = import("maplibre-gl").GeoJSONSource;
type MapLibreLayerMouseEvent = import("maplibre-gl").MapLayerMouseEvent;
type MapLibreMouseEvent = import("maplibre-gl").MapMouseEvent;

export class MapLibreRenderer implements MapRenderer {
  readonly id = "maplibre";

  private map: MapLibreMap | null = null;
  private popup: MapLibrePopup | null = null;
  private readonly bus: MapEventBus | null;

  private ready = false;
  private destroyed = false;
  private styleFailed = false;
  /**
   * Identifies the current mount attempt.
   *
   * Bumped by every `mount()` and by `destroy()`, so an in-flight mount
   * can tell whether it still owns the renderer after each await.
   */
  private mountToken = 0;

  /** Authoritative feature set, mirrored so full rebuilds stay cheap. */
  private readonly features = new Map<string, VesselFeature>();

  /** Extent and graticule intervals this mount was given. */
  private mountBounds: BoundingBox | null = null;
  private graticuleSteps: readonly number[] | null = null;

  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hoveredImo: string | null = null;
  /** LOCODE of the port under the cursor, or null. */
  private hoveredPortId: string | null = null;
  /** LOCODE of the selected port, or null. */
  private selectedPortId: string | null = null;

  /* ── Adaptive perspective ─────────────────────────────────────── */

  /**
   * Who currently decides pitch.
   *
   * Latches to `manual` on a genuine tilt gesture and stays there until
   * {@link resetPerspective}. See `perspective.ts` for why the latch is
   * one-way.
   */
  private pitchOwner: PitchOwner = "automatic";
  /**
   * True while this class is driving the camera itself.
   *
   * Read by two places that must not mistake our own easing for the
   * officer's hand: the manual-gesture test, and the `moveend` handler,
   * which would otherwise re-enter on the very move it just issued.
   */
  private selfIssuedCameraMove = false;
  /** Detaches the bus subscription for `perspective:reset`. */
  private offPerspectiveReset: (() => void) | undefined;

  /** Instrumentation — asserted in tests, surfaced in the status panel. */
  private fullReplacements = 0;
  private incrementalBatches = 0;
  private frameTimes: number[] = [];
  private lastFrameAt = 0;

  constructor(dependencies?: Partial<MapRendererDependencies>) {
    this.bus = dependencies?.bus ?? null;
  }

  /** True when a real engine is attached. Consumed by the UI empty state. */
  get isRealEngine(): boolean {
    return MAPLIBRE_AVAILABLE;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async mount(options: MapRendererMountOptions): Promise<void> {
    if (this.map) return;

    /*
     * A destroyed renderer may be mounted again.
     *
     * It previously threw here, which made `destroy()` a one-way door —
     * and the host holds this instance in a `useMemo`, so React's
     * mount → cleanup → mount cycle called `mount()` on the corpse it had
     * just buried. The throw left a live canvas with no map behind it:
     * a black rectangle, no tile requests, and a basemap that looked
     * broken while being perfectly healthy.
     *
     * Reviving is safe because `destroy()` already returns this object to
     * its constructed state — map, popup and timers released, features
     * cleared — and the flag guarded nothing else. Everything below
     * rebuilds from scratch.
     */
    this.destroyed = false;
    this.styleFailed = false;
    this.mountBounds = options.extent ?? options.maxBounds;
    this.graticuleSteps = options.graticuleSteps ?? null;
    const token = ++this.mountToken;

    // Dynamic import keeps `window` access out of the SSR path.
    const maplibre = await import("maplibre-gl");

    /*
     * Bail before building anything if this mount was already superseded.
     *
     * Two mounts can be waiting on this import at once — React remounts
     * the canvas, and both calls resume in whatever order the module
     * graph settles. Without this check the stale call goes on to
     * construct a second map and then assign it over `this.map`, so the
     * renderer's idea of "the map" becomes whichever mount resumed last
     * rather than whichever one is live.
     */
    if (token !== this.mountToken) return;

    const map = new maplibre.Map({
      container: options.container,
      style: options.style || BASEMAP_STYLE,
      center: [options.center[0], options.center[1]],
      zoom: options.zoom,
      // Restores a shared or reloaded camera pose. Absent means level,
      // which is what every caller predating M2.6 expects.
      ...(options.pitch !== undefined ? { pitch: options.pitch } : {}),
      ...(options.bearing !== undefined ? { bearing: options.bearing } : {}),
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
      // Null means unrestricted. See `MAP_SCOPES.global` for why a
      // world-spanning constraint is not the same thing.
      ...(options.maxBounds
        ? {
            maxBounds: [
              [options.maxBounds[0][0], options.maxBounds[0][1]],
              [options.maxBounds[1][0], options.maxBounds[1][1]],
            ] as [[number, number], [number, number]],
          }
        : {}),
      attributionControl: false,
      /*
       * Tilt is reachable by hand on the desktop, not only on touch.
       *
       * This was `false`, with a note reserving pitch for a future
       * terrain perspective. M2.6 supersedes that: pitch is now a
       * first-class part of the operational picture, and the officer
       * must be able to take it over from the automatic ramp — which is
       * what latches the policy and reveals the reset control.
       *
       * Without this the latch was only reachable on a touch device
       * (`touchPitch` has always defaulted on), so a desktop officer
       * could be tilted automatically but never overrule it. A control
       * the map applies and the user cannot answer is the fight
       * `perspective.ts` exists to prevent.
       */
      pitchWithRotate: true,
      // Officers read a map, and rotating it is theirs to choose. The
      // automatic perspective policy never writes bearing.
      dragRotate: true,
      fadeDuration: 0,
    });

    /*
     * Claim the instance only while this mount is still the live one.
     *
     * This assignment used to be unconditional, which is how the map
     * intermittently came up with the basemap styled and no operational
     * layers on it: a superseded mount would overwrite `this.map` with
     * its own doomed map, the live mount would then style its own local
     * map correctly, and `installSourcesAndLayers` — which read
     * `this.map` — would install every source and layer onto the wrong
     * instance. The officer saw a styled sea with no ports, no vessels,
     * no EEZ and no graticule, and nothing logged, because from each
     * call's own point of view it had succeeded.
     */
    if (token !== this.mountToken) {
      map.remove();
      return;
    }
    this.map = map;

    // Chrome. Defaults preserve the command-surface appearance exactly, so
    // a caller that passes nothing sees no change.
    const controls = options.controls ?? {};
    if (controls.navigation !== false) {
      map.addControl(
        new maplibre.NavigationControl({ showCompass: controls.compass !== false }),
        "top-left",
      );
    }
    if (controls.scale !== false) {
      map.addControl(new maplibre.ScaleControl({ maxWidth: 120, unit: "nautical" }), "bottom-left");
    }
    // Not optional: CARTO and OpenStreetMap require attribution.
    map.addControl(
      new maplibre.AttributionControl({
        compact: true,
        customAttribution: "© CARTO · © OpenStreetMap · Seaphore",
      }),
      "bottom-right",
    );

    this.popup = new maplibre.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "260px",
      className: "seaphore-map-popup",
      offset: 14,
    });

    // A failed basemap must degrade to a usable map, not a blank canvas.
    map.on("error", (event: { error?: { message?: string } }) => {
      /*
       * Ignore anything from a map this renderer has moved on from.
       *
       * This closure captures `map`, and `destroy()` does not detach
       * it. `map.remove()` aborts in-flight style and tile requests
       * whose handlers may still fire, so without this check a
       * torn-down map can report errors that surface as if they came
       * from the live one — and a remount is exactly when that
       * happens. The token is the same guard `mount` already uses
       * against the same class of problem.
       *
       * An error from a map nobody is looking at is not something the
       * officer can act on.
       */
      if (token !== this.mountToken || this.map !== map) return;
      const message = event?.error?.message ?? "Unknown map error";
      /*
       * Only a genuine style-document failure justifies swapping basemaps.
       *
       * This used to fire on any message merely *mentioning* sprite or
       * glyphs — including the routine per-glyph 404s a vector basemap
       * emits for character ranges it has no coverage for. One of those
       * would swap a working CARTO style for the fallback, which needs an
       * API key this deployment does not have, so the map went black and
       * stayed black. Losing one glyph range is cosmetic; losing the
       * basemap is not.
       */
      const styleDocumentFailed = /failed to (load|fetch).*style|style is not done loading/i.test(
        message,
      );
      if (!this.styleFailed && styleDocumentFailed) {
        this.styleFailed = true;
        this.bus?.emit("map:error", {
          scope: "maplibre:style",
          message: `Basemap failed (${message}) — falling back to ${FALLBACK_BASEMAP}`,
        });
        map.setStyle(FALLBACK_BASEMAP);
        return;
      }
      this.bus?.emit("map:error", { scope: "maplibre", message });
    });

    await this.awaitStyleLoad(map);

    /*
     * Bail if this mount was superseded while awaiting the style.
     *
     * `mount()` is async and the host may tear down and remount before it
     * finishes. Without this check the abandoned call resumes here and
     * installs its sources onto whichever map is current — the *new* one,
     * which has just installed them itself. MapLibre then throws
     * `Source "nigeria-eez" already exists` and the second map dies too.
     *
     * `destroy()` and every later `mount()` bump the token, so a stale
     * call returns quietly instead of corrupting a live map.
     */
    if (token !== this.mountToken) {
      map.remove();
      return;
    }

    await this.loadVesselIcons();
    if (token !== this.mountToken) return;
    /*
     * Retune the basemap before the operational layers go on.
     *
     * Order matters twice over: the coastline this installs must sit
     * beneath vessels and ports, and restyling first means the
     * operational palette is chosen against its final background rather
     * than against CARTO's. `applyMaritimeStyle` is total and never
     * throws, so a basemap it does not recognise costs colour, not the
     * mount.
     */
    const palette = paletteFor(options.palette);
    const styleResult = applyMaritimeStyle(map as unknown as StyleTarget, palette);
    this.installLayersWithRetry(map, palette);
    this.verifyInstalledLayers(map);
    publishStyleDiagnostics(map, styleResult);
    this.installInteractionHandlers();
    this.installFrameCounter();

    this.ready = true;
    this.bus?.emit("map:ready", { renderer: this.id });
  }

  destroy(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    // The bus outlives this renderer — a subscription left attached
    // would keep a destroyed instance alive and answer resets meant for
    // its replacement.
    this.offPerspectiveReset?.();
    this.offPerspectiveReset = undefined;
    this.popup?.remove();
    this.popup = null;
    this.map?.remove();
    this.map = null;
    this.features.clear();
    this.ready = false;
    this.destroyed = true;
    // Any mount still awaiting a style now owns nothing.
    this.mountToken += 1;
  }

  isReady(): boolean {
    return this.ready;
  }

  // ─── Camera ─────────────────────────────────────────────────────────────

  setCamera(camera: Partial<MapCamera>): void {
    const map = this.map;
    if (!map) return;
    // jumpTo, not easeTo: this path mirrors SGS state that may itself have come
    // from a map move. Animating would fight the user's own gesture.
    map.jumpTo({
      ...(camera.center ? { center: [camera.center[0], camera.center[1]] } : {}),
      ...(camera.zoom !== undefined ? { zoom: camera.zoom } : {}),
      ...(camera.pitch !== undefined ? { pitch: camera.pitch } : {}),
      ...(camera.bearing !== undefined ? { bearing: camera.bearing } : {}),
    });
  }

  getCamera(): MapCamera | null {
    const map = this.map;
    if (!map) return null;
    const center = map.getCenter();
    return {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  fitBounds(bounds: BoundingBox, options?: { padding?: number; duration?: number }): void {
    this.map?.fitBounds(
      [
        [bounds[0][0], bounds[0][1]],
        [bounds[1][0], bounds[1][1]],
      ],
      { padding: options?.padding ?? 48, duration: options?.duration ?? 800 },
    );
  }

  /**
   * Where a geographic position currently sits on screen, in container
   * pixels. Null before mount — a caller must then anchor elsewhere
   * rather than draw at (0, 0).
   */
  project(position: LonLat): { readonly x: number; readonly y: number } | null {
    if (!this.map) return null;
    const point = this.map.project([position[0], position[1]]);
    return { x: point.x, y: point.y };
  }

  getVisibleBounds(): BoundingBox | null {
    const bounds = this.map?.getBounds();
    if (!bounds) return null;
    return [
      [bounds.getWest(), bounds.getSouth()],
      [bounds.getEast(), bounds.getNorth()],
    ];
  }

  flyTo(center: LonLat, zoom?: number): void {
    this.map?.flyTo({
      center: [center[0], center[1]],
      ...(zoom !== undefined ? { zoom } : {}),
      speed: 1.5,
      curve: 1.4,
      essential: true,
    });
  }

  // ─── Layers ─────────────────────────────────────────────────────────────

  setLayerVisibility(renderLayerId: string, visible: boolean): void {
    const map = this.map;
    if (!map || !map.getLayer(renderLayerId)) return;
    const next = visible ? "visible" : "none";
    // Reading first avoids a redundant style recalculation on every SGS tick.
    if (map.getLayoutProperty(renderLayerId, "visibility") === next) return;
    map.setLayoutProperty(renderLayerId, "visibility", next);
  }

  setLayerOpacity(renderLayerId: string, opacity: number): void {
    const map = this.map;
    if (!map) return;
    const layer = map.getLayer(renderLayerId);
    if (!layer) return;
    const clamped = Math.min(1, Math.max(0, opacity));
    // The opacity property name differs per layer type.
    const property = OPACITY_PROPERTY_BY_TYPE[layer.type as keyof typeof OPACITY_PROPERTY_BY_TYPE];
    if (!property) return;
    map.setPaintProperty(renderLayerId, property, clamped);
  }

  // ─── Vessel data ────────────────────────────────────────────────────────

  setVesselData(collection: VesselFeatureCollection): void {
    this.fullReplacements += 1;
    this.features.clear();
    for (const feature of collection.features) {
      this.features.set(feature.properties.imo, feature);
    }
    this.writeVesselSource();
  }

  /**
   * Apply an incremental batch.
   *
   * Uses `GeoJSONSource.updateData` so only the touched features are handed to
   * the worker. Falls back to a full write only if the source is not yet
   * present (a batch arriving before `load` completes).
   */
  patchVessels(batch: VesselRenderBatch): void {
    for (const feature of batch.added) this.features.set(feature.properties.imo, feature);
    for (const feature of batch.updated) this.features.set(feature.properties.imo, feature);
    for (const imo of batch.removed) this.features.delete(imo);

    const source = this.vesselSource();
    if (!source) return;

    this.incrementalBatches += 1;
    void source.updateData({
      ...(batch.removed.length > 0 ? { remove: [...batch.removed] } : {}),
      ...(batch.added.length > 0 ? { add: batch.added.map(toMapLibreFeature) } : {}),
      ...(batch.updated.length > 0
        ? {
            update: batch.updated.map((feature) => ({
              id: feature.properties.imo,
              newGeometry: {
                type: "Point" as const,
                coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
              },
              addOrUpdateProperties: Object.entries(feature.properties).map(([key, value]) => ({
                key,
                value,
              })),
            })),
          }
        : {}),
    });
  }

  /**
   * Replace the voyage overlay.
   *
   * Endpoints only — see `voyage-render.ts` for why nothing connects
   * them.
   *
   * Full replacement is right here. Voyages change on the scale of
   * hours, not seconds; the incremental `updateData` path exists for
   * vessel positions, which is a different problem.
   */
  setVoyageData(endpoints: unknown): void {
    const map = this.map;
    if (!map) return;
    const endpointSource = map.getSource(SOURCE_IDS.voyageEndpoints);
    if (endpointSource && endpointSource.type === "geojson") {
      (endpointSource as MapLibreGeoJSONSource).setData(endpoints as never);
    }
  }

  async loadVesselIcons(): Promise<void> {
    const map = this.map;
    if (!map) return;
    for (const [id, image] of buildVesselSprites()) {
      if (!map.hasImage(id)) map.addImage(id, image);
    }
    // Operational symbols (ports, anchorage, incidents, weather) share
    // their geometry with the legend via `@/lib/map-symbols`.
    for (const [id, image] of buildSymbolSprites()) {
      if (!map.hasImage(id)) map.addImage(id, image);
    }
    /*
     * Hollow marker for a degree-minute port centroid.
     *
     * The shared symbol set has one port glyph and no way to say "this
     * position is approximate", so this stays registered alongside it.
     * Dropping it would silently retire the precision distinction: Lekki's
     * coordinate is good to about a kilometre, and at port zoom that error
     * is visible on screen with nothing telling the officer so.
     *
     * It is deliberately a different shape rather than a different colour,
     * so the distinction survives greyscale — but it does not yet share
     * geometry with the port glyph beside it. An outlined variant belongs
     * in `@/lib/map-symbols` so the legend can mirror it; until then this
     * keeps the capability rather than trading it for consistency.
     */
    if (!map.hasImage("port-diamond-approximate")) {
      map.addImage("port-diamond-approximate", createPortDiamondImage(undefined, false));
    }
    return Promise.resolve();
  }

  // ─── Instrumentation ────────────────────────────────────────────────────

  getFps(): number | null {
    if (this.frameTimes.length < 2) return null;
    const span = this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0];
    if (span <= 0) return null;
    return Math.round(((this.frameTimes.length - 1) * 1000) / span);
  }

  /** Diagnostics consumed by tests and the status panel. */
  getRenderStats(): {
    fullReplacements: number;
    incrementalBatches: number;
    featureCount: number;
  } {
    return {
      fullReplacements: this.fullReplacements,
      incrementalBatches: this.incrementalBatches,
      featureCount: this.features.size,
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private vesselSource(): MapLibreGeoJSONSource | null {
    const source = this.map?.getSource(SOURCE_IDS.vessels);
    if (!source || source.type !== "geojson") return null;
    return source as MapLibreGeoJSONSource;
  }

  private writeVesselSource(): void {
    const source = this.vesselSource();
    source?.setData({
      type: "FeatureCollection",
      features: [...this.features.values()].map(toMapLibreFeature),
    });
  }

  /**
   * Install every source and render layer, in the active palette.
   *
   * The palette is a parameter rather than a field on purpose: these
   * layers are installed exactly once per mount, immediately after it is
   * resolved, and passing it makes installing them without one
   * impossible to express. Ten paint properties here previously read the
   * dark `MARITIME_PALETTE` constant directly while `mount` resolved the
   * real palette a few lines above, so a light-themed map would have
   * drawn navy buildings, a dark graticule and dark label halos over
   * near-white land.
   */
  /** True once this map already carries the operational layer set. */
  private hasInstalledLayers(map: MapLibreMap): boolean {
    return Boolean(map.getLayer(LAYER_IDS.ports));
  }

  /**
   * Install the operational layers, and prove that they arrived.
   *
   * Installation is not merely attempted here — it is checked. The
   * failure this replaces was silent in both directions: a stale-map race
   * meant the layers went somewhere invisible, and nothing downstream
   * distinguished "installed nothing" from "installed everything", so
   * Mission Control presented a styled basemap as a working map.
   *
   * A style that is not finished loading is the one failure worth
   * retrying: it is a readiness race, and the map says so. Anything else
   * is a real defect and is reported rather than retried, because
   * retrying a genuine error just fails twice and hides the first
   * message.
   */
  private installLayersWithRetry(map: MapLibreMap, palette: MaritimePalette, attempt = 1): void {
    try {
      this.installSourcesAndLayers(map, palette);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const readinessRace = /style is not done loading|is not done loading/i.test(message);

      if (readinessRace && attempt === 1) {
        /*
         * Retry once, when the map says it is ready.
         *
         * `installSourcesAndLayers` returns early when the layers are
         * already present, so this cannot duplicate a source or a layer
         * even if the first attempt partly succeeded before throwing.
         */
        this.bus?.emit("map:error", {
          scope: "maplibre:layers",
          message: `Layer installation hit a readiness race (${message}) — retrying when the style is idle.`,
        });
        map.once("idle", () => {
          if (this.destroyed || this.map !== map) return;
          this.installLayersWithRetry(map, palette, attempt + 1);
          this.verifyInstalledLayers(map);
        });
        return;
      }

      console.error("[Seaphore map] Layer installation failed:", error);
      this.bus?.emit("map:error", {
        scope: "maplibre:layers",
        message: `Layer installation failed after ${attempt} attempt(s): ${message}. The map is showing the basemap only.`,
      });
    }
  }

  private installSourcesAndLayers(map: MapLibreMap, palette: MaritimePalette): void {
    /*
     * The map is a parameter, not `this.map`.
     *
     * Reading the instance field here was the defect: a superseded mount
     * could replace `this.map` between the live mount styling its own map
     * and installing onto it, so every source and layer went onto an
     * instance nobody was looking at. Taking the map explicitly makes the
     * two impossible to diverge — the caller styles and installs onto one
     * value it holds for the whole sequence.
     */
    if (this.hasInstalledLayers(map)) {
      /*
       * Already installed on this map. Re-running would throw on the
       * first duplicate id and abort the rest, so a retry that arrives
       * after a success must be a no-op rather than a corruption.
       */
      return;
    }

    /*
     * ── Extruded buildings ──
     *
     * Installed first, so every layer added after it — graticule, EEZ,
     * ports, vessels, rings, badges — sits above it in the draw order.
     * That ordering is the contract: geographic context may never
     * occlude an operational mark.
     *
     * ## Every height here is real
     *
     * `render_height` and `render_min_height` come from the basemap's own
     * building tiles, which carry them on every feature — verified
     * against the live source, where Lagos, Rotterdam and Singapore each
     * return 50–64 *distinct* heights across ~80 features with no modal
     * value above 8%. A defaulted field would show one dominant number;
     * these are measurements, mostly from OSM `height` or
     * `building:levels`.
     *
     * There is deliberately no `coalesce` and no fallback literal. A
     * building whose height nobody recorded must not be drawn at an
     * invented one — MapLibre skips a feature whose height expression
     * yields null, which is the honest outcome. That is also why this
     * layer carries a coverage caveat in the legend: a missing building
     * means the basemap has no geometry there, never that the ground is
     * empty.
     *
     * Below zoom 13 the source has no building geometry at all, so the
     * `minzoom` costs nothing and states the fact.
     */
    map.addLayer({
      id: LAYER_IDS.buildings,
      type: "fill-extrusion",
      source: BASEMAP_SOURCE_ID,
      "source-layer": "building",
      minzoom: BUILDING_MINZOOM,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": palette.buildingExtrusion,
        "fill-extrusion-height": ["get", "render_height"],
        "fill-extrusion-base": ["get", "render_min_height"],
        /*
         * Fades in across two zoom levels rather than appearing at once.
         * Ends well short of opaque: this is context an officer reads
         * past, not a layer they read.
         */
        "fill-extrusion-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          BUILDING_MINZOOM,
          0,
          15,
          0.75,
        ],
      },
    });

    // ── Graticule ──
    // Generated arithmetic, drawn beneath everything operational. Solid
    // and cool grey, deliberately unlike the dashed gold EEZ, so a
    // meridian can never be misread as a claimed boundary.
    map.addSource(SOURCE_IDS.graticule, {
      type: "geojson",
      data: graticuleFeatures(
        this.mountBounds ?? undefined,
        this.graticuleSteps ?? undefined,
      ) as never,
    });
    map.addLayer({
      id: LAYER_IDS.graticule,
      type: "line",
      source: SOURCE_IDS.graticule,
      paint: {
        "line-color": palette.graticule,
        // Hairline at world zoom, where a hundred and twenty lines are
        // in frame. The first stop was 4, and a clamped ramp drew all
        // of them at regional weight.
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          0.25,
          ZOOM_BANDS.regionalMin,
          0.4,
          10,
          0.7,
        ],
        "line-opacity": graticuleOpacityExpression() as never,
      },
    });

    map.addSource(SOURCE_IDS.voyageEndpoints, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: LAYER_IDS.voyageEndpoints,
      type: "circle",
      source: SOURCE_IDS.voyageEndpoints,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 4, 3.5, 10, 5.5],
        "circle-color": [
          "case",
          ["==", ["get", "role"], "origin"],
          palette.voyageOrigin,
          palette.voyageDestination,
        ],
        /*
         * A hollow ring for a degree-minute position, solid for a
         * surveyed one. UN/LOCODE resolves to about a kilometre, and at
         * port zoom that error is visible — the officer should be able
         * to see which endpoints are approximate without opening a
         * panel.
         */
        "circle-stroke-color": palette.voyageRelationship,
        "circle-stroke-width": 1,
        "circle-opacity": ["case", ["==", ["get", "precision"], "surveyed"], 0.95, 0.45],
      },
    });
    map.addLayer({
      id: LAYER_IDS.voyageEndpointLabels,
      type: "symbol",
      source: SOURCE_IDS.voyageEndpoints,
      minzoom: 3,
      layout: {
        "text-field": ["get", "portName"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 8, 11],
        "text-anchor": "top",
        "text-offset": [0, 0.7],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": palette.voyageRelationship,
        "text-halo-color": palette.labelHalo,
        "text-halo-width": 1.3,
      },
    });

    // ── Nigerian EEZ ──
    map.addSource(SOURCE_IDS.eez, { type: "geojson", data: ASSETS.eez });
    /*
     * A wash inside the outline, so "inside Nigerian waters" is legible
     * at a glance rather than requiring the officer to trace a dashed
     * line by eye.
     *
     * Held to a very low opacity on purpose. This polygon is twenty
     * vertices and its own file calls it APPROXIMATE and "NOT a legal or
     * navigational boundary"; a confident fill would present survey-grade
     * authority the geometry does not have. The dashed edge stays, and
     * the legend carries the caveat in words.
     */
    map.addLayer({
      id: LAYER_IDS.eezFill,
      type: "fill",
      source: SOURCE_IDS.eez,
      paint: {
        "fill-color": "#B8860B",
        /*
         * Absent at world zoom, faint at regional, fading again as the
         * officer closes.
         *
         * Two different reasons at the two ends. Closing in, the
         * approximation error grows relative to what is on screen.
         * Zooming out, the problem is emphasis: this is the only
         * jurisdictional polygon the map holds, and at world zoom a
         * gold wash over the Gulf of Guinea marks Nigeria as
         * permanently special on a map that now covers the whole
         * planet. The opening location must not be the highlighted one.
         */
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          0,
          ZOOM_BANDS.regionalMin,
          0,
          5,
          0.05,
          9,
          0.03,
          13,
          0.015,
        ],
      },
    });
    map.addLayer({
      id: LAYER_IDS.eezBoundary,
      type: "line",
      source: SOURCE_IDS.eez,
      paint: {
        "line-color": "#B8860B",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          0.6,
          ZOOM_BANDS.regionalMin,
          0.9,
          5,
          1.1,
          8,
          1.8,
          12,
          2.6,
        ],
        "line-dasharray": [4, 3],
        // Reference geography at world zoom, not a highlighted zone —
        // present enough to orient, far too quiet to read as a warning.
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          0.1,
          ZOOM_BANDS.regionalMin,
          0.28,
          5,
          0.5,
          8,
          0.7,
          12,
          0.8,
        ],
      },
    });

    // ── Ports ──
    map.addSource(SOURCE_IDS.ports, {
      type: "geojson",
      // Built from the single asset registry, never fetched: a second
      // copy of the port estate is how two ports with one name appear.
      data: portFeatureCollection() as unknown as GeoJsonFeatureCollection,
      promoteId: "locode",
    });
    map.addSource(SOURCE_IDS.anchorages, {
      type: "geojson",
      data: anchorageFeatureCollection() as unknown as GeoJsonFeatureCollection,
      promoteId: "anchorageId",
    });

    /*
     * ── Port interaction ring ──
     *
     * Kept from this branch: main's port rework dropped it. Hover and
     * selection are one layer at two intensities, which makes it
     * structurally impossible for a port to show as both.
     */
    map.addLayer({
      id: LAYER_IDS.portSelection,
      type: "circle",
      source: SOURCE_IDS.ports,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          ["case", ["boolean", ["feature-state", "selected"], false], 7, 5],
          ZOOM_BANDS.regionalMin,
          ["case", ["boolean", ["feature-state", "selected"], false], 11, 8],
          14,
          ["case", ["boolean", ["feature-state", "selected"], false], 20, 14],
        ],
        "circle-color": INTERACTION_COLORS.selectedFill,
        "circle-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          0.14,
          ["boolean", ["feature-state", "hover"], false],
          0.07,
          0,
        ],
        "circle-stroke-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          INTERACTION_COLORS.selected,
          INTERACTION_COLORS.hover,
        ],
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1.25,
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
        "circle-stroke-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          0.85,
          ["boolean", ["feature-state", "hover"], false],
          0.5,
          0,
        ],
      },
    });
    /*
     * Anchorage extent at its real radius.
     *
     * `circle-radius` is pixels, so this converts the kilometres in the
     * data using the Mercator resolution at this latitude — see
     * `PIXELS_PER_KM`. Base-2 exponential interpolation is exact here,
     * because resolution halves with every zoom step.
     *
     * The previous fixed pixel ramp meant the ring described a different
     * distance at every zoom, which is a drawing, not a geography. It is
     * still dashed, and still labelled indicative in the legend: the
     * source file calls this radius "a display hint in kilometres, not a
     * surveyed limit", and drawing it precisely must not upgrade it.
     *
     * At strategic zoom a 2 km ring is under a pixel and simply is not
     * there. That is the honest result, not a bug.
     */
    map.addLayer({
      id: LAYER_IDS.portAnchorage,
      type: "circle",
      source: SOURCE_IDS.ports,
      paint: {
        // Zoom outermost — MapLibre rejects a nested zoom expression,
        // and rejects the whole layer with it. The per-feature radius
        // multiplies inside each stop instead.
        "circle-radius": [
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          PIXELS_PER_KM.minZoom,
          ["*", ["coalesce", ["get", "anchorageRadiusKm"], 0], PIXELS_PER_KM.minZoomPixels],
          PIXELS_PER_KM.maxZoom,
          ["*", ["coalesce", ["get", "anchorageRadiusKm"], 0], PIXELS_PER_KM.maxZoomPixels],
        ],
        "circle-color": "transparent",
        // Anchorage is violet in the shared symbol vocabulary — a distinct
        // reading from the blue port itself.
        "circle-stroke-color": MAP_SYMBOLS.anchorage.color,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.15, 11, 0.45, 14, 0.6],
      },
    });
    map.addLayer({
      id: LAYER_IDS.portAnchorageSymbol,
      type: "symbol",
      source: SOURCE_IDS.ports,
      minzoom: 9,
      layout: {
        "icon-image": symbolSpriteId("anchorage"),
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 12, 0.55, 14, 0.7],
        "icon-offset": [0, 1.35],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 12, 0.8],
      },
    });

    /*
     * ── Anchorages ──
     *
     * A distinct registry, not a property of a port: an anchorage is its
     * own operational object with its own district and its own source
     * state. Its extent radius is indicative — the registry says so —
     * so it is dashed and never filled.
     */
    map.addLayer({
      id: LAYER_IDS.anchorageExtent,
      type: "circle",
      source: SOURCE_IDS.anchorages,
      paint: {
        "circle-radius": [
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          PIXELS_PER_KM.minZoom,
          ["*", ["coalesce", ["get", "radiusKm"], 0], PIXELS_PER_KM.minZoomPixels],
          PIXELS_PER_KM.maxZoom,
          ["*", ["coalesce", ["get", "radiusKm"], 0], PIXELS_PER_KM.maxZoomPixels],
        ],
        "circle-color": MAP_SYMBOLS.anchorage.color,
        "circle-opacity": 0.06,
        "circle-stroke-color": MAP_SYMBOLS.anchorage.color,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.25, 9, 0.5, 13, 0.65],
      },
    });
    map.addLayer({
      id: LAYER_IDS.anchorages,
      type: "symbol",
      source: SOURCE_IDS.anchorages,
      layout: {
        "icon-image": symbolSpriteId("anchorage"),
        // Recognisable at national zoom, and always smaller than a major
        // port so the hierarchy reads without a legend.
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 6, 0.62, 10, 0.8, 14, 1],
        "icon-allow-overlap": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.anchorageLabels,
      type: "symbol",
      source: SOURCE_IDS.anchorages,
      minzoom: 7,
      layout: {
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 9.5, 12, 11.5],
        "text-anchor": "top",
        "text-offset": [0, 1],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": MAP_SYMBOLS.anchorage.color,
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.4,
      },
    });

    /*
     * A pale disc beneath a major port symbol.
     *
     * Elevation only — it lifts the seven NPA complexes off the water so
     * they stay findable inside dense traffic. It encodes no measurement:
     * every major port gets the same disc.
     */
    map.addLayer({
      id: LAYER_IDS.portHalo,
      type: "circle",
      source: SOURCE_IDS.ports,
      filter: ["==", ["get", "tier"], "major"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 9, 7, 13, 12, 18],
        "circle-color": MAP_SYMBOLS.port.color,
        "circle-opacity": 0.12,
        "circle-stroke-color": MAP_SYMBOLS.port.color,
        "circle-stroke-width": 1.1,
        "circle-stroke-opacity": 0.55,
      },
    });
    map.addLayer({
      id: LAYER_IDS.ports,
      type: "symbol",
      source: SOURCE_IDS.ports,
      layout: {
        /*
         * Hollow for a degree-minute centroid, solid for an operator
         * reference position.
         *
         * The same convention the voyage endpoints already use, and for
         * the same reason: Lekki's coordinate is good to about a
         * kilometre, and at port zoom that error is visible. An officer
         * should be able to see which marks are approximate without
         * opening a panel — and shape, not colour, is what carries it,
         * so the distinction survives greyscale.
         */
        "icon-image": [
          "case",
          ["==", ["get", "precision"], "degree-minute"],
          "port-diamond-approximate",
          symbolSpriteId("port"),
        ],
        /*
         * Deterministic collision order.
         *
         * Lagos, Tin Can and Lekki sit within ~65 km, so at regional
         * zoom their labels contend for the same pixels. MapLibre
         * resolves ties by whichever it reaches first, which varies
         * with viewport and reads as flicker. Sorting by the canonical
         * model's `labelPriority` makes the same port win every time:
         * lower sorts first, and first wins placement.
         */
        "symbol-sort-key": ["coalesce", ["get", "labelPriority"], 9],
        /*
         * Size carries tier, not activity.
         *
         * A major NPA complex draws larger than a secondary terminal at
         * every zoom, so the national picture keeps its hierarchy. Berth
         * count no longer scales the symbol: it is a reference figure and
         * a size difference read as throughput.
         */
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          /*
           * World stop, kept from this branch over main's ramp, which
           * began at zoom 4.
           *
           * Without one the ramp clamps, and the Nigerian ports are drawn
           * at regional size on a globe — a cluster of full-weight marks
           * on West Africa and nothing anywhere else, which reads as
           * "this is where the activity is" rather than "this is all we
           * hold". Sized by main's `tier` rather than this branch's berth
           * count: tier is the registry's own statement of standing, and
           * berth count is a reference figure the source says is not
           * capacity.
           */
          ZOOM_BANDS.worldMin,
          ["case", ["==", ["get", "tier"], "major"], 0.34, 0.24],
          4,
          ["case", ["==", ["get", "tier"], "major"], 0.62, 0.42],
          7,
          ["case", ["==", ["get", "tier"], "major"], 0.8, 0.55],
          10,
          ["case", ["==", ["get", "tier"], "major"], 1, 0.7],
          14,
          ["case", ["==", ["get", "tier"], "major"], 1.25, 0.9],
        ],
        // Never decluttered away: an NPA port must not disappear because
        // vessels are dense around it.
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.portLabels,
      type: "symbol",
      source: SOURCE_IDS.ports,
      /*
       * No port names on the world view.
       *
       * At zoom 1 the label ramp clamped to its zoom-5 size and drew
       * "APA", "TIN", "CAL" on top of each other over a landmass a few
       * pixels wide. The diamonds still mark where the ports are; the
       * names arrive once the officer is close enough for them to
       * resolve as separate places.
       */
      minzoom: ZOOM_BANDS.regionalMin,
      layout: {
        // Same priority the markers sort by, so a port's label and its
        // diamond can never disagree about which of them matters most.
        "symbol-sort-key": ["coalesce", ["get", "labelPriority"], 9],
        // Abbreviation at strategic zoom, full name once there is room.
        "text-field": ["step", ["zoom"], ["get", "shortName"], 9, ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 9, 11.5, 14, 13],
        /*
         * Both Lagos labels get placed, rather than the better one
         * winning.
         *
         * Apapa and Tin Can are 8.8 km apart — about 7px at the opening
         * zoom, against labels 40-50px wide. With a single anchor they
         * compete for one strip of pixels and the sort key decides which
         * survives; that is the whole reason Tin Can drew a symbol and no
         * name. Sorting cannot fix it, because sorting picks a winner and
         * what was needed was for neither to lose.
         *
         * Variable anchoring gives the placement engine eight candidate
         * positions per label. Vertical alternatives lead deliberately:
         * for two ports on the same latitude the useful escape is one
         * label above its mark and the other below, which buys ~30px of
         * separation from 7px of geography. The diagonals are the
         * fallback for the eastern ports, which are further apart and
         * rarely need them.
         *
         * `text-offset` cannot be used with this — MapLibre takes the
         * distance from `text-radial-offset` instead.
         */
        "text-variable-anchor": [
          "top",
          "bottom",
          "left",
          "right",
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
        ],
        "text-radial-offset": 1.05,
        "text-justify": "auto",
        /*
         * Major ports win the placement contest; secondary terminals
         * yield, which is what decluttering is for.
         *
         * Expressed through `symbol-sort-key` above rather than through
         * `text-allow-overlap`. Both overlap properties are
         * `data-constant` in the style spec — zoom may vary them, a
         * feature may not — so the `["==", ["get", "tier"], "major"]`
         * that used to sit here was not a rule MapLibre could apply. It
         * declined the whole layer, silently, and no port has drawn its
         * name since. Sorting achieves the same precedence with the
         * engine's own placement pass, which is what the sort key is
         * for; the only thing given up is a major label overlapping a
         * neighbour outright, which was never desirable.
         */
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": MAP_SYMBOLS.port.color,
        // Palette-driven, not the literal #FFFFFF main used here: a
        // hardcoded halo is the bypass class the palette integration
        // removed, and it would render a white halo on the dark theme.
        "text-halo-color": palette.labelHalo,
        "text-halo-width": 1.6,
      },
    });

    // ── Vessels ──
    // `promoteId` binds MapLibre's feature id to the IMO, which is what makes
    // `updateData` able to address a single vessel.
    map.addSource(SOURCE_IDS.vessels, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      promoteId: "imo",
    });

    map.addLayer({
      id: LAYER_IDS.riskHeatmap,
      type: "heatmap",
      source: SOURCE_IDS.vessels,
      maxzoom: 10,
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "attentionScore"], 0, 0, 100, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 6, 1, 9, 3],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0,0,0,0)",
          0.3,
          "rgba(212,137,10,0.4)",
          0.6,
          "rgba(192,57,43,0.5)",
          1,
          "rgba(192,57,43,0.8)",
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 30, 9, 15],
        "heatmap-opacity": 0.65,
      },
    });

    /*
     * Selection ring.
     *
     * Beneath the vessel symbols so it reads as a halo around the hull
     * rather than a mark on top of it. Filtered to the selected feature
     * alone, and drawn in the selection teal — never in a risk colour
     * and never animated, because a ring that pulsed would suggest
     * movement or urgency the data does not support. It says "this is
     * the one you clicked", and nothing else.
     */
    map.addLayer({
      id: LAYER_IDS.vesselSelection,
      type: "circle",
      source: SOURCE_IDS.vessels,
      filter: ["==", ["get", "isSelected"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 9, 9, 14, 14, 22],
        "circle-color": "#0E7C7B",
        "circle-opacity": 0.12,
        "circle-stroke-color": "#3FBFBE",
        "circle-stroke-width": 1.25,
        "circle-stroke-opacity": 0.8,
      },
    });

    /*
     * ── Confidence ring ──
     *
     * Beneath the hull, outside the selection ring's radius, so the
     * three axes stack without overlapping: confidence outermost,
     * selection next, the hull itself carrying risk and type.
     *
     * Filtered to features that actually carry a confidence value. That
     * filter is the whole point — an entity nobody has assessed gets no
     * ring at all, rather than an `unconfirmed` ring that would look
     * like an assessment. `unconfirmed` is reserved for a record that
     * has a confidence column with nothing in it, which the data-model
     * documents as a defect worth showing.
     *
     * Dash, fill and stroke alpha all vary with tier, so the ladder is
     * legible with colour stripped out entirely.
     */
    map.addLayer({
      id: LAYER_IDS.vesselConfidence,
      type: "circle",
      source: SOURCE_IDS.vessels,
      filter: ["has", "confidenceTier"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          6,
          ZOOM_BANDS.regionalMin,
          9,
          9,
          15,
          14,
          24,
        ],
        "circle-color": confidenceMatch((style) => style.color),
        "circle-opacity": confidenceMatch((style) => style.fillOpacity),
        "circle-stroke-color": confidenceMatch((style) => style.color),
        "circle-stroke-width": confidenceMatch((style) => style.strokeWidth),
        "circle-stroke-opacity": confidenceMatch((style) => style.strokeOpacity),
      },
    });

    map.addLayer({
      id: LAYER_IDS.vessels,
      type: "symbol",
      source: SOURCE_IDS.vessels,
      layout: {
        /*
         * The sprite the feature asked for — not one re-derived here.
         *
         * This used to be a `case` over risk, selection and staleness,
         * which duplicated `vesselIconId()` and had drifted from it: the
         * expression had no branch for the `-nodir` suffix, so every
         * non-directional sprite was built, uploaded, and unreachable.
         * A vessel whose course nobody reported was drawn as a pointed
         * hull at rotation zero — indistinguishable from one steaming
         * due north, which is precisely the fabrication the sprite set
         * exists to prevent.
         *
         * `vesselIconId()` is the one place that decides, and it is
         * enumerated by `vesselSpriteIds()`, which is what
         * `loadVesselIcons()` registers. Reading the property keeps
         * those three in step by construction.
         */
        "icon-image": ["get", "iconId"],
        // Zoom scaling: readable at national view, prominent at port view.
        // World stop added: the ramp began at 4, so a vessel on the
        // globe was drawn at national-view size. Smaller, but never
        // vanishing — a vessel is the subject of this map, and the one
        // thing that must stay findable at every zoom.
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ZOOM_BANDS.worldMin,
          0.26,
          ZOOM_BANDS.regionalMin,
          0.36,
          7,
          0.55,
          9,
          0.8,
          14,
          1.3,
        ],
        /*
         * Rotate only a bearing someone reported.
         *
         * `heading` is a required number upstream, so a vessel with no
         * course still arrives as 0 — which, rotated, is a vessel
         * steaming due north. `headingKnown` is the flag that separates
         * that from a real northerly course, and an unrotated symbol is
         * the honest rendering of "we do not know which way this is
         * pointing".
         */
        "icon-rotate": ["case", ["==", ["get", "headingKnown"], true], ["get", "heading"], 0],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": ["get", "opacity"],
      },
    });

    /*
     * ── Intelligence badge ──
     *
     * A small filled dot pinned to a corner of the hull. Deliberately
     * *additive*: the vessel keeps its own silhouette, risk colour and
     * heading, and the badge says what is attached to it. Replacing the
     * hull with a case-file icon would throw away the type and heading
     * a provider did report, in order to display an administrative fact
     * — the same class of loss as collapsing an unknown heading into a
     * plain disc.
     *
     * Position is fixed per signal (see `INTELLIGENCE_BADGE_OFFSETS`),
     * so an officer learns where to look as well as what colour to look
     * for, and two signals on one vessel cannot land on each other.
     *
     * Filtered to features carrying a signal. Nothing populates
     * `intelligenceSignal` today — no map source reports investigations,
     * alerts, or per-entity risk events — so this layer draws nothing at
     * present. It is installed anyway so the vocabulary exists in one
     * place rather than being invented per-caller later, and the legend
     * reports the category as unsourced rather than as empty.
     */
    map.addLayer({
      id: LAYER_IDS.vesselIntelligence,
      type: "symbol",
      source: SOURCE_IDS.vessels,
      filter: ["has", "intelligenceSignal"],
      minzoom: ZOOM_BANDS.regionalMin,
      layout: {
        "text-field": "●",
        "text-size": ["interpolate", ["linear"], ["zoom"], ZOOM_BANDS.regionalMin, 7, 12, 11],
        /*
         * `["literal", …]` is required around each offset.
         *
         * A bare `[x, y]` inside an expression is parsed as a *call* —
         * MapLibre reads the first element as an operator name, finds a
         * number, and rejects the layer. It rejects it the quiet way:
         * `addLayer` does not throw, the layer simply never exists.
         * Caught here by `verifyInstalledLayers`, which is the reason
         * that check was added.
         */
        "text-offset": intelligenceMatch((signal) => [
          "literal",
          INTELLIGENCE_BADGE_OFFSETS[signal],
        ]),
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": intelligenceMatch((signal) => INTELLIGENCE_COLORS[signal]),
        "text-halo-color": palette.labelHalo,
        "text-halo-width": 1.4,
      },
    });

    map.addLayer({
      id: LAYER_IDS.vesselLabels,
      type: "symbol",
      source: SOURCE_IDS.vessels,
      minzoom: 8.5,
      layout: {
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8.5, 9.5, 12, 11, 15, 12.5],
        "text-anchor": "top",
        "text-offset": [0, 1.2],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#B7C4D1",
        "text-halo-color": palette.labelHalo,
        "text-halo-width": 1.2,
        // Fades in across half a zoom level rather than appearing at
        // once, arriving at the vessel's own opacity so a stale vessel's
        // label stays as recessive as its hull.
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0, 9.2, ["get", "opacity"]],
      },
    });

    // ── Incident and weather symbols ──
    // Empty until their providers are connected, but the renderer still owns
    // the layers and the icon semantics now. A future feed supplies GeoJSON;
    // it must not invent a different marker grammar or fall back to a generic
    // triangle/dot when the shared symbol vocabulary already says what to draw.
    map.addSource(SOURCE_IDS.incidentReports, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: LAYER_IDS.incidentReports,
      type: "symbol",
      source: SOURCE_IDS.incidentReports,
      layout: {
        visibility: "none",
        "icon-image": symbolSpriteId("incident"),
        "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.72, 9, 0.95, 14, 1.25],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": 0.95 },
    });
    map.addSource(SOURCE_IDS.weatherAlerts, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: LAYER_IDS.weatherOverlay,
      type: "symbol",
      source: SOURCE_IDS.weatherAlerts,
      layout: {
        visibility: "none",
        "icon-image": symbolSpriteId("weather-alert"),
        "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.72, 9, 0.95, 14, 1.2],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": 0.9 },
    });

    // ── Investigation area ──
    map.addSource(SOURCE_IDS.investigationArea, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: LAYER_IDS.investigArea,
      type: "fill",
      source: SOURCE_IDS.investigationArea,
      layout: { visibility: "none" },
      paint: { "fill-color": "#0E7C7B", "fill-opacity": 0.1 },
    });

    /*
     * ── Sea labels ──
     *
     * Geographic orientation: the name of the water the officer is
     * looking at. The basemap's own `water_name` layer is restyled and
     * let in early, but it does not carry the Gulf of Guinea at the zooms
     * this map is read at.
     *
     * Added last and placed with `beforeId` rather than added early.
     * Position in this function decides two different things — draw order
     * *and* what a failure takes down with it — and conflating them is
     * expensive: while this sat mid-chain, anything it threw aborted the
     * install before ports, vessels and the EEZ were ever added, which
     * presents as an unstyled basemap with no maritime data at all. Draw
     * order is now stated explicitly and the operational layers are
     * installed before this can affect them.
     *
     * Deliberately not an entity: no feature id, no feature-state, no
     * click target. Its `symbol-sort-key` is high so a port label always
     * wins a collision — an orientation cue must never cost the officer
     * the name of a port. It also stops at regional zoom, because once
     * the view is about a berth, naming the gulf is noise.
     */
    map.addSource(SOURCE_IDS.seaLabels, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: SEA_LABELS.map((label) => ({
          type: "Feature",
          properties: { name: label.name },
          geometry: { type: "Point", coordinates: [...label.position] },
        })),
      } as never,
    });
    map.addLayer(
      {
        id: LAYER_IDS.seaLabels,
        type: "symbol",
        source: SOURCE_IDS.seaLabels,
        minzoom: 4,
        maxzoom: 9,
        layout: {
          "text-field": ["get", "name"],
          "text-transform": "uppercase",
          // Larger than an ordinary place label and tracked out, the
          // cartographic convention for an area rather than a point.
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 6, 14, 9, 18],
          "text-letter-spacing": 0.28,
          "symbol-sort-key": 99,
        },
        paint: {
          "text-color": palette.seaLabel,
          "text-halo-color": palette.labelHalo,
          "text-halo-width": 1.2,
          // Present but recessive: context the officer reads past.
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 6, 0.55, 9, 0.35],
        },
      },
      // Beneath everything operational, above the graticule.
      map.getLayer(LAYER_IDS.voyageEndpoints) ? LAYER_IDS.voyageEndpoints : undefined,
    );
  }

  /**
   * Confirm the engine actually accepted every layer we asked for.
   *
   * `addLayer` does not throw on an invalid paint or layout expression.
   * It declines the layer, fires an error event, and the map carries on
   * looking healthy — so a layer can be registered as `ready`, toggled
   * on by an officer, and simply not exist. That is the same failure
   * shape as an empty layer reading as "no activity": the map appears to
   * answer a question it never asked.
   *
   * This turns that into a reported error. It cannot repair the layer,
   * but a missing layer that says so is recoverable and a silent one is
   * not.
   */
  /**
   * Wait for the style, but never in silence.
   *
   * Every operational layer needs a loaded style, so `mount` cannot do
   * anything until `load` fires. When the basemap is unreachable it never
   * fires: MapLibre emits one style error, the handler swaps to the
   * fallback basemap, that fails too, and `styleFailed` suppresses the
   * second report. `mount` then sits on this promise forever. What the
   * officer sees is a blank canvas, correctly sized and correctly
   * coloured, with no ports, no vessels and nothing in the console — the
   * zero-layer mount that looked intermittent because it tracked whether
   * the basemap host happened to answer.
   *
   * The stall is not repairable here; a map with no style has nothing to
   * install onto. What is fixable is the silence. After
   * `STYLE_LOAD_STALL_MS` this reports that the map is stuck and why,
   * then keeps waiting — a slow network still recovers on its own, and a
   * mount that eventually succeeds is worth more than one abandoned on a
   * timer.
   */
  private awaitStyleLoad(map: MapLibreMap): Promise<void> {
    return new Promise<void>((resolve) => {
      if (map.loaded()) {
        resolve();
        return;
      }
      const stall = setTimeout(() => {
        const message =
          `The basemap style has not finished loading after ${STYLE_LOAD_STALL_MS / 1000}s. ` +
          `No operational layer has been installed — the map is showing an empty canvas. ` +
          `This is usually the basemap host being unreachable.`;
        console.error(`[Seaphore map] ${message}`);
        this.bus?.emit("map:error", { scope: "maplibre:style", message });

        /*
         * Reporting was not enough, and this is the one case that never
         * recovers on its own.
         *
         * Controlled runs against this engine show four outcomes. A good
         * style loads. A style replaced mid-load still fires `load`. A
         * style that fails and is then replaced fires `load` for the
         * replacement. And a style document that simply fails, with
         * nothing replacing it, fires no `load` at all, ever — the map
         * sits at zero installed layers for the life of the page.
         *
         * The error handler above swaps the basemap, but only for a
         * message it recognises as a style-document failure, and it
         * matches on wording. A failure that arrives phrased differently,
         * or as a bare network error, leaves the map stalled with the
         * swap never attempted.
         *
         * So the stall itself becomes the trigger. Twelve seconds without
         * a loaded style is the condition that matters, whatever produced
         * it, and it is observable rather than inferred from a string.
         * `styleFailed` still bounds this to one attempt: a fallback that
         * also fails must not start the map thrashing between two styles
         * it cannot load.
         */
        if (!this.styleFailed && !map.isStyleLoaded()) {
          this.styleFailed = true;
          this.bus?.emit("map:error", {
            scope: "maplibre:style",
            message: `Retrying with ${FALLBACK_BASEMAP}`,
          });
          try {
            map.setStyle(FALLBACK_BASEMAP);
          } catch (error) {
            console.error("[Seaphore map] fallback basemap could not be applied", error);
          }
        }
      }, STYLE_LOAD_STALL_MS);
      map.once("load", () => {
        clearTimeout(stall);
        resolve();
      });
    });
  }

  private verifyInstalledLayers(map: MapLibreMap): void {
    const missing = INSTALLED_RENDER_LAYERS.filter((id) => !map.getLayer(id));
    if (missing.length === 0) return;

    const message =
      missing.length === INSTALLED_RENDER_LAYERS.length
        ? `No operational layer installed (${missing.length} expected). Mission Control is showing the basemap only.`
        : `The map engine declined ${missing.length} layer(s): ${missing.join(", ")}. They are registered as available but will not draw.`;

    /*
     * Logged as well as emitted.
     *
     * This used to emit to the event bus alone, and nothing subscribes to
     * `map:error` for logging, so the total-failure case — every layer
     * missing — was invisible in the console while the map looked merely
     * empty. A map with no operational layers is not a quiet degradation;
     * it is the difference between "no vessels are reporting" and "we did
     * not draw anything", and an officer cannot tell those apart.
     */
    console.error(`[Seaphore map] ${message}`);
    this.bus?.emit("map:error", { scope: "maplibre:layers", message });
  }

  private installInteractionHandlers(): void {
    const map = this.map;
    if (!map) return;

    map.on("moveend", () => {
      const camera = this.getCamera();
      if (!camera) return;
      this.bus?.emit("map:move", camera);
      this.applyPerspective();
    });

    /*
     * ── Manual tilt latches pitch away from the policy ──
     *
     * Bound to `pitchstart` rather than `pitchend` so the latch is set
     * before the gesture produces its first `moveend`; latching at the
     * end would let the policy overwrite the officer's angle in the gap.
     *
     * `isManualPitchGesture` is what separates a real gesture from this
     * class's own easing — see `perspective.ts`. Rotation is deliberately
     * *not* wired here: a bearing change is not a pitch change, and
     * spinning the map must not silently disable the perspective ramp.
     */
    map.on("pitchstart", (event: { originalEvent?: unknown } | undefined) => {
      if (!isManualPitchGesture(event, this.selfIssuedCameraMove)) return;
      this.pitchOwner = "manual";
      this.bus?.emit("map:perspective", { owner: "manual", pitch: map.getPitch() });
    });

    // The one command this renderer accepts on the bus. See the event's
    // own documentation for why a control asks this way.
    this.offPerspectiveReset?.();
    this.offPerspectiveReset = this.bus?.on("perspective:reset", () => {
      this.resetPerspective();
    });

    map.on("click", LAYER_IDS.vessels, (event: MapLibreLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const imo = String(feature.properties?.imo ?? "");
      if (!imo) return;
      this.bus?.emit("vessel:click", {
        imo,
        position: [event.lngLat.lng, event.lngLat.lat],
      });
    });

    // A bare-basemap click means "deselect". Registering it after the layer
    // handler lets MapLibre deliver the layer click first.
    map.on("click", (event: MapLibreMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [LAYER_IDS.vessels, LAYER_IDS.ports, LAYER_IDS.anchorages],
      });
      if (hits.length > 0) return;
      this.bus?.emit("map:click", { position: [event.lngLat.lng, event.lngLat.lat] });
    });

    map.on("mouseenter", LAYER_IDS.vessels, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LAYER_IDS.vessels, () => {
      map.getCanvas().style.cursor = "";
      this.clearHover();
    });
    /*
     * Voyage endpoints are selectable.
     *
     * Emitted as a distinct event rather than reusing `vessel:click` —
     * a voyage is a record, not a vessel, and the drawer resolves them
     * through different services.
     */
    map.on("click", LAYER_IDS.voyageEndpoints, (event: MapLibreLayerMouseEvent) => {
      const feature = event.features?.[0];
      const voyageId = feature?.properties?.voyageId;
      if (typeof voyageId !== "string") return;
      this.bus?.emit("voyage:click", {
        voyageId,
        voyageNumber:
          typeof feature?.properties?.voyageNumber === "string" &&
          feature.properties.voyageNumber !== ""
            ? feature.properties.voyageNumber
            : null,
      });
    });
    map.on("mouseenter", LAYER_IDS.voyageEndpoints, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LAYER_IDS.voyageEndpoints, () => {
      map.getCanvas().style.cursor = "";
    });

    /*
     * ── Ports and anchorages are selectable, each on its own channel ──
     *
     * A port and an anchorage are different objects with different
     * registries; one event carrying a "kind" flag would be the loose
     * tag the selection union exists to avoid — the same reason voyages
     * have their own event.
     *
     * The map only reports the click. Whether the selection is honoured,
     * and what is shown for it, stays with SGS and the panels — this
     * class still never calls into React or the shared service.
     */
    map.on("click", LAYER_IDS.ports, (event: MapLibreLayerMouseEvent) => {
      const feature = event.features?.[0];
      const locode = feature?.properties?.locode;
      if (typeof locode !== "string" || locode === "") return;
      this.bus?.emit("port:click", {
        // Locode, not main's generic `portId`: it is the key the source
        // promotes and the one every port consumer already shares.
        locode,
        name: typeof feature?.properties?.name === "string" ? feature.properties.name : null,
        position: [event.lngLat.lng, event.lngLat.lat],
      });
    });
    map.on("click", LAYER_IDS.anchorages, (event: MapLibreLayerMouseEvent) => {
      const feature = event.features?.[0];
      const anchorageId = feature?.properties?.anchorageId;
      if (typeof anchorageId !== "string" || anchorageId === "") return;
      const portId = feature?.properties?.portId;
      this.bus?.emit("anchorage:click", {
        anchorageId,
        portId: typeof portId === "string" && portId !== "" ? portId : null,
        position: [event.lngLat.lng, event.lngLat.lat],
      });
    });

    /*
     * Hover, as a feature state rather than an event.
     *
     * The ring is drawn by the paint expression reading
     * `["feature-state", "hover"]`, so pointing at a port costs one
     * state write and no re-parse of the collection. Undebounced on
     * purpose: unlike the vessel popup, which is expensive and would
     * flash across dense traffic, a ring appearing under the cursor is
     * the immediate feedback that makes the port feel clickable.
     */
    map.on("mousemove", LAYER_IDS.ports, (event: MapLibreLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const id = event.features?.[0]?.id;
      if (id === undefined || id === this.hoveredPortId) return;
      this.setPortHover(this.hoveredPortId, false);
      this.hoveredPortId = id as string;
      this.setPortHover(this.hoveredPortId, true);
    });
    map.on("mouseleave", LAYER_IDS.ports, () => {
      map.getCanvas().style.cursor = "";
      this.setPortHover(this.hoveredPortId, false);
      this.hoveredPortId = null;
    });

    for (const layer of [LAYER_IDS.ports, LAYER_IDS.anchorages] as const) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    // Hover is debounced by TIMING.hoverDelayMs so sweeping the cursor across
    // dense traffic does not flash a popup per vessel.
    map.on("mousemove", LAYER_IDS.vessels, (event: MapLibreLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const imo = String(feature.properties?.imo ?? "");
      if (!imo || imo === this.hoveredImo) return;

      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      const position: LonLat = [event.lngLat.lng, event.lngLat.lat];
      this.hoverTimer = setTimeout(() => {
        this.hoveredImo = imo;
        this.bus?.emit("vessel:hover", { imo, position });
        this.showQuickAssessment(imo, position);
      }, TIMING.hoverDelayMs);
    });
  }

  private installFrameCounter(): void {
    const map = this.map;
    if (!map) return;
    map.on("render", () => {
      const now = performance.now();
      if (this.lastFrameAt > 0) {
        this.frameTimes.push(now);
        // Keep a short rolling window — enough to smooth, cheap to hold.
        if (this.frameTimes.length > 60) this.frameTimes.shift();
      }
      this.lastFrameAt = now;
    });
  }

  /**
   * Write a port's hover flag, tolerating a missing source.
   *
   * `setFeatureState` throws if the source has gone — which happens
   * during teardown, when a `mouseleave` can still arrive after the
   * style has been torn down. A hover ring is not worth an exception
   * escaping into the event loop.
   */
  private setPortHover(id: string | null, hover: boolean): void {
    if (id === null || !this.map) return;
    try {
      this.map.setFeatureState({ source: SOURCE_IDS.ports, id }, { hover });
    } catch {
      // Source removed mid-interaction. Nothing to un-highlight.
    }
  }

  /**
   * Mark exactly one port as selected, clearing any previous one.
   *
   * Selection is a property of the map's state, not of the click that
   * caused it, so it is driven from here rather than from the click
   * handler — a selection restored from a URL must light the same ring
   * as one made with the mouse.
   */
  setSelectedPort(locode: string | null): void {
    if (!this.map) return;
    const previous = this.selectedPortId;
    if (previous === locode) return;
    for (const [id, selected] of [
      [previous, false],
      [locode, true],
    ] as const) {
      if (id === null) continue;
      try {
        this.map.setFeatureState({ source: SOURCE_IDS.ports, id }, { selected });
      } catch {
        // As above: a torn-down source has no state to write.
      }
    }
    this.selectedPortId = locode;
  }

  /* ── Adaptive perspective ─────────────────────────────────────── */

  /**
   * Bring pitch into line with the zoom, once the camera has settled.
   *
   * Called only from `moveend`. That timing is the whole design, and it
   * was arrived at by measuring two alternatives that do not work:
   *
   *   A React subscriber cannot be smooth. A 1.5s zoom fires ~74
   *   MapLibre `zoom` events but notifies the shared service exactly
   *   twice, because only `moveend` is wired — so pitch derived from
   *   shared state would snap in one frame at the end of the gesture.
   *
   *   `setPitch()` per `zoom` event is worse: it is a camera *command*,
   *   and it cancels whatever easing is already running. Measured, it
   *   aborted an `easeTo` to zoom 13 at zoom 7.57 — which would break
   *   the selection flight `planCameraMove` issues.
   *
   * Easing after the gesture ends competes with nothing, converges in
   * one step, and touches pitch alone.
   *
   * Wrapped entirely in try/catch. An exception thrown inside a MapLibre
   * camera event handler leaves the camera permanently wedged — every
   * later `easeTo` silently does nothing until the page is reloaded.
   * That was observed directly during the M2.6 audit, and no perspective
   * nicety is worth that failure mode.
   */
  /**
   * Switch the projection on the map already mounted.
   *
   * Globe is a MapLibre projection, so this is one call on the live
   * instance — no second map, no remount, and nothing that would put the
   * mount-reliability work back at risk. The camera, the installed
   * layers, the feature-state selection and the officer's focus all
   * survive because none of them is re-created here.
   *
   * Pitch is left alone deliberately. An officer who tilted to read a
   * berth approach and then spun out to the globe should find their tilt
   * where they left it, and `applyPerspective` remains the one place
   * that decides pitch.
   */
  setProjection(view: ViewMode): void {
    const map = this.map;
    if (!map || this.destroyed) return;

    const type = view === "GLOBE" ? "globe" : "mercator";
    try {
      (map as unknown as { setProjection: (spec: { type: string }) => void }).setProjection({
        type,
      });
    } catch (error) {
      /*
       * Reported, never silent. A projection the engine declines leaves
       * the map drawing correctly in the previous one, and an officer
       * who pressed Globe and saw no change needs to know the engine
       * refused rather than that their click was lost.
       */
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Seaphore map] Projection "${type}" was declined: ${message}`);
      this.bus?.emit("map:error", {
        scope: "maplibre:projection",
        message: `The map engine declined the ${type} projection: ${message}`,
      });
    }
  }

  private applyPerspective(): void {
    const map = this.map;
    if (!map || this.destroyed) return;
    // Our own pitch ease raises `moveend` again; without this the
    // controller would answer its own movement forever.
    if (this.selfIssuedCameraMove) return;

    try {
      const plan = planPerspective({
        zoom: map.getZoom(),
        currentPitch: map.getPitch(),
        owner: this.pitchOwner,
      });
      if (!plan.change) return;

      this.selfIssuedCameraMove = true;
      map.easeTo(
        // Pitch only. Centre, zoom and bearing are absent from this
        // object by construction, so the ease cannot move the officer
        // off what they were looking at or undo a manual rotation.
        { pitch: plan.pitch, duration: PERSPECTIVE_EASE_MS },
        // Tagged so the `moveend` this raises is identifiable even by a
        // listener that cannot see `selfIssuedCameraMove`.
        { seaphorePerspective: true },
      );
      map.once("moveend", () => {
        this.selfIssuedCameraMove = false;
      });
      // Belt and braces: if the ease is cancelled the `moveend` above may
      // never arrive, and a stuck flag would disable perspective for the
      // session.
      window.setTimeout(() => {
        this.selfIssuedCameraMove = false;
      }, PERSPECTIVE_EASE_MS + 400);
    } catch {
      // Never let a perspective decision wedge the camera.
      this.selfIssuedCameraMove = false;
    }
  }

  /** Which owner currently decides pitch. */
  getPitchOwner(): PitchOwner {
    return this.pitchOwner;
  }

  /**
   * Hand pitch back to the automatic policy and ease to its angle.
   *
   * Derives the target from the current zoom, so "reset" resumes the
   * ramp from wherever the officer is rather than undoing their session.
   * Centre, zoom and bearing are preserved — a manual rotation survives
   * a perspective reset, because bearing is never the policy's to hold.
   */
  resetPerspective(): void {
    const map = this.map;
    if (!map || this.destroyed) return;
    try {
      const plan = planPerspectiveReset(map.getZoom());
      this.pitchOwner = plan.owner;
      this.selfIssuedCameraMove = true;
      map.easeTo(
        { pitch: plan.pitch, duration: PERSPECTIVE_EASE_MS },
        { seaphorePerspective: true },
      );
      map.once("moveend", () => {
        this.selfIssuedCameraMove = false;
      });
      window.setTimeout(() => {
        this.selfIssuedCameraMove = false;
      }, PERSPECTIVE_EASE_MS + 400);
      this.bus?.emit("map:perspective", { owner: "automatic", pitch: plan.pitch });
    } catch {
      this.selfIssuedCameraMove = false;
    }
  }

  private clearHover(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    if (this.hoveredImo !== null) {
      this.hoveredImo = null;
      this.bus?.emit("vessel:hover", { imo: null, position: null });
    }
    this.popup?.remove();
  }

  /**
   * Quick Assessment popup.
   *
   * Rendered with MapLibre's own `Popup` rather than React, per
   * `MAP_RENDERING_SPEC.md` — it must track the map during pan without a React
   * render per frame. Content is escaped; it comes from vessel data.
   */
  private showQuickAssessment(imo: string, position: LonLat): void {
    const map = this.map;
    const popup = this.popup;
    const feature = this.features.get(imo);
    if (!map || !popup || !feature) return;

    const p = feature.properties;
    const riskColor = RISK_COLORS[p.risk] ?? RISK_COLORS.UNKNOWN;
    const rows = [
      `<div style="font-weight:600;color:#E5E7EB">${escapeHtml(p.name)}</div>`,
      `<div style="color:#9CA3AF">IMO ${escapeHtml(p.imo)}</div>`,
      `<div style="color:${riskColor};font-weight:600">${escapeHtml(p.risk)} RISK</div>`,
      p.destination
        ? `<div style="color:#9CA3AF">${p.etaHours !== null ? `ETA ${p.etaHours}h → ` : "→ "}${escapeHtml(p.destination)}</div>`
        : "",
      `<div style="color:${FRESHNESS_COLORS[p.freshness]}">${FRESHNESS_LABELS[p.freshness]} · ${formatAge(p.ageMs)}</div>`,
    ]
      .filter(Boolean)
      .join("");

    popup
      .setLngLat([position[0], position[1]])
      .setHTML(`<div style="font:11px/1.5 system-ui;padding:2px 4px">${rows}</div>`)
      .addTo(map);
  }
}

/** Paint property carrying opacity, per MapLibre layer type. */
const OPACITY_PROPERTY_BY_TYPE = {
  symbol: "icon-opacity",
  circle: "circle-opacity",
  line: "line-opacity",
  fill: "fill-opacity",
  heatmap: "heatmap-opacity",
  raster: "raster-opacity",
} as const;

/** Widen a readonly vessel feature into the mutable shape MapLibre expects. */
function toMapLibreFeature(feature: VesselFeature): {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
} {
  return {
    type: "Feature",
    id: feature.properties.imo,
    geometry: {
      type: "Point",
      coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
    },
    properties: { ...feature.properties },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
