import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYERS,
  LAYER_GROUP_ORDER,
  LayerRegistry,
  LayerRegistryError,
  MISSION_PRESETS,
  createDefaultLayerRegistry,
  type LayerDefinition,
} from "@/services/geospatial";

function layer(overrides: Partial<LayerDefinition> = {}): LayerDefinition {
  const id = overrides.id ?? "test-layer";
  return {
    id,
    label: "Test Layer",
    description: "A layer used in tests.",
    group: "OPERATIONAL",
    /*
     * Derived from the id so two helper-built layers do not both claim
     * one render layer. They used to share a literal, which was harmless
     * while the registry allowed shared ownership and became a
     * registration error when it stopped — the fixture was relying on the
     * very thing the registry now forbids.
     */
    renderLayerIds: [`${id}-render-layer`],
    defaultVisible: false,
    status: "ready",
    order: 1,
    ...overrides,
  };
}

describe("LayerRegistry", () => {
  it("registers and retrieves a layer", () => {
    const registry = new LayerRegistry().register(layer());

    expect(registry.has("test-layer")).toBe(true);
    expect(registry.get("test-layer")?.label).toBe("Test Layer");
  });

  it("rejects a duplicate id rather than silently overwriting", () => {
    const registry = new LayerRegistry().register(layer());

    expect(() => registry.register(layer({ label: "Different" }))).toThrow(LayerRegistryError);
    expect(registry.get("test-layer")?.label).toBe("Test Layer");
  });

  it("rejects a layer that declares no render layer ids", () => {
    const registry = new LayerRegistry();

    expect(() => registry.register(layer({ renderLayerIds: [] }))).toThrow(LayerRegistryError);
  });

  it("returns undefined for an unknown layer but throws from require()", () => {
    const registry = new LayerRegistry();

    expect(registry.get("nope")).toBeUndefined();
    expect(() => registry.require("nope")).toThrow(/Unknown layer/);
  });

  it("unregisters a layer and reports whether it was present", () => {
    const registry = new LayerRegistry().register(layer());

    expect(registry.unregister("test-layer")).toBe(true);
    expect(registry.unregister("test-layer")).toBe(false);
    expect(registry.has("test-layer")).toBe(false);
  });

  it("sorts by group order, then by order within a group", () => {
    const registry = new LayerRegistry().registerAll([
      layer({ id: "analysis-b", group: "ANALYSIS", order: 20 }),
      layer({ id: "operational-b", group: "OPERATIONAL", order: 20 }),
      layer({ id: "analysis-a", group: "ANALYSIS", order: 10 }),
      layer({ id: "intel-a", group: "INTELLIGENCE", order: 10 }),
      layer({ id: "operational-a", group: "OPERATIONAL", order: 10 }),
    ]);

    expect(registry.list().map((l) => l.id)).toEqual([
      "operational-a",
      "operational-b",
      "intel-a",
      "analysis-a",
      "analysis-b",
    ]);
  });

  it("lists only groups that contain layers, in display order", () => {
    const registry = new LayerRegistry().registerAll([
      layer({ id: "a", group: "ANALYSIS" }),
      layer({ id: "b", group: "OPERATIONAL" }),
    ]);

    expect(registry.groups()).toEqual(["OPERATIONAL", "ANALYSIS"]);
  });

  it("reports default-visible layers", () => {
    const registry = new LayerRegistry().registerAll([
      layer({ id: "on", defaultVisible: true }),
      layer({ id: "off", defaultVisible: false, order: 2 }),
    ]);

    expect(registry.defaultActiveLayers()).toEqual(["on"]);
  });

  it("maps a logical layer to its render layer ids", () => {
    const registry = new LayerRegistry().register(
      layer({ renderLayerIds: ["render-a", "render-b"] }),
    );

    expect(registry.renderLayerIds("test-layer")).toEqual(["render-a", "render-b"]);
    expect(registry.renderLayerIds("unknown")).toEqual([]);
  });

  describe("resolveVisibility", () => {
    it("returns an instruction for every render layer, including hidden ones", () => {
      const registry = new LayerRegistry().registerAll([
        layer({ id: "shown", renderLayerIds: ["r-shown"] }),
        layer({ id: "hidden", renderLayerIds: ["r-hidden"], order: 2 }),
      ]);

      const visibility = registry.resolveVisibility(["shown"]);

      // Hidden layers must be explicitly false, never merely absent, or the
      // renderer would leave them in a stale state.
      expect(visibility.get("r-shown")).toBe(true);
      expect(visibility.get("r-hidden")).toBe(false);
      expect(visibility.size).toBe(2);
    });

    it("expands one logical layer to all of its render layers", () => {
      const registry = new LayerRegistry().register(
        layer({ id: "vessels", renderLayerIds: ["markers", "headings", "labels"] }),
      );

      const visibility = registry.resolveVisibility(["vessels"]);

      expect([...visibility.entries()]).toEqual([
        ["markers", true],
        ["headings", true],
        ["labels", true],
      ]);
    });

    it("refuses to let two logical layers own one render layer", () => {
      /*
       * This used to assert the opposite — that a render layer shows when
       * *any* owning logical layer is on. That rule is unobjectionable
       * with one owner and a trap with two: the second owner keeps the
       * render layer alive after the officer switches the first one off,
       * so the control reports what they asked for and the map shows the
       * reverse.
       *
       * It reached the product twice, both times because a catalogue
       * entry was added beside an existing one instead of renaming it.
       * The EEZ ended up with two `ready`, on-by-default owners and could
       * not be switched off at all. Registration now rejects the second
       * owner, so the mistake fails at build rather than at the chip.
       */
      const registry = new LayerRegistry().register(
        layer({ id: "first", renderLayerIds: ["shared"] }),
      );

      expect(() =>
        registry.register(layer({ id: "second", renderLayerIds: ["shared"], order: 2 })),
      ).toThrow(/already owns/);
    });

    it("ignores unknown ids in the active set", () => {
      const registry = new LayerRegistry().register(layer());

      const visibility = registry.resolveVisibility(["test-layer", "does-not-exist"]);

      expect(visibility.size).toBe(1);
      expect(visibility.get("test-layer-render-layer")).toBe(true);
    });
  });

  it("identifies unknown layer ids", () => {
    const registry = new LayerRegistry().register(layer());

    expect(registry.unknownLayers(["test-layer", "ghost"])).toEqual(["ghost"]);
  });
});

describe("default layer catalogue", () => {
  it("registers every default layer without conflict", () => {
    const registry = createDefaultLayerRegistry();

    expect(registry.list()).toHaveLength(DEFAULT_LAYERS.length);
  });

  it("has unique logical ids", () => {
    const ids = DEFAULT_LAYERS.map((l) => l.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only known groups", () => {
    for (const definition of DEFAULT_LAYERS) {
      expect(LAYER_GROUP_ORDER).toContain(definition.group);
    }
  });

  it("defaults to vessels, ports, the EEZ boundary and the graticule", () => {
    const registry = createDefaultLayerRegistry();

    // The graticule is generated arithmetic rather than an observation,
    // so it costs nothing to have on and gives the strategic view a
    // frame of reference.
    expect(registry.defaultActiveLayers()).toEqual([
      "vessels",
      "ports",
      // Verified anchorages are estate, like ports: on by default.
      "anchorages",
      /*
       * The EEZ, once. It was drawn from the start with no catalogue
       * entry, so an officer could see the boundary and had no way to
       * turn it off; the entry that fixed that was added beside the
       * older `eezBoundary` rather than replacing it, which left two
       * logical layers driving one render layer and made the boundary
       * un-hideable for a different reason. One owner now, and the old
       * id resolves to this one so shared links still work.
       */
      "nigeria-eez",
      /*
       * Geographic context is on by default and invisible until it
       * matters: fully transparent below zoom 13, so the national
       * picture never shows it and it costs no tiles. It exists for the
       * moment an officer drills into a port, which is exactly where the
       * vector basemap runs out of geometry.
       */
      "geographic-context",
      "graticule",
      /*
       * Intelligence findings, added with `defaultVisible: true` without
       * this list being updated — so the assertion failed on the branch
       * that introduced it, not on the merge that brought it here.
       *
       * Recorded rather than removed: findings on by default is a product
       * decision, and the point of pinning the exact set is that turning
       * a layer on by default is a decision somebody makes deliberately
       * rather than a line that slips in unnoticed.
       */
      "intelligenceFindings",
    ]);
  });

  it("gives every pending-source layer a reason to show the officer", () => {
    for (const definition of DEFAULT_LAYERS) {
      if (definition.status === "pending-source") {
        expect(definition.pendingReason, `${definition.id} needs a pendingReason`).toBeTruthy();
      }
    }
  });
});

describe("mission presets", () => {
  it("reference only layers that exist in the registry", () => {
    const registry = createDefaultLayerRegistry();

    for (const preset of MISSION_PRESETS) {
      expect(registry.unknownLayers(preset.layers), `preset "${preset.id}"`).toEqual([]);
    }
  });

  it("have unique ids", () => {
    const ids = MISSION_PRESETS.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("match the layer bundles specified in the Live Map guide", () => {
    const byId = Object.fromEntries(MISSION_PRESETS.map((p) => [p.id, p.layers]));

    expect(byId["revenue-investigation"]).toEqual([
      "vessels",
      "ports",
      "riskHeatmap",
      "revenueHeat",
    ]);
    expect(byId["compliance-sweep"]).toEqual(["vessels", "ports", "riskHeatmap", "nigeria-eez"]);
    expect(byId["navigation"]).toEqual(["vessels", "ports", "nigeria-eez", "weather"]);
    expect(byId["full-intelligence"]).toEqual([
      "vessels",
      "ports",
      "nigeria-eez",
      "riskHeatmap",
      "revenueHeat",
      "aisTrack",
    ]);
  });
});
