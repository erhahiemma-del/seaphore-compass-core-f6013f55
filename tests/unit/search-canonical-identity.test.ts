/**
 * One vessel, whatever you searched for.
 *
 * The failure this guards is search quietly becoming a second world: a
 * result that carries its own copy of a vessel, so the drawer opened from
 * search describes something subtly different from the drawer opened from
 * the map. Everything downstream — enrichment, the port join, corroboration
 * — keys off the canonical id, so a divergence there is not a display bug,
 * it is two records for one ship.
 *
 * So what is asserted is identity, not formatting: name, IMO and MMSI must
 * all land on the same canonical vessel.
 */
import { describe, expect, it } from "vitest";

import { readQuery, noResultExplanation } from "@/features/maritime/search-state";
import type { Vessel } from "@/services/geospatial";

/** The live RIVER THAMES, as the area feed reports it. */
function riverThames(): Vessel {
  return {
    identity: {
      imo: "9865714",
      mmsi: "245026000",
      name: "RIVER THAMES",
      flag: "NL",
      // Absent, exactly as `vessel_inradius` returns it.
    },
    position: {
      lon: 3.4124,
      lat: 6.3845,
      heading: 131,
      headingReported: true,
      speed: 6.1,
      timestamp: "2026-08-29T14:41:00.000Z",
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

const FLEET = [riverThames()];

function vesselHits(query: string) {
  const reading = readQuery(query, FLEET, "all");
  return (reading?.hits ?? []).filter((h) => h.kind === "vessel");
}

describe("every entry point resolves to one canonical vessel", () => {
  it("finds the same vessel by name, IMO and MMSI", () => {
    const ids = new Set<string>();

    for (const query of ["RIVER THAMES", "9865714", "245026000"]) {
      const hits = vesselHits(query);
      expect(hits.length, `${query} found nothing`).toBeGreaterThan(0);
      ids.add((hits[0] as { imo: string }).imo);
    }

    // One id across all three, or search has produced more than one vessel.
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe("9865714");
  });

  it("carries the canonical identity into the result, not a copy", () => {
    const hit = vesselHits("RIVER THAMES")[0] as { imo: string; mmsi?: string; name: string };

    expect(hit.imo).toBe(FLEET[0].identity.imo);
    expect(hit.mmsi).toBe(FLEET[0].identity.mmsi);
    expect(hit.name).toBe(FLEET[0].identity.name);
  });

  it("is case-insensitive on a name without inventing a match", () => {
    expect(vesselHits("river thames").length).toBeGreaterThan(0);
    expect(vesselHits("ATLANTIC STAR")).toHaveLength(0);
  });
});

describe("call sign", () => {
  /*
   * Matched when present. It usually is not: the area feed returns no call
   * sign at all — zero of 139 rows measured off Lagos — so this only ever
   * finds a vessel whose particulars have already been bought.
   */
  it("matches a vessel whose particulars have been loaded", () => {
    const enriched = [
      { ...riverThames(), identity: { ...riverThames().identity, callSign: "PDSY" } } as Vessel,
    ];
    const hits = (readQuery("PDSY", enriched, "all")?.hits ?? []).filter(
      (h) => h.kind === "vessel",
    );

    expect(hits).toHaveLength(1);
    expect((hits[0] as { imo: string }).imo).toBe("9865714");
  });

  it("finds nothing when the feed carries no call sign", () => {
    expect(vesselHits("PDSY")).toHaveLength(0);
  });
});

describe("finding nothing is not a finding about the vessel", () => {
  /*
   * The claim that must not be made. The fleet in memory is whatever the
   * coverage engine last collected, not a register — so an empty result
   * cannot establish that a ship does not exist.
   */
  it("never says no such vessel exists", () => {
    for (const query of ["PDSY", "ATLANTIC STAR", "9999999"]) {
      const sentence = noResultExplanation(query);
      /*
       * The sentence may well contain the words "no such vessel exists" —
       * what matters is that it negates them. Asserting their absence
       * would have failed the correct wording and passed a bare "No
       * results", which is the claim this exists to prevent.
       */
      expect(sentence).toMatch(/does not (mean|establish)/i);
      expect(sentence.length).toBeGreaterThan(40);
    }
  });

  /*
   * A call sign gets the sharper sentence, because failing to match one
   * says nothing at all — the field is absent from the feed rather than
   * merely unmatched.
   */
  it("explains that call signs are absent from the feed", () => {
    expect(noResultExplanation("PDSY")).toMatch(/not carried by the fleet feed/i);
  });

  it("explains a name or number as the picture being partial", () => {
    const sentence = noResultExplanation("ATLANTIC STAR");
    expect(sentence).toMatch(/coverage engine/i);
    expect(sentence).not.toMatch(/call sign/i);
  });

  it("does not mistake a pure number for a call sign", () => {
    expect(noResultExplanation("9865714")).not.toMatch(/call sign/i);
  });
});
