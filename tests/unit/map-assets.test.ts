import { describe, expect, it } from "vitest";

import { findNigerianPort } from "@/services/geospatial/nigerian-ports";

import {
  ANCHORAGE_REGISTRY_IS_EXHAUSTIVE,
  NIGERIAN_ANCHORAGES,
  NIMASA_PORTS,
  anchorageFeatureCollection,
  anchoragesForPort,
  findAnchorage,
  findPort,
  layerRegistry,
  portFeatureCollection,
} from "@/services/geospatial";

/** The seven NPA port complexes the national picture must represent. */
const REQUIRED_PORTS = [
  "Lagos Port Complex — Apapa",
  "Tin Can Island Port Complex",
  "Lekki Deep Sea Port",
  "Rivers Port Complex — Port Harcourt",
  "Onne Port Complex",
  "Delta Port Complex — Warri",
  "Calabar Port Complex",
];

describe("port registry", () => {
  it("represents every NPA port complex exactly once", () => {
    const names = Object.values(NIMASA_PORTS).map((p) => p.name);
    for (const required of REQUIRED_PORTS) expect(names).toContain(required);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keys every port by its own LOCODE, so no port can be listed twice", () => {
    for (const [key, port] of Object.entries(NIMASA_PORTS)) expect(port.locode).toBe(key);
  });

  it("carries where each position came from, rather than asserting it", () => {
    for (const port of Object.values(NIMASA_PORTS)) {
      expect(["npa-reference", "chart-reference"]).toContain(port.verification);
      expect(Number.isFinite(port.lat) && Number.isFinite(port.lon)).toBe(true);
    }
  });

  it("resolves a port by code and returns null for one it does not hold", () => {
    expect(findPort("ngapapa")?.shortName).toBe("APAPA");
    expect(findPort("NGXXXX")).toBeNull();
  });
});

describe("anchorage registry", () => {
  it("never claims to be the exhaustive national list", () => {
    // No source in the project supports completeness, so the registry
    // must not imply it.
    expect(ANCHORAGE_REGISTRY_IS_EXHAUSTIVE).toBe(false);
  });

  it("gives every anchorage an id, a district and a source", () => {
    for (const [key, area] of Object.entries(NIGERIAN_ANCHORAGES)) {
      expect(area.id).toBe(key);
      expect(area.district.length).toBeGreaterThan(5);
      expect(area.source.length).toBeGreaterThan(5);
    }
  });

  it("associates anchorages with the port they serve", () => {
    const lagos = anchoragesForPort("NGAPAPA").map((a) => a.name);
    expect(lagos).toContain("Lagos Inner Anchorage");
    expect(findAnchorage("NG-ANCH-BONNY")?.portId).toBe("NGPHC");
  });

  it("holds no occupancy, congestion or vessel count", () => {
    // Those are observations. An anchorage record that carried them would
    // be asserting a measurement no connected feed provides.
    for (const area of Object.values(NIGERIAN_ANCHORAGES)) {
      expect(Object.keys(area)).not.toContain("occupancy");
      expect(Object.keys(area)).not.toContain("vesselCount");
    }
  });
});

describe("drawn features come from the registry", () => {
  it("draws one feature per port that has a position, with its tier", () => {
    /*
     * Not one per *registered* port, which is what this asserted before.
     *
     * `NIMASA_PORTS` carries an `npa-reference` lat/lon for Rivers Port
     * (NGPHC), but UN/LOCODE publishes no coordinate for it and nothing
     * else corroborates one, so the canonical model records it as
     * `position-unavailable`. Drawing the registry unfiltered puts a
     * confident dot on an unverified position that an officer cannot
     * tell apart from Onne or Warri, which are surveyed.
     */
    const collection = portFeatureCollection();
    const drawable = Object.values(NIMASA_PORTS).filter(
      (port) => findNigerianPort(port.locode)?.positionStatus !== "position-unavailable",
    );
    expect(collection.features).toHaveLength(drawable.length);
    for (const feature of collection.features) {
      expect(feature.properties["assetKind"]).toBe("port");
      expect(["major", "secondary"]).toContain(feature.properties["tier"]);
    }
  });

  it("draws no feature for a port whose position is unavailable", () => {
    // Rivers stays in the canonical model and the port intelligence
    // surfaces; it simply must not receive a map position.
    const drawn = portFeatureCollection().features.map((f) => f.properties["locode"]);
    expect(drawn).not.toContain("NGPHC");
    expect(findNigerianPort("NGPHC")?.positionStatus).toBe("position-unavailable");
  });

  it("still draws every major port that does have a position", () => {
    const drawn = portFeatureCollection().features.map((f) => f.properties["locode"]);
    for (const locode of ["NGAPAPA", "NGTIN", "NGLEK", "NGONNE", "NGWARR", "NGCBQ"]) {
      expect(drawn, `${locode} must be drawable`).toContain(locode);
    }
  });

  it("draws one feature per registered anchorage", () => {
    const collection = anchorageFeatureCollection();
    expect(collection.features).toHaveLength(Object.keys(NIGERIAN_ANCHORAGES).length);
    for (const feature of collection.features) {
      expect(feature.properties["assetKind"]).toBe("anchorage");
    }
  });

  it("exposes anchorages as their own switchable layer", () => {
    const layer = layerRegistry.list().find((l) => l.id === "anchorages");
    expect(layer?.status).toBe("ready");
    expect(layer?.defaultVisible).toBe(true);
  });
});
