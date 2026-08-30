import { describe, expect, it, vi } from "vitest";

import {
  MapEventBus,
  StubMapRenderer,
  TIMING,
  VesselUpdateEngine,
  diffVessels,
  isStale,
  normalizeHeading,
  toVesselFeature,
  type Vessel,
} from "@/services/geospatial";

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

function moved(base: Vessel, lon: number): Vessel {
  return { ...base, position: { ...base.position, lon } };
}

describe("diffVessels", () => {
  it("reports everything as added against an empty set", () => {
    const diff = diffVessels(new Map(), [vessel("1"), vessel("2")]);

    expect(diff.added).toHaveLength(2);
    expect(diff.updated).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("reports a vessel that moved as updated", () => {
    const existing = vessel("1");
    const current = new Map([["1", existing]]);

    const diff = diffVessels(current, [moved(existing, 4.0)]);

    expect(diff.updated).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });

  it("reports an identical vessel as unchanged", () => {
    const existing = vessel("1");

    const diff = diffVessels(new Map([["1", existing]]), [vessel("1")]);

    expect(diff.unchanged).toBe(1);
    expect(diff.updated).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
  });

  it("reports a vessel absent from the incoming list as removed", () => {
    const diff = diffVessels(new Map([["1", vessel("1")]]), []);

    expect(diff.removed).toEqual(["1"]);
  });

  it("ignores changes the renderer would not draw", () => {
    const existing = vessel("1");
    const sameRender = { ...existing, sourceSnapshotId: "snapshot-changed" };

    const diff = diffVessels(new Map([["1", existing]]), [sameRender]);

    expect(diff.unchanged).toBe(1);
    expect(diff.updated).toHaveLength(0);
  });

  it("detects a risk band change", () => {
    const diff = diffVessels(new Map([["1", vessel("1")]]), [
      vessel("1", { riskLevel: "CRITICAL" }),
    ]);

    expect(diff.updated).toHaveLength(1);
  });

  it("takes the last entry when a batch repeats a vessel", () => {
    const diff = diffVessels(new Map(), [vessel("1"), moved(vessel("1"), 5.0)]);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].position.lon).toBe(5.0);
  });
});

describe("VesselUpdateEngine", () => {
  it("tracks vessels applied in a full refresh", () => {
    const engine = new VesselUpdateEngine();

    engine.applyFull([vessel("1"), vessel("2")]);

    expect(engine.size).toBe(2);
    expect(engine.get("1")?.identity.imo).toBe("1");
  });

  it("drops vessels missing from a later full refresh", () => {
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel("1"), vessel("2")]);

    const diff = engine.applyFull([vessel("1")]);

    expect(diff.removed).toEqual(["2"]);
    expect(engine.size).toBe(1);
  });

  it("sends only the delta to the renderer on a full refresh", () => {
    // The point of the engine: a full list must not become a full redraw.
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    engine.applyFull([vessel("1"), vessel("2"), vessel("3")]);
    renderer.batches.length = 0;

    engine.applyFull([vessel("1"), moved(vessel("2"), 4.0), vessel("3")]);

    expect(renderer.batches).toHaveLength(1);
    expect(renderer.batches[0].updated).toHaveLength(1);
    expect(renderer.batches[0].added).toHaveLength(0);
    expect(renderer.batches[0].updated[0].properties.imo).toBe("2");
  });

  it("does not touch the renderer when nothing changed", () => {
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    engine.applyFull([vessel("1")]);
    renderer.batches.length = 0;

    engine.applyFull([vessel("1")]);

    expect(renderer.batches).toHaveLength(0);
  });

  it("applies a realtime patch as a single update", () => {
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    engine.applyFull([vessel("1"), vessel("2")]);
    renderer.batches.length = 0;

    const diff = engine.applyPatch(moved(vessel("1"), 4.2));

    expect(diff.updated).toHaveLength(1);
    expect(renderer.batches).toHaveLength(1);
    expect(renderer.batches[0].updated).toHaveLength(1);
  });

  it("treats a patch for an unknown vessel as an addition", () => {
    const engine = new VesselUpdateEngine();

    const diff = engine.applyPatch(vessel("new"));

    expect(diff.added).toHaveLength(1);
    expect(engine.size).toBe(1);
  });

  it("costs nothing when a patch repeats the current position", () => {
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    engine.applyFull([vessel("1")]);
    renderer.batches.length = 0;

    const diff = engine.applyPatch(vessel("1"));

    expect(diff.unchanged).toBe(1);
    expect(renderer.batches).toHaveLength(0);
  });

  it("removes a vessel, and no-ops for an unknown one", () => {
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel("1")]);

    expect(engine.remove("1").removed).toEqual(["1"]);
    expect(engine.remove("ghost").removed).toEqual([]);
    expect(engine.size).toBe(0);
  });

  it("emits vessels:applied with batch counts", () => {
    const bus = new MapEventBus();
    const handler = vi.fn();
    bus.on("vessels:applied", handler);
    const engine = new VesselUpdateEngine({ bus });

    engine.applyFull([vessel("1"), vessel("2")]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ added: 2, updated: 0, removed: 0, total: 2 });
  });

  it("does not emit when a batch is empty", () => {
    const bus = new MapEventBus();
    const handler = vi.fn();
    bus.on("vessels:applied", handler);
    const engine = new VesselUpdateEngine({ bus });
    engine.applyFull([vessel("1")]);
    handler.mockClear();

    engine.applyFull([vessel("1")]);

    expect(handler).not.toHaveBeenCalled();
  });

  it("pushes accumulated vessels when a renderer attaches late", () => {
    // The engine may collect data before the canvas exists.
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel("1"), vessel("2")]);
    const renderer = new StubMapRenderer();

    engine.attachRenderer(renderer);

    expect(renderer.vessels.size).toBe(2);
  });

  it("works headlessly with no renderer attached", () => {
    const engine = new VesselUpdateEngine();

    expect(() => engine.applyFull([vessel("1")])).not.toThrow();
    expect(engine.size).toBe(1);
  });

  it("clears every vessel", () => {
    const renderer = new StubMapRenderer();
    const engine = new VesselUpdateEngine({ renderer });
    engine.applyFull([vessel("1"), vessel("2")]);

    engine.clear();

    expect(engine.size).toBe(0);
    expect(renderer.vessels.size).toBe(0);
  });

  it("projects tracked vessels to a feature collection", () => {
    const engine = new VesselUpdateEngine();
    engine.applyFull([vessel("1")]);

    const collection = engine.toFeatureCollection();

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features[0].geometry.coordinates).toEqual([3.4, 6.4]);
  });
});

describe("vessel presentation", () => {
  it("marks a position older than the stale threshold", () => {
    const old = vessel("1", {
      position: {
        ...vessel("1").position,
        timestamp: new Date(NOW - TIMING.staleThresholdMs - 1_000).toISOString(),
      },
    });

    expect(isStale(old, NOW)).toBe(true);
    expect(isStale(vessel("1"), NOW)).toBe(false);
  });

  it("treats an unparseable timestamp as maximally stale", () => {
    const undated = vessel("1", { position: { ...vessel("1").position, timestamp: "not-a-date" } });

    expect(isStale(undated, NOW)).toBe(true);
  });

  it("dims a stale vessel but keeps a selected one fully opaque", () => {
    const stale = vessel("1", {
      position: {
        ...vessel("1").position,
        timestamp: new Date(NOW - TIMING.staleThresholdMs - 1_000).toISOString(),
      },
    });

    expect(toVesselFeature(stale, { now: NOW }).properties.opacity).toBe(0.5);
    expect(toVesselFeature(stale, { now: NOW, selectedImo: "1" }).properties.opacity).toBe(1);
  });

  it("selects the icon variant by type, staleness, and selection", () => {
    // The sprite id carries three axes: colour from vessel type (or
    // selection, which outranks it), silhouette from the reported hull
    // type, and the `-nodir` suffix from whether a course was reported.
    // These fixtures report no type, so both axes fall to the generic.
    //
    // Risk does not appear, deliberately: it used to drive colour, and
    // since nothing assesses it every vessel came out the same shade.
    expect(
      toVesselFeature(vessel("1", { riskLevel: "CRITICAL" }), { now: NOW }).properties.iconId,
    ).toBe("vessel-unknown-hull");
    expect(toVesselFeature(vessel("1"), { now: NOW, selectedImo: "1" }).properties.iconId).toBe(
      "vessel-selected-hull",
    );
  });

  it("normalises headings into the 0-359 range", () => {
    expect(normalizeHeading(370)).toBe(10);
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(Number.NaN)).toBe(0);
  });
});
