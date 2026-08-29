/**
 * Parsing the two deep vessel endpoints.
 *
 * The fixtures below are the real shapes `vessel_info` and `vessel_pro`
 * returned for a dredger off Lagos, copied field-for-field rather than
 * invented — an invented fixture would only prove the parser matches what
 * the parser's author imagined, which is how a provider integration ends
 * up agreeing with itself and nothing else.
 *
 * What is under test is mostly the refusals: nulls that must stay null,
 * times that must not become "now", and rows with no identity that must
 * not become a vessel.
 */
import { describe, expect, it } from "vitest";

import { parseVesselIdentity, parseVesselVoyage } from "@/lib/server/datalastic.server";

/** `vessel_info` for RIVER THAMES, 29 Aug 2026. */
const INFO_ROW = {
  uuid: "ca7d0e87-d611-68ca-9423-e748729f8bf7",
  name: "RIVER THAMES",
  name_ais: "RIVER THAMES",
  mmsi: "245026000",
  imo: "9865714",
  eni: null,
  country_iso: "NL",
  country_name: "Netherlands",
  callsign: "PDSY",
  type: "Dredger",
  type_specific: "Hopper Dredger",
  gross_tonnage: 2494,
  deadweight: 2775,
  teu: null,
  liquid_gas: null,
  length: 79.95,
  breadth: 15,
  draught_avg: null,
  draught_max: null,
  speed_avg: 1.9,
  speed_max: 12,
  year_built: 2020,
  is_navaid: false,
  home_port: "FLUSHING",
};

/** `vessel_pro` for the same vessel, same moment. */
const PRO_ROW = {
  uuid: "ca7d0e87-d611-68ca-9423-e748729f8bf7",
  name: "RIVER THAMES",
  mmsi: "245026000",
  imo: "9865714",
  country_iso: "NL",
  type: "Dredger",
  lat: 6.4123468,
  lon: 3.3993332,
  speed: 7,
  course: 180,
  heading: 181,
  current_draught: 3.8,
  navigation_status: "Restricted manoeuverability",
  destination: "LAGOS",
  dest_port_uuid: "2cb375dd-aea5-fc12-a639-7c15b893e250",
  dest_port: "LAGOS",
  dest_port_unlocode: "NGLOS",
  dep_port_uuid: "05c6be2e-ad2b-256b-ae04-8e770bc06916",
  dep_port: "KAMSAR",
  dep_port_unlocode: "GNKMR",
  last_position_epoch: 1788014460,
  last_position_UTC: "2026-08-29T14:41:00Z",
  atd_epoch: 1785158280,
  atd_UTC: "2026-07-27T13:18:00Z",
  eta_epoch: 1787562780,
  eta_UTC: "2026-08-24T09:13:00Z",
};

describe("static particulars", () => {
  it("keeps the measurements the map never carries", () => {
    const identity = parseVesselIdentity(INFO_ROW)!;

    expect(identity.grossTonnage).toBe(2494);
    expect(identity.deadweight).toBe(2775);
    expect(identity.length).toBe(79.95);
    expect(identity.breadth).toBe(15);
    expect(identity.yearBuilt).toBe(2020);
    expect(identity.callSign).toBe("PDSY");
    expect(identity.homePort).toBe("FLUSHING");
  });

  /*
   * A dredger has no container capacity, and the provider says so with a
   * null. Turning that into 0 would state a capacity the vessel does not
   * have — a fabricated fact, not a tidier one.
   */
  it("leaves absent measurements absent rather than zeroing them", () => {
    const identity = parseVesselIdentity(INFO_ROW)!;

    expect(identity.teu).toBeNull();
    expect(identity.liquidGas).toBeNull();
    expect(identity.draughtAvg).toBeNull();
    expect(identity.draughtMax).toBeNull();
  });

  it("keeps the AIS name separate from the registered name", () => {
    const identity = parseVesselIdentity({ ...INFO_ROW, name_ais: "RIVER THAMES II" })!;

    // A mismatch between these two is itself a signal, so they must not
    // be collapsed into one field.
    expect(identity.name).toBe("RIVER THAMES");
    expect(identity.nameAis).toBe("RIVER THAMES II");
  });

  it("distinguishes a navigation aid from a ship", () => {
    expect(parseVesselIdentity(INFO_ROW)!.isNavaid).toBe(false);
    expect(parseVesselIdentity({ ...INFO_ROW, is_navaid: true })!.isNavaid).toBe(true);
    // Not reported is not the same as "it is a ship".
    expect(parseVesselIdentity({ ...INFO_ROW, is_navaid: null })!.isNavaid).toBeNull();
  });

  it("refuses a row with nothing to key it to", () => {
    expect(parseVesselIdentity({ name: "GHOST" })).toBeNull();
    expect(parseVesselIdentity(null)).toBeNull();
    expect(parseVesselIdentity("not an object")).toBeNull();
  });
});

describe("voyage context", () => {
  /*
   * The reason `vessel_pro` is worth a request the cheaper endpoint is
   * not. A broadcast destination is free text nothing can join on; the
   * UNLOCODE and provider uuid are what connect a voyage to a port.
   */
  it("keeps the resolved ports, not just the broadcast text", () => {
    const voyage = parseVesselVoyage(PRO_ROW)!;

    expect(voyage.destination).toBe("LAGOS");
    expect(voyage.destinationPort).toBe("LAGOS");
    expect(voyage.destinationPortUnlocode).toBe("NGLOS");
    expect(voyage.destinationPortUuid).toBe("2cb375dd-aea5-fc12-a639-7c15b893e250");
    expect(voyage.departurePort).toBe("KAMSAR");
    expect(voyage.departurePortUnlocode).toBe("GNKMR");
  });

  it("keeps draught and navigation status", () => {
    const voyage = parseVesselVoyage(PRO_ROW)!;

    expect(voyage.currentDraught).toBe(3.8);
    expect(voyage.navigationStatus).toBe("Restricted manoeuverability");
  });

  it("reads the provider's times as given", () => {
    const voyage = parseVesselVoyage(PRO_ROW)!;

    expect(voyage.observedAt).toBe("2026-08-29T14:41:00.000Z");
    expect(voyage.departedAt).toBe("2026-07-27T13:18:00.000Z");
    expect(voyage.eta).toBe("2026-08-24T09:13:00.000Z");
  });

  it("falls back to the epoch when the ISO string is missing", () => {
    const voyage = parseVesselVoyage({ ...PRO_ROW, atd_UTC: null })!;

    // The provider sends both forms; losing one must not lose the time.
    expect(voyage.departedAt).toBe("2026-07-27T13:18:00.000Z");
  });

  /*
   * A vessel that has not declared a departure has no departure time.
   * Substituting "now" would assert it just left, which is exactly the
   * kind of invented provenance the whole model exists to prevent.
   */
  it("reports a missing time as missing, never as now", () => {
    const voyage = parseVesselVoyage({ ...PRO_ROW, atd_UTC: null, atd_epoch: 0 })!;

    expect(voyage.departedAt).toBeNull();
  });

  it("refuses a row with nothing to key it to", () => {
    expect(parseVesselVoyage({ destination: "LAGOS" })).toBeNull();
    expect(parseVesselVoyage(undefined)).toBeNull();
  });
});
