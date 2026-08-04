import { describe, expect, it } from "vitest";
import {
  AXIS_SOURCE_MAP,
  CARGO_AXES,
  CARGO_AXIS_WEIGHTS,
  NATIONAL_MARITIME_DATA_SOURCES,
  assessCargoConfidence,
  gradeForScore,
  providerPriorityMatrix,
  sourceById,
  trustClassificationMatrix,
} from "@/services/cargo-governance";

describe("GOV-02 · National Maritime Data Source Registry", () => {
  it("seeds all 13 mandated sources with unique ids", () => {
    expect(NATIONAL_MARITIME_DATA_SOURCES).toHaveLength(13);
    const ids = NATIONAL_MARITIME_DATA_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(13);
  });

  it("classifies every source and states a recommended usage", () => {
    for (const s of NATIONAL_MARITIME_DATA_SOURCES) {
      expect(["GOVERNMENT", "COMMERCIAL", "SUPPORTING", "DERIVED"]).toContain(s.sourceClass);
      expect(s.authority.length).toBeGreaterThan(3);
      expect(s.jurisdiction.length).toBeGreaterThan(0);
      expect(s.evidenceTypes.length).toBeGreaterThan(0);
      expect(s.capabilities.length).toBeGreaterThan(0);
      expect(s.recommendedUsage.length).toBeGreaterThan(20);
    }
  });

  it("maps every confidence axis to registered sources", () => {
    for (const axis of CARGO_AXES) {
      const sources = AXIS_SOURCE_MAP[axis];
      expect(sources.length).toBeGreaterThan(0);
      for (const id of sources) expect(sourceById(id)).toBeDefined();
    }
  });

  it("derives both governance matrices from the registry", () => {
    const trust = trustClassificationMatrix();
    expect(trust.find((r) => r.trustLevel === "AUTHORITY_OF_RECORD")?.sources.length).toBeGreaterThan(
      0,
    );
    const priority = providerPriorityMatrix();
    expect(priority.map((r) => r.priority)).toEqual(["P0", "P1", "P2", "P3"]);
    expect(priority[0].sources.length).toBeGreaterThan(0);
  });
});

describe("GOV-02 · Cargo Confidence Model", () => {
  it("weights sum to 1", () => {
    const total = Object.values(CARGO_AXIS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.round(total * 100) / 100).toBe(1);
  });

  it("returns 0/E and lists all eight axes as missing when no evidence exists", () => {
    const a = assessCargoConfidence([]);
    expect(a.score).toBe(0);
    expect(a.grade).toBe("E");
    expect(a.missingEvidence).toHaveLength(8);
    expect(a.explanation).toContain("officer decides");
  });

  it("scores a fully corroborated cargo package in grade A", () => {
    const a = assessCargoConfidence(
      CARGO_AXES.map((axis) => ({ axis, present: true, quality: 1, corroboration: 3 })),
    );
    expect(a.score).toBe(100);
    expect(a.grade).toBe("A");
    expect(a.missingEvidence).toHaveLength(0);
    expect(a.conflictingEvidence).toHaveLength(0);
  });

  it("halves a conflicting axis and surfaces the conflict", () => {
    const clean = assessCargoConfidence([
      { axis: "government_declaration", present: true, quality: 1, corroboration: 3 },
    ]);
    const conflicted = assessCargoConfidence([
      {
        axis: "government_declaration",
        present: true,
        quality: 1,
        corroboration: 3,
        conflicting: true,
      },
    ]);
    expect(conflicted.score).toBeCloseTo(clean.score / 2, 1);
    expect(conflicted.conflictingEvidence).toEqual([
      { axis: "government_declaration", label: "Government declaration" },
    ]);
  });

  it("grades monotonically across the A–E ladder", () => {
    expect(gradeForScore(90)).toBe("A");
    expect(gradeForScore(72)).toBe("B");
    expect(gradeForScore(60)).toBe("C");
    expect(gradeForScore(40)).toBe("D");
    expect(gradeForScore(10)).toBe("E");
  });
});
