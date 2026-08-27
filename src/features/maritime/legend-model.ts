/**
 * What the legend should currently explain.
 *
 * A legend is a key to the picture in front of the officer, not a
 * catalogue of everything Seaphore can draw. The previous one listed the
 * whole symbol vocabulary regardless of what was switched on, so an
 * officer looking at ports and the EEZ was shown entries for vessel risk
 * rings, cluster counts and weather — none of which were on the map.
 * That is worse than no legend: it teaches that the key and the map are
 * unrelated, and then the key stops being consulted at all.
 *
 * So this derives from `activeLayers`. Switch a layer off and its entry
 * leaves; switch one on and its entry appears. The legend cannot describe
 * a symbol the map is not drawing, because it has no list of its own.
 *
 * ## Only layers that can actually draw
 *
 * A `pending-source` layer may be toggled on — the catalogue deliberately
 * allows that, so an officer can see the capability exists — but nothing
 * appears on the map. It must not appear in the legend either, or the key
 * would explain a symbol that is not there.
 */
import { layerRegistry, type LayerRegistry } from "@/services/geospatial";
import { MAP_SYMBOLS, type MapSymbolKind } from "@/lib/map-symbols";

/** How a legend entry is drawn. */
export type LegendGlyphKind = MapSymbolKind | "eez-boundary" | "graticule";

export interface LegendEntry {
  /** Logical layer this entry explains. */
  readonly layerId: string;
  readonly glyph: LegendGlyphKind;
  readonly label: string;
}

/**
 * Logical layer → the symbol it puts on the map.
 *
 * Keyed by registry id rather than by render id, because the legend
 * explains what an officer switched on, and what they switch on is a
 * logical layer. A layer absent from this map draws nothing an officer
 * needs a key for — the graticule's own labels, for instance, explain
 * themselves.
 */
const LAYER_GLYPHS: Readonly<Record<string, LegendGlyphKind>> = {
  vessels: "vessel",
  ports: "port",
  anchorages: "anchorage",
  incidents: "incident",
  "investigation-areas": "restricted-zone",
  "restricted-zones": "restricted-zone",
  weather: "weather-alert",
  "nigeria-eez": "eez-boundary",
  graticule: "graticule",
};

/** Officer-facing labels for the two line treatments MAP_SYMBOLS has no entry for. */
const LINE_LABELS: Readonly<Record<"eez-boundary" | "graticule", string>> = {
  "eez-boundary": "Nigerian EEZ",
  graticule: "Graticule",
};

function labelFor(glyph: LegendGlyphKind): string {
  if (glyph === "eez-boundary" || glyph === "graticule") return LINE_LABELS[glyph];
  return MAP_SYMBOLS[glyph].label;
}

/**
 * The entries the legend should show right now.
 *
 * Ordered by the registry's own order so the legend reads down in the
 * same sequence as the layer list, rather than in whatever order the
 * active set happens to hold.
 */
export function legendEntriesFor(
  activeLayers: readonly string[],
  registry: LayerRegistry = layerRegistry,
): readonly LegendEntry[] {
  const active = new Set(activeLayers.map((id) => registry.resolveId(id)));
  const entries: LegendEntry[] = [];

  for (const layer of registry.list()) {
    if (!active.has(layer.id)) continue;
    /*
     * A layer with no connected source draws nothing, however it is
     * toggled. Explaining its symbol would be a key to an absence.
     */
    if (layer.status !== "ready") continue;
    const glyph = LAYER_GLYPHS[layer.id];
    if (!glyph) continue;
    entries.push({ layerId: layer.id, glyph, label: labelFor(glyph) });
  }

  return entries;
}

/**
 * Whether the legend has anything to say.
 *
 * An empty legend is a real state — every operational layer switched off
 * — and the control should say so rather than open onto nothing.
 */
export function hasLegendContent(
  activeLayers: readonly string[],
  registry: LayerRegistry = layerRegistry,
): boolean {
  return legendEntriesFor(activeLayers, registry).length > 0;
}
