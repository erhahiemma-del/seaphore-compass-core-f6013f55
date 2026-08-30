/**
 * An MMSI standing in as a key is not an IMO.
 *
 * `identity.imo` falls back to the MMSI when the provider reports no IMO,
 * so every vessel has a stable key. That is right, and printing the key as
 * "IMO" is not: an IMO is a permanent registry-issued number, an MMSI is a
 * radio identity that changes with the flag. Labelling one as the other
 * states something about the ship that is false — and it is not rare.
 * Measured off Lagos: 21 of 147 vessels report no IMO, roughly one in
 * seven, including a tanker.
 */
import { describe, expect, it } from "vitest";

import { hasReportedImo } from "@/services/geospatial/vessel";
import { presentVessel } from "@/features/maritime/vessel-presentation";
import type { Vessel, VesselIdentity } from "@/services/geospatial";

/** DANIEL — a live tanker off Lagos with an MMSI and no IMO. */
const NO_IMO: VesselIdentity = {
  imo: "511100241",
  mmsi: "511100241",
  name: "DANIEL",
  flag: "PW",
};

const WITH_IMO: VesselIdentity = {
  imo: "9865714",
  mmsi: "245026000",
  name: "RIVER THAMES",
  flag: "NL",
};

function vessel(identity: VesselIdentity): Vessel {
  return {
    identity,
    position: {
      lon: 3.39,
      lat: 6.37,
      heading: 167,
      headingReported: true,
      speed: 0.1,
      timestamp: "2026-08-30T08:00:00.000Z",
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

describe("telling a real IMO from a stand-in key", () => {
  it("recognises a reported IMO", () => {
    expect(hasReportedImo(WITH_IMO)).toBe(true);
  });

  /*
   * The fallback makes the two identical, and a vessel carrying both
   * never has them match — an IMO is seven digits, an MMSI is nine.
   */
  it("recognises an MMSI standing in for a missing IMO", () => {
    expect(hasReportedImo(NO_IMO)).toBe(false);
  });

  it("treats a key with no MMSI to compare against as a real IMO", () => {
    expect(hasReportedImo({ imo: "9865714", name: "X" })).toBe(true);
  });
});

describe("the drawer never claims a registry number the vessel lacks", () => {
  it("shows the IMO when one was reported", () => {
    const row = presentVessel(vessel(WITH_IMO)).identity.find((d) => d.label === "IMO")!;

    expect(row.value).toBe("9865714");
    expect(row.availability).toBe("AVAILABLE");
  });

  /*
   * The defect this was written for: the drawer read
   * "Vessel · IMO 511100241 · MMSI 511100241" for a vessel whose IMO was
   * never reported, presenting a radio identity as a registry number.
   */
  it("says the IMO was not reported rather than printing the MMSI as one", () => {
    const row = presentVessel(vessel(NO_IMO)).identity.find((d) => d.label === "IMO")!;

    expect(row.value).toBeUndefined();
    expect(row.availability).toBe("UNAVAILABLE");
    expect(row.reason).toMatch(/identified by its MMSI/i);
  });

  it("still shows the MMSI, which is the identity it does have", () => {
    const row = presentVessel(vessel(NO_IMO)).identity.find((d) => d.label === "MMSI")!;

    expect(row.value).toBe("511100241");
  });

  /*
   * The key itself is untouched. Selection, enrichment and the port join
   * all resolve on it, so weakening it to fix a label would break the
   * navigation that works.
   */
  it("leaves the canonical key intact", () => {
    expect(vessel(NO_IMO).identity.imo).toBe("511100241");
  });
});
