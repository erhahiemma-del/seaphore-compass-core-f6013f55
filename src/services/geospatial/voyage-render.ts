/**
 * Projecting voyages onto the map.
 *
 * Turns {@link Voyage} objects into the GeoJSON the renderer draws:
 * endpoint markers, and nothing else.
 *
 * ## Why there is no line between the endpoints
 *
 * An earlier draft of this module drew a connecting arc — dotted,
 * violet, bowed away from the straight line, excluded whenever either
 * end was unresolved, and captioned in the legend as derived. All of
 * that was true, and none of it was sufficient.
 *
 * A curve drawn between two ports is read as a route, because that is
 * what a line between two places on a map means. Every reader who has
 * seen a flight-path diagram brings that reading with them, and they
 * bring it before they reach the caption. The visual grammar wins.
 *
 * We know the origin. We know the destination. We do not know what
 * happened in between — the calls, the anchorages, the diversions — and
 * a line asserts that we do. So the line is gone. The endpoints are
 * drawn because they are known; the space between them is left empty
 * because it is unknown, and empty is what unknown looks like.
 *
 * The relationship still exists in the domain model, and the drawer
 * states it in words. It is simply not drawn as geometry, because there
 * is no geometry to draw.
 *
 * When an AIS history provider is connected, an observed track becomes
 * a separate capability rendered from real positions. That is the only
 * thing that should ever put a line between two ports on this map.
 *
 * ## Each end is independent
 *
 * A voyage with one unresolved port draws the resolved one. A voyage
 * with neither draws nothing and still exists as a record in the
 * drawer. Missing geography is a resolution state, never evidence that
 * the voyage did not happen.
 */
import type { Voyage } from "./voyage";
import type { GeoJsonFeature, GeoJsonFeatureCollection, LonLat } from "./types";

/** Which end of the voyage a marker represents. */
export type VoyageEndpointRole = "origin" | "destination";

export interface VoyageEndpointProperties {
  readonly voyageId: string;
  readonly role: VoyageEndpointRole;
  readonly portCode: string;
  readonly portName: string;
  /** `surveyed` or `degree-minute`. Drives the precision note in the UI. */
  readonly precision: string;
  /** Provider that resolved this endpoint. */
  readonly source: string;
  readonly voyageNumber: string;
  readonly status: string;
}

export type VoyageEndpointFeature = GeoJsonFeature<
  { readonly type: "Point"; readonly coordinates: LonLat },
  VoyageEndpointProperties
>;

export type VoyageEndpointCollection = GeoJsonFeatureCollection<
  { readonly type: "Point"; readonly coordinates: LonLat },
  VoyageEndpointProperties
>;

function endpointFeature(voyage: Voyage, role: VoyageEndpointRole): VoyageEndpointFeature | null {
  const endpoint = role === "origin" ? voyage.origin : voyage.destination;
  const resolution = endpoint.resolution;
  // Two gates rather than one. `position` is the drawable value and
  // `status` is the claim; requiring both means a future provider
  // cannot supply a coordinate without also saying it resolved.
  if (endpoint.position == null || resolution?.status !== "resolved") return null;

  return {
    type: "Feature",
    id: `${voyage.id}:${role}`,
    geometry: { type: "Point", coordinates: endpoint.position },
    properties: {
      voyageId: voyage.id,
      role,
      portCode: resolution.code,
      portName: resolution.name,
      precision: resolution.precision,
      source: resolution.source,
      voyageNumber: voyage.voyageNumber ?? "",
      status: voyage.status,
    },
  };
}

/**
 * Endpoint markers for every voyage end that genuinely resolved.
 *
 * The only geometry M2 puts on the map for a voyage.
 */
export function toVoyageEndpointCollection(voyages: readonly Voyage[]): VoyageEndpointCollection {
  const features: VoyageEndpointFeature[] = [];
  for (const voyage of voyages) {
    const origin = endpointFeature(voyage, "origin");
    if (origin) features.push(origin);
    const destination = endpointFeature(voyage, "destination");
    if (destination) features.push(destination);
  }
  return { type: "FeatureCollection", features };
}

/** Bounding box enclosing every drawable voyage endpoint, or null. */
export function voyageBounds(voyages: readonly Voyage[]): readonly [LonLat, LonLat] | null {
  const positions: LonLat[] = [];
  for (const voyage of voyages) {
    if (voyage.origin.position) positions.push(voyage.origin.position);
    if (voyage.destination.position) positions.push(voyage.destination.position);
  }
  if (positions.length === 0) return null;

  let west = positions[0][0];
  let east = positions[0][0];
  let south = positions[0][1];
  let north = positions[0][1];
  for (const [lon, lat] of positions) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** How many voyage endpoints could and could not be placed. */
export interface EndpointCoverage {
  readonly voyages: number;
  /** Both ports resolved to a position. */
  readonly bothResolved: number;
  /** Exactly one port resolved. */
  readonly oneResolved: number;
  /** Neither port resolved. Still real voyages. */
  readonly neitherResolved: number;
}

/**
 * Summarise how much of a voyage set can be placed geographically.
 *
 * Surfaced to the officer so an empty-looking map is explained by a
 * count rather than left to be read as an absence of voyages.
 */
export function endpointCoverage(voyages: readonly Voyage[]): EndpointCoverage {
  let bothResolved = 0;
  let oneResolved = 0;
  let neitherResolved = 0;
  for (const voyage of voyages) {
    const resolved = (voyage.origin.position ? 1 : 0) + (voyage.destination.position ? 1 : 0);
    if (resolved === 2) bothResolved += 1;
    else if (resolved === 1) oneResolved += 1;
    else neitherResolved += 1;
  }
  return { voyages: voyages.length, bothResolved, oneResolved, neitherResolved };
}
