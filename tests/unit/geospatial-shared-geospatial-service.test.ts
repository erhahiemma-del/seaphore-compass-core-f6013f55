import { describe, expect, it, vi } from "vitest";

import {
  LayerRegistry,
  MAP_DEFAULTS,
  SharedGeospatialService,
  createDefaultLayerRegistry,
  createDefaultMapState,
} from "@/services/geospatial";

/** A service with URL syncing disabled — the default for these cases. */
function createService(overrides?: ConstructorParameters<typeof SharedGeospatialService>[0]) {
  return new SharedGeospatialService({ urlSync: false, ...overrides });
}

describe("SharedGeospatialService", () => {
  describe("initial state", () => {
    it("starts over the Gulf of Guinea at the default zoom", () => {
      const state = createService().get();

      expect(state.center).toEqual(MAP_DEFAULTS.center);
      expect(state.zoom).toBe(MAP_DEFAULTS.zoom);
      expect(state.viewMode).toBe("2D");
    });

    it("starts with the registry's default layers", () => {
      expect(createService().get().activeLayers).toEqual(
        createDefaultLayerRegistry().defaultActiveLayers(),
      );
    });

    it("accepts partial initial state", () => {
      const service = createService({ initialState: { zoom: 11, missionId: "m-1" } });

      expect(service.get().zoom).toBe(11);
      expect(service.get().missionId).toBe("m-1");
      expect(service.get().center).toEqual(MAP_DEFAULTS.center);
    });
  });

  describe("subscribe", () => {
    it("invokes the handler immediately with current state", () => {
      const service = createService();
      const handler = vi.fn();

      service.subscribe(handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(service.get());
    });

    it("notifies on change", () => {
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.update({ zoom: 9 });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler.mock.calls[1][0].zoom).toBe(9);
    });

    it("stops notifying after unsubscribe", () => {
      const service = createService();
      const handler = vi.fn();
      const off = service.subscribe(handler);

      off();
      service.update({ zoom: 9 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(service.subscriberCount()).toBe(0);
    });

    it("tolerates unsubscribing twice", () => {
      const service = createService();
      const off = service.subscribe(vi.fn());

      off();
      expect(() => off()).not.toThrow();
    });

    it("does not skip a subscriber when another unsubscribes mid-notification", () => {
      const service = createService();
      const second = vi.fn();
      // `subscribe` fires immediately, so skip that first call and only
      // unsubscribe from inside a real notification.
      let isImmediateCall = true;
      const unsubscribe: { current?: () => void } = {};
      unsubscribe.current = service.subscribe(() => {
        if (isImmediateCall) {
          isImmediateCall = false;
          return;
        }
        unsubscribe.current?.();
      });
      service.subscribe(second);
      second.mockClear();

      service.update({ zoom: 9 });

      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe("change detection", () => {
    it("does not notify when nothing changed", () => {
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.update({ zoom: service.get().zoom });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not notify when the camera settles on the same centre", () => {
      // A moveend reporting an unchanged centre must not wake every
      // subscriber, or panning becomes a render storm.
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.update({ center: [MAP_DEFAULTS.center[0], MAP_DEFAULTS.center[1]] });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("notifies when the centre actually moves", () => {
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.update({ center: [4.5, 5.5] });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("does not notify when an identical layer list is reapplied", () => {
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.setActiveLayers([...service.get().activeLayers]);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not notify when identical filters are reapplied", () => {
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.setFilters({ riskLevel: "ALL" });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("layers", () => {
    it("toggles a layer on and off", () => {
      const service = createService();

      service.toggleLayer("riskHeatmap");
      expect(service.isLayerActive("riskHeatmap")).toBe(true);

      service.toggleLayer("riskHeatmap");
      expect(service.isLayerActive("riskHeatmap")).toBe(false);
    });

    it("ignores toggling an unknown layer", () => {
      const service = createService();
      const before = service.get().activeLayers;

      service.toggleLayer("not-a-layer");

      expect(service.get().activeLayers).toEqual(before);
    });

    it("filters unknown ids out of setActiveLayers", () => {
      const service = createService();

      service.setActiveLayers(["vessels", "not-a-layer"]);

      expect(service.get().activeLayers).toEqual(["vessels"]);
    });

    it("honours an injected registry", () => {
      const registry = new LayerRegistry().register({
        id: "only",
        label: "Only",
        description: "The only layer.",
        group: "OPERATIONAL",
        renderLayerIds: ["r"],
        defaultVisible: true,
        status: "ready",
        order: 1,
      });
      const service = createService({ registry });

      expect(service.get().activeLayers).toEqual(["only"]);
      service.setActiveLayers(["vessels"]);
      expect(service.get().activeLayers).toEqual([]);
    });
  });

  describe("mission presets", () => {
    it("applies a preset's layer bundle", () => {
      const service = createService();

      expect(service.applyPreset("revenue-investigation")).toBe(true);
      expect(service.get().activeLayers).toEqual([
        "vessels",
        "ports",
        "riskHeatmap",
        "revenueHeat",
      ]);
    });

    it("reports an unknown preset instead of silently doing nothing", () => {
      const service = createService();
      const before = service.get().activeLayers;

      expect(service.applyPreset("no-such-preset")).toBe(false);
      expect(service.get().activeLayers).toEqual(before);
    });
  });

  describe("selection and view", () => {
    it("selects and clears an entity", () => {
      const service = createService();

      service.selectEntity("entity-1", "9411765");
      expect(service.get().selectedEntityId).toBe("entity-1");
      expect(service.get().selectedEntityImo).toBe("9411765");

      service.clearSelection();
      expect(service.get().selectedEntityId).toBeNull();
      expect(service.get().selectedEntityImo).toBeNull();
    });

    it("switches view mode", () => {
      const service = createService();

      service.switchView("3D");

      expect(service.get().viewMode).toBe("3D");
    });

    it("merges partial filter changes", () => {
      const service = createService();

      service.setFilters({ riskLevel: "HIGH" });
      service.setFilters({ vesselType: "TANKER" });

      expect(service.get().filters).toMatchObject({ riskLevel: "HIGH", vesselType: "TANKER" });
    });

    it("resets to defaults", () => {
      const service = createService();
      service.switchView("3D");
      service.selectEntity("entity-1", "9411765");

      service.reset();

      expect(service.get()).toEqual(createDefaultMapState());
    });
  });

  describe("URL serialisation", () => {
    it("serialises the shareable subset", () => {
      const service = createService({
        initialState: { center: [3.4219, 6.4281], zoom: 8.5, selectedEntityImo: "9411765" },
      });

      const params = service.toSearchParams();

      expect(params.get("lat")).toBe("6.4281");
      expect(params.get("lon")).toBe("3.4219");
      expect(params.get("zoom")).toBe("8.5");
      expect(params.get("view")).toBe("2D");
      expect(params.get("vessel")).toBe("9411765");
    });

    it("omits the vessel parameter when nothing is selected", () => {
      expect(createService().toSearchParams().has("vessel")).toBe(false);
    });

    it("round-trips through the URL", () => {
      const source = createService({
        initialState: { center: [5.75, 5.5167], zoom: 10.5, viewMode: "3D" },
      });
      const target = createService();

      target.loadFromURL(`?${source.toSearchParams().toString()}`);

      expect(target.get().center).toEqual([5.75, 5.5167]);
      expect(target.get().zoom).toBe(10.5);
      expect(target.get().viewMode).toBe("3D");
    });

    it("ignores malformed coordinates rather than throwing", () => {
      const service = createService();

      service.loadFromURL("?lat=not-a-number&lon=also-bad");

      expect(service.get().center).toEqual(MAP_DEFAULTS.center);
    });

    it("rejects out-of-range coordinates", () => {
      const service = createService();

      service.loadFromURL("?lat=999&lon=999");

      expect(service.get().center).toEqual(MAP_DEFAULTS.center);
    });

    it("clamps zoom into the supported range", () => {
      const service = createService();

      service.loadFromURL("?zoom=99");
      expect(service.get().zoom).toBe(MAP_DEFAULTS.maxZoom);

      service.loadFromURL("?zoom=-5");
      expect(service.get().zoom).toBe(MAP_DEFAULTS.minZoom);
    });

    it("keeps only layers the registry knows", () => {
      const service = createService();

      service.loadFromURL("?layers=vessels,ghost-layer");

      expect(service.get().activeLayers).toEqual(["vessels"]);
    });

    it("treats an explicitly empty layer list as 'hide everything'", () => {
      const service = createService();

      service.loadFromURL("?layers=");

      expect(service.get().activeLayers).toEqual([]);
    });

    it("ignores a layer list of entirely unknown ids", () => {
      const service = createService();
      const before = service.get().activeLayers;

      service.loadFromURL("?layers=ghost,phantom");

      expect(service.get().activeLayers).toEqual(before);
    });

    it("ignores an invalid view mode", () => {
      const service = createService();

      service.loadFromURL("?view=4D");

      expect(service.get().viewMode).toBe("2D");
    });

    it("does nothing when the query string is empty", () => {
      const service = createService();
      const handler = vi.fn();
      service.subscribe(handler);

      service.loadFromURL("");

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

describe("SharedGeospatialService — layer opacity (G5.5.2)", () => {
  function svc() {
    return new SharedGeospatialService({ urlSync: false });
  }

  it("starts with no opacity overrides", () => {
    expect(svc().get().layerOpacity).toEqual({});
  });

  it("sets and reads a layer's opacity", () => {
    const service = svc();
    service.setLayerOpacity("vessels", 0.4);

    expect(service.layerOpacity("vessels")).toBe(0.4);
    expect(service.get().layerOpacity).toEqual({ vessels: 0.4 });
  });

  it("defaults to fully opaque when no override is set", () => {
    expect(svc().layerOpacity("ports")).toBe(1);
  });

  it("clamps out-of-range values", () => {
    const service = svc();
    service.setLayerOpacity("vessels", 5);
    expect(service.layerOpacity("vessels")).toBe(1);
    service.setLayerOpacity("vessels", -2);
    expect(service.layerOpacity("vessels")).toBe(0);
  });

  it("clears an override with null", () => {
    const service = svc();
    service.setLayerOpacity("vessels", 0.3);
    service.setLayerOpacity("vessels", null);

    expect(service.get().layerOpacity).toEqual({});
    expect(service.layerOpacity("vessels")).toBe(1);
  });

  it("ignores unknown layers", () => {
    const service = svc();
    service.setLayerOpacity("not-a-layer", 0.5);

    expect(service.get().layerOpacity).toEqual({});
  });

  it("does not notify when the same opacity is reapplied", () => {
    const service = svc();
    service.setLayerOpacity("vessels", 0.5);
    const handler = vi.fn();
    service.subscribe(handler);

    service.setLayerOpacity("vessels", 0.5);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("round-trips opacity through the URL", () => {
    const source = svc();
    source.setLayerOpacity("vessels", 0.25);
    source.setLayerOpacity("ports", 0.8);
    const target = svc();

    target.loadFromURL(`?${source.toSearchParams().toString()}`);

    expect(target.layerOpacity("vessels")).toBe(0.25);
    expect(target.layerOpacity("ports")).toBe(0.8);
  });

  it("omits the opacity parameter when nothing is overridden", () => {
    expect(svc().toSearchParams().has("opacity")).toBe(false);
  });

  it("drops malformed or unknown entries when hydrating", () => {
    const service = svc();

    service.loadFromURL("?opacity=vessels:0.5,ghost:0.2,ports:notanumber");

    expect(service.get().layerOpacity).toEqual({ vessels: 0.5 });
  });
});
