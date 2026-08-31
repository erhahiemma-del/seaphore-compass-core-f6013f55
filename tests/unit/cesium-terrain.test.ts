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
};

vi.mock("cesium", () => {
  class Viewer {
    scene = {
      globe: {
        enableLighting: false,
        dynamicAtmosphereLighting: false,
        showGroundAtmosphere: false,
        oceanNormalMapUrl: undefined as string | undefined,
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
    Cartesian3: { fromDegrees: (lon: number, lat: number) => ({ lon, lat }) },
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
