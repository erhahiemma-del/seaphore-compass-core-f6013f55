import { describe, expect, it } from "vitest";

import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  FRESHNESS_COLORS,
  FRESHNESS_LABELS,
  formatAge,
  freshnessBandForAge,
  freshnessBandForTimestamp,
  freshnessDistribution,
  toVesselFeature,
  type Vessel,
} from "@/services/geospatial";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const MIN = 60_000;

describe("freshnessBandForAge", () => {
  it("classifies the four measurable bands", () => {
    expect(freshnessBandForAge(1 * MIN)).toBe("fresh");
    expect(freshnessBandForAge(15 * MIN)).toBe("recent");
    expect(freshnessBandForAge(45 * MIN)).toBe("ageing");
    expect(freshnessBandForAge(120 * MIN)).toBe("stale");
  });

  it("uses exclusive upper bounds at each boundary", () => {
    expect(freshnessBandForAge(DEFAULT_FRESHNESS_THRESHOLDS.freshMs - 1)).toBe("fresh");
    expect(freshnessBandForAge(DEFAULT_FRESHNESS_THRESHOLDS.freshMs)).toBe("recent");
    expect(freshnessBandForAge(DEFAULT_FRESHNESS_THRESHOLDS.recentMs)).toBe("ageing");
    expect(freshnessBandForAge(DEFAULT_FRESHNESS_THRESHOLDS.ageingMs)).toBe("stale");
  });

  it("reports unknown rather than fresh for an unmeasurable age", () => {
    // An unmeasurable age must never be presented as a good one.
    expect(freshnessBandForAge(null)).toBe("unknown");
    expect(freshnessBandForAge(undefined)).toBe("unknown");
    expect(freshnessBandForAge(Number.NaN)).toBe("unknown");
    expect(freshnessBandForAge(Number.POSITIVE_INFINITY)).toBe("unknown");
  });

  it("treats a negative age as a clock problem, not freshness", () => {
    expect(freshnessBandForAge(-60_000)).toBe("unknown");
  });

  it("honours configurable thresholds", () => {
    const hourly = { freshMs: 60 * MIN, recentMs: 180 * MIN, ageingMs: 360 * MIN };

    // 29 minutes is `recent` by default but `fresh` for an hourly feed.
    expect(freshnessBandForAge(29 * MIN)).toBe("recent");
    expect(freshnessBandForAge(29 * MIN, hourly)).toBe("fresh");
  });

  it("accepts a partial threshold override", () => {
    expect(freshnessBandForAge(10 * MIN, { freshMs: 20 * MIN })).toBe("fresh");
  });
});

describe("freshnessBandForTimestamp", () => {
  it("classifies an ISO timestamp against a clock", () => {
    expect(freshnessBandForTimestamp(new Date(NOW - 2 * MIN).toISOString(), NOW)).toBe("fresh");
    expect(freshnessBandForTimestamp(new Date(NOW - 90 * MIN).toISOString(), NOW)).toBe("stale");
  });

  it("returns unknown for a missing or unparseable timestamp", () => {
    expect(freshnessBandForTimestamp(null, NOW)).toBe("unknown");
    expect(freshnessBandForTimestamp("not-a-date", NOW)).toBe("unknown");
  });
});

describe("presentation helpers", () => {
  it("gives every band a colour and a label", () => {
    for (const band of ["fresh", "recent", "ageing", "stale", "unknown"] as const) {
      expect(FRESHNESS_COLORS[band]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(FRESHNESS_LABELS[band].length).toBeGreaterThan(0);
    }
  });

  it("formats ages compactly", () => {
    expect(formatAge(42_000)).toBe("42s");
    expect(formatAge(7 * MIN)).toBe("7m");
    expect(formatAge(3 * 60 * MIN)).toBe("3h");
    expect(formatAge(2 * 24 * 60 * MIN)).toBe("2d");
  });

  it("distinguishes not-measured from brand-new", () => {
    expect(formatAge(null)).toBe("—");
    expect(formatAge(0)).toBe("0s");
  });
});

describe("freshnessDistribution", () => {
  it("counts ages across bands", () => {
    const counts = freshnessDistribution([1 * MIN, 2 * MIN, 15 * MIN, 45 * MIN, 999 * MIN, null]);

    expect(counts).toEqual({ fresh: 2, recent: 1, ageing: 1, stale: 1, unknown: 1 });
  });

  it("handles an empty set", () => {
    expect(freshnessDistribution([])).toEqual({
      fresh: 0,
      recent: 0,
      ageing: 0,
      stale: 0,
      unknown: 0,
    });
  });
});

describe("vessel features carry freshness", () => {
  function vessel(ageMs: number): Vessel {
    return {
      identity: { imo: "9411765", name: "MV Test" },
      position: {
        lon: 4.1,
        lat: 5.2,
        heading: 90,
        speed: 10,
        timestamp: new Date(NOW - ageMs).toISOString(),
      },
      riskLevel: "UNKNOWN",
      attentionScore: 0,
    };
  }

  it("projects the band and the age onto the feature", () => {
    const feature = toVesselFeature(vessel(2 * MIN), { now: NOW });

    expect(feature.properties.freshness).toBe("fresh");
    expect(feature.properties.ageMs).toBe(2 * MIN);
  });

  it("bands an old observation as stale", () => {
    expect(toVesselFeature(vessel(120 * MIN), { now: NOW }).properties.freshness).toBe("stale");
  });

  it("bands an unparseable timestamp as unknown", () => {
    const broken: Vessel = {
      ...vessel(0),
      position: { ...vessel(0).position, timestamp: "nope" },
    };

    expect(toVesselFeature(broken, { now: NOW }).properties.freshness).toBe("unknown");
  });

  it("keeps freshness independent of the stale render flag", () => {
    // `isStale` drives the sprite; `freshness` is the finer-grained band.
    // They answer different questions and must not be conflated.
    const feature = toVesselFeature(vessel(20 * MIN), { now: NOW });

    expect(feature.properties.isStale).toBe(true);
    expect(feature.properties.freshness).toBe("recent");
  });
});
