/**
 * Cesium — 3D Terrain Perspective adapter (G7).
 *
 * An implementation of {@link MapRenderer}, nothing more. It is a second
 * *view* of the same picture, not a second product: the vessels it draws
 * are the canonical `VesselFeature`s the update engine already diffed,
 * the selection it reports travels on the same `MapEventBus`, the camera
 * it moves is owned by `SharedGeospatialService`, and the layer ids it
 * switches come from the Layer Registry. There is no Cesium-specific
 * vessel state anywhere in this file — no store, no cache of positions,
 * no second identity key. Entities are keyed by IMO because that is the
 * identity the domain already promotes.
 *
 * MapLibre remains the primary operational map. This adapter is mounted
 * only when an officer asks for the terrain perspective and a Cesium Ion
 * token has been activated.
 *
 * The Ion token is injected at mount time by the caller, which fetched it
 * from an authenticated server function. It is never imported, never
 * hardcoded, and never read from a bundled constant here.
 *
 * Cesium itself is loaded by dynamic `import()` inside `mount`, so the
 * MapLibre path never pays for the 3D engine and SSR never evaluates it.
 */
import type { MapEventBus } from "../event-bus";
import { LAYER_IDS, RISK_COLORS } from "../constants";
import type {
  MapCamera,
  MapRenderer,
  MapRendererMountOptions,
  VesselFeatureCollection,
  VesselRenderBatch,
} from "../renderer";
import type { BoundingBox, LonLat, ViewMode } from "../types";
import {
  DEFAULT_EARTH_SETTINGS,
  clampExaggeration,
  earthPreset,
  type EarthSettings,
} from "../earth-presets";

import type { VesselFeature } from "../vessel";

/** Everything the adapter needs that is not part of the shared contract. */
export interface CesiumRendererDependencies {
  readonly bus: MapEventBus;
  /**
   * Cesium Ion access token, resolved at runtime by the caller.
   *
   * Required. A renderer constructed without one would mount a globe with
   * no terrain and no imagery, which reads as a broken map rather than an
   * unconfigured credential.
   */
  readonly ionToken: string;
  /**
   * Where Cesium's static assets (workers, glyphs) are served from.
   *
   * Defaults to the pinned CDN build matching the installed package, so
   * no asset-copying build step is required and a fresh clone works
   * without extra configuration.
   */
  readonly baseUrl?: string;
  /** Initial earth presentation. Defaults to the Intelligence Earth look. */
  readonly earth?: Partial<EarthSettings>;
}

const CESIUM_VERSION = "1.144.0";
const DEFAULT_BASE_URL = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;

/** Layer ids this adapter can actually honour, mapped to entity groups. */
const GROUP_FOR_LAYER: Record<string, "vessels" | "vesselLabels" | "findings" | "track"> = {
  [LAYER_IDS.vessels]: "vessels",
  [LAYER_IDS.vesselLabels]: "vesselLabels",
  [LAYER_IDS.findingIndicators]: "findings",
  [LAYER_IDS.findingIndicatorLabels]: "findings",
  [LAYER_IDS.vesselTrack]: "track",
};

type Group = "vessels" | "vesselLabels" | "findings" | "track";

/* eslint-disable @typescript-eslint/no-explicit-any -- Cesium is loaded dynamically; its types are not in the SSR graph. */
type Cesium = any;

/**
 * The shape of the port-twin projection, restated structurally.
 *
 * Mirrors `PortTwinFeatureCollection` without importing it: the engine
 * adapter stays ignorant of the port domain, exactly as it does for
 * findings and voyages.
 */
interface PortInfrastructureLike {
  readonly features: readonly {
    readonly geometry: { readonly coordinates: readonly [number, number] };
    readonly properties: {
      readonly assetId: string;
      readonly twinId: string;
      readonly layer: string;
      readonly name: string;
      readonly colour: string;
      readonly radiusKm: number | null;
    };
  }[];
}

interface FindingIndicatorLike {
  readonly features: readonly {
    readonly geometry: { readonly coordinates: readonly [number, number] };
    readonly properties: {
      readonly findingId: string;
      readonly subjectType: string;
      readonly subjectId: string;
      readonly colour: string;
      readonly indicatorLabel: string;
      readonly decided: boolean;
    };
  }[];
}

/**
 * The corridor projection, restated structurally.
 *
 * Mirrors `CorridorProjection` without importing it, for the same reason
 * the twin estate is restated: the engine adapter draws geometry and stays
 * ignorant of the corridor domain.
 */
interface CorridorProjectionLike {
  readonly arcs: readonly {
    readonly corridorId: string;
    readonly colour: string;
    readonly positions: readonly (readonly [number, number, number])[];
    readonly band: boolean;
  }[];
  readonly zones: readonly {
    readonly zoneId: string;
    readonly colour: string;
    readonly ring: readonly (readonly [number, number])[];
  }[];
}

interface CorridorTransitLike {
  readonly corridorId: string;
  readonly label: string;
  readonly colour: string;
  readonly position: readonly [number, number, number];
  readonly etaLabel: string;
}

export class CesiumRenderer implements MapRenderer {
  readonly id = "cesium";

  /** True engine, unlike the stub — the status bar reports it as drawing. */
  readonly isRealEngine = true;

  private readonly bus: MapEventBus;
  private readonly ionToken: string;
  private readonly baseUrl: string;

  private cesium: Cesium | null = null;
  private viewer: Cesium | null = null;
  private ready = false;
  private destroyed = false;

  /** Entities by IMO. The only per-vessel state, and it is render state. */
  private readonly vesselEntities = new Map<string, Cesium>();
  private readonly findingEntities = new Map<string, Cesium>();
  /**
   * Port Digital Twin infrastructure, by asset id.
   *
   * Kept apart from vessels and findings because it answers a different
   * question — what the estate *is*, not what is moving through it — and
   * because its visibility is decided by the twin's own layer registry.
   */
  private readonly infrastructureEntities = new Map<string, Cesium>();
  /**
   * Corridor arcs, density bands and risk zones, by entity id.
   *
   * Lane geography. Deliberately not keyed by IMO and deliberately not in
   * the vessel maps — a corridor is a published route, not a hull.
   */
  private readonly corridorEntities = new Map<string, Cesium>();
  /** Indicative transit markers, by corridor id. Not vessels. */
  private readonly transitEntities = new Map<string, Cesium>();
  private trackEntity: Cesium | null = null;
  private readonly visible: Record<Group, boolean> = {
    vessels: true,
    vesselLabels: true,
    findings: true,
    track: true,
  };
  private labelsRequested = true;

  /**
   * Which vessels carry an unresolved alert, and the current breath.
   *
   * The phase is a property of the whole attention set, driven by the one
   * clock in `useAlertPulse` — exactly as on the flat map. Held here only
   * as render state; the alert itself is owned by shared state.
   */
  private readonly alertingImos = new Set<string>();
  private alertPhase = 1;

  /** How the earth is drawn. Presentation state, and the only copy of it. */
  private earth: EarthSettings = DEFAULT_EARTH_SETTINGS;
  private satelliteLayer: Cesium | null = null;
  /** Last ocean normal map URL handed to the globe. See applyEarthSettings. */
  private oceanNormalMapUrl: string | undefined = undefined;

  constructor(deps: CesiumRendererDependencies) {
    this.bus = deps.bus;
    this.ionToken = deps.ionToken;
    this.baseUrl = deps.baseUrl ?? DEFAULT_BASE_URL;
    if (deps.earth) this.earth = { ...DEFAULT_EARTH_SETTINGS, ...deps.earth };
  }

  async mount(options: MapRendererMountOptions): Promise<void> {
    if (this.destroyed) return;

    (globalThis as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = this.baseUrl;
    const cesium = (await import("cesium")) as Cesium;
    this.cesium = cesium;
    cesium.Ion.defaultAccessToken = this.ionToken;

    ensureWidgetStylesheet(this.baseUrl);
    const viewer = new cesium.Viewer(options.container, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });
    this.viewer = viewer;

    /*
     * Terrain is requested, not assumed.
     *
     * A rejected token or an unreachable Ion produces an honest ellipsoid
     * globe plus a `map:error`, rather than a silent flat world that an
     * officer would read as terrain data saying "no relief here".
     */
    try {
      viewer.terrainProvider = await cesium.createWorldTerrainAsync?.({
        // Requested explicitly: the water mask is what the ocean shader
        // shades, and vertex normals are what day/night lighting needs.
        requestWaterMask: true,
        requestVertexNormals: true,
      });
    } catch (error) {
      this.bus.emit("map:error", {
        message: `3D terrain unavailable from Cesium Ion: ${
          error instanceof Error ? error.message : String(error)
        }. The globe is drawn on the ellipsoid; relief is not being shown.`,
      } as never);
    }

    /*
     * High-resolution Ion imagery, requested after terrain.
     *
     * A failure here is stated and survivable in exactly the same way:
     * the globe keeps its base colour and the officer is told the
     * imagery is missing rather than shown a blue sphere to interpret.
     */
    try {
      const imagery = await cesium.createWorldImageryAsync?.();
      if (imagery) {
        this.satelliteLayer = viewer.imageryLayers?.addImageryProvider?.(imagery) ?? null;
        if (this.satelliteLayer) this.satelliteLayer.show = this.earth.satelliteImagery;
      }
    } catch (error) {
      this.bus.emit("map:error", {
        message: `Satellite imagery unavailable from Cesium Ion: ${
          error instanceof Error ? error.message : String(error)
        }. The globe is drawn without imagery.`,
      } as never);
    }

    this.applyPerformanceBudget();
    this.applyEarthSettings(this.earth);

    this.setCamera({
      center: options.center,
      zoom: options.zoom,
      pitch: options.pitch ?? 55,
      bearing: options.bearing ?? 0,
    });

    // Interaction leaves on the shared bus, exactly as MapLibre's does.
    const handler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium) => {
      const picked = viewer.scene.pick(movement.position);
      const position = this.pickLonLat(movement.position);
      const entityId: string | undefined = picked?.id?.id;
      if (entityId?.startsWith("vessel:") && position) {
        this.bus.emit("vessel:click", { imo: entityId.slice("vessel:".length), position });
        return;
      }
      if (entityId?.startsWith("finding:") && position) {
        const props = picked.id.properties?.getValue?.(cesium.JulianDate.now()) ?? {};
        this.bus.emit("finding:click", {
          findingId: entityId.slice("finding:".length),
          subjectType: String(props["subjectType"] ?? "VESSEL"),
          subjectId: String(props["subjectId"] ?? ""),
          position,
        });
        return;
      }
      if (entityId?.startsWith("twin:") && position) {
        const props = picked.id.properties?.getValue?.(cesium.JulianDate.now()) ?? {};
        this.bus.emit("infrastructure:click", {
          assetId: entityId.slice("twin:".length),
          twinId: String(props["twinId"] ?? ""),
          layer: String(props["layer"] ?? ""),
          position,
        });
        return;
      }

      if (position) this.bus.emit("map:click", { position });
    }, cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.moveEnd.addEventListener(() => {
      const camera = this.getCamera();
      if (camera) {
        this.bus.emit("map:move", {
          center: camera.center,
          zoom: camera.zoom,
          pitch: camera.pitch,
          bearing: camera.bearing,
        });
      }
    });

    this.ready = true;
    this.bus.emit("map:ready", { renderer: this.id });
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.vesselEntities.clear();
    this.alertingImos.clear();
    this.findingEntities.clear();
    this.infrastructureEntities.clear();
    this.trackEntity = null;
    try {
      this.viewer?.destroy();
    } catch {
      // A viewer torn down mid-mount is already gone; nothing to release.
    }
    this.viewer = null;
  }

  isReady(): boolean {
    return this.ready && this.viewer !== null && !this.viewer.isDestroyed?.();
  }

  /** Screen point → lon/lat on the globe, or null when it misses the earth. */
  private pickLonLat(windowPosition: unknown): LonLat | null {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return null;
    const ray = viewer.camera.getPickRay(windowPosition);
    const cartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : null;
    if (!cartesian) return null;
    const carto = cesium.Cartographic.fromCartesian(cartesian);
    if (!carto) return null;
    return [cesium.Math.toDegrees(carto.longitude), cesium.Math.toDegrees(carto.latitude)];
  }

  // ── Camera ──────────────────────────────────────────────────────────

  setCamera(camera: Partial<MapCamera>): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    const current = this.getCamera();
    const center = camera.center ?? current?.center ?? [0, 0];
    const zoom = camera.zoom ?? current?.zoom ?? 6;
    const pitch = camera.pitch ?? current?.pitch ?? 55;
    const bearing = camera.bearing ?? current?.bearing ?? 0;
    viewer.camera.setView({
      destination: cesium.Cartesian3.fromDegrees(center[0], center[1], zoomToHeight(zoom)),
      orientation: {
        heading: cesium.Math.toRadians(bearing),
        pitch: cesium.Math.toRadians(pitch - 90),
        roll: 0,
      },
    });
  }

  getCamera(): MapCamera | null {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return null;
    const carto = cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    if (!carto) return null;
    return {
      center: [cesium.Math.toDegrees(carto.longitude), cesium.Math.toDegrees(carto.latitude)],
      zoom: heightToZoom(carto.height),
      pitch: cesium.Math.toDegrees(viewer.camera.pitch) + 90,
      bearing: cesium.Math.toDegrees(viewer.camera.heading),
    };
  }

  flyTo(center: LonLat, zoom?: number): void {
    const cesium = this.cesium;
    if (!cesium || !this.viewer) return;
    this.viewer.camera.flyTo({
      destination: cesium.Cartesian3.fromDegrees(
        center[0],
        center[1],
        zoomToHeight(zoom ?? this.getCamera()?.zoom ?? 8),
      ),
      duration: 1.2,
    });
  }

  fitBounds(bounds: BoundingBox): void {
    const cesium = this.cesium;
    if (!cesium || !this.viewer) return;
    const [west, south, east, north] = bounds as unknown as [number, number, number, number];
    this.viewer.camera.flyTo({
      destination: cesium.Rectangle.fromDegrees(west, south, east, north),
      duration: 1.2,
    });
  }

  project(position: LonLat): { x: number; y: number } | null {
    const cesium = this.cesium;
    if (!cesium || !this.viewer) return null;
    const world = cesium.Cartesian3.fromDegrees(position[0], position[1]);
    const screen = cesium.SceneTransforms.worldToWindowCoordinates?.(this.viewer.scene, world);
    return screen ? { x: screen.x, y: screen.y } : null;
  }

  getVisibleBounds(): BoundingBox | null {
    const cesium = this.cesium;
    if (!cesium || !this.viewer) return null;
    const rect = this.viewer.camera.computeViewRectangle?.();
    if (!rect) return null;
    return [
      cesium.Math.toDegrees(rect.west),
      cesium.Math.toDegrees(rect.south),
      cesium.Math.toDegrees(rect.east),
      cesium.Math.toDegrees(rect.north),
    ] as unknown as BoundingBox;
  }

  getFps(): number | null {
    return null;
  }

  // ── Projection and presentation ─────────────────────────────────────

  /**
   * A no-op by design: this adapter *is* the three-dimensional view.
   *
   * Recorded in `MapState` by the service either way, so the control is
   * never left looking broken — it simply has nothing to change here.
   */
  setProjection(_view: ViewMode): void {}

  setPresentation(): void {
    // Basemap lighting in 3D comes from Ion imagery, not a style document.
  }

  // ── Layers ──────────────────────────────────────────────────────────

  setLayerVisibility(renderLayerId: string, visible: boolean): void {
    const group = GROUP_FOR_LAYER[renderLayerId];
    if (!group) return;
    this.visible[group] = visible;
    if (group === "vesselLabels") this.labelsRequested = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    for (const entity of this.vesselEntities.values()) {
      entity.show = this.visible.vessels;
      if (entity.label) entity.label.show = this.visible.vessels && this.labelsRequested;
    }
    for (const entity of this.findingEntities.values()) entity.show = this.visible.findings;
    if (this.trackEntity) this.trackEntity.show = this.visible.track;
  }

  // ── Vessels — canonical features only ───────────────────────────────

  setVesselData(collection: VesselFeatureCollection): void {
    if (!this.isReady()) return;
    const incoming = new Set<string>();
    for (const feature of collection.features) {
      incoming.add(feature.properties.imo);
      this.upsertVessel(feature as unknown as VesselFeature);
    }
    for (const imo of [...this.vesselEntities.keys()]) {
      if (!incoming.has(imo)) this.removeVessel(imo);
    }
  }

  patchVessels(batch: VesselRenderBatch): void {
    if (!this.isReady()) return;
    for (const feature of batch.added) this.upsertVessel(feature);
    for (const feature of batch.updated) this.upsertVessel(feature);
    for (const imo of batch.removed) this.removeVessel(imo);
  }

  private upsertVessel(feature: VesselFeature): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    const props = feature.properties;
    const [lon, lat] = feature.geometry.coordinates as unknown as [number, number];
    const colour = cesium.Color.fromCssColorString(
      RISK_COLORS[props.risk as keyof typeof RISK_COLORS] ?? RISK_COLORS.UNKNOWN,
    ).withAlpha(props.opacity);
    const position = cesium.Cartesian3.fromDegrees(lon, lat, 0);

    /*
     * Alert membership is read from the canonical feature, never from a
     * second alert store: `alertVisual` is projected by the same vessel
     * projection MapLibre reads.
     */
    const alerting =
      typeof (props as { alertVisual?: unknown }).alertVisual === "string" &&
      (props as { alertVisual?: string }).alertVisual !== "CLEARED";
    if (alerting) this.alertingImos.add(props.imo);
    else this.alertingImos.delete(props.imo);

    const existing = this.vesselEntities.get(props.imo);
    if (existing) {
      existing.position = position;
      existing.point.color = colour;
      existing.point.pixelSize = props.isSelected ? 16 : 11;
      existing.label.text = props.name;
      existing.label.show = this.visible.vessels && this.labelsRequested;
      existing.show = this.visible.vessels;
      if (alerting) this.paintAlert(props.imo, existing);
      return;
    }

    const entity = viewer.entities.add({
      id: `vessel:${props.imo}`,
      position,
      show: this.visible.vessels,
      point: {
        pixelSize: props.isSelected ? 16 : 11,
        color: colour,
        outlineColor: cesium.Color.WHITE.withAlpha(props.isStale ? 0.4 : 0.9),
        outlineWidth: props.isSelected ? 3 : 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: props.name,
        font: "12px sans-serif",
        fillColor: cesium.Color.WHITE,
        outlineColor: cesium.Color.BLACK,
        outlineWidth: 2,
        style: cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new cesium.Cartesian2(0, -18),
        show: this.visible.vessels && this.labelsRequested,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    this.vesselEntities.set(props.imo, entity);
    if (alerting) this.paintAlert(props.imo, entity);
  }

  /**
   * Drive the attention ring, one phase for the whole alerting set.
   *
   * Cesium has no data-driven paint expression, so the breath is applied
   * to the alerting entities only — the cost tracks the number of alerts,
   * not the size of the fleet. Reduced motion arrives here as a single
   * call at full strength, so the ring stays exactly as visible and
   * simply stops moving.
   */
  setAlertPulse(phase: number): void {
    this.alertPhase = Math.min(1, Math.max(0, phase));
    if (!this.isReady()) return;
    for (const imo of this.alertingImos) {
      const entity = this.vesselEntities.get(imo);
      if (entity) this.paintAlert(imo, entity);
    }
  }

  /** One alerting vessel, drawn at the current breath. */
  private paintAlert(imo: string, entity: Cesium): void {
    const cesium = this.cesium;
    if (!cesium || !entity?.point) return;
    try {
      // Radius and stroke both carry the phase, so the ring reads at a
      // glance without relying on colour alone.
      entity.point.outlineWidth = 2 + this.alertPhase * 4;
      entity.point.outlineColor = cesium.Color.fromCssColorString("#F59E0B").withAlpha(
        0.45 + this.alertPhase * 0.55,
      );
    } catch {
      // A pulse that cannot be painted is a missing emphasis, never a
      // missing vessel: the entity stays on the globe as drawn.
    }
  }

  // ── Intelligence Earth — presentation of the globe itself ───────────

  /** The earth settings currently in force. */
  getEarthSettings(): EarthSettings {
    return this.earth;
  }

  /**
   * Apply an earth-presentation change to the live scene.
   *
   * Every field is guarded: a Cesium build without a given knob (older
   * `verticalExaggeration`, no `imageryLayers`) must degrade to "that
   * control did nothing", never to a thrown mount and a blank map.
   */
  applyEarthSettings(next: Partial<EarthSettings>): EarthSettings {
    this.earth = {
      ...this.earth,
      ...next,
      terrainExaggeration: clampExaggeration(
        next.terrainExaggeration ?? this.earth.terrainExaggeration,
      ),
    };
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return this.earth;
    const scene = viewer.scene;
    const globe = scene?.globe;
    const settings = this.earth;

    try {
      if (globe) {
        globe.enableLighting = settings.dayNightLighting;
        globe.dynamicAtmosphereLighting = settings.dayNightLighting;
        globe.showGroundAtmosphere = settings.atmosphere;
        // Water is shaded from the terrain's own mask; without a normal
        // map Cesium draws still water, which reads as a painted sea.
        /*
         * Assigned only on change.
         *
         * Cesium re-fetches the normal map on every assignment, and a
         * second assignment while the first fetch is in flight throws
         * "The Resource is already being fetched" out of the render loop
         * — which stops rendering altogether and leaves a dead globe.
         * Earth settings are applied at mount and again from the panel,
         * so the same URL was being set twice within one frame.
         */
        const oceanUrl = settings.ocean
          ? `${this.baseUrl}Assets/Textures/waterNormalsSmall.jpg`
          : undefined;
        if (oceanUrl !== this.oceanNormalMapUrl) {
          this.oceanNormalMapUrl = oceanUrl;
          globe.oceanNormalMapUrl = oceanUrl;
        }
        if (cesium.Color?.fromCssColorString) {
          globe.baseColor = cesium.Color.fromCssColorString("#0B2A4A");
        }
      }
      if (scene?.skyAtmosphere) scene.skyAtmosphere.show = settings.atmosphere;
      if (scene?.fog) scene.fog.enabled = settings.atmosphere;
      if (scene?.sun) scene.sun.show = settings.dayNightLighting;
      if (scene?.moon) scene.moon.show = settings.dayNightLighting;
      if (this.satelliteLayer) this.satelliteLayer.show = settings.satelliteImagery;

      // Relief multiplier. 1 is true-to-life; 0 flattens without
      // unloading terrain, so the officer can compare the two.
      if (scene && "verticalExaggeration" in scene) {
        scene.verticalExaggeration = settings.terrainExaggeration;
      }

      if (settings.mode === "FLAT") scene?.morphTo2D?.(1.2);
      else scene?.morphTo3D?.(1.2);
    } catch (error) {
      this.bus.emit("map:error", {
        message: `The 3D earth settings could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }. The view is still live.`,
      } as never);
    }
    return this.earth;
  }

  /**
   * Performance budget: streamed detail, culled geometry, cached tiles.
   *
   * Set once at mount because these are engine budgets, not officer
   * choices — a control for "screen-space error" would be asking an
   * officer to tune a renderer.
   */
  private applyPerformanceBudget(): void {
    const viewer = this.viewer;
    const scene = viewer?.scene;
    const globe = scene?.globe;
    if (!globe) return;
    try {
      // LOD streaming: coarser tiles further away, refined as they matter.
      globe.maximumScreenSpaceError = 2;
      globe.tileCacheSize = 1000;
      // Frustum culling of tile subtrees, and no speculative siblings.
      globe.cullWithChildrenBounds = true;
      globe.preloadSiblings = false;
      globe.preloadAncestors = true;
      // Only redraw when the scene actually changed.
      if (scene && "requestRenderMode" in scene) {
        scene.requestRenderMode = true;
        scene.maximumRenderTimeChange = 0.5;
      }
      if (viewer.resolutionScale !== undefined) {
        viewer.resolutionScale = Math.min(
          1.5,
          typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1,
        );
      }
    } catch {
      // A build that rejects a budget knob still renders; the picture is
      // slower, not wrong.
    }
  }

  /**
   * Fly to a named preset, smoothly.
   *
   * The camera is still the shared one: the pose leaves on `map:move`
   * through the existing `moveEnd` listener, so SGS and the URL follow
   * the officer to Apapa exactly as they would after a drag.
   */
  flyToPreset(presetId: string): boolean {
    const cesium = this.cesium;
    const viewer = this.viewer;
    const preset = earthPreset(presetId);
    if (!cesium || !viewer || !preset) return false;
    viewer.camera.flyTo({
      destination: cesium.Cartesian3.fromDegrees(
        preset.center[0],
        preset.center[1],
        zoomToHeight(preset.zoom),
      ),
      orientation: {
        heading: cesium.Math.toRadians(preset.bearing),
        pitch: cesium.Math.toRadians(preset.pitch - 90),
        roll: 0,
      },
      duration: 2.4,
      easingFunction: cesium.EasingFunction?.QUADRATIC_IN_OUT,
    });
    return true;
  }

  private removeVessel(imo: string): void {
    const entity = this.vesselEntities.get(imo);
    if (!entity) return;
    this.viewer?.entities.remove(entity);
    this.vesselEntities.delete(imo);
    this.alertingImos.delete(imo);
  }

  async loadVesselIcons(): Promise<void> {
    // Cesium draws vessels as depth-tested points; no sprite atlas needed.
  }

  // ── Findings — the same independent overlay, in 3D ──────────────────

  setFindingIndicators(features: unknown): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    const collection = features as FindingIndicatorLike | null;
    for (const entity of this.findingEntities.values()) viewer.entities.remove(entity);
    this.findingEntities.clear();
    for (const feature of collection?.features ?? []) {
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties;
      const entity = viewer.entities.add({
        id: `finding:${props.findingId}`,
        position: cesium.Cartesian3.fromDegrees(lon, lat, 0),
        show: this.visible.findings,
        properties: { subjectType: props.subjectType, subjectId: props.subjectId },
        point: {
          pixelSize: 22,
          color: cesium.Color.TRANSPARENT,
          outlineColor: cesium.Color.fromCssColorString(props.colour).withAlpha(
            props.decided ? 0.45 : 1,
          ),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      this.findingEntities.set(props.findingId, entity);
    }
  }

  // ── Port Digital Twins — the estate, not the fleet ──────────────────

  /**
   * Replace the open twin's infrastructure overlay.
   *
   * Full replacement rather than a diff: a twin holds tens of assets, not
   * thousands of moving vessels, and it changes only when an officer opens
   * a different port or toggles a layer. Diffing would buy nothing and
   * risk leaving a stale asset behind under a switched-off layer.
   *
   * Assets with an indicative extent get a translucent ellipse *and* a
   * point: the ellipse carries the scale honestly (a chart-derived radius,
   * not a surveyed boundary) while the point stays pickable at any camera
   * distance, so a click always resolves to the asset rather than the
   * terrain beneath it.
   */
  setPortInfrastructure(features: unknown): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    const collection = features as PortInfrastructureLike | null;
    for (const entity of this.infrastructureEntities.values()) viewer.entities.remove(entity);
    this.infrastructureEntities.clear();
    for (const feature of collection?.features ?? []) {
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties;
      const colour = cesium.Color.fromCssColorString(props.colour);
      const entity = viewer.entities.add({
        id: `twin:${props.assetId}`,
        position: cesium.Cartesian3.fromDegrees(lon, lat, 0),
        properties: { twinId: props.twinId, layer: props.layer },
        point: {
          pixelSize: 13,
          color: colour.withAlpha(0.9),
          outlineColor: cesium.Color.WHITE.withAlpha(0.85),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: props.name,
          font: "500 12px Inter, system-ui, sans-serif",
          fillColor: cesium.Color.WHITE,
          outlineColor: colour,
          outlineWidth: 3,
          style: cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new cesium.Cartesian2(0, -20),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        ...(props.radiusKm !== null && props.radiusKm > 0
          ? {
              ellipse: {
                semiMinorAxis: props.radiusKm * 1000,
                semiMajorAxis: props.radiusKm * 1000,
                material: colour.withAlpha(0.16),
                outline: true,
                outlineColor: colour.withAlpha(0.7),
                height: 0,
              },
            }
          : {}),
      });
      this.infrastructureEntities.set(props.assetId, entity);
    }
  }

  // ── Maritime corridors — lane geography, not tracks ─────────────────

  /**
   * Replace the corridor overlay: arcs, density bands and risk zones.
   *
   * Full replacement, like the twin estate: a projection holds tens of
   * lanes, changes only when an officer toggles a corridor layer, and a
   * diff would risk leaving an arc behind under a switched-off layer.
   *
   * The arcs are drawn raised off the globe because a corridor is not a
   * course over ground that a vessel followed — the lift is the visual
   * grammar that keeps it from reading as an observed track, which is the
   * one thing a line between two ports must never be mistaken for.
   */
  setMaritimeCorridors(projection: unknown): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    const value = projection as CorridorProjectionLike | null;
    for (const entity of this.corridorEntities.values()) viewer.entities.remove(entity);
    this.corridorEntities.clear();

    for (const arc of value?.arcs ?? []) {
      const colour = cesium.Color.fromCssColorString(arc.colour);
      const flat: number[] = [];
      for (const [lon, lat, height] of arc.positions) flat.push(lon, lat, height);
      if (flat.length < 6) continue;
      const entity = viewer.entities.add({
        id: `corridor:${arc.corridorId}`,
        polyline: {
          positions: cesium.Cartesian3.fromDegreesArrayHeights(flat),
          width: arc.band ? 16 : 3,
          material: arc.band
            ? colour.withAlpha(0.16)
            : (glowMaterial(cesium, colour) ?? colour.withAlpha(0.9)),
          arcType: cesium.ArcType?.NONE,
        },
      });
      this.corridorEntities.set(`corridor:${arc.corridorId}`, entity);
    }

    for (const zone of value?.zones ?? []) {
      const colour = cesium.Color.fromCssColorString(zone.colour);
      const flat: number[] = [];
      for (const [lon, lat] of zone.ring) flat.push(lon, lat);
      if (flat.length < 6) continue;
      const entity = viewer.entities.add({
        id: `corridor-zone:${zone.zoneId}`,
        polygon: {
          hierarchy: cesium.Cartesian3.fromDegreesArray(flat),
          material: colour.withAlpha(0.14),
          outline: true,
          outlineColor: colour.withAlpha(0.75),
          height: 0,
        },
      });
      this.corridorEntities.set(`corridor-zone:${zone.zoneId}`, entity);
    }
    this.requestRender();
  }

  /**
   * Move the indicative transit markers to the current phase.
   *
   * Kept apart from the arcs so the animation clock never rebuilds the
   * lane geometry: positions are written onto existing entities, and only
   * a corridor entering or leaving the set adds or removes one.
   *
   * These markers are never keyed by IMO and never enter the vessel maps.
   * They are lane indicators, and their label says so.
   */
  setCorridorTransits(transits: unknown): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    const list = (transits as readonly CorridorTransitLike[] | null) ?? [];
    const incoming = new Set<string>();

    for (const transit of list) {
      incoming.add(transit.corridorId);
      const [lon, lat, height] = transit.position;
      const position = cesium.Cartesian3.fromDegrees(lon, lat, height);
      const colour = cesium.Color.fromCssColorString(transit.colour);
      const text = `${transit.label} · ${transit.etaLabel}`;
      const existing = this.transitEntities.get(transit.corridorId);
      if (existing) {
        existing.position = position;
        if (existing.label) existing.label.text = text;
        continue;
      }
      const entity = viewer.entities.add({
        id: `corridor-transit:${transit.corridorId}`,
        position,
        point: {
          pixelSize: 9,
          color: colour.withAlpha(0.95),
          outlineColor: cesium.Color.WHITE.withAlpha(0.85),
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text,
          font: "500 11px Inter, system-ui, sans-serif",
          fillColor: cesium.Color.WHITE,
          outlineColor: colour,
          outlineWidth: 3,
          style: cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new cesium.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      this.transitEntities.set(transit.corridorId, entity);
    }

    for (const [corridorId, entity] of [...this.transitEntities.entries()]) {
      if (incoming.has(corridorId)) continue;
      viewer.entities.remove(entity);
      this.transitEntities.delete(corridorId);
    }
    this.requestRender();
  }

  /**
   * Ask for a frame.
   *
   * `requestRenderMode` is on for the performance budget, so an entity
   * written outside Cesium's own event path would otherwise not appear
   * until something else moved the camera.
   */
  private requestRender(): void {
    try {
      this.viewer?.scene?.requestRender?.();
    } catch {
      // A scene that refuses the request is still rendering on its own
      // schedule; the overlay appears on the next frame.
    }
  }

  /** The selected vessel's recorded movement, drawn as a polyline. */
  setVesselTrack(collection: unknown): void {
    const cesium = this.cesium;
    const viewer = this.viewer;
    if (!cesium || !viewer) return;
    if (this.trackEntity) {
      viewer.entities.remove(this.trackEntity);
      this.trackEntity = null;
    }
    const points = extractTrackPositions(collection);
    if (points.length < 2) return;
    this.trackEntity = viewer.entities.add({
      id: "vessel-track",
      show: this.visible.track,
      polyline: {
        positions: cesium.Cartesian3.fromDegreesArray(points.flat()),
        width: 2,
        material: cesium.Color.fromCssColorString("#38BDF8").withAlpha(0.85),
        clampToGround: false,
      },
    });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Cesium's widget stylesheet, added once.
 *
 * Injected rather than `import`ed so the MapLibre path never loads it and
 * SSR never evaluates a browser-only asset.
 */
function ensureWidgetStylesheet(baseUrl: string): void {
  if (typeof document === "undefined") return;
  const id = "cesium-widgets-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `${baseUrl}Widgets/widgets.css`;
  document.head.appendChild(link);
}

/** Web-mercator zoom ↔ camera height, so one camera model serves both engines. */
function zoomToHeight(zoom: number): number {
  return 40_075_016.686 / Math.pow(2, zoom) / 2;
}

function heightToZoom(height: number): number {
  const zoom = Math.log2(40_075_016.686 / (height * 2));
  return Number.isFinite(zoom) ? Math.max(0, Math.min(22, zoom)) : 6;
}

function extractTrackPositions(collection: unknown): [number, number][] {
  const value = collection as
    | { features?: { geometry?: { type?: string; coordinates?: unknown } }[] }
    | null
    | undefined;
  const out: [number, number][] = [];
  for (const feature of value?.features ?? []) {
    const coords = feature.geometry?.coordinates;
    if (feature.geometry?.type === "LineString" && Array.isArray(coords)) {
      for (const pair of coords as [number, number][]) {
        if (Array.isArray(pair) && pair.length >= 2) out.push([pair[0], pair[1]]);
      }
    }
  }
  return out;
}

/**
 * A glowing polyline material, when the build offers one.
 *
 * Guarded rather than assumed: a Cesium build without the property should
 * cost the corridor its glow, never its line. Returns null so the caller
 * falls back to a flat colour.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Cesium is loaded dynamically. */
function glowMaterial(cesium: any, colour: any): unknown | null {
  try {
    if (!cesium?.PolylineGlowMaterialProperty) return null;
    return new cesium.PolylineGlowMaterialProperty({ color: colour, glowPower: 0.18, taperPower: 1 });
  } catch {
    return null;
  }
}
