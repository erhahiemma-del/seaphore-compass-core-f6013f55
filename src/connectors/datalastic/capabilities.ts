/**
 * What Datalastic can actually do for Seaphore, and where each answer belongs.
 *
 * ## Why this exists
 *
 * The subscription advertises twenty-three capabilities. Eight of them
 * return data. The rest answer 404 on every path and version tried — the
 * account reports `addons: true`, and that turns out to describe what was
 * bought rather than what the API will serve. Building presentation for a
 * capability on the strength of a billing flag would produce sections that
 * are permanently empty, and an empty section reads to an officer as "this
 * vessel has no owner on record" rather than "Seaphore cannot ask".
 *
 * So every row here carries `availability`, and it is set from a probe
 * against the live API, never from the subscription. `UNAVAILABLE` rows are
 * kept rather than deleted: they are the record of what was tried, and they
 * stop the same discovery being re-bought every time someone reads the
 * capability list and wonders why ownership is missing.
 *
 * ## What the surface flags mean
 *
 * They are eligibility, not implementation. A capability may be eligible
 * for the drawer and not yet rendered there; that gap is visible by
 * comparing this registry against the UI, which is the point. What they
 * must never say is that a surface is eligible for data the provider does
 * not return — eligibility is downstream of availability.
 */

/** Whether the endpoint answers, established by probing it. */
export type CapabilityAvailability =
  /** Probed, answered, returned usable fields. */
  | "VERIFIED"
  /** Probed, answered, but the payload was empty or unusable. */
  | "EMPTY"
  /** Probed on every documented path and version; no endpoint exists. */
  | "UNAVAILABLE"
  /** Not yet probed. Never a reason to build presentation. */
  | "UNPROBED";

/**
 * How expensive an answer is.
 *
 * Datalastic bills per vessel returned, not per request, so an area scan
 * is unbounded in a way a single lookup is not. `PER_RECORD` is the class
 * that exhausted a 20,000 request allowance in about thirteen minutes.
 */
export type CapabilityCost = "FREE" | "PER_REQUEST" | "PER_RECORD";

/**
 * When the data is fetched.
 *
 * The map must stay cheap, so nothing beyond a position may load for every
 * vessel on screen. Deeper data is bought when an officer selects one
 * vessel, and the deepest only when they ask.
 */
export type LoadingStrategy =
  /** Loaded for every vessel in view. Position-class data only. */
  | "AMBIENT"
  /** Loaded once, when an officer selects a single vessel. */
  | "ON_SELECT"
  /** Loaded only on explicit request. */
  | "ON_DEMAND";

export type EntityType = "VESSEL" | "PORT" | "LOCATION";

export interface DatalasticCapability {
  readonly id: string;
  readonly name: string;
  /** Path under `https://api.datalastic.com/api/v0/`. */
  readonly endpoint: string;
  readonly entityType: EntityType;
  readonly availability: CapabilityAvailability;
  /** ISO date the availability claim was last established by probe. */
  readonly probedOn: string | null;
  readonly cost: CapabilityCost;
  readonly loading: LoadingStrategy;
  /** Cache lifetime in ms. Identity is stable; position is not. */
  readonly cacheTtlMs: number;
  readonly spatial: boolean;
  readonly temporal: boolean;

  /* Surface eligibility. Always false when availability is not VERIFIED. */
  readonly mapEligible: boolean;
  readonly drawerEligible: boolean;
  readonly searchEligible: boolean;
  readonly portEligible: boolean;
  readonly voyageEligible: boolean;
  readonly intelligenceEligible: boolean;
  readonly copilotEligible: boolean;
  readonly manifestEligible: boolean;

  /**
   * Why a capability is unavailable, or what a verified one is for.
   * Officer-facing: it is shown wherever a section cannot be filled.
   */
  readonly note: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The date every `VERIFIED` and `UNAVAILABLE` claim below was probed. */
const PROBED = "2026-08-29";

/**
 * Everything unavailable shares these: no cost, no cache, no surface.
 *
 * Spelled once so an unavailable row cannot accidentally acquire a
 * surface flag — the failure that would put an empty section in front of
 * an officer.
 */
const UNAVAILABLE = {
  availability: "UNAVAILABLE",
  probedOn: PROBED,
  cost: "FREE",
  loading: "ON_DEMAND",
  cacheTtlMs: 0,
  spatial: false,
  temporal: false,
  mapEligible: false,
  drawerEligible: false,
  searchEligible: false,
  portEligible: false,
  voyageEligible: false,
  intelligenceEligible: false,
  copilotEligible: false,
  manifestEligible: false,
} as const;

export const DATALASTIC_CAPABILITIES: ReadonlyArray<DatalasticCapability> = [
  {
    id: "area-traffic",
    name: "Area Traffic Scan",
    endpoint: "vessel_inradius",
    entityType: "VESSEL",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_RECORD",
    loading: "AMBIENT",
    cacheTtlMs: MINUTE,
    spatial: true,
    temporal: false,
    mapEligible: true,
    drawerEligible: false,
    searchEligible: false,
    portEligible: true,
    voyageEligible: false,
    intelligenceEligible: true,
    copilotEligible: true,
    manifestEligible: false,
    note: "148 vessels returned for a 50 km cell over Lagos. Billed per vessel — the single most expensive capability Seaphore uses.",
  },
  {
    id: "vessel-finder",
    name: "Vessel Finder",
    endpoint: "vessel_find",
    entityType: "VESSEL",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_RECORD",
    loading: "ON_DEMAND",
    cacheTtlMs: MINUTE,
    spatial: false,
    temporal: false,
    mapEligible: false,
    drawerEligible: false,
    searchEligible: true,
    portEligible: false,
    voyageEligible: false,
    intelligenceEligible: false,
    copilotEligible: true,
    manifestEligible: true,
    note: "Name, IMO, MMSI or call sign. The resolution step that turns a manifest's vessel name into a canonical entity.",
  },
  {
    id: "vessel-position",
    name: "Vessel Tracking",
    endpoint: "vessel",
    entityType: "VESSEL",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_REQUEST",
    loading: "ON_SELECT",
    cacheTtlMs: 10 * MINUTE,
    spatial: true,
    temporal: false,
    mapEligible: true,
    drawerEligible: true,
    searchEligible: false,
    portEligible: false,
    voyageEligible: false,
    intelligenceEligible: false,
    copilotEligible: true,
    manifestEligible: false,
    note: "19 fields. Superseded by vessel_pro for a selected vessel, which returns the same position plus voyage context for the same cost.",
  },
  {
    id: "vessel-voyage",
    name: "Vessel Voyage Detail",
    endpoint: "vessel_pro",
    entityType: "VESSEL",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_REQUEST",
    loading: "ON_SELECT",
    cacheTtlMs: 5 * MINUTE,
    spatial: true,
    temporal: true,
    mapEligible: false,
    drawerEligible: true,
    searchEligible: false,
    portEligible: true,
    voyageEligible: true,
    intelligenceEligible: true,
    copilotEligible: true,
    manifestEligible: true,
    note: "30 fields. Carries departure port, destination port with UNLOCODE and provider port uuid, actual departure time, ETA, current draught and navigation status — none of which Seaphore currently shows.",
  },
  {
    id: "vessel-identity",
    name: "Vessel Info",
    endpoint: "vessel_info",
    entityType: "VESSEL",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_REQUEST",
    loading: "ON_SELECT",
    cacheTtlMs: 24 * HOUR,
    spatial: false,
    temporal: false,
    mapEligible: false,
    drawerEligible: true,
    searchEligible: false,
    portEligible: false,
    voyageEligible: false,
    intelligenceEligible: true,
    copilotEligible: true,
    manifestEligible: true,
    note: "24 fields of static identity: call sign, tonnage, deadweight, dimensions, year built, home port. Stable, so cached for a day. The primary corroboration source for a manifest's vessel particulars.",
  },
  {
    id: "vessel-history",
    name: "Historical Vessel Data",
    endpoint: "vessel_history",
    entityType: "VESSEL",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_RECORD",
    loading: "ON_DEMAND",
    cacheTtlMs: 10 * MINUTE,
    spatial: true,
    temporal: true,
    mapEligible: true,
    drawerEligible: true,
    searchEligible: false,
    portEligible: false,
    voyageEligible: true,
    intelligenceEligible: true,
    copilotEligible: true,
    manifestEligible: false,
    note: "Historical positions for one vessel. Distinct from session replay, which records what Seaphore displayed rather than where the vessel was.",
  },
  {
    id: "port-finder",
    name: "Port Finder",
    endpoint: "port_find",
    entityType: "PORT",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_RECORD",
    loading: "ON_DEMAND",
    cacheTtlMs: 24 * HOUR,
    spatial: true,
    temporal: false,
    mapEligible: true,
    drawerEligible: false,
    searchEligible: true,
    portEligible: true,
    voyageEligible: true,
    intelligenceEligible: false,
    copilotEligible: true,
    manifestEligible: true,
    note: "Port name, UNLOCODE, country, position and provider uuid — the uuid that vessel_pro's destination and departure ports refer to.",
  },
  {
    id: "weather",
    name: "Weather",
    endpoint: "weather",
    entityType: "LOCATION",
    availability: "VERIFIED",
    probedOn: PROBED,
    cost: "PER_REQUEST",
    loading: "ON_DEMAND",
    cacheTtlMs: 30 * MINUTE,
    spatial: true,
    temporal: true,
    mapEligible: true,
    drawerEligible: true,
    searchEligible: false,
    portEligible: true,
    voyageEligible: false,
    intelligenceEligible: false,
    copilotEligible: true,
    manifestEligible: false,
    note: "Marine conditions at a point: wave height, period and direction, wind, gusts, visibility, pressure. Sea state, not just air temperature.",
  },

  /*
   * ── Sold, but not served ──────────────────────────────────────────
   *
   * Each of these was probed against `vessel_*`, bare, and plural path
   * forms, and against API versions v0, v1 and v2. Every one answered
   * 404. They are listed so the gap is a recorded finding rather than an
   * unexplained absence, and so nobody builds a drawer section for them
   * on the strength of the subscription.
   */
  {
    id: "vessel-ownership",
    name: "Vessel Ownership",
    endpoint: "vessel_ownership",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers. Beneficial owner, registered owner, operator and manager are therefore unavailable to Seaphore from this provider — not absent from the vessel.",
  },
  {
    id: "maritime-companies",
    name: "Maritime Companies",
    endpoint: "maritime_companies",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers. Company intelligence must come from another provider.",
  },
  {
    id: "classification",
    name: "Classification Society",
    endpoint: "vessel_classification",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers.",
  },
  {
    id: "inspections",
    name: "Inspections & Detentions",
    endpoint: "vessel_inspections",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers. Port state control history is unavailable from this provider.",
  },
  {
    id: "casualties",
    name: "Ship Casualties",
    endpoint: "vessel_casualties",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers.",
  },
  {
    id: "engine",
    name: "Vessel Engines",
    endpoint: "vessel_engine",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers.",
  },
  {
    id: "dry-dock",
    name: "Dry Dock Dates",
    endpoint: "vessel_drydock",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers.",
  },
  {
    id: "sales-demolition",
    name: "Sales & Demolitions",
    endpoint: "vessel_sales",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers.",
  },
  {
    id: "sea-routes",
    name: "Sea Routes",
    endpoint: "sea_routes",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers. An estimated route cannot be drawn from this provider.",
  },
  {
    id: "sat-e",
    name: "SAT-E Satellite Estimator",
    endpoint: "sat_e",
    entityType: "LOCATION",
    ...UNAVAILABLE,
    note: "Sold as an add-on; no endpoint answers. Satellite-estimated positions are unavailable, so nothing in Seaphore may be labelled as one.",
  },
  {
    id: "port-info",
    name: "Port Info",
    endpoint: "port_info",
    entityType: "PORT",
    ...UNAVAILABLE,
    note: "Advertised as core; no endpoint answers. Port detail beyond what port_find returns is unavailable.",
  },
  {
    id: "port-terminals",
    name: "Port Terminals",
    endpoint: "port_terminals",
    entityType: "PORT",
    ...UNAVAILABLE,
    note: "Advertised as core; no endpoint answers. Terminal and berth geometry must come from another source.",
  },
  {
    id: "bulk-reports",
    name: "Intelligence Bulk Reports",
    endpoint: "vessel_list",
    entityType: "VESSEL",
    ...UNAVAILABLE,
    note: "Advertised; no endpoint answers.",
  },
];

/** Look one capability up by id. */
export function datalasticCapability(id: string): DatalasticCapability | null {
  return DATALASTIC_CAPABILITIES.find((c) => c.id === id) ?? null;
}

/** Only the capabilities that have actually returned data. */
export function verifiedCapabilities(): ReadonlyArray<DatalasticCapability> {
  return DATALASTIC_CAPABILITIES.filter((c) => c.availability === "VERIFIED");
}

/**
 * The capabilities a given surface may draw on.
 *
 * Filtered by availability first, so a surface can never be handed a
 * capability the provider does not serve.
 */
export function capabilitiesForSurface(
  surface:
    | "map"
    | "drawer"
    | "search"
    | "port"
    | "voyage"
    | "intelligence"
    | "copilot"
    | "manifest",
): ReadonlyArray<DatalasticCapability> {
  const key = `${surface}Eligible` as const;
  return verifiedCapabilities().filter((c) => c[key]);
}
