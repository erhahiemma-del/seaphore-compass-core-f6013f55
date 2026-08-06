import { describe, expect, it } from "vitest";

import {
  contributionFrom,
  fuseObservation,
  fuseObservations,
  type FusionContribution,
  type Vessel,
} from "@/services/geospatial";

const T0 = "2026-08-04T12:00:00.000Z";

function vessel(overrides: Partial<Vessel> = {}, source = "gfw"): Vessel {
  return {
    identity: { imo: "9411765", mmsi: "657123456", name: "MV Test", flag: "NGA" },
    position: { lon: 4.1, lat: 5.2, heading: 90, speed: 10, timestamp: T0 },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    confidence: 0.6,
    provenance: {
      source,
      provider: source.toUpperCase(),
      datasetId: `${source}:latest`,
      retrievedAt: T0,
      observedAt: T0,
    },
    ...overrides,
  };
}

function contribution(
  sourceId: string,
  confidence: number,
  overrides: Partial<Vessel> = {},
): FusionContribution {
  const v = vessel({ ...overrides, confidence }, sourceId);
  return contributionFrom(v)!;
}

describe("contributionFrom", () => {
  it("builds a contribution from provenance", () => {
    const c = contributionFrom(vessel());

    expect(c).toMatchObject({ sourceId: "gfw", provider: "GFW", confidence: 0.6 });
  });

  it("returns null without provenance — nothing to attribute", () => {
    expect(contributionFrom({ ...vessel(), provenance: undefined })).toBeNull();
  });
});

describe("fuseObservation — selection", () => {
  it("returns null for no contributions", () => {
    expect(fuseObservation([])).toBeNull();
  });

  it("selects the highest-confidence contribution, never a blend", () => {
    const fused = fuseObservation([
      contribution("a", 0.4, { identity: { imo: "1", name: "Low" } }),
      contribution("b", 0.9, { identity: { imo: "1", name: "High" } }),
    ])!;

    expect(fused.selectedSourceId).toBe("b");
    expect(fused.vessel.identity.name).toBe("High");
  });

  it("breaks a confidence tie by recency", () => {
    const older = contribution("a", 0.6);
    const newer: FusionContribution = {
      ...contribution("b", 0.6),
      observedAt: "2026-08-04T13:00:00.000Z",
    };

    expect(fuseObservation([older, newer])!.selectedSourceId).toBe("b");
  });
});

describe("fuseObservation — corroboration", () => {
  it("leaves a single source's confidence unchanged", () => {
    const fused = fuseObservation([contribution("a", 0.6)])!;

    expect(fused.sourceCount).toBe(1);
    expect(fused.confidence).toBe(0.6);
  });

  it("raises confidence with each corroborating source", () => {
    const fused = fuseObservation([
      contribution("a", 0.6),
      contribution("b", 0.6),
      contribution("c", 0.6),
    ])!;

    expect(fused.sourceCount).toBe(3);
    expect(fused.confidence).toBeCloseTo(0.7, 5);
  });

  it("anchors on the best source, so a weak one cannot drag it down", () => {
    const fused = fuseObservation([contribution("a", 0.9), contribution("b", 0.1)])!;

    // Averaging would give 0.5. Anchoring on the best gives 0.9 + bonus.
    expect(fused.confidence).toBeCloseTo(0.95, 5);
  });

  it("caps fused confidence below certainty", () => {
    const many = Array.from({ length: 20 }, (_, i) => contribution(`s${i}`, 0.9));

    expect(fuseObservation(many)!.confidence).toBeLessThanOrEqual(0.98);
  });

  it("does not corroborate on repeated reports from one source", () => {
    const fused = fuseObservation([contribution("a", 0.6), contribution("a", 0.6)])!;

    expect(fused.sourceCount).toBe(1);
    expect(fused.confidence).toBe(0.6);
  });

  it("honours configurable bonus and cap", () => {
    const fused = fuseObservation([contribution("a", 0.5), contribution("b", 0.5)], {
      corroborationBonus: 0.2,
      confidenceCap: 0.65,
    })!;

    expect(fused.confidence).toBe(0.65);
  });

  it("bands the fused confidence", () => {
    const fused = fuseObservation([contribution("a", 0.9)])!;

    expect(fused.confidenceLevel).toBe("VERIFIED");
  });
});

describe("fuseObservation — evidence", () => {
  it("carries a citation per contribution", () => {
    const fused = fuseObservation([contribution("a", 0.6), contribution("b", 0.9)])!;

    expect(fused.citations).toHaveLength(2);
    expect(fused.citations.map((c) => c.sourceId).sort()).toEqual(["a", "b"]);
    for (const citation of fused.citations) {
      expect(citation.statement.length).toBeGreaterThan(0);
      expect(citation.confidenceLevel.length).toBeGreaterThan(0);
    }
  });

  it("carries provenance from every contribution", () => {
    const fused = fuseObservation([contribution("a", 0.6), contribution("b", 0.9)])!;

    expect(fused.provenance).toHaveLength(2);
    expect(fused.provenance.map((p) => p.source).sort()).toEqual(["a", "b"]);
  });

  it("lists distinct source ids", () => {
    const fused = fuseObservation([
      contribution("a", 0.6),
      contribution("a", 0.6),
      contribution("b", 0.6),
    ])!;

    expect(fused.sourceIds.sort()).toEqual(["a", "b"]);
  });
});

describe("fuseObservation — conflicts", () => {
  it("records disagreement rather than averaging it away", () => {
    const fused = fuseObservation([
      contribution("a", 0.6, { identity: { imo: "1", name: "MV Alpha", flag: "NGA" } }),
      contribution("b", 0.9, { identity: { imo: "1", name: "MV Beta", flag: "PAN" } }),
    ])!;

    const fields = fused.conflicts.map((c) => c.field);
    expect(fields).toContain("identity.name");
    expect(fields).toContain("identity.flag");
  });

  it("attributes each conflicting value to its sources", () => {
    const fused = fuseObservation([
      contribution("a", 0.6, { identity: { imo: "1", name: "Alpha" } }),
      contribution("b", 0.6, { identity: { imo: "1", name: "Beta" } }),
      contribution("c", 0.6, { identity: { imo: "1", name: "Beta" } }),
    ])!;

    const nameConflict = fused.conflicts.find((c) => c.field === "identity.name")!;
    const beta = nameConflict.values.find((v) => v.value === "Beta")!;
    expect(beta.sourceIds.sort()).toEqual(["b", "c"]);
  });

  it("reports no conflict when providers agree", () => {
    const fused = fuseObservation([contribution("a", 0.6), contribution("b", 0.9)])!;

    expect(fused.conflicts).toEqual([]);
  });

  it("ignores absent values rather than treating them as disagreement", () => {
    const fused = fuseObservation([
      contribution("a", 0.6, { identity: { imo: "1", name: "Same", flag: "NGA" } }),
      contribution("b", 0.6, { identity: { imo: "1", name: "Same" } }),
    ])!;

    expect(fused.conflicts).toEqual([]);
  });

  it("reports no conflict for a single contribution", () => {
    expect(fuseObservation([contribution("a", 0.6)])!.conflicts).toEqual([]);
  });
});

describe("fuseObservations — grouping", () => {
  it("groups by IMO, the same key the map uses", () => {
    const fused = fuseObservations([
      contribution("a", 0.6, { identity: { imo: "1", name: "One" } }),
      contribution("b", 0.7, { identity: { imo: "1", name: "One" } }),
      contribution("a", 0.6, { identity: { imo: "2", name: "Two" } }),
    ]);

    expect(fused).toHaveLength(2);
    const one = fused.find((f) => f.key === "1")!;
    expect(one.sourceCount).toBe(2);
  });

  it("skips contributions with no key", () => {
    const fused = fuseObservations([contribution("a", 0.6, { identity: { imo: "", name: "x" } })]);

    expect(fused).toEqual([]);
  });

  it("handles an empty input", () => {
    expect(fuseObservations([])).toEqual([]);
  });
});
