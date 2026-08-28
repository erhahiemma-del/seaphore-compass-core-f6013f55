/**
 * The Nigerian EEZ outline, loaded once for the approach engine.
 *
 * The polygon has always existed — the renderer draws it from
 * `/geojson/nigeria-eez.geojson` — but nothing ever handed it to
 * `assessApproach`, which is why the approach engine had no production
 * caller at all. It was a complete, tested calculation with no way to
 * reach the fleet.
 *
 * ## One outline, loaded once
 *
 * The same file the map draws, so an assessment can never be computed
 * against a different boundary from the one the officer is looking at.
 * A second copy of these coordinates would be a second boundary, and the
 * disagreement would appear as vessels reported approaching a line that
 * is not on screen.
 *
 * Cached because the fleet is assessed repeatedly and the outline does
 * not change within a session.
 */
import type { LonLat } from "./types";

const EEZ_URL = "/geojson/nigeria-eez.geojson";

let cached: readonly LonLat[] | null = null;
let inFlight: Promise<readonly LonLat[]> | null = null;

/**
 * The outline's outer ring.
 *
 * Returns an empty ring on failure rather than throwing. An approach
 * assessment against nothing yields nothing, which the caller reports as
 * unavailable — a failed fetch must not take down the map, and must not
 * silently produce an assessment against a partial boundary either.
 */
export async function loadEezRing(fetcher: typeof fetch = fetch): Promise<readonly LonLat[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetcher(EEZ_URL);
      if (!response.ok) return [];
      const geojson: unknown = await response.json();
      const ring = readOuterRing(geojson);
      cached = ring;
      return ring;
    } catch {
      return [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** The ring if it has already been loaded, without triggering a fetch. */
export function eezRingIfLoaded(): readonly LonLat[] | null {
  return cached;
}

/**
 * Pull the outer ring out of whatever shape the file uses.
 *
 * Accepts a bare geometry, a Feature or a FeatureCollection, and both
 * Polygon and MultiPolygon — the file's shape is a data decision that
 * has changed before and should not require a code change here.
 */
function readOuterRing(geojson: unknown): readonly LonLat[] {
  const geometry = findGeometry(geojson);
  if (!geometry) return [];

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  const type = (geometry as { type?: string }).type;

  if (type === "Polygon" && Array.isArray(coordinates)) {
    return toRing(coordinates[0]);
  }
  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    /*
     * The largest ring, not the first. A multipolygon's ordering is not
     * meaningful, and taking the first could hand the engine an offshore
     * islet while the mainland EEZ went unused.
     */
    let largest: readonly LonLat[] = [];
    for (const polygon of coordinates) {
      const ring = toRing(Array.isArray(polygon) ? polygon[0] : null);
      if (ring.length > largest.length) largest = ring;
    }
    return largest;
  }
  return [];
}

function findGeometry(geojson: unknown): unknown {
  if (!geojson || typeof geojson !== "object") return null;
  const node = geojson as Record<string, unknown>;
  if (node.type === "FeatureCollection" && Array.isArray(node.features)) {
    return findGeometry(node.features[0]);
  }
  if (node.type === "Feature") return node.geometry;
  return node;
}

function toRing(raw: unknown): readonly LonLat[] {
  if (!Array.isArray(raw)) return [];
  const ring: LonLat[] = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    // A malformed vertex is dropped rather than coerced to zero, which
    // would drag the boundary through Null Island.
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    ring.push([lon, lat]);
  }
  return ring;
}

/** Test seam. Never called by application code. */
export function resetEezRingCache(): void {
  cached = null;
  inFlight = null;
}
