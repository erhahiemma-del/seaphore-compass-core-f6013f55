/**
 * Resolving a clicked marker to the right registry record.
 *
 * The facility layer draws five different record types onto one source,
 * so a click carries an id and a claimed kind. This resolves the id — and
 * deliberately does not trust the kind, because the id is unique across
 * the whole workbook and a feature property is one refactor away from
 * being stale.
 *
 * The narrowings matter for the same reason. A jetty and a terminal carry
 * different fields, and picking the wrong set would show an officer a
 * blank "Berths" row on a facility that never had berths, which reads as
 * missing data rather than as an inapplicable field.
 */
import { describe, expect, it } from "vitest";

import {
  FACILITY_KIND_LABELS,
  findFacility,
  isJettyRecord,
  isOffshoreRecord,
  isTerminalRecord,
} from "@/features/maritime/facility-presentation";
import type {
  FacilityRegistry,
  RegistryFacility,
  RegistryOffshore,
  RegistryPort,
  RegistryTerminal,
} from "@/services/registry/registry-ingest";

const SOURCE = {
  file: "Seaphore_Registry_v2_Intelligence_Edition (1).xlsx",
  fileHash: "bcb981ac",
  importRunId: "reg-bcb981ac",
  sheet: "TERMINALS",
  row: 2,
};

const PRESENTATION = {
  mapCategory: "Container Terminal",
  mapLayer: "Terminals",
  zoomTier: 2,
  popupSummary: "Container terminal · Tin Can",
};

const EXACT = {
  lat: 6.4325,
  lon: 3.3525,
  precision: "EXACT_NEAR_EXACT" as const,
  geometry: "VERIFIED_GEOMETRY" as const,
  note: "Facility-level coordinate, verified or near-verified.",
};

const CENTROID = {
  lat: 6.433,
  lon: 3.392,
  precision: "PORT_CENTROID" as const,
  geometry: "PORT_ANCHORED" as const,
  note: "This is the parent port's coordinate, not the facility's.",
};

const port: RegistryPort = {
  id: "NG-PORT-TIN",
  name: "Tin Can Island Port Complex",
  parentType: "Port Complex",
  state: "Lagos",
  locality: "Tin Can",
  principalFunction: "Container / general cargo",
  unlocode: "NGTIN",
  point: EXACT,
  presentation: { ...PRESENTATION, mapCategory: "Port Complex", zoomTier: 1 },
  dataState: "VERIFIED",
  brief: "A two-paragraph brief.",
  notes: null,
  source: { ...SOURCE, sheet: "PORTS" },
};

const terminal: RegistryTerminal = {
  id: "NG-TIN-T02",
  portId: "NG-PORT-TIN",
  name: "Terminal B (TICT)",
  facilityClass: "Container terminal",
  primaryCargo: "Container",
  companyId: "CO-TIC",
  operator: "Tin Can Island Container Terminal Ltd",
  berthDesignations: "3, 4, 4A, 5",
  quayLengthM: 764.64,
  // The registry writes NOT VERIFIED here; the ingest makes it null.
  maxDraftM: null,
  annualCapacity: null,
  concessionId: "CN-006",
  point: EXACT,
  presentation: PRESENTATION,
  dataState: "CORROBORATED",
  brief: null,
  notes: null,
  source: SOURCE,
};

const jetty: RegistryFacility = {
  id: "NG-ONN-J01",
  portId: "NG-PORT-ONN",
  name: "STARTZ Jetty",
  facilityClass: "Private jetty",
  locality: "Onne",
  cargoFunction: "Offshore support",
  operator: "STARTZ",
  maxDraftM: null,
  status: "Active",
  point: CENTROID,
  presentation: { ...PRESENTATION, mapCategory: "Jetty", mapLayer: "Jetties", zoomTier: 3 },
  dataState: "VERIFIED",
  brief: null,
  source: { ...SOURCE, sheet: "JETTIES & FACILITIES" },
};

const offshore: RegistryOffshore = {
  id: "NG-OFF-031",
  name: "Egina FPSO",
  facilityClass: "FPSO",
  zone: "OML 130",
  operator: "TotalEnergies",
  product: "Crude oil",
  historicalStorageBbl: "2,300,000",
  loadingSystem: "Tandem offloading",
  coordinateSource: "Maritime directory",
  point: {
    lat: 4.2,
    lon: 5.9,
    precision: "OFFSHORE_ESTIMATED",
    geometry: "VERIFIED_GEOMETRY",
    note: "Offshore position taken from maritime directories.",
  },
  presentation: {
    ...PRESENTATION,
    mapCategory: "Offshore FPSO",
    mapLayer: "Offshore",
    zoomTier: 1,
  },
  dataState: "PROVISIONAL",
  brief: null,
  notes: null,
  source: { ...SOURCE, sheet: "OFFSHORE" },
};

const registry: FacilityRegistry = {
  sourceFile: SOURCE.file,
  sourceFileHash: SOURCE.fileHash,
  importRunId: SOURCE.importRunId,
  ingestedAt: "2026-08-31T10:56:00.000Z",
  ports: [port],
  terminals: [terminal],
  facilities: [jetty],
  offshore: [offshore],
  lngGas: [],
  companies: [
    {
      id: "CO-TIC",
      name: "Tin Can Island Container Terminal Ltd",
      parent: "AGL / Bolloré (verification item)",
      founded: null,
      nigerianEntry: "2006",
      role: "Container terminal operator",
      facilityIds: ["NG-TIN-T02"],
      dataState: "VERIFIED",
      notes: null,
      source: { ...SOURCE, sheet: "COMPANIES" },
    },
  ],
  concessions: [
    {
      id: "CN-006",
      port: "Tin Can Island",
      terminalId: "NG-TIN-T02",
      concessionaire: "Tin Can Island Container Terminal Ltd",
      commencement: "2006",
      originalTerm: "15 years",
      originalExpiry: null,
      extension: null,
      currentStatus: "Active",
      sourceAuthority: "NPA / ICRC",
      dataState: "VERIFIED",
      source: { ...SOURCE, sheet: "CONCESSIONS" },
    },
  ],
  audit: [],
};

describe("resolving a clicked marker", () => {
  it("finds each record type by its registry id", () => {
    expect(findFacility(registry, "NG-PORT-TIN")?.kind).toBe("PORT");
    expect(findFacility(registry, "NG-TIN-T02")?.kind).toBe("TERMINAL");
    expect(findFacility(registry, "NG-ONN-J01")?.kind).toBe("JETTY");
    expect(findFacility(registry, "NG-OFF-031")?.kind).toBe("OFFSHORE");
  });

  it("returns the record itself, not just its kind", () => {
    const found = findFacility(registry, "NG-TIN-T02")!;

    expect(found.record.name).toBe("Terminal B (TICT)");
    expect(isTerminalRecord(found.record) && found.record.operator).toBe(
      "Tin Can Island Container Terminal Ltd",
    );
  });

  /*
   * "Selected but unknown" is a real state — a stale URL, or a registry
   * re-import that dropped a row. Null lets the drawer say so instead of
   * rendering an empty panel that reads as an empty record.
   */
  it("returns null for an id the registry does not hold", () => {
    expect(findFacility(registry, "NG-NOPE-999")).toBeNull();
  });

  it("returns null when no registry has loaded", () => {
    expect(findFacility(null, "NG-TIN-T02")).toBeNull();
  });

  it("names every kind the layer can open", () => {
    expect(FACILITY_KIND_LABELS.PORT).toBe("Port");
    expect(FACILITY_KIND_LABELS.TERMINAL).toBe("Terminal");
    expect(FACILITY_KIND_LABELS.JETTY).toBe("Jetty / facility");
    expect(FACILITY_KIND_LABELS.OFFSHORE).toBe("Offshore facility");
    expect(FACILITY_KIND_LABELS.LNG_GAS).toBe("LNG / gas facility");
  });
});

describe("choosing the right field set", () => {
  /*
   * A jetty has no berths and no concession. Showing those rows as
   * "Not available" would read as missing data rather than as a field
   * that does not apply to this kind of facility.
   */
  it("distinguishes a terminal from a jetty", () => {
    expect(isTerminalRecord(terminal)).toBe(true);
    expect(isTerminalRecord(jetty)).toBe(false);
    expect(isJettyRecord(jetty)).toBe(true);
    expect(isJettyRecord(terminal)).toBe(false);
  });

  it("distinguishes an offshore facility by its loading system", () => {
    expect(isOffshoreRecord(offshore)).toBe(true);
    expect(isOffshoreRecord(terminal)).toBe(false);
    expect(isOffshoreRecord(jetty)).toBe(false);
  });

  it("does not mistake a port for any facility kind", () => {
    expect(isTerminalRecord(port)).toBe(false);
    expect(isJettyRecord(port)).toBe(false);
    expect(isOffshoreRecord(port)).toBe(false);
  });
});

describe("what the panel can say about a record", () => {
  /*
   * The registry writes NOT VERIFIED rather than leaving a cell blank,
   * and the ingest turns that into null. A null here is the source
   * declining to state a value, which is what the panel reports — never
   * a zero, and never an omitted row.
   */
  it("carries an unstated draft and capacity as absent, not zero", () => {
    expect(terminal.maxDraftM).toBeNull();
    expect(terminal.annualCapacity).toBeNull();
    expect(terminal.maxDraftM).not.toBe(0);
  });

  it("keeps berth designations as written rather than a count", () => {
    expect(terminal.berthDesignations).toBe("3, 4, 4A, 5");
    expect(Number(terminal.berthDesignations)).toBeNaN();
  });

  /*
   * A facility drawn on the map still has to say how well it is located.
   * An exact survey and an offshore estimate are different claims, and
   * both reach the map — only the precision separates them.
   */
  it("keeps precision distinct from drawability", () => {
    expect(terminal.point.geometry).toBe("VERIFIED_GEOMETRY");
    expect(terminal.point.precision).toBe("EXACT_NEAR_EXACT");

    expect(offshore.point.geometry).toBe("VERIFIED_GEOMETRY");
    expect(offshore.point.precision).toBe("OFFSHORE_ESTIMATED");
  });

  it("keeps a port-anchored facility off the map without losing its record", () => {
    expect(jetty.point.geometry).toBe("PORT_ANCHORED");
    // Still resolvable, still openable — simply not drawn as a pin.
    expect(findFacility(registry, jetty.id)).not.toBeNull();
  });

  it("resolves the operator company through the registry id, never the name", () => {
    const company = registry.companies.find((entry) => entry.id === terminal.companyId);

    expect(company?.name).toBe("Tin Can Island Container Terminal Ltd");
    /*
     * The registry is explicit that a founding year must not be inferred
     * from a concession date, and records none here.
     */
    expect(company?.founded).toBeNull();
  });

  it("resolves the concession through the registry id", () => {
    const concession = registry.concessions.find((entry) => entry.id === terminal.concessionId);

    expect(concession?.concessionaire).toBe("Tin Can Island Container Terminal Ltd");
    expect(concession?.sourceAuthority).toBe("NPA / ICRC");
    expect(concession?.originalExpiry).toBeNull();
  });

  it("carries provenance down to the spreadsheet row", () => {
    expect(terminal.source.file).toBe(SOURCE.file);
    expect(terminal.source.sheet).toBe("TERMINALS");
    expect(terminal.source.row).toBe(2);
    expect(terminal.source.importRunId).toBe("reg-bcb981ac");
  });
});

describe("port to terminal", () => {
  it("links a terminal to its parent port by id", () => {
    const parent = registry.ports.find((entry) => entry.id === terminal.portId);

    expect(parent?.name).toBe("Tin Can Island Port Complex");
    expect(parent?.unlocode).toBe("NGTIN");
  });

  /*
   * The parent link is what lets the panel offer "open the port". A
   * facility with no parent must not fall back to the nearest one.
   */
  it("claims no parent when the registry names none", () => {
    expect(registry.ports.find((entry) => entry.id === offshore.id)).toBeUndefined();
    expect("portId" in offshore).toBe(false);
  });
});
