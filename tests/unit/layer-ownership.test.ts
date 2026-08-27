/**
 * One render layer, one owner — and renamed ids that still resolve.
 *
 * The registry translates logical layers (what an officer toggles) into
 * render layers (what MapLibre draws). Visibility resolves to true when an
 * owning logical layer is on, which is correct for one owner and a trap
 * with two: the second keeps the render layer alive after the officer
 * switches the first off, so the control reports what they asked for and
 * the map shows the opposite.
 *
 * That reached the product twice, both times the same way — a descriptive
 * catalogue entry added *beside* an older camel-cased one instead of
 * replacing it. `nigeria-eez` next to `eezBoundary`, `investigation-areas`
 * next to `investigArea`. Both EEZ entries were `ready` and on by default,
 * so the boundary could not be switched off at all, and the live URL
 * carried both ids at once.
 *
 * The fix is an invariant rather than a correction, because correcting two
 * entries does nothing about the third. Registration now rejects a second
 * claim on a render layer, so the next rename fails at build.
 *
 * The retired ids survive as aliases. A shared operational link carries its
 * layer set in the URL, and an id that has shipped has to keep resolving —
 * otherwise a link an officer saved comes back quietly missing a layer.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYERS,
  LayerRegistry,
  createDefaultLayerRegistry,
} from "@/services/geospatial/layer-registry";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

const registry = createDefaultLayerRegistry();

/* ═══════ 1. The invariant ═══════ */

describe("a render layer has exactly one owner", () => {
  it("holds across the whole shipped catalogue", () => {
    const owners = new Map<string, string[]>();
    for (const layer of registry.list()) {
      for (const renderId of layer.renderLayerIds) {
        owners.set(renderId, [...(owners.get(renderId) ?? []), layer.id]);
      }
    }
    const shared = [...owners.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([renderId, ids]) => `${renderId} <- ${ids.join(", ")}`);
    expect(shared).toEqual([]);
  });

  it("is enforced at registration, not merely true today", () => {
    /*
     * The difference that matters. Both duplicates were introduced by
     * people acting reasonably — adding an entry rather than renaming
     * one — and neither was caught by a test asserting the catalogue was
     * currently clean.
     */
    const one = {
      id: "first",
      label: "First",
      description: "x",
      group: "OPERATIONAL" as const,
      renderLayerIds: ["contested"],
      defaultVisible: false,
      status: "ready" as const,
      order: 1,
    };
    const fresh = new LayerRegistry().register(one);
    expect(() => fresh.register({ ...one, id: "second" })).toThrow(/already owns/);
  });

  it("names both sides when it refuses", () => {
    // A registration error that does not say which layer already owns the
    // render id sends the reader to grep for it.
    const one = {
      id: "first",
      label: "First",
      description: "x",
      group: "OPERATIONAL" as const,
      renderLayerIds: ["contested"],
      defaultVisible: false,
      status: "ready" as const,
      order: 1,
    };
    const fresh = new LayerRegistry().register(one);
    expect(() => fresh.register({ ...one, id: "second" })).toThrow(/second.*contested.*first/s);
  });
});

/* ═══════ 2. The EEZ, specifically ═══════ */

describe("the EEZ can be switched off", () => {
  it("has one logical owner", () => {
    const owners = DEFAULT_LAYERS.filter((l) =>
      l.renderLayerIds.some((r) => r.includes("eez")),
    ).map((l) => l.id);
    expect(owners).toEqual(["nigeria-eez"]);
  });

  it("appears once in the standard bundle", () => {
    const standard = registry.standardLayerIds().filter((id) => id.includes("eez"));
    expect(standard).toEqual(["nigeria-eez"]);
  });

  it("hides its render layers when the officer turns it off", () => {
    /*
     * The behaviour an officer actually reported: the Zones chip did not
     * hide the boundary. With two owners the render layer stayed on
     * because the other one was still active.
     */
    const active = registry.defaultActiveLayers().filter((id) => id !== "nigeria-eez");
    const visibility = registry.resolveVisibility(active);
    for (const [renderId, visible] of visibility) {
      if (renderId.includes("eez")) {
        expect(visible, `${renderId} is still drawn after the EEZ was switched off`).toBe(false);
      }
    }
  });
});

/* ═══════ 3. Retired ids still resolve ═══════ */

describe("a link saved before a rename still works", () => {
  it("resolves both retired ids", () => {
    expect(registry.resolveId("eezBoundary")).toBe("nigeria-eez");
    expect(registry.resolveId("investigArea")).toBe("investigation-areas");
  });

  it("leaves a current id alone", () => {
    for (const id of ["vessels", "ports", "nigeria-eez"]) {
      expect(registry.resolveId(id)).toBe(id);
    }
  });

  it("resolves rather than drops when a layer set is applied", () => {
    // Mission Modes and the map presets both name layer sets, and several
    // were written before the rename. Normalising at the setter means
    // none of them had to be edited — which matters most for the Mission
    // Mode definitions, on a frozen surface.
    const service = new SharedGeospatialService();
    service.setActiveLayers(["vessels", "eezBoundary", "investigArea"]);
    expect([...service.get().activeLayers]).toEqual([
      "vessels",
      "nigeria-eez",
      "investigation-areas",
    ]);
  });

  it("does not produce a duplicate when both spellings are present", () => {
    // A URL written during the overlap carries both. Resolving without
    // de-duplicating would put the same layer in the set twice.
    const service = new SharedGeospatialService();
    service.setActiveLayers(["nigeria-eez", "eezBoundary"]);
    expect([...service.get().activeLayers]).toEqual(["nigeria-eez"]);
  });

  it("still rejects an id that never existed", () => {
    const service = new SharedGeospatialService();
    service.setActiveLayers(["vessels", "not-a-layer"]);
    expect([...service.get().activeLayers]).toEqual(["vessels"]);
  });
});
