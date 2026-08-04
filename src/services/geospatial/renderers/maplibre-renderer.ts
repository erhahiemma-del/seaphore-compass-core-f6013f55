/**
 * GIP — MapLibre renderer adapter (stub).
 *
 * The 2D Operational View adapter. **`maplibre-gl` is not a dependency of
 * this repository yet**, so this class currently inherits the stub's
 * bookkeeping and draws nothing. It exists now so that the injection site,
 * the type surface, and the integration contract are all settled — installing
 * the library later is a change to this file alone.
 *
 * ## Completing this adapter
 *
 * 1. `bun add maplibre-gl` (and import `maplibre-gl/dist/maplibre-gl.css`).
 * 2. Replace the `extends StubMapRenderer` with a real implementation of
 *    {@link MapRenderer}, holding a `maplibregl.Map` instance.
 * 3. Per method:
 *
 *    - `mount`: construct `new maplibregl.Map({ container, style, center,
 *      zoom, minZoom, maxZoom, maxBounds, attributionControl: false,
 *      pitchWithRotate: false })`; add `NavigationControl` (top-left),
 *      `ScaleControl` with `unit: "nautical"` (bottom-left), and a custom
 *      `AttributionControl` (bottom-right). Resolve on the `load` event, then
 *      emit `map:ready`.
 *    - `mount` (events): forward `moveend` to `map:move`, feature clicks on
 *      `LAYER_IDS.vessels` to `vessel:click`, `mousemove`/`mouseleave` to
 *      `vessel:hover`, and bare-basemap clicks to `map:click`. Interaction is
 *      reported on the bus only — never via callbacks.
 *    - `setVesselData`: `(map.getSource("vessels") as GeoJSONSource).setData(collection)`.
 *    - `patchVessels`: keep a local `Map<imo, VesselFeature>`, apply the
 *      batch, then `setData` with the merged collection. MapLibre has no
 *      per-feature source mutation, so the incremental win comes from the
 *      update engine's diffing (small batches, no work when nothing changed)
 *      rather than from a partial GL upload. Do **not** re-derive features
 *      for untouched vessels.
 *    - `setLayerVisibility`: `map.setLayoutProperty(id, "visibility", visible
 *      ? "visible" : "none")`, guarded by `map.getLayer(id)`.
 *    - `loadVesselIcons`: build the risk-coloured arrow sprites and register
 *      each with `map.addImage(id, imageData)` when `!map.hasImage(id)`.
 *      Sprite ids must match {@link vesselIconId}: `vessel-critical`,
 *      `vessel-high`, `vessel-medium`, `vessel-low`, `vessel-unknown`,
 *      `vessel-clean`, `vessel-selected`, `vessel-stale`.
 *    - `destroy`: `map.remove()` and drop every listener.
 *
 * 4. The sources and layers to create on `load` (ids from `LAYER_IDS`):
 *    `nigeria-eez` (line, gold dashed), `nimasa-ports` (symbol + circle for
 *    anchorage), `vessels` (symbol layer with `icon-rotate` bound to the
 *    `heading` property and `icon-opacity` bound to `opacity`).
 *
 * Nothing above this file changes when that work happens: consumers depend on
 * {@link MapRenderer}, and the engine is selected by injection.
 */
import type { MapRendererDependencies } from "../renderer";
import { StubMapRenderer } from "./stub-renderer";

/**
 * Whether a real MapLibre engine is available.
 *
 * Surfaced so the UI can tell the officer the map is running without a
 * rendering engine, rather than showing an empty canvas that looks like a
 * data outage. Flip to a real capability check when the dependency lands.
 */
export const MAPLIBRE_AVAILABLE = false;

export class MapLibreRenderer extends StubMapRenderer {
  override readonly id = "maplibre";

  constructor(dependencies?: Partial<MapRendererDependencies>) {
    super(dependencies);
  }

  /**
   * True once this adapter actually draws. Until `maplibre-gl` is installed
   * it reports false, and hosts should present the "renderer pending" state.
   */
  get isRealEngine(): boolean {
    return MAPLIBRE_AVAILABLE;
  }
}
