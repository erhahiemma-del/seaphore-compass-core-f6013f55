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
  private trackEntity: Cesium | null = null;
  private readonly visible: Record<Group, boolean> = {
    vessels: true,
    vesselLabels: true,
    findings: true,
    track: true,
  };
  private labelsRequested = true;

  /** How the earth is drawn. Presentation state, and the only copy of it. */
  private earth: EarthSettings = DEFAULT_EARTH_SETTINGS;
  private satelliteLayer: Cesium | null = null;

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
    this.findingEntities.clear();
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

    const existing = this.vesselEntities.get(props.imo);
    if (existing) {
      existing.position = position;
      existing.point.color = colour;
      existing.point.pixelSize = props.isSelected ? 16 : 11;
      existing.label.text = props.name;
      existing.label.show = this.visible.vessels && this.labelsRequested;
      existing.show = this.visible.vessels;
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
  }

  private removeVessel(imo: string): void {
    const entity = this.vesselEntities.get(imo);
    if (!entity) return;
    this.viewer?.entities.remove(entity);
    this.vesselEntities.delete(imo);
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
