/**
 * Matching NPA schedule rows to tracked vessels.
 *
 * The pairs here are real: DESERT LION, GREEN OSHIMA and LADY DOYIN all
 * appear in both the supplied NPA workbook and the live Nigerian coverage,
 * matched by identifier with names agreeing exactly. Measured 30 Aug 2026 —
 * 237 NPA identifiers, 470 tracked vessels, 52 in common.
 *
 * The rule these hold is that the identifier decides and the name never
 * does. Names collide and are rewritten; two ships called OCEAN FLOWING are
 * two ships, and merging them would attribute one vessel's cargo
 * declaration to another's hull.
 */
import { describe, expect, it } from "vitest";

import {
  normaliseVesselName,
  resolveNpaVessel,
  summariseResolutions,
} from "@/services/government/npa/vessel-resolution";
import type { Vessel } from "@/services/geospatial";

function tracked(imo: string, name: string): Vessel {
  return {
    identity: { imo, name, mmsi: "000000000" },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 90,
      headingReported: true,
      speed: 0,
      timestamp: "2026-08-30T08:00:00.000Z",
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

/** Three real pairs from the live picture. */
const FLEET = [
  tracked("9314208", "LADY DOYIN"),
  tracked("1027354", "GREEN OSHIMA"),
  tracked("8202628", "CHIEF JOSHUA"),
];

describe("resolving by identifier", () => {
  it("matches an NPA row to the tracked vessel", () => {
    const r = resolveNpaVessel({ imo: "9314208", npaName: "LADY DOYIN" }, FLEET);

    expect(r.state).toBe("RESOLVED");
    expect(r.vessel).not.toBeNull();
    expect(r.vessel!.identity.imo).toBe("9314208");
  });

  /*
   * The ordinary outcome for most of the workbook, and not a defect: NPA
   * records port calls that happened, the map shows what is in Nigerian
   * waters now. Roughly four NPA vessels in five are not currently
   * visible.
   */
  it("reports a vessel outside coverage as outside coverage, not missing", () => {
    const r = resolveNpaVessel({ imo: "9999999", npaName: "SOME SHIP" }, FLEET);

    expect(r.state).toBe("NOT_IN_COVERAGE");
    expect(r.vessel).toBeNull();
    expect(r.note).toMatch(/expected for most historical rows/i);
  });

  /*
   * Without an identifier there is no safe match. Falling back to the name
   * would attribute a port call to whichever ship happened to share it.
   */
  it("refuses to match a row with no identifier", () => {
    const r = resolveNpaVessel({ imo: null, npaName: "LADY DOYIN" }, FLEET);

    expect(r.state).toBe("NO_IDENTIFIER");
    expect(r.vessel).toBeNull();
    expect(r.note).toMatch(/different ship/i);
  });
});

describe("names check a match, they never make one", () => {
  it("ignores punctuation, spacing and vessel prefixes", () => {
    const r = resolveNpaVessel({ imo: "9314208", npaName: "M/V Lady-Doyin" }, FLEET);

    expect(r.state).toBe("RESOLVED");
  });

  /*
   * A matched identifier with a different name is neither accepted
   * silently nor thrown away. It may be a rename, a transcription slip or
   * a reused number, and those want different responses — so the state
   * says what was seen and leaves the judgement to an officer.
   */
  it("flags an identifier match whose names disagree", () => {
    const r = resolveNpaVessel({ imo: "9314208", npaName: "ATLANTIC STAR" }, FLEET);

    expect(r.state).toBe("IDENTIFIER_MATCH_NAME_CONFLICT");
    // The vessel is still carried, so the conflict can be inspected.
    expect(r.vessel).not.toBeNull();
    expect(r.trackedName).toBe("LADY DOYIN");
    expect(r.note).toMatch(/renamed/i);
  });

  it("never matches on the name alone", () => {
    // Right name, wrong identifier: this must not resolve.
    const r = resolveNpaVessel({ imo: "1111111", npaName: "LADY DOYIN" }, FLEET);

    expect(r.state).toBe("NOT_IN_COVERAGE");
    expect(r.vessel).toBeNull();
  });

  it("normalises only formatting", () => {
    expect(normaliseVesselName("M/V Lady-Doyin")).toBe(normaliseVesselName("LADY DOYIN"));
    expect(normaliseVesselName("OCEAN FLOWING")).not.toBe(normaliseVesselName("OCEAN FLOWER"));
  });
});

describe("summarising a batch", () => {
  it("counts each outcome separately", () => {
    const rows = [
      { imo: "9314208", npaName: "LADY DOYIN" },
      { imo: "1027354", npaName: "GREEN OSHIMA" },
      { imo: "9999999", npaName: "ELSEWHERE" },
      { imo: null, npaName: "NO NUMBER" },
      { imo: "8202628", npaName: "WRONG NAME" },
    ];
    const summary = summariseResolutions(rows.map((r) => resolveNpaVessel(r, FLEET)));

    expect(summary).toEqual({
      total: 5,
      resolved: 2,
      nameConflicts: 1,
      notInCoverage: 1,
      noIdentifier: 1,
    });
  });

  /*
   * A low match rate is information about coverage, not a fault. Framing
   * it as one pushes whoever reads it toward loosening the matching rules
   * to make the number look better, which is exactly how a name match
   * gets reintroduced.
   */
  it("keeps unmatched rows visible rather than dropping them", () => {
    const summary = summariseResolutions([
      resolveNpaVessel({ imo: "9999999", npaName: "A" }, FLEET),
      resolveNpaVessel({ imo: null, npaName: "B" }, FLEET),
    ]);

    expect(summary.total).toBe(2);
    expect(summary.resolved).toBe(0);
    expect(summary.notInCoverage + summary.noIdentifier).toBe(2);
  });
});
