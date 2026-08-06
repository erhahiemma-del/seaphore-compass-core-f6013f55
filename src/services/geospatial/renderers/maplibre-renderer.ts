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
import { BASEMAP_STYLE, LAYER_IDS, RISK_COLORS, TIMING } from "../constants";
import { FRESHNESS_COLORS, FRESHNESS_LABELS, formatAge } from "../freshness";
import type { MapEventBus } from "../event-bus";
import { buildVesselSprites, createPortDiamondImage } from "../icons/vessel-arrow";
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
  vesselsClustered: "vessels-clustered",
  ports: "ports",
  eez: "nigeria-eez",
  investigationArea: "investigation-area",
} as const;

/** Static asset paths. */
const ASSETS = {
  eez: "/geojson/nigeria-eez.geojson",
  ports: "/geojson/nimasa-ports.geojson",
} as const;

/** Fallback basemap when the primary style fails to load. */
const FALLBACK_BASEMAP = "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";

/** Bounding box framing Nigeria and its maritime approaches. */
export const NIGERIA_BOUNDS: BoundingBox = [
  [2.2, 1.5],
  [9.2, 7.2],
] as const;

/** True once this adapter draws with a real engine. */
export const MAPLIBRE_AVAILABLE = true;

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
    if (this.destroyed) throw new Error("Renderer has been destroyed");
    if (this.map) return;

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

    map.addControl(new maplibre.NavigationControl({ showCompass: true }), "top-left");
    map.addControl(new maplibre.ScaleControl({ maxWidth: 120, unit: "nautical" }), "bottom-left");
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
      if (!this.styleFailed && /style|sprite|glyphs/i.test(message)) {
        this.styleFailed = true;
        this.bus?.emit("map:error", {
          scope: "maplibre:style",
          message: `Basemap failed (${message}) — falling back to Stadia Alidade Smooth Dark`,
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

    await this.loadVesselIcons();
    this.installSourcesAndLayers();
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

    // ── Nigerian EEZ ──
    map.addSource(SOURCE_IDS.eez, { type: "geojson", data: ASSETS.eez });
    map.addLayer({
      id: LAYER_IDS.eezBoundary,
      type: "line",
      source: SOURCE_IDS.eez,
      paint: {
        "line-color": "#B8860B",
        "line-width": 1.5,
        "line-dasharray": [4, 3],
        "line-opacity": 0.6,
      },
    });

    // ── Ports ──
    map.addSource(SOURCE_IDS.ports, { type: "geojson", data: ASSETS.ports });
    map.addLayer({
      id: LAYER_IDS.portAnchorage,
      type: "circle",
      source: SOURCE_IDS.ports,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 8, 12, 40],
        "circle-color": "transparent",
        "circle-stroke-color": "#0E7C7B",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.4,
      },
    });
    map.addLayer({
      id: LAYER_IDS.ports,
      type: "symbol",
      source: SOURCE_IDS.ports,
      layout: {
        "icon-image": "port-diamond",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 1.1],
        "icon-allow-overlap": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.portLabels,
      type: "symbol",
      source: SOURCE_IDS.ports,
      layout: {
        "text-field": ["get", "shortName"],
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#0E7C7B",
        "text-halo-color": "rgba(11,31,58,0.9)",
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

    map.addLayer({
      id: LAYER_IDS.vessels,
      type: "symbol",
      source: SOURCE_IDS.vessels,
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "isSelected"], true],
          "vessel-selected",
          ["==", ["get", "isStale"], true],
          "vessel-stale",
          ["==", ["get", "risk"], "CRITICAL"],
          "vessel-critical",
          ["==", ["get", "risk"], "HIGH"],
          "vessel-high",
          ["==", ["get", "risk"], "MEDIUM"],
          "vessel-medium",
          ["==", ["get", "risk"], "LOW"],
          "vessel-low",
          ["==", ["get", "risk"], "CLEAN"],
          "vessel-clean",
          "vessel-unknown",
        ],
        // Zoom scaling: readable at national view, prominent at port view.
        "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 9, 0.75, 14, 1.2],
        "icon-rotate": ["get", "heading"],
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
      minzoom: 9,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 10,
        "text-anchor": "top",
        "text-offset": [0, 1.2],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#9CA3AF",
        "text-halo-color": "rgba(11,31,58,0.9)",
        "text-halo-width": 1,
        "text-opacity": ["get", "opacity"],
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
