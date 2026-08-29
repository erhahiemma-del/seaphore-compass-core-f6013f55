/**
 * Deep vessel enrichment, and the port join that must not guess.
 *
 * The fixtures are the real shapes Datalastic returned for a dredger off
 * Lagos on 29 Aug 2026 — a vessel bound for LAGOS (NGLOS) out of KAMSAR
 * (GNKMR). Real shapes because an invented one only proves the code agrees
 * with its author.
 *
 * The load-bearing rule is the port link: a destination is joined on a
 * provider identifier or it is not joined at all. "LAGOS" is a port in
 * Nigeria and a port in Portugal, and a confident wrong join puts a vessel
 * in the wrong country's workspace — which is worse than admitting the
 * link is unavailable.
 */
import { describe, expect, it } from "vitest";

import type {
  DatalasticVesselIdentity,
  DatalasticVesselVoyage,
} from "@/connectors/datalastic/types";
import {
  resolvePortLink,
  toDeclaredVoyage,
  toVesselParticulars,
  vesselCoverage,
  type VesselEnrichment,
} from "@/services/geospatial/vessel-enrichment";

const IDENTITY: DatalasticVesselIdentity = {
  uuid: "ca7d0e87-d611-68ca-9423-e748729f8bf7",
  imo: "9865714",
  mmsi: "245026000",
  name: "RIVER THAMES",
  nameAis: "RIVER THAMES",
  callSign: "PDSY",
  flag: "NL",
  flagName: "Netherlands",
  type: "Dredger",
  typeSpecific: "Hopper Dredger",
  grossTonnage: 2494,
  deadweight: 2775,
  teu: null,
  liquidGas: null,
  length: 79.95,
  breadth: 15,
  draughtAvg: null,
  draughtMax: null,
  speedAvg: 1.9,
  speedMax: 12,
  yearBuilt: 2020,
  homePort: "FLUSHING",
  isNavaid: false,
};

const VOYAGE: DatalasticVesselVoyage = {
  uuid: "ca7d0e87-d611-68ca-9423-e748729f8bf7",
  imo: "9865714",
  mmsi: "245026000",
  currentDraught: 3.8,
  navigationStatus: "Restricted manoeuverability",
  destination: "LAGOS",
  destinationPort: "LAGOS",
  destinationPortUnlocode: "NGLOS",
  destinationPortUuid: "2cb375dd-aea5-fc12-a639-7c15b893e250",
  departurePort: "KAMSAR",
  departurePortUnlocode: "GNKMR",
  departurePortUuid: "05c6be2e-ad2b-256b-ae04-8e770bc06916",
  departedAt: "2026-07-27T13:18:00.000Z",
  eta: "2026-08-24T09:13:00.000Z",
  observedAt: "2026-08-29T14:41:00.000Z",
};

describe("the port join never guesses", () => {
  it("links on a provider identifier", () => {
    const link = resolvePortLink(VOYAGE);

    expect(link.state).toBe("VERIFIED");
    expect(link.unlocode).toBe("NGLOS");
    expect(link.providerPortUuid).toBe("2cb375dd-aea5-fc12-a639-7c15b893e250");
    expect(link.note).toBeNull();
  });

  /*
   * The rule the whole module exists for. A vessel broadcasting "LAGOS"
   * with no resolved port must not be joined to Lagos, Nigeria — the same
   * text names a port in Portugal.
   */
  it("refuses to join on a free-text name alone", () => {
    const link = resolvePortLink({
      ...VOYAGE,
      destinationPortUnlocode: null,
      destinationPortUuid: null,
    });

    expect(link.state).toBe("NO_VERIFIED_PORT_LINK");
    expect(link.unlocode).toBeNull();
    expect(link.providerPortUuid).toBeNull();
    // The name is still shown — it is what the vessel said — but as text.
    expect(link.name).toBe("LAGOS");
    expect(link.note).toMatch(/not unique/i);
  });

  it("still links when only the UNLOCODE survives", () => {
    const link = resolvePortLink({ ...VOYAGE, destinationPortUuid: null });
    expect(link.state).toBe("VERIFIED");
    expect(link.unlocode).toBe("NGLOS");
  });

  it("still links when only the provider uuid survives", () => {
    const link = resolvePortLink({ ...VOYAGE, destinationPortUnlocode: null });
    expect(link.state).toBe("VERIFIED");
    expect(link.providerPortUuid).toBe("2cb375dd-aea5-fc12-a639-7c15b893e250");
  });

  /*
   * A vessel declaring nothing is a different state from one declaring
   * something unjoinable — the first is normal at anchor, the second may
   * be a data-quality problem worth noticing.
   */
  it("separates declaring nothing from declaring something unjoinable", () => {
    const link = resolvePortLink({
      ...VOYAGE,
      destination: null,
      destinationPort: null,
      destinationPortUnlocode: null,
      destinationPortUuid: null,
    });

    expect(link.state).toBe("NOT_DECLARED");
  });
});

describe("declared voyage", () => {
  it("carries the provider's ports, times and draught", () => {
    const voyage = toDeclaredVoyage(VOYAGE);

    expect(voyage.departurePort).toBe("KAMSAR");
    expect(voyage.departureUnlocode).toBe("GNKMR");
    expect(voyage.departedAt).toBe("2026-07-27T13:18:00.000Z");
    expect(voyage.eta).toBe("2026-08-24T09:13:00.000Z");
    expect(voyage.currentDraught).toBe(3.8);
    expect(voyage.navigationStatus).toBe("Restricted manoeuverability");
    expect(voyage.observedAt).toBe("2026-08-29T14:41:00.000Z");
  });

  /*
   * No ETA is ever computed from speed and distance. An inferred arrival
   * sitting beside a declared one is indistinguishable from it, and only
   * one of them is something the vessel actually said.
   */
  it("reports a missing ETA as missing rather than estimating one", () => {
    const voyage = toDeclaredVoyage({ ...VOYAGE, eta: null });

    expect(voyage.eta).toBeNull();
  });

  /*
   * A voyage state with no provider timestamp cannot be aged, and an
   * unageable value must never borrow the current time — that would turn
   * "we do not know when this was true" into "this is true now", which is
   * the one error the freshness model exists to prevent.
   */
  it("never substitutes the current time for a missing observation time", () => {
    const voyage = toDeclaredVoyage({ ...VOYAGE, observedAt: null });

    expect(voyage.observedAt).toBeNull();
  });

  it("never substitutes a time for a missing departure", () => {
    const voyage = toDeclaredVoyage({ ...VOYAGE, departedAt: null });

    expect(voyage.departedAt).toBeNull();
  });
});

describe("static particulars", () => {
  it("carries the measurements the map never held", () => {
    const p = toVesselParticulars(IDENTITY);

    expect(p.callSign).toBe("PDSY");
    expect(p.grossTonnage).toBe(2494);
    expect(p.deadweight).toBe(2775);
    expect(p.length).toBe(79.95);
    expect(p.yearBuilt).toBe(2020);
    expect(p.homePort).toBe("FLUSHING");
  });

  /*
   * A duplicated value in every panel trains an officer to stop reading
   * it. The AIS name earns its place only when it disagrees — which is
   * how a vessel operating under a changed identity shows up.
   */
  it("shows the AIS name only when it differs from the registered one", () => {
    expect(toVesselParticulars(IDENTITY).aisNameDiffers).toBeNull();

    const renamed = toVesselParticulars({ ...IDENTITY, nameAis: "RIVER THAMES II" });
    expect(renamed.aisNameDiffers).toBe("RIVER THAMES II");
  });

  it("ignores case and padding when comparing the two names", () => {
    const p = toVesselParticulars({ ...IDENTITY, nameAis: "  river thames " });
    expect(p.aisNameDiffers).toBeNull();
  });

  it("keeps an absent measurement absent rather than zeroing it", () => {
    const p = toVesselParticulars(IDENTITY);
    // A dredger has no container capacity. Zero would state one.
    expect(p.teu).toBeNull();
  });
});

describe("coverage card", () => {
  const enriched: VesselEnrichment = {
    particulars: toVesselParticulars(IDENTITY),
    particularsProvenance: null,
    voyage: toDeclaredVoyage(VOYAGE),
    voyageProvenance: null,
  };

  it("ticks only what actually arrived", () => {
    const coverage = vesselCoverage(enriched);
    const by = (name: string) => coverage.find((c) => c.capability === name)!;

    expect(by("Vessel particulars").present).toBe(true);
    expect(by("Voyage").present).toBe(true);
    expect(by("Port link").present).toBe(true);
    expect(by("Draught").present).toBe(true);
  });

  /*
   * The card's purpose is telling an officer what is *not* known, so a
   * tick meaning "we asked" would invert it.
   */
  it("does not tick a port link that was never verified", () => {
    const unlinked: VesselEnrichment = {
      ...enriched,
      voyage: toDeclaredVoyage({
        ...VOYAGE,
        destinationPortUnlocode: null,
        destinationPortUuid: null,
      }),
    };

    const link = vesselCoverage(unlinked).find((c) => c.capability === "Port link")!;
    expect(link.present).toBe(false);
  });

  it("reports nothing as present when nothing was loaded", () => {
    const empty = vesselCoverage({
      particulars: null,
      particularsProvenance: null,
      voyage: null,
      voyageProvenance: null,
    });

    expect(empty.every((c) => !c.present)).toBe(true);
  });

  /*
   * The unreachable add-ons are listed rather than omitted. An officer
   * asking who owns a ship is better served by being told Seaphore cannot
   * answer than by a panel that never mentions ownership — and their
   * reason must be NOT_AVAILABLE, not NO_RECORD, which would claim the
   * provider looked and found nothing.
   */
  it("names the unreachable capabilities without claiming they are empty", () => {
    const coverage = vesselCoverage(enriched);
    for (const name of ["Ownership", "Classification", "Inspections", "Engine"]) {
      const row = coverage.find((c) => c.capability === name)!;
      expect(row.present).toBe(false);
      expect(row.reason).toBe("NOT_AVAILABLE");
    }
  });
});
