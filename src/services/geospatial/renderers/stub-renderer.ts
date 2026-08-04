/**
 * GIP — Stub map renderer.
 *
 * A complete, dependency-free {@link MapRenderer} that maintains all the
 * bookkeeping a real engine would, but draws nothing.
 *
 * It is not dead code. It is what lets the entire geospatial stack — SGS,
 * layer registry, update engine, event bus, layer panel — be exercised in
 * unit tests, during SSR, and in environments without a WebGL context, and
 * it is the default renderer until `maplibre-gl` is installed. Because it
 * records every instruction it receives, tests can assert on exactly what
 * the map *would* have drawn.
 */
import type { MapEventBus } from "../event-bus";
import type {
  MapCamera,
  MapRenderer,
  MapRendererDependencies,
  MapRendererMountOptions,
  VesselFeatureCollection,
  VesselRenderBatch,
} from "../renderer";
import type { VesselFeature } from "../vessel";

export class StubMapRenderer implements MapRenderer {
  readonly id: string = "stub";

  protected bus: MapEventBus | null;
  protected camera: MapCamera | null = null;
  protected ready = false;
  protected destroyed = false;

  /** Visibility per render-layer id, as last instructed. */
  readonly layerVisibility = new Map<string, boolean>();
  /** Vessel features currently in the source, keyed by IMO. */
  readonly vessels = new Map<string, VesselFeature>();
  /** Every batch received, in order — for assertions about incrementality. */
  readonly batches: VesselRenderBatch[] = [];
  /** Count of full-source replacements, to prove refreshes stay incremental. */
  fullReplacements = 0;
  iconsLoaded = false;

  constructor(dependencies?: Partial<MapRendererDependencies>) {
    this.bus = dependencies?.bus ?? null;
  }

  mount(options: MapRendererMountOptions): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("Renderer has been destroyed"));
    this.camera = {
      center: options.center,
      zoom: options.zoom,
      pitch: 0,
      bearing: 0,
    };
    this.ready = true;
    this.bus?.emit("map:ready", { renderer: this.id });
    return Promise.resolve();
  }

  destroy(): void {
    this.ready = false;
    this.destroyed = true;
    this.vessels.clear();
    this.layerVisibility.clear();
  }

  isReady(): boolean {
    return this.ready;
  }

  setCamera(camera: Partial<MapCamera>): void {
    const base: MapCamera = this.camera ?? { center: [0, 0], zoom: 0, pitch: 0, bearing: 0 };
    this.camera = { ...base, ...camera };
  }

  getCamera(): MapCamera | null {
    return this.camera;
  }

  setLayerVisibility(renderLayerId: string, visible: boolean): void {
    this.layerVisibility.set(renderLayerId, visible);
    this.bus?.emit("layer:visibility", { layerId: renderLayerId, visible });
  }

  setVesselData(collection: VesselFeatureCollection): void {
    this.fullReplacements += 1;
    this.vessels.clear();
    for (const feature of collection.features) {
      this.vessels.set(feature.properties.imo, feature);
    }
  }

  patchVessels(batch: VesselRenderBatch): void {
    this.batches.push(batch);
    for (const feature of batch.added) this.vessels.set(feature.properties.imo, feature);
    for (const feature of batch.updated) this.vessels.set(feature.properties.imo, feature);
    for (const imo of batch.removed) this.vessels.delete(imo);
  }

  loadVesselIcons(): Promise<void> {
    this.iconsLoaded = true;
    return Promise.resolve();
  }
}
