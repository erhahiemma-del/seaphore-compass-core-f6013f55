/**
 * Turning the facility registry into map features.
 *
 * Two rules from the registry's own MAP CONFIG sheet govern this file,
 * and both are about refusing to draw:
 *
 * > PORT_CENTROID — Do NOT drop an individual pin: plotting
 * > centroid-sharing terminals as separate pins would stack false markers
 * > on one point.
 *
 * > UNVERIFIED — No map marker. The map must never look precise while
 * > being wrong.
 *
 * Nineteen of twenty-nine terminals are located only to their parent
 * port. Drawing them would put nineteen pins on seven coordinates, each
 * looking like a surveyed position.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_FACILITIES,
  facilityFeatures,
  facilityPaletteFor,
  precisionStyle,
  undrawnFacilities,
} from "@/services/registry/facility-features";
import type {
  CoordinatePrecision,
  FacilityRegistry,
  RegistryTerminal,
} from "@/services/registry/registry-ingest";

const SOURCE = {
  file: "registry.xlsx",
  fileHash: "bcb981ac",
  importRunId: "reg-bcb981ac",
  sheet: "TERMINALS",
  row: 2,
};

function point(precision: CoordinatePrecision, located = true) {
  const geometry = !located
    ? ("GEOMETRY_PENDING" as const)
    : precision === "PORT_CENTROID"
      ? ("PORT_ANCHORED" as const)
      : precision === "UNVERIFIED"
        ? ("GEOMETRY_PENDING" as const)
        : ("VERIFIED_GEOMETRY" as const);
  return {
    lat: located ? 6.4325 : null,
    lon: located ? 3.3525 : null,
    precision,
    geometry,
    note: "n/a",
  };
}

function terminal(overrides: Partial<RegistryTerminal> = {}): RegistryTerminal {
  return {
    id: "NG-TIN-T02",
    portId: "NG-PORT-TIN",
    name: "Terminal B (TICT)",
    facilityClass: "Container terminal",
    primaryCargo: "Containers",
    companyId: "CO-TIC",
    operator: "Tin Can Island Container Terminal Ltd",
    berthDesignations: "3, 4, 4A, 5",
    quayLengthM: null,
    maxDraftM: null,
    annualCapacity: null,
    concessionId: "CN-006",
    point: point("EXACT_NEAR_EXACT"),
    presentation: {
      mapCategory: "Container Terminal",
      mapLayer: "Terminals",
      zoomTier: 2,
      popupSummary: "Container terminal · Tin Can",
    },
    dataState: "VERIFIED",
    brief: null,
    notes: null,
    source: SOURCE,
    ...overrides,
  };
}

function registry(terminals: readonly RegistryTerminal[]): FacilityRegistry {
  return {
    sourceFile: "registry.xlsx",
    sourceFileHash: "bcb981ac",
    importRunId: "reg-bcb981ac",
    ingestedAt: "2026-08-31T10:56:00.000Z",
    ports: [],
    terminals,
    facilities: [],
    offshore: [],
    lngGas: [],
    companies: [],
    concessions: [],
    audit: [],
  };
}

describe("only located facilities become features", () => {
  it("draws a facility the registry located itself", () => {
    const collection = facilityFeatures(registry([terminal()]));

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].geometry.coordinates).toEqual([3.3525, 6.4325]);
  });

  /*
   * The rule that matters most. The coordinate exists and is correct — it
   * is the port's. A pin here would be a surveyed-looking marker for a
   * position the registry explicitly declines to state, and nineteen
   * terminals would stack onto seven points.
   */
  it("never draws a facility located only to its parent port", () => {
    const collection = facilityFeatures(registry([terminal({ point: point("PORT_CENTROID") })]));

    expect(collection.features).toHaveLength(0);
  });

  it("never draws a facility with no coordinate of adequate quality", () => {
    const collection = facilityFeatures(
      registry([terminal({ point: point("UNVERIFIED", false) })]),
    );

    expect(collection.features).toHaveLength(0);
  });

  /*
   * Undrawn is not unknown. A facility missing from the map is a question
   * someone will ask, and the answer is a property of the source.
   */
  it("reports what it left off, with the reason", () => {
    const undrawn = undrawnFacilities(
      registry([
        terminal({ id: "anchored", point: point("PORT_CENTROID") }),
        terminal({ id: "unlocated", point: point("UNVERIFIED", false) }),
      ]),
    );

    expect(undrawn).toHaveLength(2);
    expect(undrawn[0].reason).toMatch(/stack a false marker/i);
    expect(undrawn[1].reason).toMatch(/never look precise while being wrong/i);
  });

  it("returns an empty collection with no registry loaded", () => {
    expect(facilityFeatures(null)).toEqual(EMPTY_FACILITIES);
    expect(undrawnFacilities(null)).toHaveLength(0);
  });
});

describe("precision drives how a marker is drawn", () => {
  it("maps each precision to its MAP CONFIG treatment", () => {
    expect(precisionStyle("EXACT_NEAR_EXACT")).toBe("SOLID");
    expect(precisionStyle("APPROXIMATE")).toBe("HALO");
    expect(precisionStyle("OFFSHORE_ESTIMATED")).toBe("ESTIMATED");
  });

  /*
   * MAP CONFIG excludes offshore estimates from nearest-facility
   * calculations until confirmed. That exclusion travels on the feature,
   * so a consumer computing "closest terminal" does not have to re-derive
   * it from a precision string.
   */
  it("marks an offshore estimate as unusable for distance work", () => {
    const estimated = facilityFeatures(
      registry([terminal({ point: point("OFFSHORE_ESTIMATED") })]),
    );
    const exact = facilityFeatures(registry([terminal()]));

    expect(estimated.features[0].properties.usableForDistance).toBe(false);
    expect(exact.features[0].properties.usableForDistance).toBe(true);
  });
});

describe("the registry's own presentation is honoured", () => {
  it("carries category, layer and zoom tier through", () => {
    const feature = facilityFeatures(registry([terminal()])).features[0];

    expect(feature.properties.category).toBe("Container Terminal");
    expect(feature.properties.layer).toBe("Terminals");
    expect(feature.properties.zoomTier).toBe(2);
    expect(feature.properties.popupSummary).toBe("Container terminal · Tin Can");
  });

  /*
   * Tier 3 is facility-level zoom — the safe default. Defaulting to 1
   * would put an untiered private jetty on the national view.
   */
  it("defaults an untiered facility to facility-level zoom", () => {
    const feature = facilityFeatures(
      registry([terminal({ presentation: { ...terminal().presentation, zoomTier: null } })]),
    ).features[0];

    expect(feature.properties.zoomTier).toBe(3);
  });

  it("colours by the registry's cargo-economy grouping", () => {
    expect(facilityPaletteFor("Port Complex")).toBe("port");
    expect(facilityPaletteFor("Container Terminal")).toBe("terminal");
    expect(facilityPaletteFor("Bulk Terminal")).toBe("terminal");
    expect(facilityPaletteFor("Offshore FPSO")).toBe("energy");
    expect(facilityPaletteFor("Oil Export Terminal")).toBe("energy");
    expect(facilityPaletteFor("LNG Terminal")).toBe("gas");
    expect(facilityPaletteFor("Jetty")).toBe("industrial");
  });

  /*
   * A category this mapping does not know should look unclassified, not
   * inherit the colour of whichever branch happened to be last.
   */
  it("gives an unrecognised category a neutral colour", () => {
    expect(facilityPaletteFor("Something New")).toBe("services");
    expect(facilityPaletteFor(null)).toBe("services");
  });
});
