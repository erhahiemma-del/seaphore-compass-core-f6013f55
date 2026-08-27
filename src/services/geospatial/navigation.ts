/**
 * One way to move the map.
 *
 * Global View, the National selector, a port click, a pasted coordinate,
 * a Go To result and eventually a spoken command are all the same
 * request: put the camera somewhere and say what the officer is now
 * looking at. Each of those growing its own camera call is how a map ends
 * up with five ways to fly and four of them subtly wrong.
 *
 * So this is the only function that decides a navigation target, and it
 * writes through `SharedGeospatialService` like every other camera
 * change. It holds no state, owns no map reference and never touches
 * MapLibre — the renderer follows shared state, which is what keeps
 * selection, filters, layers and presentation mode intact across a
 * flight.
 *
 * ## Scope widens to fit, and never narrows on its own
 *
 * Flying to Rotterdam from the regional scope would otherwise be clamped
 * by `maxBounds` back into the Gulf of Guinea. Navigation therefore lifts
 * the scope to global when the destination sits outside the regional
 * bounds. It does not put it back afterwards: an officer who went to
 * Rotterdam has said something about how they intend to work, and
 * silently re-confining them on the next move would undo it.
 */
import { MAP_SCOPES } from "./constants";
import { findPlace, levelForZoom, type NavigationLevel, type Place } from "./places";
import { sgs, type SharedGeospatialService } from "./shared-geospatial-service";
import type { LonLat } from "./types";

/** Where a navigation request came from. For audit and for tests. */
export type NavigationSource = "control" | "search" | "voice" | "selection" | "coordinates" | "url";

export interface NavigationRequest {
  /** A place id or name. Resolved through the place registry. */
  readonly place?: string;
  /** An explicit point, for coordinates and entity focus. */
  readonly coordinates?: LonLat;
  /** Overrides the place's declared framing. */
  readonly zoom?: number;
  readonly level?: NavigationLevel;
  readonly source: NavigationSource;
}

export interface NavigationResult {
  readonly ok: boolean;
  readonly center: LonLat;
  readonly zoom: number;
  readonly level: NavigationLevel;
  /** Resolved place, when the request named one. */
  readonly place: Place | null;
  /** Why the request could not be served. Null on success. */
  readonly reason: string | null;
}

/** Whether a point falls inside the regional scope's panning bounds. */
function insideRegionalBounds([lon, lat]: LonLat): boolean {
  const bounds = MAP_SCOPES.regional.maxBounds;
  if (!bounds) return true;
  const [[west, south], [east, north]] = bounds;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/**
 * Move the map to a place or a point.
 *
 * Returns what it did rather than throwing: a navigation that cannot
 * resolve is an ordinary answer to an officer's request, not an
 * exception, and the caller usually wants to say so rather than crash.
 */
export function navigateTo(
  request: NavigationRequest,
  service: SharedGeospatialService = sgs,
): NavigationResult {
  const place = request.place ? findPlace(request.place) : null;

  if (request.place && !place) {
    return {
      ok: false,
      center: service.get().center,
      zoom: service.get().zoom,
      level: levelForZoom(service.get().zoom),
      place: null,
      reason: `No known place matches "${request.place}".`,
    };
  }

  const center = request.coordinates ?? place?.center ?? null;
  if (!center) {
    return {
      ok: false,
      center: service.get().center,
      zoom: service.get().zoom,
      level: levelForZoom(service.get().zoom),
      place: null,
      reason: "A navigation request needs a place or a coordinate.",
    };
  }

  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
    return {
      ok: false,
      center: service.get().center,
      zoom: service.get().zoom,
      level: levelForZoom(service.get().zoom),
      place,
      reason: "The coordinate is not a finite position.",
    };
  }

  const zoom = request.zoom ?? place?.zoom ?? service.get().zoom;

  /*
   * Widen the scope before moving, never after.
   *
   * `maxBounds` is applied by the renderer as the camera moves, so a
   * flight to Rotterdam issued under the regional scope would be clamped
   * back into the Gulf of Guinea and land nowhere near the destination.
   */
  if (service.get().scope !== "global" && !insideRegionalBounds(center)) {
    service.setScope("global");
  }

  service.setCamera({ center, zoom });

  return {
    ok: true,
    center,
    zoom,
    level: request.level ?? place?.level ?? levelForZoom(zoom),
    place,
    reason: null,
  };
}

/**
 * Fly to a coordinate.
 *
 * The convergence point the coordinate work will use, present now so it
 * cannot arrive later as a second camera implementation.
 */
export function navigateToCoordinates(
  coordinates: LonLat,
  options: { readonly zoom?: number; readonly source?: NavigationSource } = {},
  service: SharedGeospatialService = sgs,
): NavigationResult {
  return navigateTo(
    {
      coordinates,
      zoom: options.zoom ?? 12,
      level: "LOCAL",
      source: options.source ?? "coordinates",
    },
    service,
  );
}

/** Zoom all the way out. */
export function navigateToGlobal(
  source: NavigationSource = "control",
  service: SharedGeospatialService = sgs,
): NavigationResult {
  return navigateTo({ place: "world", source }, service);
}
