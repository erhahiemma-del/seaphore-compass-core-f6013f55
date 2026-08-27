/**
 * Presentation modes, and the composition that made room for them.
 *
 * Lighting is a design decision, not a claim about the world. I argued
 * the opposite once — that a third palette would be fabrication — and
 * that was wrong: fabricating is inventing a vessel position, not
 * choosing a colour ramp. Night Operations exists because officers work
 * at night, and it costs no data to say so.
 *
 * What the mode must not cost is the officer's place. Swapping the
 * basemap document discards every layer that was not part of it, which
 * is all of ours, so the renderer reinstalls them on the live map rather
 * than the canvas being remounted. Camera, selection, focus and filters
 * all survive because none of them lives in the style.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NIGHT_OPS_PALETTE,
  PRESENTATION_MODES,
  basemapStyleFor,
  paletteFor,
} from "@/services/geospatial/constants";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const RENDERER = read("src/services/geospatial/renderers/maplibre-renderer.ts");
const CANVAS = read("src/features/maritime/MapCanvas.tsx");
const COMMAND = read("src/features/maritime/MaritimeCommand.tsx");
const RAIL = read("src/features/maritime/ControlRail.tsx");

/* ═══════ 1. Three modes, each real ═══════ */

describe("the presentation modes are complete", () => {
  it("offers exactly the three agreed modes", () => {
    expect(PRESENTATION_MODES.map((m) => m.id)).toEqual([
      "institutional",
      "maritime",
      "night-operations",
    ]);
  });

  it("gives every mode its own palette", () => {
    const oceans = PRESENTATION_MODES.map((m) => paletteFor(m.id).ocean);
    expect(new Set(oceans).size).toBe(oceans.length);
  });

  it("paints Night Operations against a near-black ground", () => {
    // The point of the mode: operational colour has to carry at low
    // luminance, which it cannot do over the daylight ocean.
    expect(NIGHT_OPS_PALETTE.ocean).toBe("#061525");
    expect(paletteFor("night-operations")).toBe(NIGHT_OPS_PALETTE);
  });

  it("needs no second basemap host for the dark modes", () => {
    /*
     * Night Operations shares the dark style document and is repainted
     * from its palette, so a lighting choice does not become another
     * network dependency that can fail.
     */
    expect(basemapStyleFor("night-operations")).toBe(basemapStyleFor("maritime"));
    expect(basemapStyleFor("institutional")).not.toBe(basemapStyleFor("maritime"));
  });

  it("describes each mode in operational terms", () => {
    for (const mode of PRESENTATION_MODES) {
      expect(mode.description.length, mode.id).toBeGreaterThan(20);
      expect(mode.description, mode.id).not.toMatch(/provider|credential|source/i);
    }
  });
});

/* ═══════ 2. It is state, not a prop ═══════ */

describe("the mode belongs to the map, not to a component", () => {
  it("defaults to the light command surface", () => {
    expect(new SharedGeospatialService({ urlSync: false }).get().presentationMode).toBe(
      "institutional",
    );
  });

  it("is written through the shared service", () => {
    const service = new SharedGeospatialService({ urlSync: false });
    service.setPresentationMode("night-operations");
    expect(service.get().presentationMode).toBe("night-operations");
  });

  it("ignores a mode it does not recognise", () => {
    // This arrives from a URL as readily as from a control.
    const service = new SharedGeospatialService({ urlSync: false });
    service.setPresentationMode("chartreuse" as never);
    expect(service.get().presentationMode).toBe("institutional");
  });

  it("reads the mode from shared state at mount", () => {
    // It was a prop, which meant the officer could not choose, the choice
    // could not survive a reload, and a shared link carried someone
    // else's lighting.
    expect(CANVAS).toContain("basemapStyleFor(state.presentationMode)");
    expect(CANVAS).toContain("palette: state.presentationMode");
  });
});

/* ═══════ 3. Changing it must not cost the officer their place ═══════ */

describe("a repaint is not a remount", () => {
  it("swaps the style on the mounted map", () => {
    expect(RENDERER).toContain("setPresentation(palette: MapStylePaletteName)");
    expect(RENDERER).toContain("map.setStyle(basemapStyleFor(palette))");
  });

  it("reinstalls the operational layers over the new style", () => {
    /*
     * `setStyle` discards every layer that was not part of the basemap
     * document — which is all of ours. Without this the mode change
     * would produce a correctly lit map with nothing on it.
     */
    expect(RENDERER).toContain("installLayersWithRetry(map, resolved)");
    expect(RENDERER).toContain('map.once("styledata"');
  });

  it("guards the reinstall against a superseded mount", () => {
    expect(RENDERER).toContain("if (token !== this.mountToken || this.destroyed || !this.map)");
  });

  it("does nothing when the mode has not changed", () => {
    // A no-op swap would still discard and reinstall every layer.
    expect(RENDERER).toContain("palette === this.palette");
  });

  it("hands the vessels back once the source is recreated", () => {
    // They live in the update engine, not in the style, so nothing else
    // would restore them.
    expect(RENDERER).toContain('this.bus?.emit("map:style"');
    expect(CANVAS).toContain('bus.on("map:style"');
    expect(CANVAS).toContain("engine.refreshPresentation()");
  });

  it("never remounts the canvas to change lighting", () => {
    expect(CANVAS).not.toMatch(/key=\{[^}]*presentationMode/);
  });
});

/* ═══════ 4. The map reclaimed its width ═══════ */

describe("the map is the workspace", () => {
  it("no longer holds a permanent layer panel open", () => {
    /*
     * 300px of application width was reserved for a configuration
     * surface an officer touches occasionally, which made the map the
     * smaller half of its own screen.
     */
    expect(COMMAND).not.toContain("<LayerPanel");
    expect(COMMAND).not.toContain("leftOpen");
  });

  it("opens layers from the rail instead", () => {
    expect(RAIL).toContain("<LayerPanel");
    expect(RAIL).toContain('control.id === "layers"');
  });

  it("gives Map Style a real chooser rather than an explanation", () => {
    // A control marked ready that only explains itself is the failure the
    // rail's status model exists to prevent.
    expect(RAIL).toContain("<MapStyleDrawer");
    expect(RAIL).toContain('control.id === "map-style"');
  });
});
