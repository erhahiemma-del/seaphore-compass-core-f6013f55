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
  return {
    id: "test-layer",
    label: "Test Layer",
    description: "A layer used in tests.",
    group: "OPERATIONAL",
    renderLayerIds: ["test-render-layer"],
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

    it("shows a shared render layer when any owning logical layer is active", () => {
      const registry = new LayerRegistry().registerAll([
        layer({ id: "first", renderLayerIds: ["shared"] }),
        layer({ id: "second", renderLayerIds: ["shared"], order: 2 }),
      ]);

      expect(registry.resolveVisibility(["second"]).get("shared")).toBe(true);
      expect(registry.resolveVisibility([]).get("shared")).toBe(false);
    });

    it("ignores unknown ids in the active set", () => {
      const registry = new LayerRegistry().register(layer());

      const visibility = registry.resolveVisibility(["test-layer", "does-not-exist"]);

      expect(visibility.size).toBe(1);
      expect(visibility.get("test-render-layer")).toBe(true);
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
      "eezBoundary",
      "graticule",
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
    expect(byId["compliance-sweep"]).toEqual(["vessels", "ports", "riskHeatmap", "eezBoundary"]);
    expect(byId["navigation"]).toEqual(["vessels", "ports", "eezBoundary", "weather"]);
    expect(byId["full-intelligence"]).toEqual([
      "vessels",
      "ports",
      "eezBoundary",
      "riskHeatmap",
      "revenueHeat",
      "aisTrack",
    ]);
  });
});
