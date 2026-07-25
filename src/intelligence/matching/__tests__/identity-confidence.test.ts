/**
 * Sprint 1C.1 — Identity Resolution Engine regression tests.
 *
 * Covers: exact IMO/MMSI, exact vessel name, ambiguous names,
 * NO_MATCH handling, fuzzy searches, alias resolution.
 */
import { describe, it, expect } from "vitest";
import {
  scoreIdentityCandidate,
  selectIdentity,
  nameSimilarity,
  type IdentityCandidate,
} from "@/intelligence/matching/identity-confidence";

const DONGWON: IdentityCandidate = {
  id: "gfw:dongwon-16",
  name: "DONGWON NO.16",
  imo: "9438291",
  mmsi: "440825000",
  callSign: "DSQV3",
  flag: "KOR",
  vesselType: "fishing",
  aliases: ["DONGWON 16", "DW 16"],
  historicalNames: ["JIN HAENG"],
  providerMatchFields: "SEVERAL_FIELDS",
};

const DECOY_SIMILAR_NAME: IdentityCandidate = {
  id: "gfw:dongwon-17",
  name: "DONGWON NO.17",
  imo: "9438292",
  mmsi: "440825001",
  callSign: "DSQV4",
  flag: "KOR",
  vesselType: "fishing",
  providerMatchFields: "SHIPNAME",
};

const NO_MATCH_HIT: IdentityCandidate = {
  id: "gfw:no-match-1",
  name: "DONGWON NO.16",
  imo: "9999999",
  mmsi: "999999999",
  callSign: null,
  flag: "PAN",
  vesselType: "cargo",
  providerMatchFields: "NO_MATCH",
};

describe("Identity Resolution Engine (Sprint 1C.1)", () => {
  it("exact IMO search auto-selects with VERIFIED confidence", () => {
    const sel = selectIdentity([DECOY_SIMILAR_NAME, DONGWON], {
      query: "9438291",
    });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    expect(sel.confidence?.score).toBeGreaterThanOrEqual(90);
    expect(sel.confidence?.tier).toBe("VERIFIED");
    expect(sel.requiresConfirmation).toBe(false);
    expect(
      sel.confidence?.signals.find((s) => s.kind === "imo")?.contribution,
    ).toBeGreaterThan(0);
  });

  it("exact MMSI search auto-selects the correct vessel", () => {
    const sel = selectIdentity([DECOY_SIMILAR_NAME, DONGWON], {
      query: "440825000",
    });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    expect(sel.confidence?.tier).toBe("VERIFIED");
    expect(
      sel.confidence?.signals.find((s) => s.kind === "mmsi")?.contribution,
    ).toBeGreaterThan(0);
  });

  it("exact vessel name search selects the matching candidate", () => {
    const sel = selectIdentity([DECOY_SIMILAR_NAME, DONGWON], {
      query: "DONGWON NO.16",
    });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    expect(sel.confidence?.score).toBeGreaterThan(sel.alternates[1].confidence.score);
  });

  it("ambiguous vessel names flag officer confirmation", () => {
    const twinA: IdentityCandidate = {
      id: "twin-a",
      name: "PACIFIC STAR",
      imo: null,
      mmsi: null,
      providerMatchFields: "SHIPNAME",
    };
    const twinB: IdentityCandidate = {
      id: "twin-b",
      name: "PACIFIC STAR",
      imo: null,
      mmsi: null,
      providerMatchFields: "SHIPNAME",
    };
    const sel = selectIdentity([twinA, twinB], { query: "Pacific Star" });
    expect(sel.requiresConfirmation).toBe(true);
    expect(sel.ambiguityReason).toBe("tied-candidates");
    expect(sel.selectionReason).toMatch(/officer confirmation required/i);
  });

  it("de-prioritises NO_MATCH candidates when better candidates exist", () => {
    const sel = selectIdentity([NO_MATCH_HIT, DONGWON], {
      query: "DONGWON NO.16",
    });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    expect(sel.rejected).toHaveLength(1);
    expect(sel.rejected[0].candidate.id).toBe("gfw:no-match-1");
    expect(sel.rejected[0].rejectionReason).toMatch(/NO_MATCH/i);
    // Alternates should not include the rejected candidate
    expect(sel.alternates.every((a) => a.candidate.id !== "gfw:no-match-1")).toBe(true);
  });

  it("surfaces the best NO_MATCH candidate when NOTHING else is available", () => {
    const sel = selectIdentity([NO_MATCH_HIT], { query: "DONGWON NO.16" });
    expect(sel.selected?.id).toBe("gfw:no-match-1");
    expect(sel.requiresConfirmation).toBe(true);
    // NO_MATCH damper keeps the score well below the auto-select bar
    expect(sel.confidence!.score).toBeLessThan(70);
    expect(sel.selectionReason).toMatch(/only no_match/i);
  });

  it("fuzzy name search still ranks the correct candidate first", () => {
    const sel = selectIdentity([DECOY_SIMILAR_NAME, DONGWON], {
      query: "Dongwon 16", // whitespace + punctuation variance
    });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    expect(nameSimilarity("Dongwon 16", "DONGWON NO.16")).toBeGreaterThan(0.7);
  });

  it("resolves candidates via alias / historical name signal", () => {
    const sel = selectIdentity([DECOY_SIMILAR_NAME, DONGWON], {
      query: "JIN HAENG", // prior name
    });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    const historical = sel.confidence?.signals.find((s) => s.kind === "historical");
    expect(historical?.contribution ?? 0).toBeGreaterThan(0);
  });

  it("treats matchFields as a primary positive signal (SEVERAL_FIELDS)", () => {
    const res = scoreIdentityCandidate(DONGWON, { query: "9438291" });
    const mf = res.signals.find((s) => s.kind === "matchFields");
    expect(mf).toBeDefined();
    expect(mf!.contribution).toBeGreaterThan(0);
    expect(mf!.weight).toBeGreaterThan(0);
  });

  it("selection carries matching criteria and reason for the brief", () => {
    const sel = selectIdentity([NO_MATCH_HIT, DONGWON], { query: "9438291" });
    expect(sel.selected?.id).toBe("gfw:dongwon-16");
    expect(sel.selectionReason).toMatch(/IMO/);
    expect(sel.rejected).toHaveLength(1);
  });
});
