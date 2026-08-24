/**
 * Basemap restyling and the graticule.
 *
 * Two properties under test. First, that the restyling is *total*: it
 * runs inside the renderer's mount path, so a style it does not
 * recognise must cost colour, never the mount. Second, that nothing it
 * does adds a geographic claim — it may repaint what CARTO already
 * draws, and it may trace an edge that already exists, but it must not
 * invent geometry or vary a colour with position.
 */
import { describe, expect, it, vi } from "vitest";

import {
  MARITIME_PALETTE,
  applyMaritimeStyle,
  coastlineLayer,
  graticuleFeatures,
  planMaritimeStyle,
  COASTLINE_LAYER_ID,
  GRATICULE_STEPS,
  type StyleLayerSummary,
  type StyleTarget,
} from "@/services/geospatial";

/** A slice of the real CARTO Dark Matter layer list. */
const CARTO_LAYERS: readonly StyleLayerSummary[] = [
  { id: "background", type: "background" },
  { id: "landcover", type: "fill", "source-layer": "landcover" },
  { id: "landuse", type: "fill", "source-layer": "landuse" },
  { id: "water", type: "fill", "source-layer": "water" },
  { id: "water_shadow", type: "fill", "source-layer": "water" },
  { id: "waterway", type: "line", "source-layer": "waterway" },
  { id: "watername_sea", type: "symbol", "source-layer": "water_name" },
  { id: "place_country_1", type: "symbol", "source-layer": "place" },
  { id: "boundary_state", type: "line", "source-layer": "boundary" },
  { id: "road_mot_fill_noramp", type: "line", "source-layer": "transportation" },
  { id: "roadname_major", type: "symbol", "source-layer": "transportation_name" },
  { id: "poi_park", type: "symbol", "source-layer": "poi" },
  { id: "building", type: "fill", "source-layer": "building" },
];

function fakeMap(overrides: Partial<StyleTarget> = {}): StyleTarget & {
  paint: Map<string, unknown>;
  layout: Map<string, unknown>;
  zoomRanges: Map<string, number>;
  added: string[];
  sky: Record<string, unknown> | null;
} {
  const paint = new Map<string, unknown>();
  const layout = new Map<string, unknown>();
  const zoomRanges = new Map<string, number>();
  const added: string[] = [];
  let sky: Record<string, unknown> | null = null;
  const known = new Set(CARTO_LAYERS.map((l) => l.id));

  return {
    paint,
    layout,
    zoomRanges,
    added,
    get sky() {
      return sky;
    },
    getStyle: () => ({ layers: CARTO_LAYERS }),
    getLayer: (id: string) => (known.has(id) ? { id } : undefined),
    setPaintProperty: (id, property, value) => paint.set(`${id}.${property}`, value),
    setLayoutProperty: (id, property, value) => layout.set(`${id}.${property}`, value),
    setLayerZoomRange: (id: string, minzoom: number) => zoomRanges.set(id, minzoom),
    addLayer: (layer: Record<string, unknown>) => {
      added.push(String(layer.id));
      known.add(String(layer.id));
    },
    setSky: (next: Record<string, unknown>) => {
      sky = next;
    },
    ...overrides,
  } as never;
}

/* ═══════ Planning ═══════ */

describe("maritime style planning", () => {
  it("inverts the figure–ground: land lighter than sea", () => {
    const edits = planMaritimeStyle(CARTO_LAYERS);
    const at = (layerId: string, property: string) =>
      edits.find((e) => e.layerId === layerId && e.property === property)?.value;

    expect(at("background", "background-color")).toBe(MARITIME_PALETTE.land);
    expect(at("water", "fill-color")).toBe(MARITIME_PALETTE.ocean);
    // The whole point of the palette: land must read as solid mass.
    expect(MARITIME_PALETTE.land).not.toBe(MARITIME_PALETTE.ocean);
  });

  it("keeps the ocean one flat colour", () => {
    // A water fill that varied with position would be read as
    // bathymetry, and no depth data exists in this repository.
    const waterFill = planMaritimeStyle(CARTO_LAYERS).find(
      (e) => e.layerId === "water" && e.property === "fill-color",
    );
    expect(typeof waterFill?.value).toBe("string");
    expect(Array.isArray(waterFill?.value)).toBe(false);
  });

  it("never writes geometry — only paint, layout and zoom range", () => {
    // `minzoom` joined the vocabulary in M2.5 so sea names can be
    // revealed at the zooms where they orient. It decides *when* an
    // existing layer draws, never what it draws or where, so it belongs
    // on the same side of this line as paint and layout.
    for (const edit of planMaritimeStyle(CARTO_LAYERS)) {
      expect(["paint", "layout", "minzoom"]).toContain(edit.kind);
      expect(edit.property).not.toMatch(/source|filter|coordinates/i);
    }
  });

  it("suppresses street furniture that competes with maritime marks", () => {
    const edits = planMaritimeStyle(CARTO_LAYERS);
    for (const layerId of ["roadname_major", "poi_park"]) {
      expect(edits.find((e) => e.layerId === layerId && e.property === "visibility")?.value).toBe(
        "none",
      );
    }
  });

  it("lifts maritime and place labels out of the background", () => {
    const edits = planMaritimeStyle(CARTO_LAYERS);
    const seaLabel = edits.find(
      (e) => e.layerId === "watername_sea" && e.property === "text-color",
    );
    expect(seaLabel?.value).toBe(MARITIME_PALETTE.seaLabel);
  });

  it("plans nothing for a style it does not recognise", () => {
    expect(planMaritimeStyle([{ id: "x", type: "line", "source-layer": "unheard-of" }])).toEqual(
      [],
    );
    expect(planMaritimeStyle([])).toEqual([]);
  });
});

/* ═══════ Applying ═══════ */

describe("applying the maritime style", () => {
  it("applies every planned edit and adds the coastline", () => {
    const map = fakeMap();
    const result = applyMaritimeStyle(map);

    expect(result.applied).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
    // The sea-label threshold is genuinely lowered, not merely planned.
    expect(map.zoomRanges.get("watername_sea")).toBeLessThan(5);
    expect(result.coastlineAdded).toBe(true);
    expect(map.added).toContain(COASTLINE_LAYER_ID);
    expect(result.skyApplied).toBe(true);
  });

  it("traces the coastline from the basemap's own water polygons", () => {
    // It draws an edge that already exists; it does not supply one.
    const layer = coastlineLayer();
    expect(layer.source).toBe("carto");
    expect(layer["source-layer"]).toBe("water");
  });

  /*
   * The fail-safe guarantee. CARTO owns the style document and can
   * rename its layers at any time; a mount that threw during styling
   * leaves a black canvas the officer cannot tell from a data outage.
   */
  it("survives a style whose layers have all been renamed", () => {
    const map = fakeMap({ getLayer: () => undefined });
    const result = applyMaritimeStyle(map);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("survives a property write that throws", () => {
    const map = fakeMap({
      setPaintProperty: vi.fn(() => {
        throw new Error("style is not done loading");
      }),
    });
    expect(() => applyMaritimeStyle(map)).not.toThrow();
  });

  it("survives a style that cannot be read at all", () => {
    const map = fakeMap({
      getStyle: () => {
        throw new Error("no style");
      },
    });
    expect(() => applyMaritimeStyle(map)).not.toThrow();
    expect(applyMaritimeStyle(map).applied).toBe(0);
  });

  it("survives a renderer with no sky or addLayer support", () => {
    const map = fakeMap({ setSky: undefined, addLayer: undefined });
    const result = applyMaritimeStyle(map);
    expect(result.skyApplied).toBe(false);
    expect(result.coastlineAdded).toBe(false);
    expect(result.applied).toBeGreaterThan(0);
  });

  it("does not add the coastline twice", () => {
    const map = fakeMap();
    applyMaritimeStyle(map);
    applyMaritimeStyle(map);
    expect(map.added.filter((id) => id === COASTLINE_LAYER_ID)).toHaveLength(1);
  });
});

/* ═══════ Graticule ═══════ */

describe("graticule", () => {
  it("generates meridians and parallels across the bounds", () => {
    const g = graticuleFeatures([
      [-10, -4],
      [20, 14],
    ]);
    const meridians = g.features.filter((f) => f.properties.axis === "meridian");
    const parallels = g.features.filter((f) => f.properties.axis === "parallel");
    // -10..20 and -4..14 inclusive, at one degree.
    expect(meridians).toHaveLength(31);
    expect(parallels).toHaveLength(19);
  });

  it("tags each line with the coarsest interval it belongs to", () => {
    const g = graticuleFeatures([
      [-10, -4],
      [20, 14],
    ]);
    const stepFor = (axis: string, degrees: number) =>
      g.features.find((f) => f.properties.axis === axis && f.properties.degrees === degrees)
        ?.properties.step;

    expect(stepFor("meridian", 10)).toBe(10);
    expect(stepFor("meridian", 5)).toBe(5);
    expect(stepFor("meridian", 7)).toBe(1);
    expect(stepFor("meridian", 0)).toBe(10);
    // Negative degrees divide the same way.
    expect(stepFor("meridian", -10)).toBe(10);
  });

  it("is exact: every line is a straight two-point segment", () => {
    // Meridians and parallels are both straight in Web Mercator, so no
    // densification is needed and none is invented.
    for (const f of graticuleFeatures().features) {
      expect(f.geometry.coordinates).toHaveLength(2);
    }
  });

  it("stays small enough to be free", () => {
    expect(graticuleFeatures().features.length).toBeLessThan(80);
  });

  it("declares its steps coarsest first", () => {
    expect([...GRATICULE_STEPS]).toEqual([...GRATICULE_STEPS].sort((a, b) => b - a));
  });
});
