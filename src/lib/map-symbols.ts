/**
 * Maritime symbol tokens — one definition, used by map and legend.
 *
 * Every operational object on the National Maritime Picture must carry a
 * recognisable silhouette, not a coloured dot: shape says *what it is*,
 * colour says *what it means*. The map sprites (Canvas → MapLibre
 * `addImage`) and the legend glyphs (inline SVG) are both generated from
 * the geometry below, so the legend can never drift from the map.
 *
 * Geometry is authored on a 24×24 grid and scaled at draw time.
 */

export type MapSymbolKind =
  | "vessel"
  | "port"
  | "anchorage"
  | "incident"
  | "restricted-zone"
  | "weather-alert";

export interface MapSymbolToken {
  readonly kind: MapSymbolKind;
  readonly label: string;
  /** Semantic colour. Fill for solid symbols, stroke for outlined ones. */
  readonly color: string;
  /** Primary silhouette path on the 24×24 grid. */
  readonly path: string;
  /** Optional detail drawn on top in {@link detailColor}. */
  readonly detail?: string;
  readonly detailColor?: string;
  /** Outlined symbols are stroked, not filled (zones, weather). */
  readonly outlined?: boolean;
  /** Dashed outline — used for boundary-style symbols. */
  readonly dashed?: boolean;
}

/** Generic ship hull, bow to the north. Never a disc. */
const HULL_PATH = "M12 1.8 16.6 11.4 16.6 20.4 12 18 7.4 20.4 7.4 11.4Z";

/**
 * Port / harbour: a quay with a container crane above it.
 *
 * Deliberately not an anchor. Port and anchorage are different objects,
 * so they must not share a silhouette — the anchor belongs to the
 * anchorage alone.
 */
const PORT_PATH =
  "M2.4 18.4h19.2v3.2H2.4Z" +
  "M6.4 2.4h1.9v14.4H6.4Z" +
  "M6.4 2.4h13.2v1.9H6.4Z" +
  "M17.7 4.3h1.9v5.1h-1.9Z" +
  "M11.4 6.6h6.3v1.7h-6.3Z" +
  "M10.6 6.6h1.7v10.2h-1.7Z";

/** Anchor: ring, shank, stock and curved arms. */
const ANCHOR_PATH =
  "M12 1.6a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Zm0 1.7a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM11 7.4h2v13.1h-2Z" +
  "M7.4 9.2h9.2v1.8H7.4Z" +
  "M3.6 13.4h2.2c0 3 2.7 5.4 6.2 5.4s6.2-2.4 6.2-5.4h2.2c0 4.3-3.8 7.7-8.4 7.7S3.6 17.7 3.6 13.4Z";

/** Warning triangle plus exclamation. */
const WARNING_PATH = "M12 2.4 22.6 20.9H1.4Z";
const WARNING_DETAIL = "M11.1 9.6h1.8v5.6h-1.8Zm0 6.9h1.8v1.9h-1.8Z";

/** Weather alert: alert triangle with a lightning cue. */
const WEATHER_DETAIL = "M13.4 9.4 9.6 15.6h2.5l-.7 3.9 3.8-5.9h-2.5Z";

export const MAP_SYMBOLS: Readonly<Record<MapSymbolKind, MapSymbolToken>> = {
  vessel: {
    kind: "vessel",
    label: "Vessels",
    color: "#25B36B",
    path: HULL_PATH,
  },
  port: {
    kind: "port",
    label: "Ports",
    // Seaphore cyan/blue. Ports are estate, not observation — this blue
    // is used by no risk band and no vessel state.
    color: "#0268CA",
    path: PORT_PATH,
  },
  anchorage: {
    kind: "anchorage",
    label: "Anchorage",
    // Violet, one clear step away from the port blue.
    color: "#7C5CD6",
    path: ANCHOR_PATH,
  },
  incident: {
    kind: "incident",
    label: "Incidents",
    color: "#E0453A",
    path: WARNING_PATH,
    detail: WARNING_DETAIL,
    detailColor: "#FFFFFF",
  },
  "restricted-zone": {
    kind: "restricted-zone",
    label: "Restricted Zone",
    color: "#E9A93B",
    path: "M3 5.5h18v13H3Z",
    outlined: true,
    dashed: true,
  },
  "weather-alert": {
    kind: "weather-alert",
    label: "Weather Alert",
    color: "#E9EEF3",
    path: WARNING_PATH,
    detail: WEATHER_DETAIL,
    detailColor: "#E9EEF3",
    outlined: true,
  },
} as const;

/** Legend order, as specified by the operational reference. */
export const MAP_SYMBOL_ORDER: readonly MapSymbolKind[] = [
  "vessel",
  "port",
  "anchorage",
  "incident",
  "restricted-zone",
  "weather-alert",
] as const;

/** The 24×24 authoring grid, exposed so both renderers scale identically. */
export const MAP_SYMBOL_GRID = 24;
