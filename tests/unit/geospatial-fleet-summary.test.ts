import { describe, expect, it } from "vitest";

import { describeFleet, summarizeFleet, type Vessel } from "@/services/geospatial";

const NOW = Date.parse("2026-08-06T12:00:00.000Z");
const MIN = 60_000;

function vessel(over: Partial<Vessel> = {}, ageMin = 1): Vessel {
  return {
    identity: { imo: "1", mmsi: "m1", name: "MV A", flag: "NGA" },
    position: {
      lon: 4,
      lat: 5,
      heading: 90,
      speed: 10,
      timestamp: new Date(NOW - ageMin * MIN).toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    confidence: 0.6,
    provenance: {
      source: "global-fishing-watch",
      provider: "Global Fishing Watch",
      retrievedAt: new Date(NOW).toISOString(),
      observedAt: new Date(NOW - ageMin * MIN).toISOString(),
    },
    ...over,
  };
}

describe("summarizeFleet", () => {
  it("handles an empty fleet", () => {
    const s = summarizeFleet([], NOW);
    expect(s.vesselCount).toBe(0);
    expect(s.averageConfidence).toBeNull();
    expect(s.observedFrom).toBeNull();
    expect(describeFleet(s)).toMatch(/No vessels/);
  });

  it("counts vessels, sources and risk bands", () => {
    const s = summarizeFleet([vessel(), vessel({ riskLevel: "HIGH" })], NOW);
    expect(s.vesselCount).toBe(2);
    expect(s.sources).toEqual(["global-fishing-watch"]);
    expect(s.riskCounts.UNKNOWN).toBe(1);
    expect(s.riskCounts.HIGH).toBe(1);
  });

  it("bands freshness across the fleet", () => {
    const s = summarizeFleet([vessel({}, 1), vessel({}, 15), vessel({}, 500)], NOW);
    expect(s.freshness.fresh).toBe(1);
    expect(s.freshness.recent).toBe(1);
    expect(s.freshness.stale).toBe(1);
  });

  it("averages confidence over vessels that carry one", () => {
    const s = summarizeFleet([vessel({ confidence: 0.8 }), vessel({ confidence: undefined })], NOW);
    expect(s.averageConfidence).toBe(0.8);
  });

  it("reports the observation span", () => {
    const s = summarizeFleet([vessel({}, 10), vessel({}, 1)], NOW);
    expect(s.observedFrom).toBe(new Date(NOW - 10 * MIN).toISOString());
    expect(s.observedTo).toBe(new Date(NOW - 1 * MIN).toISOString());
  });

  it("ranks flags", () => {
    const s = summarizeFleet(
      [
        vessel({ identity: { imo: "1", name: "a", flag: "NGA" } }),
        vessel({ identity: { imo: "2", name: "b", flag: "NGA" } }),
        vessel({ identity: { imo: "3", name: "c", flag: "GNQ" } }),
      ],
      NOW,
    );
    expect(s.topFlags[0]).toEqual({ flag: "NGA", count: 2 });
  });

  it("counts absent fields rather than hiding them", () => {
    const s = summarizeFleet(
      [
        vessel({ identity: { imo: "1", name: "a" } }),
        vessel({
          position: {
            lon: 4,
            lat: 5,
            heading: 0,
            speed: 0,
            timestamp: new Date(NOW).toISOString(),
          },
        }),
      ],
      NOW,
    );
    expect(s.missing.mmsi).toBe(1);
    expect(s.missing.flag).toBe(1);
    expect(s.missing.course).toBe(1);
    expect(s.missing.speed).toBe(1);
  });
});

describe("describeFleet", () => {
  it("states counts, sources, freshness and confidence", () => {
    const text = describeFleet(summarizeFleet([vessel(), vessel()], NOW));
    expect(text).toMatch(/2 vessels/);
    expect(text).toMatch(/global-fishing-watch/);
    expect(text).toMatch(/Freshness/);
    expect(text).toMatch(/60%/);
  });

  it("states data gaps and warns against reading them as zero", () => {
    const text = describeFleet(
      summarizeFleet([vessel({ identity: { imo: "1", name: "a" } })], NOW),
    );
    expect(text).toMatch(/without MMSI/);
    expect(text).toMatch(/unreported, not as zero/i);
  });
});
