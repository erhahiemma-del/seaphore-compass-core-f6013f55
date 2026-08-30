import { describe, expect, it } from "vitest";

import {
  MapEventBus,
  StubMapRenderer,
  VESSEL_COLOR_KEYS,
  VESSEL_SPRITE_COLORS,
  VesselUpdateEngine,
  vesselIconId,
  vesselSpriteIds,
  type MapRenderer,
  type Vessel,
} from "@/services/geospatial";
import { NIGERIA_BOUNDS } from "@/services/geospatial";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function vessel(imo: string, overrides: Partial<Vessel> = {}): Vessel {
  return {
    identity: { imo, name: `Vessel ${imo}` },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 90,
      speed: 12,
      timestamp: new Date(NOW).toISOString(),
    },
    riskLevel: "LOW",
    attentionScore: 0,
    ...overrides,
  };
}

/**
 * Sprite ids are produced in one module and registered in another. A mismatch
 * renders nothing at all — MapLibre silently skips features naming an
 * unregistered sprite — so this assertion is load-bearing.
 */
describe("vessel sprite registry", () => {
  const RISKS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "CLEAN", "UNKNOWN"] as const;

  const REGISTERED = new Set(vesselSpriteIds());

  it("registers a sprite for every risk band vesselIconId can produce", () => {
    for (const risk of RISKS) {
      const id = vesselIconId(vessel("1", { riskLevel: risk }), { now: NOW });
      expect(REGISTERED, `missing sprite for risk ${risk}`).toContain(id);
    }
  });

  it("registers the selected sprite", () => {
    const id = vesselIconId(vessel("1"), { now: NOW, selectedImo: "1" });
    // No type reported on the fixture, so the hull family is the generic hull.
    expect(id).toBe("vessel-selected-hull");
    expect(REGISTERED).toContain(id);
  });

  /*
   * Staleness is carried by opacity, not by colour: a hull that has not
   * reported for an hour is still the same kind of hull, and recolouring
   * it would lose the type to say something the fade already says.
   */
  it("keeps stale vessels on their own category sprite", () => {
    const stale = vessel("1", {
      position: { ...vessel("1").position, timestamp: new Date(NOW - 3_600_000).toISOString() },
    });
    const id = vesselIconId(stale, { now: NOW });
    expect(id).toBe("vessel-unknown-hull");
    expect(REGISTERED).toContain(id);
  });

  it("gives every sprite colour a hex value", () => {
    for (const [key, color] of Object.entries(VESSEL_SPRITE_COLORS)) {
      expect(color, `sprite colour ${key} is not a hex value`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("covers every colour key the sprite ids use", () => {
    for (const key of VESSEL_COLOR_KEYS) {
      expect(VESSEL_SPRITE_COLORS, `no colour registered for ${key}`).toHaveProperty(key);
    }
  });
});

describe("MapRenderer contract", () => {
  /**
   * Exercised against the stub. The MapLibre adapter satisfies the same
   * interface by construction (`implements MapRenderer`), and its
   * WebGL-dependent behaviour is covered by the manual acceptance tests.
   */
  function contractFor(renderer: MapRenderer) {
    return {
      hasRequiredMethods() {
        expect(typeof renderer.mount).toBe("function");
        expect(typeof renderer.destroy).toBe("function");
        expect(typeof renderer.isReady).toBe("function");
        expect(typeof renderer.setCamera).toBe("function");
        expect(typeof renderer.getCamera).toBe("function");
        expect(typeof renderer.setLayerVisibility).toBe("function");
        expect(typeof renderer.setVesselData).toBe("function");
        expect(typeof renderer.patchVessels).toBe("function");
        expect(typeof renderer.loadVesselIcons).toBe("function");
      },
    };
  }

  it("the stub renderer satisfies every required method", () => {
    contractFor(new StubMapRenderer()).hasRequiredMethods();
  });

  it("reports not-ready before mount", () => {
    expect(new StubMapRenderer().isReady()).toBe(false);
  });

  it("emits map:ready on the bus after mount", async () => {
    const bus = new MapEventBus();
    const events: string[] = [];
    bus.on("map:ready", (payload) => events.push(payload.renderer));
    const renderer = new StubMapRenderer({ bus });

    await renderer.mount({
      container: {} as HTMLElement,
      style: "test",
      center: [3.5, 4.5],
      zoom: 6,
      minZoom: 4,
      maxZoom: 18,
      maxBounds: [
        [-10, -4],
        [20, 14],
      ],
    });

    expect(renderer.isReady()).toBe(true);
    expect(events).toEqual(["stub"]);
  });

  it("refuses to mount after destroy", async () => {
    const renderer = new StubMapRenderer();
    renderer.destroy();

    await expect(
      renderer.mount({
        container: {} as HTMLElement,
        style: "test",
        center: [0, 0],
        zoom: 6,
        minZoom: 4,
        maxZoom: 18,
        maxBounds: [
          [-10, -4],
          [20, 14],
        ],
      }),
    ).rejects.toThrow(/destroyed/i);
  });

  it("records visibility instructions per render layer", () => {
    const renderer = new StubMapRenderer();

    renderer.setLayerVisibility("vessels-layer", true);
    renderer.setLayerVisibility("ports-layer", false);

    expect(renderer.layerVisibility.get("vessels-layer")).toBe(true);
    expect(renderer.layerVisibility.get("ports-layer")).toBe(false);
  });
});

describe("incremental rendering guarantee", () => {
  it("moving one vessel produces one batch and no full replacement", () => {
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    engine.applyFull([vessel("1"), vessel("2"), vessel("3")]);
    const replacementsAfterLoad = renderer.fullReplacements;
    renderer.batches.length = 0;

    engine.applyPatch({
      ...vessel("2"),
      position: { ...vessel("2").position, lon: 4.9 },
    });

    expect(renderer.batches).toHaveLength(1);
    expect(renderer.batches[0].updated).toHaveLength(1);
    expect(renderer.batches[0].added).toHaveLength(0);
    expect(renderer.batches[0].removed).toHaveLength(0);
    // The whole layer was never rebuilt.
    expect(renderer.fullReplacements).toBe(replacementsAfterLoad);
  });

  it("scales to a large fleet without a full rebuild per update", () => {
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    const fleet = Array.from({ length: 2_000 }, (_, i) =>
      vessel(String(i), {
        position: { ...vessel("0").position, lon: 3 + (i % 100) / 100 },
      }),
    );
    engine.applyFull(fleet);
    const replacements = renderer.fullReplacements;
    renderer.batches.length = 0;

    // Ten vessels report new positions.
    for (let i = 0; i < 10; i++) {
      engine.applyPatch({
        ...fleet[i],
        position: { ...fleet[i].position, lat: 6.5 + i / 1000 },
      });
    }

    expect(renderer.batches).toHaveLength(10);
    expect(renderer.batches.every((batch) => batch.updated.length === 1)).toBe(true);
    expect(renderer.fullReplacements).toBe(replacements);
    expect(engine.size).toBe(2_000);
  });
});

describe("NIGERIA_BOUNDS", () => {
  it("frames Nigerian waters and is well-ordered", () => {
    const [[west, south], [east, north]] = NIGERIA_BOUNDS;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    // Contains Apapa (3.42, 6.43) and Calabar (8.32, 4.95).
    expect(west).toBeLessThan(3.42);
    expect(east).toBeGreaterThan(8.32);
    expect(south).toBeLessThan(4.95);
    expect(north).toBeGreaterThan(6.43);
  });
});
