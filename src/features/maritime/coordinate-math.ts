/**
 * Screen position to geographic position, and how to say it.
 *
 * Pure Web Mercator arithmetic over the camera the shared service
 * already holds, so the coordinate readout needs no reference to the map
 * engine. That matters for more than tidiness: an overlay that reached
 * into MapLibre to unproject would be a second thing reading the camera,
 * and the two would disagree the moment one of them lagged a frame.
 *
 * The formulae are the standard spherical Mercator ones MapLibre itself
 * uses, so the answer here and the answer on the map are the same answer.
 */
import type { LonLat } from "@/services/geospatial/types";

/** Pixels per tile, and MapLibre's tile size. */
const TILE = 512;

/** World size in pixels at a given zoom. */
function worldSize(zoom: number): number {
  return TILE * Math.pow(2, zoom);
}

/** Longitude → normalised x, 0..1 across the world. */
function lonToX(lon: number): number {
  return (lon + 180) / 360;
}

/** Latitude → normalised y, 0..1, clamped at the Mercator limit. */
function latToY(lat: number): number {
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  const rad = (clamped * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI);
}

function xToLon(x: number): number {
  return x * 360 - 180;
}

function yToLat(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export interface Viewport {
  /** Camera centre. */
  readonly center: LonLat;
  readonly zoom: number;
  /** Container size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

/**
 * Where a point on the map container is, geographically.
 *
 * `x` and `y` are relative to the container's top-left, not the page.
 * Returns null for a viewport that has not laid out — a zero-width
 * container yields a coordinate that is arithmetically valid and
 * operationally meaningless.
 */
export function screenToLngLat(
  point: { readonly x: number; readonly y: number },
  viewport: Viewport,
): LonLat | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  if (!Number.isFinite(viewport.zoom)) return null;

  const size = worldSize(viewport.zoom);
  const centreX = lonToX(viewport.center[0]) * size;
  const centreY = latToY(viewport.center[1]) * size;

  const worldX = centreX + (point.x - viewport.width / 2);
  const worldY = centreY + (point.y - viewport.height / 2);

  const lon = xToLon(worldX / size);
  const lat = yToLat(worldY / size);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  /*
   * Longitude wraps; latitude does not.
   *
   * Panning west past the antimeridian is ordinary navigation and should
   * report -179°, not -181°. Dragging above the Mercator limit is not
   * navigation — there is no such place on this projection — so the
   * latitude is clamped rather than wrapped.
   */
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [wrapped, Math.max(-85.051129, Math.min(85.051129, lat))];
}

/**
 * Degrees and decimal minutes, as a maritime officer reads a position.
 *
 * Not decimal degrees: charts, NPA publications and the handbook that
 * gave Tin Can its coordinate are all in degrees and minutes, and a
 * readout an officer has to convert before using is a readout they will
 * stop consulting. Longitude is padded to three digits, as on a chart.
 */
export function formatLatitude(lat: number): string {
  const hemisphere = lat >= 0 ? "N" : "S";
  const absolute = Math.abs(lat);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${String(degrees).padStart(2, "0")}° ${minutes.toFixed(3).padStart(6, "0")}' ${hemisphere}`;
}

export function formatLongitude(lon: number): string {
  const hemisphere = lon >= 0 ? "E" : "W";
  const absolute = Math.abs(lon);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${String(degrees).padStart(3, "0")}° ${minutes.toFixed(3).padStart(6, "0")}' ${hemisphere}`;
}

/**
 * Parse a spoken or typed position.
 *
 * Accepts what an officer actually says or pastes — decimal pairs,
 * hemisphere suffixes, degrees and minutes — because the alternative is a
 * syntax they have to learn. Returns null rather than a guess: navigating
 * somewhere on a misread coordinate is worse than declining to move.
 */
export function parseCoordinates(input: string): LonLat | null {
  const text = input.trim();
  if (text === "") return null;

  // Degrees and minutes, with hemispheres: 06° 25.7' N 003° 20.53' E
  const dm =
    /(\d{1,3})\s*°?\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*([NS])[,\s]+(\d{1,3})\s*°?\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*([EW])/i.exec(
      text,
    );
  if (dm) {
    const lat = (Number(dm[1]) + Number(dm[2]) / 60) * (dm[3]!.toUpperCase() === "S" ? -1 : 1);
    const lon = (Number(dm[4]) + Number(dm[5]) / 60) * (dm[6]!.toUpperCase() === "W" ? -1 : 1);
    return within(lon, lat);
  }

  // Decimal with hemispheres: 6.4283 N, 3.3422 E
  const decHem = /(-?\d+(?:\.\d+)?)\s*°?\s*([NS])[,\s]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])/i.exec(text);
  if (decHem) {
    const lat = Number(decHem[1]) * (decHem[2]!.toUpperCase() === "S" ? -1 : 1);
    const lon = Number(decHem[3]) * (decHem[4]!.toUpperCase() === "W" ? -1 : 1);
    return within(lon, lat);
  }

  // Bare decimal pair, latitude first — the convention everywhere a
  // position is written without labels.
  const pair = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (pair) return within(Number(pair[2]), Number(pair[1]));

  return null;
}

function within(lon: number, lat: number): LonLat | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}
