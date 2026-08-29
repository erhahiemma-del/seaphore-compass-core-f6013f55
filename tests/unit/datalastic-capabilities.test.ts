/**
 * The capability registry, and the rule that keeps it honest.
 *
 * The registry decides what each surface may render. Its one dangerous
 * failure mode is claiming a surface for a capability the provider does
 * not actually serve — that produces a drawer section which is
 * permanently empty, and an empty section reads to an officer as "this
 * vessel has no registered owner" rather than "Seaphore cannot ask".
 *
 * So the invariant asserted hardest here is not what any individual row
 * says. It is that eligibility is downstream of availability, for every
 * row, including ones added later.
 */
import { describe, expect, it } from "vitest";

import {
  capabilitiesForSurface,
  DATALASTIC_CAPABILITIES,
  datalasticCapability,
  verifiedCapabilities,
  type DatalasticCapability,
} from "@/connectors/datalastic/capabilities";

const SURFACE_FLAGS = [
  "mapEligible",
  "drawerEligible",
  "searchEligible",
  "portEligible",
  "voyageEligible",
  "intelligenceEligible",
  "copilotEligible",
  "manifestEligible",
] as const satisfies ReadonlyArray<keyof DatalasticCapability>;

describe("an unserved capability can never claim a surface", () => {
  /*
   * The whole point of the file. Asserted as a property over every row
   * rather than against the rows that exist today, because the failure
   * this prevents arrives with the next capability somebody adds after
   * reading the subscription rather than probing the API.
   */
  it("grants no surface to anything not VERIFIED", () => {
    const offenders = DATALASTIC_CAPABILITIES.filter(
      (c) => c.availability !== "VERIFIED" && SURFACE_FLAGS.some((flag) => c[flag]),
    ).map((c) => c.id);

    expect(offenders).toEqual([]);
  });

  it("costs nothing and caches nothing when unavailable", () => {
    for (const capability of DATALASTIC_CAPABILITIES) {
      if (capability.availability === "UNAVAILABLE") {
        expect(capability.cacheTtlMs).toBe(0);
        expect(capability.cost).toBe("FREE");
      }
    }
  });

  it("records when an availability claim was established", () => {
    for (const capability of DATALASTIC_CAPABILITIES) {
      // A claim with no probe date is an assumption wearing a fact's
      // clothes — the exact thing the subscription flag already did.
      if (capability.availability !== "UNPROBED") {
        expect(capability.probedOn).toBeTruthy();
      }
    }
  });

  it("explains every unavailable capability", () => {
    for (const capability of DATALASTIC_CAPABILITIES) {
      if (capability.availability === "UNAVAILABLE") {
        expect(capability.note.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("what the provider actually serves", () => {
  it("reports the eight endpoints that answered", () => {
    const verified = verifiedCapabilities()
      .map((c) => c.endpoint)
      .sort();

    expect(verified).toEqual([
      "port_find",
      "vessel",
      "vessel_find",
      "vessel_history",
      "vessel_info",
      "vessel_inradius",
      "vessel_pro",
      "weather",
    ]);
  });

  /*
   * These eleven are sold by the subscription and answer 404 on every
   * path and version tried. Locked in a test so that "the add-ons are
   * missing" stays a recorded finding rather than becoming folklore, and
   * so flipping one to VERIFIED requires a deliberate edit here.
   */
  it("keeps the sold-but-unserved add-ons on the record", () => {
    const unavailable = DATALASTIC_CAPABILITIES.filter((c) => c.availability === "UNAVAILABLE").map(
      (c) => c.id,
    );

    expect(unavailable).toContain("vessel-ownership");
    expect(unavailable).toContain("maritime-companies");
    expect(unavailable).toContain("classification");
    expect(unavailable).toContain("inspections");
    expect(unavailable).toContain("casualties");
    expect(unavailable).toContain("engine");
    expect(unavailable).toContain("dry-dock");
    expect(unavailable).toContain("sales-demolition");
    expect(unavailable).toContain("sea-routes");
    expect(unavailable).toContain("sat-e");
  });

  it("has no duplicate ids", () => {
    const ids = DATALASTIC_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cost class matches what the endpoint actually bills", () => {
  /*
   * Area traffic returned 148 vessels for one 50km cell, and Datalastic
   * bills per vessel. Mislabelling that as PER_REQUEST is how a map poll
   * turns into a four-figure charge, which has already happened once.
   */
  it("marks the per-vessel endpoints as PER_RECORD", () => {
    expect(datalasticCapability("area-traffic")?.cost).toBe("PER_RECORD");
    expect(datalasticCapability("vessel-finder")?.cost).toBe("PER_RECORD");
    expect(datalasticCapability("vessel-history")?.cost).toBe("PER_RECORD");
  });

  it("keeps the per-vessel scan out of every non-map surface's ambient load", () => {
    const areaTraffic = datalasticCapability("area-traffic");
    expect(areaTraffic?.loading).toBe("AMBIENT");
    expect(areaTraffic?.drawerEligible).toBe(false);
  });

  /*
   * The map may not buy per-vessel detail for every vessel on screen.
   * Nothing loaded AMBIENT may be a single-vessel lookup, or the map
   * pays one request per marker.
   */
  it("loads single-vessel detail on selection, never ambiently", () => {
    for (const id of ["vessel-identity", "vessel-voyage"]) {
      expect(datalasticCapability(id)?.loading).toBe("ON_SELECT");
    }
  });
});

describe("caching reflects how fast each thing actually changes", () => {
  it("caches static particulars far longer than position", () => {
    const identity = datalasticCapability("vessel-identity")!;
    const traffic = datalasticCapability("area-traffic")!;

    // Tonnage changes at a refit; position changes continuously.
    expect(identity.cacheTtlMs).toBeGreaterThan(traffic.cacheTtlMs * 100);
  });
});

describe("surface lookup", () => {
  it("returns only verified capabilities for a surface", () => {
    for (const capability of capabilitiesForSurface("drawer")) {
      expect(capability.availability).toBe("VERIFIED");
      expect(capability.drawerEligible).toBe(true);
    }
  });

  it("offers the drawer the deep vessel loads", () => {
    const ids = capabilitiesForSurface("drawer").map((c) => c.id);
    expect(ids).toContain("vessel-identity");
    expect(ids).toContain("vessel-voyage");
  });

  it("returns null for an unknown id rather than guessing", () => {
    expect(datalasticCapability("no-such-capability")).toBeNull();
  });
});
