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
  MARITIME_PALETTE,
  PIXELS_PER_KM,
  RISK_COLORS,
  TIMING,
} from "../constants";
import { FRESHNESS_COLORS, FRESHNESS_LABELS, formatAge } from "../freshness";
import type { MapEventBus } from "../event-bus";
import { buildVesselSprites, createPortDiamondImage } from "../icons/vessel-arrow";
import {
  applyMaritimeStyle,
  COASTLINE_LAYER_ID,
  type MaritimeStyleResult,
  type StyleTarget,
} from "../map-style";
import { graticuleFeatures, graticuleOpacityExpression } from "../graticule";
import type {
  MapCamera,
  MapRenderer,
  MapRendererDependencies,
  MapRendererMountOptions,
  VesselFeatureCollection,
  VesselRenderBatch,
} from "../renderer";
import type { BoundingBox, LonLat } from "../types";
import type { VesselFeature } from "../vessel";

/** Source ids owned by this renderer. */
const SOURCE_IDS = {
  vessels: "vessels",
  ports: "ports",
  eez: "nigeria-eez",
  graticule: "graticule",
  investigationArea: "investigation-area",
} as const;

/** Static asset paths. */
const ASSETS = {
  eez: "/geojson/nigeria-eez.geojson",
  ports: "/geojson/nimasa-ports.geojson",
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
export const INSTALLED_RENDER_LAYERS: readonly string[] = [
  LAYER_IDS.graticule,
  LAYER_IDS.eezFill,
  LAYER_IDS.eezBoundary,
  LAYER_IDS.portAnchorage,
  LAYER_IDS.ports,
  LAYER_IDS.portLabels,
  LAYER_IDS.riskHeatmap,
  LAYER_IDS.vesselSelection,
  LAYER_IDS.vessels,
  LAYER_IDS.vesselLabels,
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

  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hoveredImo: string | null = null;

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
    const token = ++this.mountToken;

    // Dynamic import keeps `window` access out of the SSR path.
    const maplibre = await import("maplibre-gl");

    const map = new maplibre.Map({
      container: options.container,
      style: options.style || BASEMAP_STYLE,
      center: [options.center[0], options.center[1]],
      zoom: options.zoom,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
      maxBounds: [
        [options.maxBounds[0][0], options.maxBounds[0][1]],
        [options.maxBounds[1][0], options.maxBounds[1][1]],
      ],
      attributionControl: false,
      // 2D operational view — pitch is reserved for the G7 Terrain Perspective.
      pitchWithRotate: false,
      // Officers read a map; they should not be able to tilt it by accident.
      dragRotate: true,
      fadeDuration: 0,
    });

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

    await new Promise<void>((resolve) => {
      if (map.loaded()) {
        resolve();
        return;
      }
      map.once("load", () => resolve());
    });

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
    const styleResult = applyMaritimeStyle(map as unknown as StyleTarget);
    this.installSourcesAndLayers();
    this.verifyInstalledLayers();
    publishStyleDiagnostics(map, styleResult);
    this.installInteractionHandlers();
    this.installFrameCounter();

    this.ready = true;
    this.bus?.emit("map:ready", { renderer: this.id });
  }

  destroy(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
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

  async loadVesselIcons(): Promise<void> {
    const map = this.map;
    if (!map) return;
    for (const [id, image] of buildVesselSprites()) {
      if (!map.hasImage(id)) map.addImage(id, image);
    }
    if (!map.hasImage("port-diamond")) map.addImage("port-diamond", createPortDiamondImage());
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

  private installSourcesAndLayers(): void {
    const map = this.map;
    if (!map) return;

    // ── Graticule ──
    // Generated arithmetic, drawn beneath everything operational. Solid
    // and cool grey, deliberately unlike the dashed gold EEZ, so a
    // meridian can never be misread as a claimed boundary.
    map.addSource(SOURCE_IDS.graticule, {
      type: "geojson",
      data: graticuleFeatures() as never,
    });
    map.addLayer({
      id: LAYER_IDS.graticule,
      type: "line",
      source: SOURCE_IDS.graticule,
      paint: {
        "line-color": MARITIME_PALETTE.graticule,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 10, 0.7],
        "line-opacity": graticuleOpacityExpression() as never,
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
        // Fades out as the officer closes, where the approximation
        // error is largest relative to what they are looking at.
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.05, 9, 0.03, 13, 0.015],
      },
    });
    map.addLayer({
      id: LAYER_IDS.eezBoundary,
      type: "line",
      source: SOURCE_IDS.eez,
      paint: {
        "line-color": "#B8860B",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.1, 8, 1.8, 12, 2.6],
        "line-dasharray": [4, 3],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 8, 0.7, 12, 0.8],
      },
    });

    // ── Ports ──
    map.addSource(SOURCE_IDS.ports, { type: "geojson", data: ASSETS.ports });
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
        "circle-stroke-color": "#0E7C7B",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.15, 11, 0.45, 14, 0.6],
      },
    });
    map.addLayer({
      id: LAYER_IDS.ports,
      type: "symbol",
      source: SOURCE_IDS.ports,
      layout: {
        "icon-image": "port-diamond",
        /*
         * Scale carries berth count — a reference figure from the source
         * file, which states it is "not live capacity". It is a static
         * property of the estate, like a runway count, so it may inform
         * size; it must never be read as throughput or activity, which
         * is why the legend says so explicitly.
         */
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          [
            "*",
            0.5,
            ["interpolate", ["linear"], ["coalesce", ["get", "berths"], 5], 5, 0.85, 14, 1.25],
          ],
          9,
          [
            "*",
            0.85,
            ["interpolate", ["linear"], ["coalesce", ["get", "berths"], 5], 5, 0.85, 14, 1.25],
          ],
          14,
          [
            "*",
            1.35,
            ["interpolate", ["linear"], ["coalesce", ["get", "berths"], 5], 5, 0.85, 14, 1.25],
          ],
        ],
        "icon-allow-overlap": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.portLabels,
      type: "symbol",
      source: SOURCE_IDS.ports,
      layout: {
        // Abbreviation at strategic zoom, full name once there is room.
        "text-field": ["step", ["zoom"], ["get", "shortName"], 9, ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9.5, 9, 11, 14, 13],
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#3FBFBE",
        "text-halo-color": MARITIME_PALETTE.labelHalo,
        "text-halo-width": 1.5,
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
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.38, 7, 0.55, 9, 0.8, 14, 1.3],
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
        "text-halo-color": MARITIME_PALETTE.labelHalo,
        "text-halo-width": 1.2,
        // Fades in across half a zoom level rather than appearing at
        // once, arriving at the vessel's own opacity so a stale vessel's
        // label stays as recessive as its hull.
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0, 9.2, ["get", "opacity"]],
      },
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
  private verifyInstalledLayers(): void {
    const map = this.map;
    if (!map) return;
    const missing = INSTALLED_RENDER_LAYERS.filter((id) => !map.getLayer(id));
    if (missing.length === 0) return;
    this.bus?.emit("map:error", {
      scope: "maplibre:layers",
      message: `The map engine declined ${missing.length} layer(s): ${missing.join(", ")}. They are registered as available but will not draw.`,
    });
  }

  private installInteractionHandlers(): void {
    const map = this.map;
    if (!map) return;

    map.on("moveend", () => {
      const camera = this.getCamera();
      if (!camera) return;
      this.bus?.emit("map:move", camera);
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
      const hits = map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.vessels] });
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
    map.on("mouseenter", LAYER_IDS.ports, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LAYER_IDS.ports, () => {
      map.getCanvas().style.cursor = "";
    });

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
