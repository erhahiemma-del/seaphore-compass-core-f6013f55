/**
 * Global Maritime Corridor Intelligence (Phase 4C).
 *
 * The corridor domain: which country-to-country lanes Seaphore knows, the
 * geometry of each one, the zones that qualify them, and the indicative
 * transit marker that travels along them.
 *
 * ## What a corridor is, and what it is not
 *
 * A corridor is *published lane geography* — the origin and destination of
 * a commercial trade route, and the great-circle course between them. It
 * is not an observed vessel track, it is not an AIS history, and it is not
 * a claim that any particular hull is on it. Every corridor therefore
 * carries `integrity: "REFERENCE"`, and the panel and drawer say so in
 * words, because a glowing arc between two ports is the single easiest
 * thing on this map to mistake for a recorded voyage.
 *
 * The distinction matters enough that the numbers are derived rather than
 * asserted: distance comes from the two coordinates, and transit time from
 * distance and a stated service speed. Nothing is a typed-in figure that
 * could quietly drift from the geometry it claims to describe.
 *
 * ## No new vessel state
 *
 * The travelling marker is a *corridor transit indicator*, not a vessel.
 * It has no IMO, it never enters `VesselUpdateEngine`, it is not keyed
 * into any vessel map, and it cannot be selected as an entity. Live hulls
 * continue to arrive only from the canonical vessel sources through the
 * update engine, exactly as before — this module adds lane geography and
 * an animation phase, and nothing else.
 *
 * ## Engine-agnostic by construction
 *
 * Everything here is plain geometry and numbers in the vocabulary the
 * renderers already share (`LonLat`). The Cesium adapter draws it; a
 * renderer that cannot simply does not implement the seam, and the flat
 * operational map is unchanged.
 */
import type { LonLat } from "./types";

/** Which trade the lane serves. Drives colour and layer membership. */
export type CorridorClass = "OIL_GAS" | "CONTAINER" | "REGIONAL" | "TRADE";

/**
 * How well founded the corridor is.
 *
 * `REFERENCE` is the only value any corridor currently carries: the lane
 * is published trade geography. `OBSERVED` is reserved for the day an AIS
 * history provider lets a corridor be derived from real positions — at
 * which point it must be drawn differently, because it would then be a
 * different kind of claim.
 */
export type CorridorIntegrity = "REFERENCE" | "OBSERVED";

export interface CorridorTerminus {
  /** UN/LOCODE where one exists. */
  readonly code: string;
  readonly name: string;
  readonly country: string;
  readonly position: LonLat;
}

export interface MaritimeCorridor {
  readonly id: string;
  readonly label: string;
  readonly corridorClass: CorridorClass;
  readonly origin: CorridorTerminus;
  readonly destination: CorridorTerminus;
  /** Service speed used to derive transit time, in knots. */
  readonly serviceSpeedKn: number;
  readonly integrity: CorridorIntegrity;
  /** Who publishes the lane. Shown wherever the corridor is described. */
  readonly citation: string;
}

/** Officer-facing corridor layers. Each selects a subset of the geography. */
export type CorridorLayerId =
  | "shipping-lanes"
  | "oil-gas-routes"
  | "container-routes"
  | "regional-corridors"
  | "trade-corridors"
  | "cargo-flow"
  | "density-band"
  | "piracy-risk-zones";

export interface CorridorLayerDefinition {
  readonly id: CorridorLayerId;
  readonly label: string;
  readonly description: string;
  /** Corridor classes drawn by this layer. Empty for zone-only layers. */
  readonly classes: readonly CorridorClass[];
  /** Draws the risk zones rather than lanes. */
  readonly zonesOnly?: boolean;
  /** Wide translucent band instead of a line — a concentration, not a route. */
  readonly band?: boolean;
  /** Carries the animated transit marker and its ETA readout. */
  readonly transits?: boolean;
  readonly defaultVisible?: boolean;
}

export const CORRIDOR_LAYERS: readonly CorridorLayerDefinition[] = [
  {
    id: "shipping-lanes",
    label: "Global shipping lanes",
    description: "Every known corridor, drawn as its origin-to-destination course.",
    classes: ["OIL_GAS", "CONTAINER", "REGIONAL", "TRADE"],
    defaultVisible: true,
  },
  {
    id: "cargo-flow",
    label: "Cargo flow",
    description:
      "Corridors carrying an animated transit marker with an indicative ETA. The marker is a lane indicator, not a tracked vessel.",
    classes: ["OIL_GAS", "CONTAINER", "TRADE"],
    transits: true,
    defaultVisible: true,
  },
  {
    id: "oil-gas-routes",
    label: "Oil & gas routes",
    description: "Crude and LNG lanes out of the Niger Delta terminals.",
    classes: ["OIL_GAS"],
  },
  {
    id: "container-routes",
    label: "Container routes",
    description: "Box lanes serving Apapa and Tin Can Island.",
    classes: ["CONTAINER"],
  },
  {
    id: "regional-corridors",
    label: "Regional corridors",
    description: "Intra-Gulf of Guinea coastal traffic between West African ports.",
    classes: ["REGIONAL"],
  },
  {
    id: "trade-corridors",
    label: "Trade corridors",
    description: "Country-to-country lanes for general and bulk cargo.",
    classes: ["TRADE"],
  },
  {
    id: "density-band",
    label: "Density band",
    description:
      "The same corridors widened into a concentration band. It weights lane presence, never risk.",
    classes: ["OIL_GAS", "CONTAINER", "REGIONAL", "TRADE"],
    band: true,
  },
  {
    id: "piracy-risk-zones",
    label: "Piracy risk zones",
    description:
      "Published high-risk areas in the Gulf of Guinea. A designated area, not an incident position.",
    classes: [],
    zonesOnly: true,
    defaultVisible: true,
  },
];

export function defaultCorridorLayers(): readonly CorridorLayerId[] {
  return CORRIDOR_LAYERS.filter((layer) => layer.defaultVisible).map((layer) => layer.id);
}

const CLASS_COLOUR: Readonly<Record<CorridorClass, string>> = {
  OIL_GAS: "#F59E0B",
  CONTAINER: "#38BDF8",
  REGIONAL: "#34D399",
  TRADE: "#A78BFA",
};

export const CORRIDOR_CLASS_LABEL: Readonly<Record<CorridorClass, string>> = {
  OIL_GAS: "Oil & gas",
  CONTAINER: "Container",
  REGIONAL: "Regional",
  TRADE: "Trade",
};

export function corridorColour(corridorClass: CorridorClass): string {
  return CLASS_COLOUR[corridorClass];
}

const PUBLISHED_LANES = "Published commercial lane geography (port coordinates, great-circle course)";

function terminus(
  code: string,
  name: string,
  country: string,
  position: LonLat,
): CorridorTerminus {
  return { code, name, country, position };
}

const SHANGHAI = terminus("CNSHA", "Shanghai", "China", [121.8, 31.05]);
const SINGAPORE = terminus("SGSIN", "Singapore", "Singapore", [103.85, 1.26]);
const ROTTERDAM = terminus("NLRTM", "Rotterdam", "Netherlands", [4.05, 51.95]);
const HOUSTON = terminus("USHOU", "Houston", "United States", [-95.0, 29.6]);
const LOME = terminus("TGLFW", "Lomé", "Togo", [1.28, 6.11]);
const TEMA = terminus("GHTEM", "Tema", "Ghana", [0.01, 5.62]);
const DOUALA = terminus("CMDLA", "Douala", "Cameroon", [9.68, 4.02]);

const LAGOS = terminus("NGLOS", "Lagos", "Nigeria", [3.38, 6.42]);
const APAPA = terminus("NGAPP", "Apapa", "Nigeria", [3.363, 6.446]);
const ONNE = terminus("NGONN", "Onne", "Nigeria", [7.157, 4.674]);
const BONNY = terminus("NGBON", "Bonny", "Nigeria", [7.171, 4.427]);
const CALABAR = terminus("NGCBQ", "Calabar", "Nigeria", [8.322, 4.965]);
const WARRI = terminus("NGWAR", "Warri", "Nigeria", [5.741, 5.532]);

/**
 * The corridors Seaphore holds.
 *
 * Four named in the Phase 4C brief (Shanghai→Lagos, Singapore→Onne,
 * Rotterdam→Apapa, Houston→Bonny), plus the Delta export lanes and the
 * coastal regional traffic that give the Gulf of Guinea picture its
 * context.
 */
export const MARITIME_CORRIDORS: readonly MaritimeCorridor[] = [
  {
    id: "cnsha-nglos",
    label: "Shanghai → Lagos",
    corridorClass: "CONTAINER",
    origin: SHANGHAI,
    destination: LAGOS,
    serviceSpeedKn: 16,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "sgsin-ngonn",
    label: "Singapore → Onne",
    corridorClass: "CONTAINER",
    origin: SINGAPORE,
    destination: ONNE,
    serviceSpeedKn: 16,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "nlrtm-ngapp",
    label: "Rotterdam → Apapa",
    corridorClass: "CONTAINER",
    origin: ROTTERDAM,
    destination: APAPA,
    serviceSpeedKn: 15,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "ushou-ngbon",
    label: "Houston → Bonny",
    corridorClass: "OIL_GAS",
    origin: HOUSTON,
    destination: BONNY,
    serviceSpeedKn: 13,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "ngbon-nlrtm",
    label: "Bonny → Rotterdam",
    corridorClass: "OIL_GAS",
    origin: BONNY,
    destination: ROTTERDAM,
    serviceSpeedKn: 13,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "ngwar-ushou",
    label: "Warri → Houston",
    corridorClass: "OIL_GAS",
    origin: WARRI,
    destination: HOUSTON,
    serviceSpeedKn: 13,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "ngcbq-cnsha",
    label: "Calabar → Shanghai",
    corridorClass: "TRADE",
    origin: CALABAR,
    destination: SHANGHAI,
    serviceSpeedKn: 14,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "ghtem-ngapp",
    label: "Tema → Apapa",
    corridorClass: "REGIONAL",
    origin: TEMA,
    destination: APAPA,
    serviceSpeedKn: 12,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "tglfw-nglos",
    label: "Lomé → Lagos",
    corridorClass: "REGIONAL",
    origin: LOME,
    destination: LAGOS,
    serviceSpeedKn: 11,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
  {
    id: "cmdla-ngonn",
    label: "Douala → Onne",
    corridorClass: "REGIONAL",
    origin: DOUALA,
    destination: ONNE,
    serviceSpeedKn: 11,
    integrity: "REFERENCE",
    citation: PUBLISHED_LANES,
  },
];

// ── Geometry ──────────────────────────────────────────────────────────

const EARTH_RADIUS_NM = 3440.065;
const RAD = Math.PI / 180;

/** Great-circle distance in nautical miles. */
export function distanceNm(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point at fraction `t` along the great circle from `a` to `b`. */
export function interpolateGreatCircle(a: LonLat, b: LonLat, t: number): LonLat {
  const fraction = Math.min(1, Math.max(0, t));
  const [lon1, lat1] = [a[0] * RAD, a[1] * RAD];
  const [lon2, lat2] = [b[0] * RAD, b[1] * RAD];
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );
  // Coincident endpoints have no course between them; return the point.
  if (d === 0) return [a[0], a[1]];
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return [
    Math.atan2(y, x) / RAD,
    Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD,
  ];
}

/** Transit time in hours, derived from the geometry and the service speed. */
export function transitHours(corridor: MaritimeCorridor): number {
  const nm = distanceNm(corridor.origin.position, corridor.destination.position);
  return corridor.serviceSpeedKn > 0 ? nm / corridor.serviceSpeedKn : 0;
}

const ARC_SAMPLES = 64;

/**
 * Arc apex height, in metres.
 *
 * Scaled to the lane's own length so a Lagos–Lomé hop does not bow as
 * high as a trans-Pacific lane, and capped so no arc leaves the globe's
 * readable envelope.
 */
function apexMetres(nm: number): number {
  return Math.min(900_000, Math.max(40_000, nm * 90));
}

export interface CorridorArc {
  readonly corridorId: string;
  readonly label: string;
  readonly corridorClass: CorridorClass;
  readonly colour: string;
  /** Sampled course, lon/lat plus arc height in metres. */
  readonly positions: readonly (readonly [number, number, number])[];
  readonly distanceNm: number;
  /** Drawn as a wide translucent band rather than a line. */
  readonly band: boolean;
  readonly integrity: CorridorIntegrity;
}

/** One indicative transit marker, at the current animation phase. */
export interface CorridorTransit {
  readonly corridorId: string;
  readonly label: string;
  readonly corridorClass: CorridorClass;
  readonly colour: string;
  readonly position: readonly [number, number, number];
  /** 0–1 along the corridor. */
  readonly progress: number;
  readonly previousPort: string;
  readonly nextPort: string;
  /** "ETA 3 d 4 h" — indicative, derived from distance and service speed. */
  readonly etaLabel: string;
  readonly etaIso: string;
  /** Explicit reminder that this is lane geography, not a tracked hull. */
  readonly readout: string;
}

export interface CorridorZone {
  readonly zoneId: string;
  readonly label: string;
  readonly colour: string;
  readonly ring: readonly LonLat[];
  readonly note: string;
  readonly citation: string;
}

/**
 * Published Gulf of Guinea high-risk areas.
 *
 * Designated areas, drawn as the polygons their custodians publish. A
 * zone says "this water is designated high risk", never "an attack
 * happened at this point" — incidents are a separate overlay with their
 * own positions and their own provenance.
 */
export const CORRIDOR_ZONES: readonly CorridorZone[] = [
  {
    zoneId: "gog-high-risk",
    label: "Gulf of Guinea high-risk area",
    colour: "#EF4444",
    note: "Designated high-risk area for armed robbery and kidnap-for-ransom against shipping.",
    citation: "BMP West Africa / IMB designated high-risk area (published extent)",
    ring: [
      [-2, 2],
      [10, -2],
      [14, 2],
      [12, 6],
      [4, 7],
      [-2, 6],
    ],
  },
  {
    zoneId: "delta-approaches",
    label: "Niger Delta approaches",
    colour: "#F97316",
    note: "Elevated-risk approaches to the Delta export terminals and their offshore anchorages.",
    citation: "NIMASA advisory area (published extent)",
    ring: [
      [4.6, 3.4],
      [8.6, 3.4],
      [8.6, 5.2],
      [4.6, 5.2],
    ],
  },
];

export interface CorridorProjection {
  readonly arcs: readonly CorridorArc[];
  readonly zones: readonly CorridorZone[];
  /** How many corridors are drawn, of how many held. */
  readonly drawn: number;
  readonly held: number;
}

const EMPTY_PROJECTION: CorridorProjection = {
  arcs: [],
  zones: [],
  drawn: 0,
  held: MARITIME_CORRIDORS.length,
};

function layer(id: CorridorLayerId): CorridorLayerDefinition | undefined {
  return CORRIDOR_LAYERS.find((entry) => entry.id === id);
}

/**
 * Project the corridors and zones the switched-on layers ask for.
 *
 * Layer membership decides what exists in the projection at all, exactly
 * as it does for port twins: a corridor nobody asked for is absent rather
 * than present-and-hidden, so nothing can survive its own layer.
 */
export function corridorProjection(
  visibleLayers: readonly CorridorLayerId[],
  corridors: readonly MaritimeCorridor[] = MARITIME_CORRIDORS,
): CorridorProjection {
  if (visibleLayers.length === 0) return EMPTY_PROJECTION;
  const definitions = visibleLayers.map(layer).filter(Boolean) as CorridorLayerDefinition[];
  if (definitions.length === 0) return EMPTY_PROJECTION;

  const bandOnly = new Set<string>();
  const wanted = new Map<string, MaritimeCorridor>();
  for (const definition of definitions) {
    for (const corridor of corridors) {
      if (!definition.classes.includes(corridor.corridorClass)) continue;
      wanted.set(corridor.id, corridor);
      if (definition.band) bandOnly.add(corridor.id);
    }
  }
  // A corridor asked for by both a line layer and the density band is a
  // line: the specific reading wins over the aggregate one.
  for (const definition of definitions) {
    if (definition.band || definition.zonesOnly) continue;
    for (const corridor of corridors) {
      if (definition.classes.includes(corridor.corridorClass)) bandOnly.delete(corridor.id);
    }
  }

  const arcs: CorridorArc[] = [];
  for (const corridor of wanted.values()) {
    const nm = distanceNm(corridor.origin.position, corridor.destination.position);
    const apex = apexMetres(nm);
    const positions: (readonly [number, number, number])[] = [];
    for (let index = 0; index <= ARC_SAMPLES; index += 1) {
      const t = index / ARC_SAMPLES;
      const [lon, lat] = interpolateGreatCircle(
        corridor.origin.position,
        corridor.destination.position,
        t,
      );
      positions.push([lon, lat, apex * Math.sin(Math.PI * t)]);
    }
    arcs.push({
      corridorId: corridor.id,
      label: corridor.label,
      corridorClass: corridor.corridorClass,
      colour: corridorColour(corridor.corridorClass),
      positions,
      distanceNm: nm,
      band: bandOnly.has(corridor.id),
      integrity: corridor.integrity,
    });
  }

  const zones = definitions.some((definition) => definition.zonesOnly) ? CORRIDOR_ZONES : [];

  return { arcs, zones, drawn: arcs.length, held: corridors.length };
}

/** Deterministic 0–1 offset, so ten markers do not travel in lockstep. */
function phaseOffset(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 9973;
  }
  return hash / 9973;
}

function durationLabel(hours: number): string {
  const whole = Math.max(0, Math.round(hours));
  const days = Math.floor(whole / 24);
  const rest = whole % 24;
  if (days === 0) return `${rest} h`;
  return `${days} d ${rest} h`;
}

/**
 * The indicative transit markers for the switched-on transit layers.
 *
 * `phase` is a 0–1 loop supplied by the caller's clock, so the animation
 * has exactly one driver and a paused or reduced-motion session simply
 * stops advancing it — the markers stay drawn, they stop moving.
 */
export function corridorTransits(
  visibleLayers: readonly CorridorLayerId[],
  phase: number,
  now: Date = new Date(),
  corridors: readonly MaritimeCorridor[] = MARITIME_CORRIDORS,
): readonly CorridorTransit[] {
  const definitions = (visibleLayers.map(layer).filter(Boolean) as CorridorLayerDefinition[]).filter(
    (definition) => definition.transits,
  );
  if (definitions.length === 0) return [];

  const classes = new Set<CorridorClass>();
  for (const definition of definitions) {
    for (const corridorClass of definition.classes) classes.add(corridorClass);
  }

  const loop = ((phase % 1) + 1) % 1;
  const transits: CorridorTransit[] = [];
  for (const corridor of corridors) {
    if (!classes.has(corridor.corridorClass)) continue;
    const progress = (loop + phaseOffset(corridor.id)) % 1;
    const [lon, lat] = interpolateGreatCircle(
      corridor.origin.position,
      corridor.destination.position,
      progress,
    );
    const nm = distanceNm(corridor.origin.position, corridor.destination.position);
    const total = transitHours(corridor);
    const remaining = total * (1 - progress);
    const etaIso = new Date(now.getTime() + remaining * 3_600_000).toISOString();
    transits.push({
      corridorId: corridor.id,
      label: corridor.label,
      corridorClass: corridor.corridorClass,
      colour: corridorColour(corridor.corridorClass),
      position: [lon, lat, apexMetres(nm) * Math.sin(Math.PI * progress)],
      progress,
      previousPort: corridor.origin.name,
      nextPort: corridor.destination.name,
      etaLabel: `ETA ${durationLabel(remaining)}`,
      etaIso,
      readout: "Indicative corridor transit — lane geography, not a tracked vessel.",
    });
  }
  return transits;
}

/** One sentence stating what the corridor overlay is, for the officer. */
export const CORRIDOR_PROVENANCE_NOTE =
  "Corridors are published lane geography between named ports. Transit markers and ETAs are derived from distance and service speed — they are not observed vessel tracks.";
