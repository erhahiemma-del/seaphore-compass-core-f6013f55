/**
 * Checking a manifest against Datalastic.
 *
 * The property these hold is that uncertainty survives. A binary
 * match/mismatch would force every ambiguous case into a confident answer,
 * and most of the interesting cases are ambiguous: a tonnage off by one is
 * not a tonnage off by nine hundred, a port Seaphore cannot resolve is not
 * a wrong port, and a manifest contradicting itself is not the provider
 * disagreeing with it.
 *
 * Getting that wrong in either direction is expensive. Raising a false
 * discrepancy against honest paperwork wastes an officer's time and the
 * declarant's; hiding a real one is worse.
 */
import { describe, expect, it } from "vitest";

import {
  corroborateAgainstDatalastic,
  TOLERANCES,
  type SubmittedVessel,
} from "@/services/manifest/datalastic-corroboration";
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";

/** The live RIVER THAMES enrichment, 29 Aug 2026. */
const SOURCE: VesselEnrichment = {
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
      providerPortUuid: "2cb375dd",
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

/** A manifest that agrees with the provider on everything. */
const HONEST: SubmittedVessel = {
  name: "RIVER THAMES",
  callSign: "PDSY",
  flag: "Netherlands",
  length: 79.95,
  breadth: 15,
  grossTonnage: 2494,
  deadweight: 2775,
  departureUnlocode: "GNKMR",
  destinationUnlocode: "NGLOS",
  departureTime: "2026-07-27T13:18:00.000Z",
  eta: "2026-08-24T09:13:00.000Z",
};

function run(submitted: SubmittedVessel, source = SOURCE, vesselName = "RIVER THAMES") {
  const rows = corroborateAgainstDatalastic(submitted, source, vesselName);
  return (field: string) => rows.find((r) => r.field === field)!;
}

describe("an honest manifest", () => {
  it("matches on every checkable field", () => {
    const by = run(HONEST);

    for (const field of [
      "Vessel name",
      "Call sign",
      "Length",
      "Breadth",
      "Gross tonnage",
      "Deadweight",
      "Departure UNLOCODE",
      "Destination UNLOCODE",
      "Departure time",
      "ETA",
    ]) {
      expect(by(field).status, `${field} should match`).toBe("MATCH");
    }
  });

  it("carries the endpoint and timestamp behind each value", () => {
    const by = run(HONEST);

    expect(by("Call sign").sourceRef).toBe("Datalastic /vessel_info");
    expect(by("ETA").sourceRef).toBe("Datalastic /vessel_pro");
    expect(by("ETA").timestamp).toBe("2026-08-29T14:41:00.000Z");
  });
});

describe("tolerances are applied and named", () => {
  it("treats a rounded tonnage as close, not wrong", () => {
    const row = run({ ...HONEST, grossTonnage: 2500 })("Gross tonnage");

    expect(row.status).toBe("CLOSE_MATCH");
    expect(row.confidence).toBe("MEDIUM");
    // An officer disputing this is entitled to know how close "close" was.
    expect(row.reason).toMatch(/1%/);
  });

  it("calls a large tonnage difference a mismatch", () => {
    const row = run({ ...HONEST, grossTonnage: 3400 })("Gross tonnage");

    expect(row.status).toBe("MISMATCH");
    expect(row.confidence).toBe("HIGH");
  });

  it("allows measurement slack on dimensions", () => {
    expect(run({ ...HONEST, length: 80.2 })("Length").status).toBe("CLOSE_MATCH");
    expect(run({ ...HONEST, length: 92 })("Length").status).toBe("MISMATCH");
  });

  it("allows the declared slack on times, and not more", () => {
    // Half an hour out — within the declared hour.
    expect(run({ ...HONEST, eta: "2026-08-24T09:43:00.000Z" })("ETA").status).toBe("CLOSE_MATCH");
    // Two days out is not a rounding difference.
    expect(run({ ...HONEST, eta: "2026-08-26T09:13:00.000Z" })("ETA").status).toBe("MISMATCH");
  });

  it("publishes the tolerances it used", () => {
    expect(TOLERANCES.tonnageRatio).toBeGreaterThan(0);
    expect(TOLERANCES.timeMinutes).toBeGreaterThan(0);
  });
});

describe("names", () => {
  it("accepts a vessel prefix and punctuation as formatting", () => {
    const row = run({ ...HONEST, name: "M/V River-Thames" })("Vessel name");

    expect(row.status).toBe("CLOSE_MATCH");
    expect(row.reason).toMatch(/normalised/i);
  });

  it("calls a genuinely different name a mismatch", () => {
    expect(run({ ...HONEST, name: "ATLANTIC STAR" })("Vessel name").status).toBe("MISMATCH");
  });
});

describe("uncertainty is preserved rather than forced", () => {
  /*
   * The provider holding nothing is not evidence against the manifest.
   * Recording it as a mismatch would manufacture a discrepancy out of
   * Seaphore's own coverage gap.
   */
  it("reports a missing source value as no-source-data, never a mismatch", () => {
    const blank: VesselEnrichment = {
      ...SOURCE,
      particulars: { ...SOURCE.particulars!, callSign: null },
    };
    const row = run(HONEST, blank)("Call sign");

    expect(row.status).toBe("NO_SOURCE_DATA");
    expect(row.confidence).toBe("LOW");
  });

  it("reports an undeclared field as unverifiable, never a mismatch", () => {
    const row = run({ ...HONEST, callSign: null })("Call sign");

    expect(row.status).toBe("NOT_VERIFIABLE");
  });

  /*
   * Port names are not unique. Agreeing on "LAGOS" does not establish the
   * same port, and disagreeing does not establish a different one — so a
   * name alone can never settle a port.
   */
  it("never settles a port on its name alone", () => {
    const row = run({ ...HONEST, destinationPort: "LAGOS" })("Destination port");

    expect(row.status).toBe("NOT_VERIFIABLE");
    expect(row.reason).toMatch(/not unique/i);
  });

  /*
   * A manifest whose own name and code disagree is the declarant's problem
   * to resolve, not a disagreement with Datalastic — and it needs a
   * different conversation, so it gets a different status.
   */
  it("flags a manifest that contradicts itself as a conflict", () => {
    const row = run({
      ...HONEST,
      destinationPort: "TEMA",
      destinationUnlocode: "NGLOS",
    })("Destination port");

    expect(row.status).toBe("CONFLICT");
    expect(row.reason).toMatch(/internally inconsistent/i);
  });
});

describe("identifiers admit no tolerance", () => {
  it("treats a differing UNLOCODE as a hard mismatch", () => {
    const row = run({ ...HONEST, destinationUnlocode: "NGTIN" })("Destination UNLOCODE");

    expect(row.status).toBe("MISMATCH");
    expect(row.confidence).toBe("HIGH");
    expect(row.reason).toMatch(/not a formatting difference/i);
  });

  it("ignores only case and padding on a call sign", () => {
    expect(run({ ...HONEST, callSign: " pdsy " })("Call sign").status).toBe("MATCH");
    expect(run({ ...HONEST, callSign: "PDSX" })("Call sign").status).toBe("MISMATCH");
  });
});

describe("the table never quietly shrinks", () => {
  /*
   * Omitting an unverifiable field would narrow what the officer believes
   * was checked. Every field is reported, including the ones that could
   * not be settled.
   */
  it("reports every field even when nothing is comparable", () => {
    const empty: VesselEnrichment = {
      particulars: null,
      particularsProvenance: null,
      voyage: null,
      voyageProvenance: null,
    };

    const rows = corroborateAgainstDatalastic(HONEST, empty, null);

    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows.every((r) => r.status !== "MATCH")).toBe(true);
  });

  /*
   * With no provenance there is no timestamp, and the current time must
   * not stand in for one. A row stamped "now" would date the evidence to
   * the moment the officer opened the screen rather than to the moment the
   * provider observed anything — and a comparison is only as good as the
   * age of what it compared against.
   */
  it("stamps no time when the provider supplied no provenance", () => {
    const empty: VesselEnrichment = {
      particulars: null,
      particularsProvenance: null,
      voyage: null,
      voyageProvenance: null,
    };

    const rows = corroborateAgainstDatalastic(HONEST, empty, null);

    for (const row of rows) {
      expect(row.timestamp, `${row.field} must carry no invented timestamp`).toBeNull();
      expect(row.sourceRef, `${row.field} must name no source`).toBeNull();
    }
  });

  it("produces no verdict of its own", () => {
    const rows = corroborateAgainstDatalastic(HONEST, SOURCE, "RIVER THAMES");

    // Approval is an officer's decision. Nothing here may pre-empt it.
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("approved");
      expect(Object.keys(row)).not.toContain("verdict");
    }
  });
});

describe("a divergent AIS name is surfaced, not folded away", () => {
  it("adds its own row without deciding anything", () => {
    const diverged: VesselEnrichment = {
      ...SOURCE,
      particulars: { ...SOURCE.particulars!, aisNameDiffers: "RIVER THAMES II" },
    };
    const by = run(HONEST, diverged)("AIS name");

    expect(by.source).toBe("RIVER THAMES II");
    expect(by.status).toBe("NOT_VERIFIABLE");
  });
});
