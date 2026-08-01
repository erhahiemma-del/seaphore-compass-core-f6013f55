import { describe, expect, it } from "vitest";
import {
  nameSimilarity,
  scoreIdentityCandidate,
  selectIdentity,
} from "@/intelligence/matching/identity-confidence";

describe("identity-confidence", () => {
  it("scores an exact IMO hit as VERIFIED", () => {
    const r = scoreIdentityCandidate(
      { id: "v1", name: "OCEAN PEARL", imo: "9876543", mmsi: "503138740", flag: "AUS" },
      { query: "9876543" },
    );
    expect(r.tier).toBe("VERIFIED");
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("penalises NO_MATCH candidates via provider modifier", () => {
    const good = scoreIdentityCandidate(
      { id: "a", name: "PEARL", providerMatchFields: "SEVERAL_FIELDS" },
      { query: "MV Ocean Pearl" },
    );
    const bad = scoreIdentityCandidate(
      {
        id: "b",
        name: "HG FII IBI 1SO 3",
        providerMatchFields: "NO_MATCH",
        imo: "1234567",
        mmsi: "574182861",
        flag: "VNM",
      },
      { query: "MV Ocean Pearl" },
    );
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("requires officer confirmation when top score is below threshold", () => {
    const sel = selectIdentity([{ id: "x", name: "SOME OTHER SHIP" }], { query: "MV Nightingale" });
    expect(sel.requiresConfirmation).toBe(true);
    expect(sel.ambiguityReason).toBe("below-threshold");
  });

  it("requires confirmation when candidates are tied", () => {
    const sel = selectIdentity(
      [
        { id: "a", name: "OCEAN PEARL", mmsi: "111111111" },
        { id: "b", name: "OCEAN PEARL", mmsi: "222222222" },
      ],
      { query: "OCEAN PEARL" },
    );
    expect(sel.requiresConfirmation).toBe(true);
    expect(sel.ambiguityReason).toBe("tied-candidates");
  });

  it("auto-selects a clear winner", () => {
    const sel = selectIdentity(
      [
        {
          id: "a",
          name: "OCEAN PEARL",
          mmsi: "503138740",
          flag: "AUS",
          providerMatchFields: "SEVERAL_FIELDS",
        },
        { id: "b", name: "COASTAL DRIFTER", providerMatchFields: "NO_MATCH" },
      ],
      { query: "OCEAN PEARL" },
    );
    expect(sel.requiresConfirmation).toBe(false);
    expect(sel.selected?.id).toBe("a");
  });

  it("name similarity ignores MV/M/V prefixes", () => {
    expect(nameSimilarity("MV Ocean Pearl", "Ocean Pearl")).toBeGreaterThan(0.9);
  });
});
