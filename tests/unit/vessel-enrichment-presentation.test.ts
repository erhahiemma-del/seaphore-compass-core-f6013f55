/**
 * The drawer rows built from the deep Datalastic loads.
 *
 * The rule these enforce is that no row reaches an officer saying nothing.
 * Every absent value carries a reason, and the reasons are not
 * interchangeable: "not loaded yet", "the provider holds no value", and
 * "Datalastic sells this and serves no endpoint for it" are three different
 * statements, and only the middle one says anything about the vessel.
 */
import { describe, expect, it } from "vitest";

import {
  presentDeclaredVoyage,
  presentEnrichmentSource,
  presentParticulars,
  presentPortContext,
  presentUnservedCapabilities,
} from "@/features/maritime/vessel-presentation";
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";

const FULL: VesselEnrichment = {
  particulars: {
    callSign: "PDSY",
    grossTonnage: 2494,
    deadweight: 2775,
    teu: null,
    length: 79.95,
    breadth: 15,
    yearBuilt: 2020,
    homePort: "FLUSHING",
    flagName: "Netherlands",
    aisNameDiffers: null,
    speedAvg: 1.9,
    speedMax: 12,
    isNavaid: false,
  },
  particularsProvenance: {
    provider: "Datalastic",
    endpoint: "vessel_info",
    retrievedAt: "2026-08-29T14:42:00.000Z",
    observedAt: null,
  },
  voyage: {
    departurePort: "KAMSAR",
    departureUnlocode: "GNKMR",
    departedAt: "2026-07-27T13:18:00.000Z",
    destinationText: "LAGOS",
    destinationLink: {
      state: "VERIFIED",
      unlocode: "NGLOS",
      providerPortUuid: "2cb375dd-aea5-fc12-a639-7c15b893e250",
      name: "LAGOS",
      note: null,
    },
    eta: "2026-08-24T09:13:00.000Z",
    navigationStatus: "Restricted manoeuverability",
    currentDraught: 3.8,
    observedAt: "2026-08-29T14:41:00.000Z",
  },
  voyageProvenance: {
    provider: "Datalastic",
    endpoint: "vessel_pro",
    retrievedAt: "2026-08-29T14:42:00.000Z",
    observedAt: "2026-08-29T14:41:00.000Z",
  },
};

const EMPTY: VesselEnrichment = {
  particulars: null,
  particularsProvenance: null,
  voyage: null,
  voyageProvenance: null,
};

/** Every row is either a value or an explained absence. Never neither. */
function everyRowSpeaks(rows: readonly { value?: string; reason?: string }[]): boolean {
  return rows.every((r) => Boolean(r.value) || Boolean(r.reason));
}

describe("particulars", () => {
  it("renders the measurements with their units", () => {
    const rows = presentParticulars(FULL);
    const by = (label: string) => rows.find((r) => r.label === label);

    expect(by("Call sign")?.value).toBe("PDSY");
    expect(by("Gross tonnage")?.value).toBe("2,494 t");
    expect(by("Length")?.value).toBe("79.95 m");
    expect(by("Year built")?.value).toBe("2020");
    expect(by("Home port")?.value).toBe("FLUSHING");
  });

  /*
   * The distinction the whole panel rests on. Not loaded is a statement
   * about Seaphore; no record is a statement about the vessel.
   */
  it("says not-loaded rather than no-record before the deep load runs", () => {
    const rows = presentParticulars(EMPTY);

    expect(rows).toHaveLength(1);
    expect(rows[0].availability).toBe("UNKNOWN");
    expect(rows[0].reason).toMatch(/not loaded/i);
  });

  it("says no-record when the provider answered without a value", () => {
    const rows = presentParticulars({
      ...FULL,
      particulars: { ...FULL.particulars!, callSign: null },
    });
    const callSign = rows.find((r) => r.label === "Call sign")!;

    expect(callSign.availability).toBe("UNAVAILABLE");
    expect(callSign.reason).toMatch(/holds no value/i);
  });

  /*
   * Blank-to-zero: an absent tonnage rendered as "0 t" would state that
   * the vessel weighs nothing, which is a fabricated fact, not a tidier
   * one.
   */
  it("never renders an absent measurement as zero", () => {
    const rows = presentParticulars({
      ...FULL,
      particulars: { ...FULL.particulars!, grossTonnage: null, deadweight: null, length: null },
    });

    for (const label of ["Gross tonnage", "Deadweight", "Length"]) {
      const row = rows.find((r) => r.label === label)!;
      expect(row.value).toBeUndefined();
      expect(row.availability).toBe("UNAVAILABLE");
    }
  });

  it("shows the AIS name only when it diverges", () => {
    expect(presentParticulars(FULL).some((r) => r.label === "AIS name")).toBe(false);

    const diverged = presentParticulars({
      ...FULL,
      particulars: { ...FULL.particulars!, aisNameDiffers: "RIVER THAMES II" },
    });
    const row = diverged.find((r) => r.label === "AIS name")!;
    expect(row.value).toBe("RIVER THAMES II");
    expect(row.provenance).toMatch(/differs/i);
  });

  it("leaves no row silent", () => {
    expect(everyRowSpeaks(presentParticulars(FULL))).toBe(true);
    expect(everyRowSpeaks(presentParticulars(EMPTY))).toBe(true);
  });
});

describe("declared voyage", () => {
  it("renders the ports, times and draught", () => {
    const rows = presentDeclaredVoyage(FULL);
    const by = (label: string) => rows.find((r) => r.label === label);

    expect(by("Departure port")?.value).toBe("KAMSAR");
    expect(by("Departure port")?.provenance).toBe("UNLOCODE GNKMR");
    expect(by("Departed")?.value).toBe("2026-07-27 13:18 UTC");
    expect(by("ETA")?.value).toBe("2026-08-24 09:13 UTC");
    expect(by("Current draught")?.value).toBe("3.8 m");
    expect(by("Navigation status")?.value).toBe("Restricted manoeuverability");
  });

  /*
   * An ETA labelled as computed and one labelled as declared are read
   * very differently, and only one of them is something the vessel said.
   */
  it("labels the ETA as declared, never computed", () => {
    const eta = presentDeclaredVoyage(FULL).find((r) => r.label === "ETA")!;
    expect(eta.provenance).toMatch(/declared/i);
    expect(eta.provenance).toMatch(/not computed/i);
  });

  it("says the vessel is not declaring, rather than showing a blank", () => {
    const rows = presentDeclaredVoyage({
      ...FULL,
      voyage: { ...FULL.voyage!, eta: null, navigationStatus: null },
    });

    for (const label of ["ETA", "Navigation status"]) {
      const row = rows.find((r) => r.label === label)!;
      expect(row.value).toBeUndefined();
      expect(row.reason).toMatch(/not declaring/i);
    }
  });

  it("leaves no row silent", () => {
    expect(everyRowSpeaks(presentDeclaredVoyage(FULL))).toBe(true);
    expect(everyRowSpeaks(presentDeclaredVoyage(EMPTY))).toBe(true);
  });
});

describe("port context", () => {
  it("shows the resolved port and its UNLOCODE", () => {
    const rows = presentPortContext(FULL);

    expect(rows.find((r) => r.label === "Destination port")?.value).toBe("LAGOS");
    expect(rows.find((r) => r.label === "UNLOCODE")?.value).toBe("NGLOS");
  });

  /*
   * The safety property. An unresolved broadcast name is shown as what the
   * vessel said — not as a port — because "LAGOS" is also a port in
   * Portugal and a confident wrong link is worse than an admitted absence.
   */
  it("does not present an unresolved name as a port", () => {
    const rows = presentPortContext({
      ...FULL,
      voyage: {
        ...FULL.voyage!,
        destinationLink: {
          state: "NO_VERIFIED_PORT_LINK",
          unlocode: null,
          providerPortUuid: null,
          name: "LAGOS",
          note: "Port names are not unique.",
        },
      },
    });

    expect(rows.find((r) => r.label === "Broadcast destination")?.value).toBe("LAGOS");
    const port = rows.find((r) => r.label === "Destination port")!;
    expect(port.value).toBeUndefined();
    expect(port.availability).toBe("UNAVAILABLE");
  });
});

describe("provenance", () => {
  it("names the endpoint, not just the provider", () => {
    const rows = presentEnrichmentSource(FULL);

    expect(rows.find((r) => r.label === "Particulars")?.value).toBe("Datalastic /vessel_info");
    expect(rows.find((r) => r.label === "Voyage")?.value).toBe("Datalastic /vessel_pro");
  });

  it("shows observation and retrieval times separately", () => {
    const voyage = presentEnrichmentSource(FULL).find((r) => r.label === "Voyage")!;

    expect(voyage.provenance).toMatch(/Observed 2026-08-29 14:41 UTC/);
    expect(voyage.provenance).toMatch(/retrieved 2026-08-29 14:42 UTC/);
  });

  /*
   * When the provider gave no observation time, the retrieval time must
   * not silently stand in for it — that would age a fact from the moment
   * Seaphore asked rather than the moment it was true.
   */
  it("says so when the provider gave no observation time", () => {
    const particulars = presentEnrichmentSource(FULL).find((r) => r.label === "Particulars")!;

    expect(particulars.provenance).toMatch(/no observation time/i);
    expect(particulars.provenance).not.toMatch(/Observed/);
  });
});

describe("capabilities Datalastic does not serve", () => {
  /*
   * NOT_CONNECTED, never UNAVAILABLE. The provider did not look and find
   * nothing — there is no endpoint to look in, and only one of those
   * sentences says something about the vessel.
   */
  it("blames the missing endpoint, not the vessel", () => {
    const rows = presentUnservedCapabilities();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.availability).toBe("NOT_CONNECTED");
      expect(row.reason).toMatch(/no endpoint/i);
      expect(row.value).toBeUndefined();
    }
  });

  it("names ownership explicitly, so an officer looking for it finds a reason", () => {
    const labels = presentUnservedCapabilities().map((r) => r.label);

    expect(labels).toContain("Registered owner");
    expect(labels).toContain("Operator");
    expect(labels).toContain("Classification society");
  });
});

/*
 * A resolved port is not necessarily one Seaphore holds.
 *
 * The gazetteer is Nigerian. A vessel bound for Kamsar has a valid
 * UNLOCODE and no local record, and the panel must say that is Seaphore's
 * limit rather than implying the declaration is unresolved.
 */
describe("port record availability", () => {
  it("says the port is held when it is in the register", () => {
    const row = presentPortContext(FULL).find((r) => r.label === "Port record")!;

    expect(row.availability).toBe("AVAILABLE");
    expect(row.provenance).toMatch(/register/i);
  });

  it("says a foreign port is outside the register, not unresolved", () => {
    const abroad = presentPortContext({
      ...FULL,
      voyage: {
        ...FULL.voyage!,
        destinationLink: {
          state: "VERIFIED",
          unlocode: "GNKMR",
          providerPortUuid: "05c6be2e",
          name: "KAMSAR",
          note: null,
        },
      },
    });

    // The UNLOCODE is still shown as resolved — it is.
    expect(abroad.find((r) => r.label === "UNLOCODE")?.value).toBe("GNKMR");

    const record = abroad.find((r) => r.label === "Port record")!;
    expect(record.availability).toBe("NOT_CONNECTED");
    expect(record.reason).toMatch(/outside this deployment/i);
    // The vessel is not blamed for Seaphore's coverage.
    expect(record.reason).toMatch(/not in question/i);
  });
});
