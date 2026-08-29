/**
 * The coverage engine.
 *
 * Nigeria is covered by many small circles because the provider answers
 * one 50km circle at a time and bills per vessel found. Those two facts
 * generate every rule worth testing here: the cap must be impossible to
 * exceed, overlapping circles must not double-count a hull, a budget
 * must stop spending rather than degrade quietly, and one zone's failure
 * must not take the rest of the coast with it.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_ZONE_RADIUS_KM,
  NIGERIA_COVERAGE_ZONES,
  ZoneRadiusError,
  activeZones,
  assertZoneRadius,
  zonesWithinBudget,
  type CoverageZone,
} from "@/services/geospatial/sources/datalastic-coverage-zones";
import {
  fleetIdentity,
  runCoveragePass,
  type ZoneFetchResult,
} from "@/services/geospatial/sources/datalastic-coverage";
import type { Vessel } from "@/services/geospatial";

const AT = "2026-08-29T09:00:00.000Z";

function vessel(options: {
  imo?: string | null;
  mmsi?: string | null;
  name?: string;
  lat?: number;
  lon?: number;
}): Vessel {
  return {
    identity: {
      imo: options.imo === undefined ? "9539810" : (options.imo ?? undefined),
      mmsi: options.mmsi ?? undefined,
      name: options.name ?? "LADY VICTORIA",
    },
    position: {
      lon: options.lon ?? 3.39,
      lat: options.lat ?? 6.38,
      heading: 90,
      speed: 10,
      timestamp: AT,
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

function zone(id: string, overrides: Partial<CoverageZone> = {}): CoverageZone {
  return {
    id,
    name: id,
    lat: 6.4,
    lon: 3.4,
    radiusKm: 50,
    priority: 1,
    enabled: true,
    refreshIntervalMs: 60_000,
    creditBudget: 10,
    ...overrides,
  };
}

function ok(vessels: readonly Vessel[]): ZoneFetchResult {
  return {
    outcome: "OK",
    vessels,
    latencyMs: 120,
    requestCost: 1,
    retrievedAt: AT,
    message: null,
  };
}

describe("the provider's radius cap is not negotiable", () => {
  it("holds every shipped Nigerian zone at or under 50km", () => {
    for (const z of NIGERIA_COVERAGE_ZONES) {
      expect(z.radiusKm).toBeLessThanOrEqual(MAX_ZONE_RADIUS_KM);
      expect(z.radiusKm).toBeGreaterThan(0);
    }
  });

  /*
   * Throwing rather than clamping is the point. The server clamps, so an
   * over-radius zone would still return vessels — from a quarter of the
   * area its name promises, with nothing saying so.
   */
  it("refuses a zone that would be silently shrunk", () => {
    expect(() => assertZoneRadius(zone("too-wide", { radiusKm: 200 }))).toThrow(ZoneRadiusError);
    expect(() => assertZoneRadius(zone("zero", { radiusKm: 0 }))).toThrow(ZoneRadiusError);
    expect(() => assertZoneRadius(zone("edge", { radiusKm: 50 }))).not.toThrow();
  });

  it("refuses before any request is made", async () => {
    await expect(
      runCoveragePass({
        zones: [zone("bad", { radiusKm: 493 })],
        fetchZone: async () => {
          throw new Error("must not be reached");
        },
      }),
    ).rejects.toThrow(ZoneRadiusError);
  });
});

describe("zone ordering and budget", () => {
  it("runs the most important zones first", () => {
    const ordered = activeZones([
      zone("offshore", { priority: 7 }),
      zone("apapa", { priority: 1 }),
      zone("warri", { priority: 4 }),
    ]);

    expect(ordered.map((z) => z.id)).toEqual(["apapa", "warri", "offshore"]);
  });

  it("leaves disabled zones out entirely", () => {
    const ordered = activeZones([zone("on"), zone("off", { enabled: false })]);

    expect(ordered.map((z) => z.id)).toEqual(["on"]);
  });

  /*
   * Truncating beats thinning: half the coast covered properly can be
   * dated and described, whereas every zone refreshed at a fraction of
   * its cadence produces a picture nobody can characterise.
   */
  it("drops whole low-priority zones rather than thinning every zone", () => {
    const ordered = activeZones([
      zone("a", { priority: 1 }),
      zone("b", { priority: 2 }),
      zone("c", { priority: 3 }),
    ]);

    expect(zonesWithinBudget(ordered, 2).map((z) => z.id)).toEqual(["a", "b"]);
  });

  it("names the skipped zones instead of omitting them", async () => {
    const report = await runCoveragePass({
      zones: [zone("a", { priority: 1 }), zone("b", { priority: 2 })],
      requestBudget: 1,
      fetchZone: async () => ok([vessel({ imo: "1" })]),
    });

    expect(report.requestsMade).toBe(1);
    const skipped = report.zones.find((z) => z.zoneId === "b");
    expect(skipped?.outcome).toBe("SKIPPED_BUDGET");
    // Silence about a zone would read as coverage it never had.
    expect(skipped?.message).toContain("budget");
  });
});

describe("one hull, one entry", () => {
  it("counts a vessel in two overlapping zones once", async () => {
    const shared = vessel({ imo: "9539810" });
    const report = await runCoveragePass({
      zones: [zone("apapa", { priority: 1 }), zone("tincan", { priority: 2 })],
      fetchZone: async () => ok([shared, vessel({ imo: "9111111" })]),
    });

    expect(report.totalRaw).toBe(4);
    expect(report.totalUnique).toBe(2);
    expect(report.duplicatesRemoved).toBe(2);
    expect(report.vessels).toHaveLength(2);
  });

  it("credits the unique vessels to the zone that first supplied them", async () => {
    const report = await runCoveragePass({
      zones: [zone("first", { priority: 1 }), zone("second", { priority: 2 })],
      fetchZone: async (z) =>
        z.id === "first"
          ? ok([vessel({ imo: "A" }), vessel({ imo: "B" })])
          : ok([vessel({ imo: "B" }), vessel({ imo: "C" })]),
    });

    // The second zone is worth one vessel, not two — which is the number
    // that says whether it is earning its cost.
    expect(report.zones.find((z) => z.zoneId === "first")?.unique).toBe(2);
    expect(report.zones.find((z) => z.zoneId === "second")?.unique).toBe(1);
    expect(report.totalUnique).toBe(3);
  });

  it("prefers IMO, falls back to MMSI, and never merges on name", () => {
    expect(fleetIdentity(vessel({ imo: "9539810", mmsi: "636023347" }))).toBe("imo:9539810");
    expect(fleetIdentity(vessel({ imo: null, mmsi: "636023347" }))).toBe("mmsi:636023347");

    /*
     * Two hulls sharing a name must stay two. "PRINCE JOB 1" is not
     * unique in the simulated fleet and certainly is not in the Gulf of
     * Guinea, so merging on it would delete real vessels from the count.
     */
    const a = fleetIdentity(vessel({ imo: null, mmsi: null, name: "SAME NAME", lat: 1 }));
    const b = fleetIdentity(vessel({ imo: null, mmsi: null, name: "SAME NAME", lat: 2 }));
    expect(a).not.toBe(b);
  });
});

describe("one zone failing is not the fleet failing", () => {
  it("keeps the vessels from zones that answered", async () => {
    const report = await runCoveragePass({
      zones: [zone("lagos", { priority: 1 }), zone("calabar", { priority: 2 })],
      fetchZone: async (z) =>
        z.id === "lagos"
          ? ok([vessel({ imo: "A" }), vessel({ imo: "B" })])
          : {
              outcome: "RATE_LIMITED",
              vessels: [],
              latencyMs: 40,
              requestCost: null,
              retrievedAt: AT,
              message: "Datalastic rate limit reached.",
            },
    });

    expect(report.totalUnique).toBe(2);
    expect(report.anyZoneSucceeded).toBe(true);
    const failed = report.zones.find((z) => z.zoneId === "calabar");
    expect(failed?.outcome).toBe("RATE_LIMITED");
    // The provider's own words survive to the surface.
    expect(failed?.message).toContain("rate limit");
  });

  /*
   * The distinction the whole failure vocabulary exists for: an empty
   * fleet from a total outage must never be presentable as an empty sea.
   */
  it("reports that nothing answered when nothing answered", async () => {
    const report = await runCoveragePass({
      zones: [zone("a"), zone("b", { priority: 2 })],
      fetchZone: async () => ({
        outcome: "PROVIDER_FAILURE",
        vessels: [],
        latencyMs: null,
        requestCost: null,
        retrievedAt: null,
        message: "Datalastic is unreachable.",
      }),
    });

    expect(report.vessels).toHaveLength(0);
    expect(report.anyZoneSucceeded).toBe(false);
  });

  it("separates a zone that answered with nothing from one that failed", async () => {
    const report = await runCoveragePass({
      zones: [zone("quiet")],
      fetchZone: async () => ok([]),
    });

    // Answered, and the answer was no vessels. Not a failure.
    expect(report.zones[0].outcome).toBe("NO_RECORD");
    expect(report.anyZoneSucceeded).toBe(true);
  });
});

describe("cost telemetry", () => {
  it("totals the provider's reported cost", async () => {
    const report = await runCoveragePass({
      zones: [zone("a", { priority: 1 }), zone("b", { priority: 2 })],
      fetchZone: async () => ({ ...ok([vessel({ imo: "A" })]), requestCost: 7 }),
    });

    expect(report.totalRequestCost).toBe(14);
    expect(report.requestsMade).toBe(2);
  });

  it("reports cost as unknown rather than zero when the provider is silent", async () => {
    const report = await runCoveragePass({
      zones: [zone("a")],
      fetchZone: async () => ({ ...ok([vessel({ imo: "A" })]), requestCost: null }),
    });

    // Zero would read as free. It was not free; it was unmeasured.
    expect(report.totalRequestCost).toBeNull();
  });
});

describe("cadence is the main cost control", () => {
  /*
   * The incident this locks: the engine ignored refreshIntervalMs and
   * queried every zone on every pass, so the map's sixty-second poll
   * re-billed the whole coast every minute. At 1,374 vessels per pass,
   * billed per vessel found, that exhausted a 20,000-request allowance
   * in about thirteen minutes of the map being open.
   */
  it("skips a zone that was refreshed inside its own interval", async () => {
    let calls = 0;
    const report = await runCoveragePass({
      zones: [zone("apapa", { refreshIntervalMs: 180_000 })],
      lastRunAt: new Map([["apapa", 1_000_000 - 60_000]]),
      now: () => 1_000_000,
      fetchZone: async () => {
        calls += 1;
        return ok([vessel({ imo: "A" })]);
      },
    });

    expect(calls).toBe(0);
    expect(report.requestsMade).toBe(0);
    expect(report.zones[0].outcome).toBe("SKIPPED_INTERVAL");
    // Not due is not failed: an empty pass here is not an empty sea.
    expect(report.anyZoneSucceeded).toBe(true);
  });

  it("queries a zone once its interval has elapsed", async () => {
    let calls = 0;
    const report = await runCoveragePass({
      zones: [zone("apapa", { refreshIntervalMs: 180_000 })],
      lastRunAt: new Map([["apapa", 1_000_000 - 200_000]]),
      now: () => 1_000_000,
      fetchZone: async () => {
        calls += 1;
        return ok([vessel({ imo: "A" })]);
      },
    });

    expect(calls).toBe(1);
    expect(report.zones[0].outcome).toBe("OK");
  });

  it("always queries a zone that has never run", async () => {
    const report = await runCoveragePass({
      zones: [zone("fresh", { refreshIntervalMs: 900_000 })],
      lastRunAt: new Map(),
      fetchZone: async () => ok([vessel({ imo: "A" })]),
    });

    expect(report.requestsMade).toBe(1);
  });

  it("says why a zone was skipped rather than omitting it", async () => {
    const report = await runCoveragePass({
      zones: [zone("apapa", { refreshIntervalMs: 300_000 })],
      lastRunAt: new Map([["apapa", 1_000_000 - 1_000]]),
      now: () => 1_000_000,
      fetchZone: async () => ok([]),
    });

    // Silence about a zone reads as coverage that failed.
    expect(report.zones[0].message).toContain("interval");
  });
});
