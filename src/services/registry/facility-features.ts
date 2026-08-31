/**
 * Turning the facility registry into something the map can draw.
 *
 * The registry ships its own rendering specification — a MAP CONFIG sheet
 * plus a category, layer, zoom tier and popup line on every row — and
 * this honours it rather than deciding independently. An FPSO appears at
 * national zoom and a private jetty at facility zoom because the registry
 * says so, not because a rule here inferred it from the class name.
 *
 * ## The two rules that matter more than the styling
 *
 * MAP CONFIG states both, and they are the reason this file exists at all
 * rather than a `map(f => point(f))`:
 *
 * > PORT_CENTROID — Do NOT drop an individual pin: plotting
 * > centroid-sharing terminals as separate pins would stack false markers
 * > on one point.
 *
 * > UNVERIFIED — No map marker. The map must never look precise while
 * > being wrong.
 *
 * So only facilities the registry locates in their own right become
 * features. Nineteen terminals share their port's coordinate and are
 * deliberately absent from the map; they appear in the port's panel,
 * which is where the registry says they belong.
 */
import type {
  CoordinatePrecision,
  DataState,
  FacilityRegistry,
  RegistryPoint,
  RegistryPresentation,
} from "./registry-ingest";

/**
 * Colours as MAP CONFIG assigns them, by category.
 *
 * Taken from the workbook rather than from Seaphore's palette because the
 * registry groups facilities by cargo economy — every container, bulk and
 * RoRo terminal shares one colour, and the sheet is explicit that they
 * are distinguished "by icon shape, not color alone". Inventing a colour
 * per class here would break that grouping.
 */
export const FACILITY_COLORS: Readonly<Record<string, string>> = {
  port: "#1F3057",
  terminal: "#1F6F6F",
  energy: "#BF9000",
  gas: "#8A6D1D",
  industrial: "#2C5F63",
  services: "#6B7A8F",
};

export type FacilityPalette = keyof typeof FACILITY_COLORS;

/**
 * Which palette a registry category belongs to.
 *
 * Matched on the category text the registry writes, and anything
 * unrecognised falls to `services` — a neutral grey — rather than
 * borrowing the colour of whichever branch happened to be last. A new
 * facility class should look unclassified, not miscategorised.
 */
export function facilityPaletteFor(category: string | null): FacilityPalette {
  const text = (category ?? "").toLowerCase();
  if (text.includes("port complex") || text.includes("deep-sea port")) return "port";
  if (text.includes("lng") || text.includes("gas")) return "gas";
  if (
    text.includes("fpso") ||
    text.includes("fso") ||
    text.includes("spm") ||
    text.includes("oil export") ||
    text.includes("offshore") ||
    text.includes("oil/energy") ||
    text.includes("oil/gas")
  ) {
    return "energy";
  }
  if (text.includes("terminal")) return "terminal";
  if (text.includes("jetty") || text.includes("logistics") || text.includes("marine facility")) {
    return "industrial";
  }
  return "services";
}

/** What the map draws for each precision, per MAP CONFIG. */
export type PrecisionStyle =
  /** Solid marker at the coordinate. */
  | "SOLID"
  /** Solid marker with a thin halo ring; tooltip notes it is approximate. */
  | "HALO"
  /** Dashed ring; requires confirmation before operational use. */
  | "ESTIMATED";

export function precisionStyle(precision: CoordinatePrecision): PrecisionStyle {
  switch (precision) {
    case "EXACT_NEAR_EXACT":
      return "SOLID";
    case "APPROXIMATE":
      return "HALO";
    case "OFFSHORE_ESTIMATED":
      return "ESTIMATED";
    /*
     * Neither of these reaches the map at all — `facilityFeatures` filters
     * them out before styling. Named here so the switch stays exhaustive
     * and a future precision cannot silently fall through to solid.
     */
    case "PORT_CENTROID":
    case "UNVERIFIED":
      return "ESTIMATED";
  }
}

/** Properties carried on every facility feature. */
export interface FacilityProperties {
  readonly id: string;
  readonly name: string;
  readonly kind: FacilityKind;
  readonly category: string | null;
  readonly layer: string | null;
  readonly zoomTier: number;
  readonly palette: FacilityPalette;
  readonly color: string;
  readonly precision: CoordinatePrecision;
  readonly precisionStyle: PrecisionStyle;
  readonly dataState: DataState;
  readonly operator: string | null;
  readonly popupSummary: string | null;
  /** The parent port's registry id, when the record names one. */
  readonly portId: string | null;
  /**
   * Whether the position may be used for distance work.
   *
   * MAP CONFIG excludes offshore estimates from nearest-facility
   * calculations until confirmed, and that exclusion has to travel with
   * the feature — a consumer computing "closest terminal" cannot be
   * expected to re-derive it from the precision string.
   */
  readonly usableForDistance: boolean;
}

export type FacilityKind = "PORT" | "TERMINAL" | "JETTY" | "OFFSHORE" | "LNG_GAS";

export interface FacilityFeature {
  readonly type: "Feature";
  readonly id: string;
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: FacilityProperties;
}

export interface FacilityFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly FacilityFeature[];
}

export const EMPTY_FACILITIES: FacilityFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface Drawable {
  readonly id: string;
  readonly name: string;
  readonly point: RegistryPoint;
  readonly presentation: RegistryPresentation;
  readonly dataState: DataState;
  readonly operator?: string | null;
  readonly portId?: string | null;
}

function toFeature(record: Drawable, kind: FacilityKind): FacilityFeature | null {
  const { lat, lon, precision, geometry } = record.point;

  /*
   * The whole rule, in one guard. `VERIFIED_GEOMETRY` is the only state
   * that means "the registry located this facility itself"; port-anchored
   * and unlocated records are handled by the port panel instead.
   */
  if (geometry !== "VERIFIED_GEOMETRY" || lat === null || lon === null) return null;

  const palette = facilityPaletteFor(record.presentation.mapCategory);

  return {
    type: "Feature",
    id: record.id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id: record.id,
      name: record.name,
      kind,
      category: record.presentation.mapCategory,
      layer: record.presentation.mapLayer,
      /*
       * Tier 3 — facility-level zoom — is the safe default for a record
       * the registry did not tier. Defaulting to 1 would put an untiered
       * jetty on the national view.
       */
      zoomTier: record.presentation.zoomTier ?? 3,
      palette,
      color: FACILITY_COLORS[palette],
      precision,
      precisionStyle: precisionStyle(precision),
      dataState: record.dataState,
      operator: record.operator ?? null,
      popupSummary: record.presentation.popupSummary,
      portId: record.portId ?? null,
      usableForDistance: precision !== "OFFSHORE_ESTIMATED",
    },
  };
}

/**
 * Every facility the registry locates well enough to draw.
 *
 * Ports come first so that, where a port and a terminal sit close
 * together, the port draws beneath — it is the parent, and MAP CONFIG has
 * child facilities collapsing into it below port-level zoom.
 */
export function facilityFeatures(registry: FacilityRegistry | null): FacilityFeatureCollection {
  if (!registry) return EMPTY_FACILITIES;

  const features: FacilityFeature[] = [];
  const add = (record: Drawable, kind: FacilityKind) => {
    const feature = toFeature(record, kind);
    if (feature) features.push(feature);
  };

  for (const port of registry.ports) add(port, "PORT");
  for (const terminal of registry.terminals) add(terminal, "TERMINAL");
  for (const facility of registry.facilities) add(facility, "JETTY");
  for (const facility of registry.offshore) add(facility, "OFFSHORE");
  for (const facility of registry.lngGas) add(facility, "LNG_GAS");

  return { type: "FeatureCollection", features };
}

/** Registry ids the map deliberately does not draw, and why. */
export interface UndrawnFacility {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

/**
 * What was left off the map.
 *
 * Reported rather than silently dropped: a facility missing from the map
 * is a question an officer will eventually ask, and the answer is a
 * property of the source rather than a fault. 23 are port-anchored and 51
 * have no coordinate of adequate quality.
 */
export function undrawnFacilities(registry: FacilityRegistry | null): readonly UndrawnFacility[] {
  if (!registry) return [];

  const undrawn: UndrawnFacility[] = [];
  const consider = (record: Drawable) => {
    if (record.point.geometry === "VERIFIED_GEOMETRY") return;
    undrawn.push({
      id: record.id,
      name: record.name,
      reason:
        record.point.geometry === "PORT_ANCHORED"
          ? "Located only to its parent port's coordinate. Drawing a separate pin would stack a false marker on the port's own point, so it is listed in the port panel instead."
          : "No coordinate of adequate source quality. Listed in the port panel rather than drawn, because the map must never look precise while being wrong.",
    });
  };

  for (const record of [
    ...registry.ports,
    ...registry.terminals,
    ...registry.facilities,
    ...registry.offshore,
    ...registry.lngGas,
  ]) {
    consider(record);
  }
  return undrawn;
}
