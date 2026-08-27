/**
 * The legend keys the map, it does not catalogue the product.
 *
 * The previous legend listed the whole symbol vocabulary whatever was
 * switched on, so an officer looking at ports and the EEZ was shown
 * entries for vessel risk rings, cluster counts and weather — none of
 * which were on the map. That is worse than no legend: it teaches that
 * the key and the map are unrelated, and the key stops being read.
 *
 * These pin the two properties that make it operational — it is derived
 * from the active layer set, and it never explains a symbol the map
 * cannot draw.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { hasLegendContent, legendEntriesFor } from "@/features/maritime/legend-model";
import { createDefaultLayerRegistry } from "@/services/geospatial/layer-registry";

const registry = createDefaultLayerRegistry();
const LEGEND = readFileSync(
  resolve(process.cwd(), "src/features/maritime/OperationalLegend.tsx"),
  "utf8",
);
const COMMAND = readFileSync(
  resolve(process.cwd(), "src/features/maritime/MaritimeCommand.tsx"),
  "utf8",
);

describe("the legend follows the active layers", () => {
  it("explains the opening picture", () => {
    const entries = legendEntriesFor(registry.defaultActiveLayers(), registry);
    expect(entries.map((e) => e.layerId)).toEqual([
      "vessels",
      "ports",
      "anchorages",
      "nigeria-eez",
      "graticule",
    ]);
  });

  it("drops an entry when its layer is switched off", () => {
    const without = registry.defaultActiveLayers().filter((id) => id !== "ports");
    const entries = legendEntriesFor(without, registry);
    expect(entries.map((e) => e.layerId)).not.toContain("ports");
    expect(entries.map((e) => e.layerId)).toContain("vessels");
  });

  it("has nothing to say when every layer is off", () => {
    // A real state, not a failure — and the panel says so rather than
    // opening onto an empty box.
    expect(legendEntriesFor([], registry)).toEqual([]);
    expect(hasLegendContent([], registry)).toBe(false);
  });

  it("resolves a retired layer id like the rest of the map", () => {
    // A shared link written before a rename must key the same picture it
    // draws.
    expect(legendEntriesFor(["eezBoundary"], registry).map((e) => e.layerId)).toEqual([
      "nigeria-eez",
    ]);
  });

  it("reads down in the same order as the layer list", () => {
    const entries = legendEntriesFor(registry.defaultActiveLayers(), registry);
    const order = registry.list().map((l) => l.id);
    const positions = entries.map((e) => order.indexOf(e.layerId));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("it never keys a symbol the map cannot draw", () => {
  it("ignores a layer with no connected source", () => {
    /*
     * The catalogue deliberately lets an officer switch on a
     * pending-source layer so the capability is visible. Nothing appears
     * on the map, so nothing may appear in the key.
     */
    const pending = registry.list().find((l) => l.status === "pending-source")!;
    expect(legendEntriesFor([pending.id], registry)).toEqual([]);
  });

  it("only ever names ready layers", () => {
    const all = registry.list().map((l) => l.id);
    for (const entry of legendEntriesFor(all, registry)) {
      expect(registry.get(entry.layerId)?.status, entry.layerId).toBe("ready");
    }
  });

  it("gives every entry a label", () => {
    for (const entry of legendEntriesFor(
      registry.list().map((l) => l.id),
      registry,
    )) {
      expect(entry.label.length, entry.layerId).toBeGreaterThan(0);
    }
  });
});

describe("the legend is collapsed until asked for", () => {
  it("starts closed", () => {
    // The map is what the officer came for; a permanent key spends space
    // explaining symbols they already know.
    expect(LEGEND).toContain("useState(false)");
    expect(LEGEND).toContain('data-testid="legend-toggle"');
  });

  it("reports whether it is expanded", () => {
    expect(LEGEND).toContain("aria-expanded={open}");
  });

  it("draws from the same symbol tokens as the map sprites", () => {
    // Styled independently, the key and the map drift apart.
    expect(LEGEND).toContain("MAP_SYMBOLS");
  });

  it("holds no symbol list of its own", () => {
    // The whole defect being fixed: a hard-coded catalogue cannot follow
    // the map.
    expect(LEGEND).not.toMatch(/const LEGEND(_ENTRIES)? *[:=] *\[/);
  });
});

describe("the map surface leads with controls, not diagnostics", () => {
  it("no longer opens the drawer with the national picture", () => {
    /*
     * Answerability ratios and provider health are real and belong in
     * Data Sources. Above the officer's layers they made the primary map
     * surface read as a status report about Seaphore's collection rather
     * than an instrument for looking at the sea.
     */
    expect(COMMAND).not.toContain("NationalPicturePanel");
    expect(COMMAND).not.toContain("buildNationalPicture");
  });

  it("uses the operational legend rather than the static catalogue", () => {
    expect(COMMAND).toContain("OperationalLegend");
    expect(COMMAND).not.toMatch(/<MapLegend\s*\/>/);
  });
});
