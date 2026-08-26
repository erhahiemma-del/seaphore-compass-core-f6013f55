/**
 * Maritime asset features — one registry, rendered.
 *
 * Ports and anchorages are declared exactly once, in `constants.ts`. This
 * module projects those declarations into GeoJSON for the renderer, so
 * the map cannot hold a second, drifting copy of a port. There is no
 * fetched port asset any more: the previous `/geojson/nimasa-ports.geojson`
 * was a duplicate record of the same estate.
 *
 * Nothing here computes activity. A feature carries identity, position
 * and provenance only — occupancy, congestion and vessel counts are
 * observations, and they come from a connected feed or not at all.
 */
import {
  NIGERIAN_ANCHORAGES,
  NIMASA_PORTS,
  type AnchorageArea,
  type NimasaPort,
} from "./constants";
import { findNigerianPort } from "./nigerian-ports";

export interface AssetFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly {
    readonly type: "Feature";
    readonly id: string;
    readonly properties: Record<string, string | number | null>;
    readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  }[];
}

/**
 * Every port complex that has a position, as drawable points.
 *
 * Filtered against the canonical model rather than emitting the whole
 * registry. `NIMASA_PORTS` carries an `npa-reference` lat/lon for Rivers
 * Port (NGPHC), but UN/LOCODE publishes no coordinate for it and no other
 * source corroborates one, so the canonical model records it as
 * `position-unavailable`. Mapping the registry unfiltered would draw a
 * confident dot on an unverified position — the officer would have no way
 * to tell it apart from Onne or Warri, which are surveyed.
 *
 * Rivers is not lost: it stays in the canonical port model and in the
 * port intelligence surfaces, carrying the reason it cannot be drawn.
 */
export function portFeatureCollection(): AssetFeatureCollection {
  return {
    type: "FeatureCollection",
    features: Object.values(NIMASA_PORTS)
      // Fails open on purpose. A port is dropped only when the canonical
      // model *says* its position is unavailable — not merely because the
      // lookup missed. The two registries key Lekki differently (NGLEK
      // here, NGLKK there), and an unknown key must leave a real port on
      // the map rather than silently erase it.
      .filter((port) => findNigerianPort(port.locode)?.positionStatus !== "position-unavailable")
      .map((port) => ({
        type: "Feature" as const,
        id: port.locode,
        properties: {
          assetKind: "port",
          locode: port.locode,
          name: port.name,
          shortName: port.shortName,
          berths: port.berths,
          anchorageRadiusKm: port.anchorageRadius,
          tier: port.tier,
          state: port.state,
          verification: port.verification,
        },
        geometry: { type: "Point" as const, coordinates: [port.lon, port.lat] as const },
      })),
  };
}

/** Every verified anchorage area, as drawable points. */
export function anchorageFeatureCollection(): AssetFeatureCollection {
  return {
    type: "FeatureCollection",
    features: Object.values(NIGERIAN_ANCHORAGES).map((area) => ({
      type: "Feature" as const,
      id: area.id,
      properties: {
        assetKind: "anchorage",
        anchorageId: area.id,
        name: area.name,
        radiusKm: area.radiusKm,
        portId: area.portId,
        district: area.district,
        verification: area.verification,
        source: area.source,
      },
      geometry: { type: "Point" as const, coordinates: [area.lon, area.lat] as const },
    })),
  };
}

/** Resolve a port by LOCODE. Null when the registry does not hold it. */
export function findPort(id: string): NimasaPort | null {
  return NIMASA_PORTS[id.trim().toUpperCase()] ?? null;
}

/** Resolve an anchorage by canonical id. */
export function findAnchorage(id: string): AnchorageArea | null {
  return NIGERIAN_ANCHORAGES[id.trim().toUpperCase()] ?? null;
}

/** Anchorages serving one port. Empty is a real answer, not a failure. */
export function anchoragesForPort(portId: string): readonly AnchorageArea[] {
  const code = portId.trim().toUpperCase();
  return Object.values(NIGERIAN_ANCHORAGES).filter((a) => a.portId === code);
}

/** Great-circle distance in kilometres, for "vessels near this asset". */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
