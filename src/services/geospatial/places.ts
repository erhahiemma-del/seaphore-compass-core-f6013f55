/**
 * Places an officer can navigate to, and how to frame them.
 *
 * Geography, not intelligence. A region's extent and a country's centroid
 * are facts about the Earth; nothing here claims a vessel, a movement or
 * an activity. That distinction is what lets this ship while no provider
 * is connected — an officer can fly to Rotterdam today and see the place,
 * and will see traffic there on the day a source can report it.
 *
 * ## Framing is declared, not computed
 *
 * Each place carries the centre and zoom that frame it usefully, because
 * a centroid alone frames a country badly: Nigeria's centroid is inland,
 * and a maritime officer arriving there is looking at farmland. The
 * framings below lean seaward for coastal states for that reason, which
 * is a judgement a bounding box cannot make.
 *
 * ## Nigerian ports are not duplicated here
 *
 * They live in the canonical port registry with their provenance and
 * precision, and are projected into this model on demand. A second
 * coordinate for Apapa is exactly the drift the canonical registry
 * exists to prevent.
 */
import { NIGERIAN_PORT_LIST, hasDrawablePosition } from "./nigerian-ports";
import type { LonLat } from "./types";

/**
 * How far out an officer is looking.
 *
 * Spatial intent rather than a UI label: `PORT` means "framed on a port",
 * whichever port and however the officer arrived.
 */
export type NavigationLevel =
  | "GLOBAL"
  | "REGIONAL"
  | "COUNTRY"
  | "MARITIME_AREA"
  | "PORT"
  | "LOCAL"
  | "ENTITY";

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly level: NavigationLevel;
  readonly center: LonLat;
  readonly zoom: number;
  /** The place one level out, for the spatial trail. */
  readonly parent?: string;
  /**
   * Where the framing came from.
   *
   * `geographic` is a public fact about the Earth. `operator` is a
   * position an authority published for a facility, and carries the
   * canonical registry's provenance with it.
   */
  readonly source: "geographic" | "operator";
}

const WORLD: Place = {
  id: "world",
  name: "Global",
  level: "GLOBAL",
  // Centred on the Atlantic so Africa and the Americas are both in frame
  // rather than the Pacific, which is where a naive [0,0] would look.
  center: [-10, 15],
  zoom: 1.6,
  source: "geographic",
};

const REGIONS: readonly Place[] = [
  {
    id: "africa",
    name: "Africa",
    level: "REGIONAL",
    center: [18, 2],
    zoom: 2.6,
    parent: "world",
    source: "geographic",
  },
  {
    id: "west-africa",
    name: "West Africa",
    level: "REGIONAL",
    center: [0, 8],
    zoom: 4,
    parent: "africa",
    source: "geographic",
  },
  {
    id: "gulf-of-guinea",
    name: "Gulf of Guinea",
    level: "MARITIME_AREA",
    center: [3, 2],
    zoom: 4.6,
    parent: "west-africa",
    source: "geographic",
  },
  {
    id: "north-africa",
    name: "North Africa",
    level: "REGIONAL",
    center: [18, 28],
    zoom: 3.6,
    parent: "africa",
    source: "geographic",
  },
  {
    id: "east-africa",
    name: "East Africa",
    level: "REGIONAL",
    center: [40, 2],
    zoom: 3.6,
    parent: "africa",
    source: "geographic",
  },
  {
    id: "southern-africa",
    name: "Southern Africa",
    level: "REGIONAL",
    center: [25, -26],
    zoom: 3.6,
    parent: "africa",
    source: "geographic",
  },
  {
    id: "mediterranean",
    name: "Mediterranean",
    level: "MARITIME_AREA",
    center: [16, 36],
    zoom: 4,
    parent: "world",
    source: "geographic",
  },
  {
    id: "north-atlantic",
    name: "North Atlantic",
    level: "MARITIME_AREA",
    center: [-35, 45],
    zoom: 2.8,
    parent: "world",
    source: "geographic",
  },
  {
    id: "south-atlantic",
    name: "South Atlantic",
    level: "MARITIME_AREA",
    center: [-20, -25],
    zoom: 2.8,
    parent: "world",
    source: "geographic",
  },
  {
    id: "indian-ocean",
    name: "Indian Ocean",
    level: "MARITIME_AREA",
    center: [75, -15],
    zoom: 2.8,
    parent: "world",
    source: "geographic",
  },
  {
    id: "arabian-gulf",
    name: "Arabian Gulf",
    level: "MARITIME_AREA",
    center: [52, 26],
    zoom: 4.6,
    parent: "world",
    source: "geographic",
  },
  {
    id: "red-sea",
    name: "Red Sea",
    level: "MARITIME_AREA",
    center: [38, 20],
    zoom: 4.4,
    parent: "world",
    source: "geographic",
  },
  {
    id: "south-china-sea",
    name: "South China Sea",
    level: "MARITIME_AREA",
    center: [114, 14],
    zoom: 4,
    parent: "world",
    source: "geographic",
  },
  {
    id: "southeast-asia",
    name: "Southeast Asia",
    level: "REGIONAL",
    center: [110, 5],
    zoom: 3.6,
    parent: "world",
    source: "geographic",
  },
];

/*
 * Coastal framings lean seaward.
 *
 * A country centroid frames a maritime officer badly — Nigeria's is
 * inland, and arriving there shows farmland. These sit over the coast so
 * the approaches and the EEZ are in view, which is the thing the officer
 * came to look at.
 */
const COUNTRIES: readonly Place[] = [
  {
    id: "nigeria",
    name: "Nigeria",
    level: "COUNTRY",
    center: [5.8, 5.5],
    zoom: 6,
    parent: "gulf-of-guinea",
    source: "geographic",
  },
  {
    id: "ghana",
    name: "Ghana",
    level: "COUNTRY",
    center: [-1.0, 4.8],
    zoom: 6.2,
    parent: "west-africa",
    source: "geographic",
  },
  {
    id: "netherlands",
    name: "Netherlands",
    level: "COUNTRY",
    center: [4.6, 52.2],
    zoom: 6.6,
    parent: "world",
    source: "geographic",
  },
  {
    id: "united-kingdom",
    name: "United Kingdom",
    level: "COUNTRY",
    center: [-2.5, 53.5],
    zoom: 5.2,
    parent: "north-atlantic",
    source: "geographic",
  },
  {
    id: "singapore",
    name: "Singapore",
    level: "COUNTRY",
    center: [103.85, 1.3],
    zoom: 9.5,
    parent: "southeast-asia",
    source: "geographic",
  },
  {
    id: "south-africa",
    name: "South Africa",
    level: "COUNTRY",
    center: [22, -32],
    zoom: 4.8,
    parent: "southern-africa",
    source: "geographic",
  },
  {
    id: "brazil",
    name: "Brazil",
    level: "COUNTRY",
    center: [-43, -20],
    zoom: 4.2,
    parent: "south-atlantic",
    source: "geographic",
  },
  {
    id: "united-states",
    name: "United States",
    level: "COUNTRY",
    center: [-95, 32],
    zoom: 3.6,
    parent: "north-atlantic",
    source: "geographic",
  },
];

/*
 * International ports, as navigation targets only.
 *
 * Public geographic references for well-known harbours — enough to fly
 * to the place and see it. They carry no berths, no calls and no
 * activity, because Seaphore observes none of that here, and the
 * `geographic` source says so.
 */
const INTERNATIONAL_PORTS: readonly Place[] = [
  {
    id: "rotterdam",
    name: "Rotterdam",
    level: "PORT",
    center: [4.4, 51.95],
    zoom: 10.5,
    parent: "netherlands",
    source: "geographic",
  },
  {
    id: "singapore-port",
    name: "Port of Singapore",
    level: "PORT",
    center: [103.75, 1.26],
    zoom: 11,
    parent: "singapore",
    source: "geographic",
  },
  {
    id: "houston",
    name: "Houston",
    level: "PORT",
    center: [-95.05, 29.72],
    zoom: 10.5,
    parent: "united-states",
    source: "geographic",
  },
  {
    id: "tema",
    name: "Tema",
    level: "PORT",
    center: [0.01, 5.63],
    zoom: 11,
    parent: "ghana",
    source: "geographic",
  },
];

/**
 * Nigerian ports, projected from the canonical registry.
 *
 * Only those with a drawable position: Rivers Port has none, and a
 * navigation target that flew an officer to an invented coordinate would
 * be the same fabrication as drawing it.
 */
function nigerianPortPlaces(): readonly Place[] {
  return NIGERIAN_PORT_LIST.filter(hasDrawablePosition).map((port) => ({
    id: port.locode.toLowerCase(),
    name: port.name,
    level: "PORT" as const,
    center: port.position,
    // Close enough to read the harbour, wide enough to keep the approach.
    zoom: 11,
    parent: "nigeria",
    source: "operator" as const,
  }));
}

/** Every navigable place, world first. */
export function allPlaces(): readonly Place[] {
  return [WORLD, ...REGIONS, ...COUNTRIES, ...INTERNATIONAL_PORTS, ...nigerianPortPlaces()];
}

/**
 * Resolve a place by id or name.
 *
 * Case- and separator-insensitive, because this is reached from a
 * control, a URL and eventually a spoken phrase, and "Gulf of Guinea",
 * "gulf-of-guinea" and "GULF OF GUINEA" are one place.
 */
export function findPlace(query: string | null | undefined): Place | null {
  if (!query) return null;
  const key = query
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (key === "") return null;
  const places = allPlaces();
  return (
    places.find((p) => p.id === key) ??
    places.find((p) => p.name.toLowerCase().replace(/[\s_]+/g, "-") === key) ??
    null
  );
}

/**
 * The trail from the world down to this place.
 *
 * Derived by walking `parent`, so it cannot disagree with the hierarchy
 * the way a hand-maintained label would.
 */
export function trailTo(place: Place): readonly Place[] {
  const trail: Place[] = [place];
  const seen = new Set<string>([place.id]);
  let current = place;
  while (current.parent) {
    const parent = findPlace(current.parent);
    // A cycle would hang the walk; a missing parent simply ends it.
    if (!parent || seen.has(parent.id)) break;
    trail.unshift(parent);
    seen.add(parent.id);
    current = parent;
  }
  return trail;
}

/**
 * The level a zoom corresponds to.
 *
 * Lets the spatial trail follow a hand-panned camera, not only an
 * officer who arrived through a control.
 */
export function levelForZoom(zoom: number): NavigationLevel {
  if (zoom < 2.5) return "GLOBAL";
  if (zoom < 4.5) return "REGIONAL";
  if (zoom < 5.5) return "MARITIME_AREA";
  if (zoom < 8) return "COUNTRY";
  if (zoom < 12) return "PORT";
  return "LOCAL";
}
