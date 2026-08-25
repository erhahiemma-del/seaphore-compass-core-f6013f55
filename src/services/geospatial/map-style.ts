/**
 * Maritime restyling of the basemap.
 *
 * The basemap is CARTO Dark Matter — a general-purpose dark city style
 * whose priorities are roads and buildings. This module retunes it for a
 * maritime picture: land becomes a solid neutral mass, the ocean becomes
 * the subject, the coastline is drawn explicitly instead of being left
 * as an accident of two similar fills meeting, and street furniture gets
 * out of the way until the officer is close enough to want it.
 *
 * ## Nothing here adds a geographic claim
 *
 * Every polygon, line and label restyled below is already in CARTO's
 * vector tiles, drawn from OpenStreetMap. This module changes paint, not
 * geometry: no coastline is moved, no feature is invented, and no colour
 * varies with position in a way that could be read as a measurement.
 * The one layer it *adds* — the coastline — traces the boundary of the
 * existing water polygons, so it draws an edge that was always there.
 *
 * ## Why nothing is matched by layer id
 *
 * CARTO owns that style document and can rename or reorganise its 93
 * layers without telling us. Matching on `source-layer` and layer type
 * means a rename degrades to "that rule found nothing" rather than to a
 * half-restyled map. Every write is individually guarded, and a failure
 * anywhere is reported and skipped: a basemap that is merely the wrong
 * colour is recoverable, and one that threw during styling is not.
 */
import { MARITIME_PALETTE, SKY_TREATMENT, type MaritimePalette } from "./constants";

/** The subset of a style layer this module needs in order to decide. */
export interface StyleLayerSummary {
  readonly id: string;
  readonly type: string;
  readonly "source-layer"?: string;
}

/** One property write, decided but not yet applied. */
export interface StyleEdit {
  readonly layerId: string;
  readonly kind: "paint" | "layout";
  readonly property: string;
  readonly value: unknown;
}

/**
 * The map surface this module drives.
 *
 * Structural rather than `maplibregl.Map` so the planning and
 * application logic can be exercised against a fake in unit tests, which
 * is the only way to check the fail-safe behaviour without WebGL.
 */
export interface StyleTarget {
  getStyle(): { layers?: readonly StyleLayerSummary[] } | undefined;
  getLayer(id: string): unknown;
  setPaintProperty(id: string, property: string, value: unknown): unknown;
  setLayoutProperty(id: string, property: string, value: unknown): unknown;
  addLayer?(layer: Record<string, unknown>, beforeId?: string): unknown;
  setSky?(sky: Record<string, unknown>): unknown;
}

/** Render layer id for the coastline this module installs. */
export const COASTLINE_LAYER_ID = "maritime-coastline";

/** Source id of the basemap's vector tiles, per its style document. */
const BASEMAP_SOURCE = "carto";

/**
 * Zoom at which street-level basemap detail is allowed back in.
 *
 * Below this the officer is reading a maritime picture and road casings
 * are noise; at and above it they are inspecting a port approach, where
 * the surrounding street pattern is genuine context.
 */
const STREET_DETAIL_MINZOOM = 11;

/**
 * Decide every paint and layout change, without applying any of them.
 *
 * Pure: same layers in, same edits out. Keeping the decision separate
 * from the writes is what lets a test assert that no rule targets a
 * layer the style does not have, and that no rule touches geometry.
 */
export function planMaritimeStyle(
  layers: readonly StyleLayerSummary[],
  palette: MaritimePalette = MARITIME_PALETTE,
): readonly StyleEdit[] {
  const edits: StyleEdit[] = [];
  const paint = (layerId: string, property: string, value: unknown) =>
    edits.push({ layerId, kind: "paint", property, value });
  const layout = (layerId: string, property: string, value: unknown) =>
    edits.push({ layerId, kind: "layout", property, value });

  for (const layer of layers) {
    const sourceLayer = layer["source-layer"];

    // ── The ground plane ──
    if (layer.type === "background") {
      paint(layer.id, "background-color", palette.land);
      continue;
    }

    switch (sourceLayer) {
      // ── Land ──
      case "landcover":
      case "park":
        if (layer.type === "fill") paint(layer.id, "fill-color", palette.land);
        break;

      case "landuse":
        // Built-up land lifts a shade so cities read as settlement rather
        // than as a hole in the landmass.
        if (layer.type === "fill") paint(layer.id, "fill-color", palette.landUrban);
        break;

      // ── Water ──
      case "water":
        if (layer.type === "fill") {
          // Open sea takes the primary tone; the basemap's inshore
          // water classes take the lighter secondary tone, so the sea
          // carries subtle variation without any invented bathymetry.
          paint(layer.id, "fill-color", [
            "match",
            ["get", "class"],
            ["ocean"],
            palette.ocean,
            palette.oceanShallow,
          ]);
          paint(layer.id, "fill-opacity", 1);
        }
        break;

      case "waterway":
        if (layer.type === "line") {
          paint(layer.id, "line-color", palette.waterway);
          // Estuaries and delta channels gain width with zoom rather than
          // appearing all at once.
          paint(layer.id, "line-width", [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0.4,
            10,
            1.1,
            14,
            2.2,
          ]);
          paint(layer.id, "line-opacity", 0.85);
        } else if (layer.type === "symbol") {
          paint(layer.id, "text-color", palette.seaLabel);
          paint(layer.id, "text-halo-color", palette.labelHalo);
        }
        break;

      // ── Maritime and geographic labels ──
      case "water_name":
        // Sea and ocean names are orientation, and Dark Matter styles
        // them at #3c3c3c — effectively invisible on water.
        paint(layer.id, "text-color", palette.seaLabel);
        paint(layer.id, "text-halo-color", palette.labelHalo);
        paint(layer.id, "text-halo-width", 1.4);
        break;

      case "place":
        paint(layer.id, "text-color", palette.placeLabel);
        paint(layer.id, "text-halo-color", palette.labelHalo);
        paint(layer.id, "text-halo-width", 1.4);
        break;

      // ── Administrative boundaries: kept, dimmed ──
      case "boundary":
        if (layer.type === "line") {
          paint(layer.id, "line-color", palette.boundary);
          paint(layer.id, "line-opacity", 0.55);
        }
        break;

      // ── Street furniture: deferred until close zoom ──
      case "transportation":
      case "aeroway":
        if (layer.type === "line") {
          paint(layer.id, "line-opacity", [
            "interpolate",
            ["linear"],
            ["zoom"],
            STREET_DETAIL_MINZOOM - 1,
            0,
            STREET_DETAIL_MINZOOM + 2,
            0.5,
          ]);
        }
        break;

      case "transportation_name":
      case "poi":
      case "housenumber":
        // Road names and points of interest compete directly with vessel
        // and port labels, and lose nothing by arriving later.
        layout(layer.id, "visibility", "none");
        break;

      case "building":
        if (layer.type === "fill") {
          paint(layer.id, "fill-opacity", ["interpolate", ["linear"], ["zoom"], 14, 0, 16, 0.35]);
        }
        break;

      default:
        break;
    }
  }

  return edits;
}

/**
 * The coastline layer.
 *
 * Traces the outline of the basemap's existing water polygons, so it
 * asserts nothing new — it makes an edge legible that was previously
 * only the meeting point of two near-identical fills. Width and opacity
 * climb with zoom so the strategic view reads as a clean silhouette and
 * the close view resolves individual creeks.
 */
export function coastlineLayer(palette: MaritimePalette = MARITIME_PALETTE): Record<string, unknown> {
  return {
    id: COASTLINE_LAYER_ID,
    type: "line",
    source: BASEMAP_SOURCE,
    "source-layer": "water",
    paint: {
      "line-color": palette.coastline,
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 7, 0.8, 11, 1.6, 15, 2.6],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.45, 7, 0.7, 12, 0.9],
    },
  };
}

/** Reported by {@link applyMaritimeStyle} so callers can log or assert. */
export interface MaritimeStyleResult {
  readonly applied: number;
  readonly skipped: number;
  readonly coastlineAdded: boolean;
  readonly skyApplied: boolean;
}

/**
 * Retune the loaded basemap for maritime work.
 *
 * Safe to call on any style, including one that has nothing this module
 * recognises: unknown layers are skipped, a failed write is counted and
 * stepped over, and the whole function is total. It must never throw —
 * it runs inside the renderer's mount path, and a style that is the
 * wrong colour is an inconvenience while a mount that threw is a black
 * canvas the officer cannot tell from a data outage.
 */
export function applyMaritimeStyle(
  map: StyleTarget,
  palette: MaritimePalette = MARITIME_PALETTE,
): MaritimeStyleResult {
  let applied = 0;
  let skipped = 0;

  let layers: readonly StyleLayerSummary[] = [];
  try {
    layers = map.getStyle()?.layers ?? [];
  } catch {
    // A style that cannot be read is one we cannot restyle. The basemap
    // still draws in CARTO's own colours, which is a working map.
    return { applied: 0, skipped: 0, coastlineAdded: false, skyApplied: false };
  }

  for (const edit of planMaritimeStyle(layers, palette)) {
    try {
      // The layer may have been removed between reading the style and
      // writing to it — a style reload, or a fallback basemap swap.
      if (!map.getLayer(edit.layerId)) {
        skipped += 1;
        continue;
      }
      if (edit.kind === "paint") map.setPaintProperty(edit.layerId, edit.property, edit.value);
      else map.setLayoutProperty(edit.layerId, edit.property, edit.value);
      applied += 1;
    } catch {
      skipped += 1;
    }
  }

  let coastlineAdded = false;
  try {
    const hasWaterSource = layers.some((layer) => layer["source-layer"] === "water");
    if (hasWaterSource && map.addLayer && !map.getLayer(COASTLINE_LAYER_ID)) {
      map.addLayer(coastlineLayer(palette));
      coastlineAdded = true;
    }
  } catch {
    // No coastline emphasis. The land/water contrast above still makes
    // the edge readable on its own.
  }

  let skyApplied = false;
  try {
    if (map.setSky) {
      map.setSky({ ...SKY_TREATMENT });
      skyApplied = true;
    }
  } catch {
    // Sky is atmosphere only; its absence costs no information.
  }

  return { applied, skipped, coastlineAdded, skyApplied };
}
