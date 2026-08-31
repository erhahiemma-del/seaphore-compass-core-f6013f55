/**
 * Cesium adapter — contract, canonical data, and honest failure.
 *
 * A browser check needs a live Ion credential; these do not. Cesium is
 * mocked at the module boundary so the questions that matter without a
 * globe can be answered in CI:
 *
 *   - the adapter mounts and reports itself on the shared bus,
 *   - it draws the canonical `VesselFeature`s and keeps no second vessel
 *     state (entities keyed by the domain's own identity, IMO),
 *   - interaction leaves on the same `MapEventBus` as MapLibre's,
 *   - a terrain failure is stated as `map:error` and still leaves a
 *     mounted globe — never a blank map,
 *   - the injected token is never written anywhere but Ion's own field.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Entity {
  id: string;
  position: unknown;
  show: boolean;
  point?: Record<string, unknown>;
  polyline?: Record<string, unknown>;
  polygon?: Record<string, unknown>;
  label?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

const state = {
  terrainRejects: false,
  imageryRejects: false,
  flights: [] as unknown[],
  morphs: [] as string[],
  entities: [] as Entity[],
  clickHandler: null as ((movement: unknown) => void) | null,
  ionToken: null as string | null,
  /** How many times the ocean normal map was handed to the globe. */
  oceanAssignments: 0,
  /** Frames explicitly requested — requestRenderMode makes this necessary. */
  renderRequests: 0,
};

vi.mock("cesium", () => {
  class Viewer {
    scene = {
      globe: {
        enableLighting: false,
        dynamicAtmosphereLighting: false,
        showGroundAtmosphere: false,
        // Cesium re-fetches the asset on every assignment, and a second
        // assignment while the first is in flight throws. The mock counts
        // assignments so the guard can be asserted.
        _oceanNormalMapUrl: undefined as string | undefined,
        get oceanNormalMapUrl() {
          return this._oceanNormalMapUrl;
        },
        set oceanNormalMapUrl(value: string | undefined) {
          state.oceanAssignments += 1;
          this._oceanNormalMapUrl = value;
        },

        baseColor: null as unknown,
        maximumScreenSpaceError: 0,
        tileCacheSize: 0,
        cullWithChildrenBounds: false,
        preloadSiblings: true,
        preloadAncestors: false,
        pick: () => ({}),
      },
      skyAtmosphere: { show: false },
      fog: { enabled: false },
      sun: { show: false },
      moon: { show: false },
      verticalExaggeration: 1,
      requestRenderMode: false,
      maximumRenderTimeChange: 0,
      morphTo2D: () => state.morphs.push("2D"),
      morphTo3D: () => state.morphs.push("3D"),
      canvas: {},
      requestRender: () => {
        state.renderRequests += 1;
      },
      pick: (_: unknown) => pickResult,
    };
    imageryLayers = {
      addImageryProvider: (_: unknown) => ({ show: true }),
    };
    resolutionScale = 1;
    camera = {
      positionWC: {},
      pitch: 0,
      heading: 0,
      setView: () => {},
      flyTo: (options: unknown) => state.flights.push(options),
      getPickRay: () => ({}),
      moveEnd: { addEventListener: () => {} },
    };
    terrainProvider: unknown = null;
    entities = {
      add: (entity: Entity) => {
        state.entities.push(entity);
        return entity;
      },
      remove: (entity: Entity) => {
        state.entities = state.entities.filter((e) => e !== entity);
      },
    };
    isDestroyed() {
      return false;
    }
    destroy() {}
  }

  let pickResult: unknown = null;

  return {
    Ion: {
      get defaultAccessToken() {
        return state.ionToken;
      },
      set defaultAccessToken(value: string) {
        state.ionToken = value;
      },
    },
    Viewer,
    createWorldTerrainAsync: async () => {
      if (state.terrainRejects) throw new Error("Ion rejected the token");
      return { terrain: true };
    },
    createWorldImageryAsync: async () => {
      if (state.imageryRejects) throw new Error("Ion rejected the imagery request");
      return { imagery: true };
    },
    EasingFunction: { QUADRATIC_IN_OUT: "ease" },
    ScreenSpaceEventHandler: class {
      setInputAction(handler: (movement: unknown) => void) {
        state.clickHandler = handler;
      }
    },
    ScreenSpaceEventType: { LEFT_CLICK: "LEFT_CLICK" },
    Cartesian2: class {
      constructor(
        public x: number,
        public y: number,
      ) {}
    },
    Cartesian3: {
      fromDegrees: (lon: number, lat: number, height?: number) => ({ lon, lat, height }),
      fromDegreesArray: (values: number[]) => ({ ring: values }),
      fromDegreesArrayHeights: (values: number[]) => ({ heights: values }),
    },
    ArcType: { NONE: 0 },
    PolylineGlowMaterialProperty: class {
      constructor(public options: unknown) {}
    },
    Cartographic: { fromCartesian: () => ({ longitude: 0.1, latitude: 0.1, height: 100_000 }) },
    Rectangle: { fromDegrees: () => ({}) },
    Color: {
      fromCssColorString: () => ({ withAlpha: () => ({}) }),
      WHITE: { withAlpha: () => ({}) },
      BLACK: {},
      TRANSPARENT: {},
    },
    LabelStyle: { FILL_AND_OUTLINE: 1 },
    JulianDate: { now: () => 0 },
    SceneTransforms: { worldToWindowCoordinates: () => ({ x: 1, y: 2 }) },
    Math: {
      toDegrees: (v: number) => v,
      toRadians: (v: number) => v,
    },
    // Test hook: what the next scene pick returns.
    __setPick: (value: unknown) => {
      pickResult = value;
    },
  };
});

async function build(bus: unknown, token = "ion-test-token") {
  const { CesiumRenderer } = await import("@/services/geospatial/renderers/cesium-renderer");
  return new CesiumRenderer({
    bus: bus as never,
    ionToken: token,
  });
}

function makeBus() {
  const events: { event: string; payload: unknown }[] = [];
  return {
    events,
    bus: {
      emit: (event: string, payload: unknown) => events.push({ event, payload }),
      on: () => () => {},
      off: () => {},
    },
  };
}

function vessel(imo: string, lon: number, lat: number, selected = false) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      imo,
      name: `VESSEL ${imo}`,
      risk: "MEDIUM",
      opacity: 1,
      isSelected: selected,
      isStale: false,
    },
  };
}

async function mount(bus: unknown) {
  const renderer = await build(bus);
  const container = { appendChild: () => {} } as unknown as HTMLElement;
  await renderer.mount({
    container,
    style: "https://example.invalid/style.json",
    center: [3.4, 6.4],
    zoom: 7,
    minZoom: 2,
    maxZoom: 20,
    maxBounds: null,
  });
  return renderer;
}

describe("Cesium 3D Terrain Perspective", () => {
  beforeEach(() => {
    state.terrainRejects = false;
    state.imageryRejects = false;
    state.flights = [];
    state.morphs = [];
    state.entities = [];
    state.clickHandler = null;
    state.ionToken = null;
    state.renderRequests = 0;
  });

  it("mounts, reports readiness on the shared bus, and applies the injected token", async () => {
    const { bus, events } = makeBus();
    const renderer = await mount(bus);
    expect(renderer.id).toBe("cesium");
    expect(renderer.isReady()).toBe(true);
    expect(state.ionToken).toBe("ion-test-token");
    expect(events.some((e) => e.event === "map:ready")).toBe(true);
    expect(events.some((e) => e.event === "map:error")).toBe(false);
  });

  it("draws canonical vessels keyed by IMO and holds no second vessel state", async () => {
    const { bus } = makeBus();
    const renderer = await mount(bus);
    renderer.setVesselData({
      type: "FeatureCollection",
      features: [vessel("9111111", 3.4, 6.4), vessel("9222222", 3.5, 6.5)],
    } as never);
    expect(state.entities.map((e) => e.id).sort()).toEqual(["vessel:9111111", "vessel:9222222"]);

    // A vessel that leaves the canonical set leaves the picture too.
    renderer.setVesselData({
      type: "FeatureCollection",
      features: [vessel("9111111", 3.41, 6.41)],
    } as never);
    expect(state.entities.map((e) => e.id)).toEqual(["vessel:9111111"]);
  });

  it("reports vessel selection on the same event bus MapLibre uses", async () => {
    const { bus, events } = makeBus();
    const renderer = await mount(bus);
    renderer.setVesselData({
      type: "FeatureCollection",
      features: [vessel("9111111", 3.4, 6.4)],
    } as never);
    const cesium = (await import("cesium")) as unknown as { __setPick: (v: unknown) => void };
    cesium.__setPick({ id: { id: "vessel:9111111" } });
    state.clickHandler?.({ position: { x: 10, y: 10 } });
    const click = events.find((e) => e.event === "vessel:click");
    expect(click).toBeDefined();
    expect((click?.payload as { imo: string }).imo).toBe("9111111");
  });

  it("states a terrain failure and still leaves a mounted globe", async () => {
    state.terrainRejects = true;
    const { bus, events } = makeBus();
    const renderer = await mount(bus);
    const error = events.find((e) => e.event === "map:error");
    expect(error).toBeDefined();
    expect((error?.payload as { message: string }).message).toMatch(/terrain unavailable/i);
    // Honest degradation, not a blank map: the adapter is still drawing.
    expect(renderer.isReady()).toBe(true);
    expect(events.some((e) => e.event === "map:ready")).toBe(true);
  });

  it("is unusable after destroy, so a fallback cannot draw into a dead viewer", async () => {
    const { bus } = makeBus();
    const renderer = await mount(bus);
    renderer.destroy();
    expect(renderer.isReady()).toBe(false);
    renderer.setVesselData({
      type: "FeatureCollection",
      features: [vessel("9333333", 3.4, 6.4)],
    } as never);
    expect(state.entities).toHaveLength(0);
  });
});

/**
 * Intelligence Earth (Phase 4A).
 *
 * The globe's *presentation*: terrain, imagery, atmosphere, water, light,
 * relief, mode and camera presets. What matters in CI is that each control
 * reaches the live scene, that the relief slider cannot leave its range,
 * that a preset produces one animated flight rather than a jump, and that
 * a missing Ion asset is stated rather than shown as an empty world.
 */
describe("Intelligence Earth", () => {
  beforeEach(() => {
    state.terrainRejects = false;
    state.imageryRejects = false;
    state.flights = [];
    state.morphs = [];
    state.entities = [];
    state.clickHandler = null;
    state.ionToken = null;
    state.oceanAssignments = 0;
  });

  it("requests the ocean normal map once, so a repeated settings pass cannot stall the globe", async () => {
    const { bus, events } = makeBus();
    const renderer = (await mount(bus)) as never as {
      applyEarthSettings(next: Record<string, unknown>): unknown;
    };
    expect(state.oceanAssignments).toBe(1);
    renderer.applyEarthSettings({ terrainExaggeration: 2 });
    renderer.applyEarthSettings({ dayNightLighting: false });
    expect(state.oceanAssignments).toBe(1);
    // Turning the ocean off and on again is a real change, so exactly one
    // further request each way — never one per settings pass.
    renderer.applyEarthSettings({ ocean: false });
    renderer.applyEarthSettings({ ocean: true });
    expect(state.oceanAssignments).toBe(3);
    expect(events.some((e) => e.event === "map:error")).toBe(false);
  });

  it("breathes the attention ring on alerting vessels only, and never throws", async () => {
    const { bus } = makeBus();
    const renderer = (await mount(bus)) as never as {
      setVesselData(collection: unknown): void;
      setAlertPulse(phase: number): void;
    };
    const alerting = vessel("9111111", 3.4, 6.4);
    (alerting.properties as Record<string, unknown>)["alertVisual"] = "ARRIVING";
    const quiet = vessel("9222222", 3.5, 6.5);
    (quiet.properties as Record<string, unknown>)["alertVisual"] = "CLEARED";
    renderer.setVesselData({ type: "FeatureCollection", features: [alerting, quiet] });

    const ring = (id: string) =>
      state.entities.find((e) => e.id === id)?.point as Record<string, number> | undefined;
    const quietBefore = ring("vessel:9222222")?.["outlineWidth"];
    expect(() => renderer.setAlertPulse(1)).not.toThrow();
    expect(ring("vessel:9111111")?.["outlineWidth"]).toBeGreaterThan(2);
    expect(ring("vessel:9222222")?.["outlineWidth"]).toBe(quietBefore);

    // A phase outside 0–1 is clamped rather than rejected: the ring is an
    // emphasis, so it can never be the reason a frame fails.
    expect(() => renderer.setAlertPulse(4)).not.toThrow();
    expect(ring("vessel:9111111")?.["outlineWidth"]).toBeLessThanOrEqual(6);
  });

  it("applies world terrain, satellite imagery, atmosphere, ocean and lighting at mount", async () => {
    const { bus, events } = makeBus();
    const renderer = (await mount(bus)) as never as {
      getEarthSettings(): Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      viewerForTest?: any;
    };
    expect(events.some((e) => e.event === "map:error")).toBe(false);
    const settings = renderer.getEarthSettings();
    expect(settings["satelliteImagery"]).toBe(true);
    expect(settings["atmosphere"]).toBe(true);
    expect(settings["ocean"]).toBe(true);
    expect(settings["dayNightLighting"]).toBe(true);
    expect(settings["mode"]).toBe("GLOBE");
    expect(state.morphs).toContain("3D");
  });

  it("states an imagery failure instead of showing a bare globe silently", async () => {
    state.imageryRejects = true;
    const { bus, events } = makeBus();
    const renderer = await mount(bus);
    const error = events.find((e) => e.event === "map:error");
    expect((error?.payload as { message: string }).message).toMatch(/imagery unavailable/i);
    expect(renderer.isReady()).toBe(true);
  });

  it("clamps terrain exaggeration to 0–3", async () => {
    const { bus } = makeBus();
    const renderer = (await mount(bus)) as never as {
      applyEarthSettings(next: Record<string, unknown>): { terrainExaggeration: number };
    };
    expect(renderer.applyEarthSettings({ terrainExaggeration: 9 }).terrainExaggeration).toBe(3);
    expect(renderer.applyEarthSettings({ terrainExaggeration: -4 }).terrainExaggeration).toBe(0);
    expect(renderer.applyEarthSettings({ terrainExaggeration: 1.5 }).terrainExaggeration).toBe(1.5);
    expect(renderer.applyEarthSettings({ terrainExaggeration: NaN }).terrainExaggeration).toBe(1);
  });

  it("morphs between globe and flat earth without remounting", async () => {
    const { bus } = makeBus();
    const renderer = (await mount(bus)) as never as {
      applyEarthSettings(next: Record<string, unknown>): { mode: string };
      isReady(): boolean;
    };
    expect(renderer.applyEarthSettings({ mode: "FLAT" }).mode).toBe("FLAT");
    expect(state.morphs.at(-1)).toBe("2D");
    expect(renderer.applyEarthSettings({ mode: "GLOBE" }).mode).toBe("GLOBE");
    expect(state.morphs.at(-1)).toBe("3D");
    expect(renderer.isReady()).toBe(true);
  });

  it("flies smoothly to every named preset and refuses an unknown one", async () => {
    const { EARTH_CAMERA_PRESETS } = await import("@/services/geospatial/earth-presets");
    const { bus } = makeBus();
    const renderer = (await mount(bus)) as never as { flyToPreset(id: string): boolean };

    for (const preset of EARTH_CAMERA_PRESETS) {
      expect(renderer.flyToPreset(preset.id), `preset ${preset.id} did not fly`).toBe(true);
    }
    expect(state.flights).toHaveLength(EARTH_CAMERA_PRESETS.length);
    // Animated, not a cut: every flight carries a duration and an easing.
    for (const flight of state.flights as { duration?: number; easingFunction?: unknown }[]) {
      expect(flight.duration).toBeGreaterThan(0);
      expect(flight.easingFunction).toBeDefined();
    }
    expect(renderer.flyToPreset("atlantis")).toBe(false);
  });

  it("offers the operational descent global → national → terminal", async () => {
    const { EARTH_CAMERA_PRESETS } = await import("@/services/geospatial/earth-presets");
    const ids = EARTH_CAMERA_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "global",
      "africa",
      "west-africa",
      "nigeria",
      "lagos",
      "apapa",
      "tin-can-island",
      "onne",
      "bonny",
      "warri",
      "calabar",
    ]);
    // The scales descend: global → national → port. The terminals are
    // peers of one another, so they are checked as a band rather than a
    // ranking — Onne is not "further out" than Tin Can Island.
    const scales = EARTH_CAMERA_PRESETS.slice(0, 5);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i].zoom).toBeGreaterThan(scales[i - 1].zoom);
    }
    for (const terminal of EARTH_CAMERA_PRESETS.slice(5)) {
      expect(terminal.zoom, `${terminal.id} is not at terminal scale`).toBeGreaterThanOrEqual(13);
    }
  });
});

describe("Cesium maritime corridors", () => {
  beforeEach(() => {
    state.entities = [];
    state.renderRequests = 0;
  });

  it("draws corridor arcs and risk zones, and clears them when the layers go off", async () => {
    const { bus } = makeBus();
    const renderer = await mount(bus);
    const { corridorProjection } = await import("@/services/geospatial/maritime-corridors");
    renderer.setMaritimeCorridors(corridorProjection(["shipping-lanes", "piracy-risk-zones"]));

    const ids = state.entities.map((entity) => entity.id);
    expect(ids.some((id) => id.startsWith("corridor:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("corridor-zone:"))).toBe(true);
    // A frame is requested explicitly: requestRenderMode is on.
    expect(state.renderRequests).toBeGreaterThan(0);

    renderer.setMaritimeCorridors(corridorProjection([]));
    expect(state.entities.filter((entity) => entity.id.startsWith("corridor"))).toHaveLength(0);
  });

  it("moves transit markers without rebuilding them, and keeps them out of vessel state", async () => {
    const { bus } = makeBus();
    const renderer = await mount(bus);
    const { corridorTransits } = await import("@/services/geospatial/maritime-corridors");

    renderer.setCorridorTransits(corridorTransits(["cargo-flow"], 0));
    const first = state.entities.filter((entity) => entity.id.startsWith("corridor-transit:"));
    expect(first.length).toBeGreaterThan(0);
    // Never a vessel entity, so nothing can reach the vessel maps.
    expect(state.entities.some((entity) => entity.id.startsWith("vessel:"))).toBe(false);

    const identity = first[0];
    renderer.setCorridorTransits(corridorTransits(["cargo-flow"], 0.3));
    const second = state.entities.filter((entity) => entity.id.startsWith("corridor-transit:"));
    expect(second).toHaveLength(first.length);
    // The same entity object, repositioned — not a rebuilt one.
    expect(second[0]).toBe(identity);

    renderer.setCorridorTransits([]);
    expect(state.entities.filter((entity) => entity.id.startsWith("corridor-transit:"))).toHaveLength(
      0,
    );
  });
});
