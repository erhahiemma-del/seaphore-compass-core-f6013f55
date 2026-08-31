import { describe, expect, it } from "vitest";

import {
  corridorProjection,
  corridorTransits,
  defaultCorridorLayers,
  distanceNm,
  interpolateGreatCircle,
  transitHours,
  MARITIME_CORRIDORS,
  CORRIDOR_ZONES,
} from "@/services/geospatial/maritime-corridors";

describe("maritime corridors", () => {
  it("draws nothing when no corridor layer is switched on", () => {
    const projection = corridorProjection([]);
    expect(projection.arcs).toHaveLength(0);
    expect(projection.zones).toHaveLength(0);
    expect(projection.drawn).toBe(0);
  });

  it("derives distance and transit time from the geometry, never a typed figure", () => {
    const corridor = MARITIME_CORRIDORS.find((entry) => entry.id === "nlrtm-ngapp")!;
    const nm = distanceNm(corridor.origin.position, corridor.destination.position);
    // Rotterdam to Lagos is roughly 4,200 nm around the bulge of Africa;
    // the great circle is a little shorter.
    expect(nm).toBeGreaterThan(2_500);
    expect(nm).toBeLessThan(4_500);
    expect(transitHours(corridor)).toBeCloseTo(nm / corridor.serviceSpeedKn, 6);
  });

  it("samples arcs raised off the globe, returning to the surface at both ends", () => {
    const projection = corridorProjection(["shipping-lanes"]);
    expect(projection.arcs).toHaveLength(MARITIME_CORRIDORS.length);
    const arc = projection.arcs[0];
    expect(arc.positions.length).toBeGreaterThan(10);
    expect(arc.positions[0][2]).toBeCloseTo(0, 6);
    expect(arc.positions[arc.positions.length - 1][2]).toBeCloseTo(0, 6);
    const apex = Math.max(...arc.positions.map(([, , height]) => height));
    expect(apex).toBeGreaterThan(0);
  });

  it("interpolates along the great circle, hitting both endpoints exactly", () => {
    const a: [number, number] = [3.38, 6.42];
    const b: [number, number] = [4.05, 51.95];
    expect(interpolateGreatCircle(a, b, 0)[1]).toBeCloseTo(6.42, 4);
    expect(interpolateGreatCircle(a, b, 1)[1]).toBeCloseTo(51.95, 4);
    const middle = interpolateGreatCircle(a, b, 0.5);
    expect(middle[1]).toBeGreaterThan(6.42);
    expect(middle[1]).toBeLessThan(51.95);
  });

  it("draws risk zones only when the zone layer is on", () => {
    expect(corridorProjection(["shipping-lanes"]).zones).toHaveLength(0);
    expect(corridorProjection(["piracy-risk-zones"]).zones).toHaveLength(CORRIDOR_ZONES.length);
  });

  it("prefers the line reading over the density band when both layers ask", () => {
    const bandOnly = corridorProjection(["density-band"]);
    expect(bandOnly.arcs.every((arc) => arc.band)).toBe(true);
    const both = corridorProjection(["density-band", "container-routes"]);
    const container = both.arcs.find((arc) => arc.corridorClass === "CONTAINER")!;
    expect(container.band).toBe(false);
  });

  it("emits transit markers only for transit layers, and staggers them", () => {
    expect(corridorTransits(["shipping-lanes"], 0)).toHaveLength(0);
    const transits = corridorTransits(["cargo-flow"], 0);
    expect(transits.length).toBeGreaterThan(0);
    const progresses = new Set(transits.map((transit) => transit.progress.toFixed(4)));
    expect(progresses.size).toBe(transits.length);
    for (const transit of transits) {
      expect(transit.etaLabel.startsWith("ETA")).toBe(true);
      expect(transit.readout).toMatch(/not a tracked vessel/);
      expect(transit).not.toHaveProperty("imo");
    }
  });

  it("advances markers with the phase and never leaves the corridor", () => {
    const [first] = corridorTransits(["cargo-flow"], 0);
    const [later] = corridorTransits(["cargo-flow"], 0.25);
    expect(later.progress).not.toBeCloseTo(first.progress, 4);
    for (const phase of [0, 0.4, 0.9, 1.7, -0.3]) {
      for (const transit of corridorTransits(["cargo-flow"], phase)) {
        expect(transit.progress).toBeGreaterThanOrEqual(0);
        expect(transit.progress).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ships the global lane and risk-zone layers on by default", () => {
    const defaults = defaultCorridorLayers();
    expect(defaults).toContain("shipping-lanes");
    expect(defaults).toContain("piracy-risk-zones");
    expect(defaults).not.toContain("density-band");
  });

  it("holds every corridor as published lane geography, never an observed track", () => {
    for (const corridor of MARITIME_CORRIDORS) {
      expect(corridor.integrity).toBe("REFERENCE");
      expect(corridor.citation.length).toBeGreaterThan(10);
    }
  });
});
