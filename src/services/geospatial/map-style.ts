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
import { MARITIME_PALETTE, SKY_TREATMENT, ZOOM_BANDS } from "./constants";

/** The subset of a style layer this module needs in order to decide. */
export interface StyleLayerSummary {
  readonly id: string;
  readonly type: string;
  readonly "source-layer"?: string;
  /** The layer's own lower zoom bound, when the style declares one. */
  readonly minzoom?: number;
}

/**
 * One property write, decided but not yet applied.
 *
 * `minzoom` is its own kind rather than a layout property because
 * MapLibre exposes it through `setLayerZoomRange`, not
 * `setLayoutProperty` — passing it to the latter is accepted and does
 * nothing, which is the quietest possible failure.
 */
export interface StyleEdit {
  readonly layerId: string;
  readonly kind: "paint" | "layout" | "minzoom";
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
  /** Optional: absent on a target that cannot retune zoom ranges. */
  setLayerZoomRange?(id: string, minzoom: number, maxzoom?: number): unknown;
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
 * Zoom at which sea and ocean names are allowed in.
 *
 * The basemap holds `watername_sea` back to zoom 5, which is a city
 * style's judgement: on a road map an ocean label is decoration. On a
 * maritime picture it is the primary orientation cue at the exact zooms
 * where nothing else is legible, and the underlying tiles carry the
 * points from zoom 2 — verified by querying the source directly, not
 * assumed. Lowering the layer's own `minzoom` therefore reveals data
 * that was already there rather than overzooming an empty tile.
 */
const SEA_LABEL_MINZOOM = 3;

/**
 * Label hierarchy across the three reading bands.
 *
 * One expression applied to every `place` symbol layer, because the
 * basemap splits places across fifteen layers by class and rank and
 * matching them individually would be matching by id — the thing this
 * module refuses to do. A single class-driven ramp reaches all fifteen
 * and degrades to "no change" on any layer whose features lack `class`.
 *
 * The shape is forced: MapLibre requires `["zoom"]` to be the outermost
 * element, so zoom interpolates on the outside and each stop is a `case`
 * over the feature's own class. The inverse — a `case` containing a zoom
 * expression — is rejected, and rejected silently.
 *
 * The hierarchy inverts across the bands on purpose. At world zoom the
 * question is "which landmass am I looking at", so continents lead and
 * countries murmur; by operational zoom the continent is self-evident
 * and would only be clutter, so it goes to nothing.
 */
function placeLabelOpacity(): unknown {
  const byClass = (continent: number, country: number, state: number, city: number) => [
    "case",
    ["==", ["get", "class"], "continent"],
    continent,
    ["==", ["get", "class"], "country"],
    country,
    ["any", ["==", ["get", "class"], "state"], ["==", ["get", "class"], "province"]],
    state,
    city,
  ];

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    // World: continents carry the picture, countries are context.
    ZOOM_BANDS.worldMin,
    byClass(0.92, 0.42, 0, 0),
    3,
    byClass(0.8, 0.5, 0, 0.35),
    // Regional: countries lead, the continent recedes.
    ZOOM_BANDS.regionalMin,
    byClass(0.4, 0.82, 0.3, 0.55),
    6,
    byClass(0.12, 0.85, 0.45, 0.7),
    // Operational: the continent is redundant, settlement detail leads.
    ZOOM_BANDS.operationalMin,
    byClass(0, 0.6, 0.6, 0.9),
    12,
    byClass(0, 0.45, 0.55, 0.95),
  ];
}

/**
 * Label size across the same bands.
 *
 * Opacity alone would leave a continent name set at city size, which
 * reads as a faint city rather than a quiet continent. Size is the
 * second, colour-independent channel that makes the hierarchy survive a
 * greyscale export.
 */
function placeLabelSize(): unknown {
  const byClass = (continent: number, country: number, other: number) => [
    "case",
    ["==", ["get", "class"], "continent"],
    continent,
    ["==", ["get", "class"], "country"],
    country,
    other,
  ];

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ZOOM_BANDS.worldMin,
    byClass(13, 9.5, 9),
    ZOOM_BANDS.regionalMin,
    byClass(14, 11.5, 10),
    ZOOM_BANDS.operationalMin,
    byClass(14, 12.5, 12),
  ];
}

/**
 * Decide every paint and layout change, without applying any of them.
 *
 * Pure: same layers in, same edits out. Keeping the decision separate
 * from the writes is what lets a test assert that no rule targets a
 * layer the style does not have, and that no rule touches geometry.
 */
export function planMaritimeStyle(layers: readonly StyleLayerSummary[]): readonly StyleEdit[] {
  const edits: StyleEdit[] = [];
  const paint = (layerId: string, property: string, value: unknown) =>
    edits.push({ layerId, kind: "paint", property, value });
  const layout = (layerId: string, property: string, value: unknown) =>
    edits.push({ layerId, kind: "layout", property, value });
  const minzoom = (layerId: string, value: number) =>
    edits.push({ layerId, kind: "minzoom", property: "minzoom", value });

  for (const layer of layers) {
    const sourceLayer = layer["source-layer"];

    // ── The ground plane ──
    if (layer.type === "background") {
      paint(layer.id, "background-color", MARITIME_PALETTE.land);
      continue;
    }

    switch (sourceLayer) {
      // ── Land ──
      case "landcover":
      case "park":
        if (layer.type === "fill") paint(layer.id, "fill-color", MARITIME_PALETTE.land);
        break;

      case "landuse":
        // Built-up land lifts a shade so cities read as settlement rather
        // than as a hole in the landmass.
        if (layer.type === "fill") paint(layer.id, "fill-color", MARITIME_PALETTE.landUrban);
        break;

      // ── Water ──
      case "water":
        if (layer.type === "fill") {
          paint(layer.id, "fill-color", MARITIME_PALETTE.ocean);
          paint(layer.id, "fill-opacity", 1);
        }
        break;

      case "waterway":
        if (layer.type === "line") {
          paint(layer.id, "line-color", MARITIME_PALETTE.waterway);
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
          paint(layer.id, "text-color", MARITIME_PALETTE.seaLabel);
          paint(layer.id, "text-halo-color", MARITIME_PALETTE.labelHalo);
        }
        break;

      // ── Maritime and geographic labels ──
      case "water_name":
        // Sea and ocean names are orientation, and Dark Matter styles
        // them at #3c3c3c — effectively invisible on water.
        paint(layer.id, "text-color", MARITIME_PALETTE.seaLabel);
        paint(layer.id, "text-halo-color", MARITIME_PALETTE.labelHalo);
        paint(layer.id, "text-halo-width", 1.4);
        /*
         * Let sea names in early.
         *
         * `minzoom` is a layout-adjacent property with its own setter,
         * so it is expressed as a layout edit and applied through
         * `setLayerZoomRange` at write time. Only ever *lowered*: a
         * layer already visible sooner keeps its own threshold, because
         * raising one would hide a label the basemap intended to show.
         */
        minzoom(layer.id, SEA_LABEL_MINZOOM);
        break;

      case "place":
        paint(layer.id, "text-color", MARITIME_PALETTE.placeLabel);
        paint(layer.id, "text-halo-color", MARITIME_PALETTE.labelHalo);
        paint(layer.id, "text-halo-width", 1.4);
        // Zoom- and class-aware hierarchy, so the world view is read by
        // continent and the port view by settlement. See above.
        paint(layer.id, "text-opacity", placeLabelOpacity());
        layout(layer.id, "text-size", placeLabelSize());
        break;

      // ── Administrative boundaries: kept, dimmed, zoom-aware ──
      case "boundary":
        if (layer.type === "line") {
          paint(layer.id, "line-color", MARITIME_PALETTE.boundary);
          /*
           * Faint at world zoom, firmer as the officer closes.
           *
           * A flat 0.55 meant every national border on earth was drawn
           * at working weight while the officer was reading the globe —
           * a dense web over the one view where land divisions matter
           * least. Internal borders are never the maritime subject;
           * they earn contrast only once the view is about a specific
           * coast.
           */
          paint(layer.id, "line-opacity", [
            "interpolate",
            ["linear"],
            ["zoom"],
            ZOOM_BANDS.worldMin,
            0.16,
            ZOOM_BANDS.regionalMin,
            0.34,
            ZOOM_BANDS.operationalMin,
            0.55,
          ]);
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
export function coastlineLayer(): Record<string, unknown> {
  return {
    id: COASTLINE_LAYER_ID,
    type: "line",
    source: BASEMAP_SOURCE,
    "source-layer": "water",
    paint: {
      "line-color": MARITIME_PALETTE.coastline,
      /*
       * Anchored at zoom 1, not zoom 4.
       *
       * A ramp whose first stop is 4 does not fade below it — MapLibre
       * clamps to the first stop, so the whole world view was drawn at
       * regional coastline weight. On a globe that is a hard bright
       * outline traced around every landmass, which is precisely the
       * "competes with the entities" failure the coastline is supposed
       * to avoid. It now thins and softens into the world view, where
       * the land/water *fill* contrast is already doing the work and
       * the edge only needs to confirm it.
       */
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        ZOOM_BANDS.worldMin,
        0.25,
        ZOOM_BANDS.regionalMin,
        0.5,
        7,
        0.8,
        11,
        1.6,
        15,
        2.6,
      ],
      "line-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        ZOOM_BANDS.worldMin,
        0.32,
        ZOOM_BANDS.regionalMin,
        0.5,
        7,
        0.7,
        12,
        0.9,
      ],
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
export function applyMaritimeStyle(map: StyleTarget): MaritimeStyleResult {
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

  for (const edit of planMaritimeStyle(layers)) {
    try {
      // The layer may have been removed between reading the style and
      // writing to it — a style reload, or a fallback basemap swap.
      if (!map.getLayer(edit.layerId)) {
        skipped += 1;
        continue;
      }
      if (edit.kind === "paint") {
        map.setPaintProperty(edit.layerId, edit.property, edit.value);
      } else if (edit.kind === "minzoom") {
        /*
         * Only ever lower a threshold.
         *
         * The existing `minzoom` is read from the style rather than
         * assumed, and a layer the basemap already shows earlier keeps
         * its own value. Raising one here would hide a label CARTO
         * intended to draw — a subtraction dressed up as a retune.
         */
        const existing = layers.find((candidate) => candidate.id === edit.layerId)?.minzoom;
        const next = edit.value as number;
        if (!map.setLayerZoomRange || (existing !== undefined && existing <= next)) {
          skipped += 1;
          continue;
        }
        map.setLayerZoomRange(edit.layerId, next);
      } else {
        map.setLayoutProperty(edit.layerId, edit.property, edit.value);
      }
      applied += 1;
    } catch {
      skipped += 1;
    }
  }

  let coastlineAdded = false;
  try {
    const hasWaterSource = layers.some((layer) => layer["source-layer"] === "water");
    if (hasWaterSource && map.addLayer && !map.getLayer(COASTLINE_LAYER_ID)) {
      map.addLayer(coastlineLayer());
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
