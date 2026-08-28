/**
 * Asking about the next day, and being answered about it.
 *
 * The defect this fixes was quiet and complete: every rule in the time
 * extractor is anchored on `last`, so "vessels approaching Nigeria
 * within 24 hours" matched nothing, fell to the intent default, and came
 * back as *last 30 days*. The officer asked about the coming day and was
 * answered about the previous month, with no indication anything had
 * been substituted.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPROACH_HOURS,
  approachWindowFor,
  isForwardLooking,
  readApproachWindow,
} from "@/services/orchestration/understanding/approach-window";
import { understand } from "@/services/orchestration";
import { assessFleetApproach, describeFleetApproach } from "@/services/geospatial/fleet-approach";
import type { LonLat, Vessel } from "@/services/geospatial";

/*
 * A synthetic boundary, matching the convention the existing boundary
 * tests already use. The production outline is loaded as map data rather
 * than exported as a constant, and a test that depended on its exact
 * shape would fail the day the outline was refined.
 */
const RING: readonly LonLat[] = [
  [3, 4],
  [7, 4],
  [7, 6],
  [3, 6],
];

describe("a forward horizon is not a data-recency window", () => {
  it.each([
    ["within 24 hours", 24],
    ["within the next 48 hours", 48],
    ["in the next 72 hours", 72],
    ["within 2 days", 48],
    ["24 hours from now", 24],
  ])("reads %s as %i hours ahead", (phrase, hours) => {
    expect(readApproachWindow(`vessels approaching Nigeria ${phrase}`)?.hours).toBe(hours);
  });

  it("refuses to read a historical phrase as a forward one", () => {
    /*
     * "In the last 24 hours" contains "24 hours". A looser pattern would
     * claim it and turn a question about the past into one about the
     * future — the same confusion, mirrored.
     */
    expect(readApproachWindow("vessels seen in the last 24 hours")).toBeNull();
    expect(readApproachWindow("positions from the past 48 hours")).toBeNull();
    expect(isForwardLooking("what happened in the last 24 hours")).toBe(false);
  });

  it("says when it applied a default rather than reading one", () => {
    const stated = approachWindowFor("approaching within 24 hours");
    expect(stated.hours).toBe(24);
    expect(stated.inferred).toBe(false);

    const unstated = approachWindowFor("show me vessels approaching Nigeria");
    expect(unstated.hours).toBe(DEFAULT_APPROACH_HOURS);
    // The officer must be able to see the threshold was assumed.
    expect(unstated.inferred).toBe(true);
  });
});

describe("the classifier recognises an approach question", () => {
  it.each([
    "show me vessels approaching Nigerian waters within 24 hours",
    "which vessels are heading towards Nigerian waters",
    "show me vessels requiring attention",
    "show vessels inside Nigerian waters",
  ])("classifies: %s", (query) => {
    expect(understand(query).intent).toBe("approach-intelligence");
  });

  it("does not let the port names in the sentence claim it", () => {
    /*
     * "Approaching Apapa" mentions a port, and port-intelligence matches
     * both the noun and the word arrivals. The approach rule sits above
     * it because the officer asked about vessels, not about the port.
     */
    expect(understand("vessels approaching Apapa").intent).toBe("approach-intelligence");
  });

  it("keeps attention separate from risk", () => {
    // "Requiring attention" is an operational-attention query. Attention
    // is not risk, and the two must not collapse into one intent.
    expect(understand("show me vessels requiring attention").intent).not.toBe("risk-assessment");
  });
});

/* ── Fleet assessment ────────────────────────────────────────────────── */

const vessel = (over: Partial<Vessel["position"]> & { imo?: string }): Vessel =>
  ({
    identity: { imo: over.imo ?? "SIM-0001", name: "Test Vessel" },
    position: {
      lon: 2.0,
      lat: 5.0,
      heading: 90,
      speed: 12,
      timestamp: new Date().toISOString(),
      ...over,
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  }) as Vessel;

const assess = (vessels: readonly Vessel[], thresholdHours: number) =>
  assessFleetApproach(vessels, RING, { thresholdHours });

describe("the fleet is assessed, never estimated into", () => {
  it("reports a stopped vessel as unassessable rather than arriving", () => {
    /*
     * A vessel at zero knots has no arrival time. Producing one would be
     * the single most damaging fabrication available here, because it
     * looks exactly like a real answer.
     */
    const result = assess([vessel({ speed: 0 })], 24);
    expect(result.approaching).toHaveLength(0);
    expect(result.unassessable).toHaveLength(1);
    expect(result.unassessable[0].assessment.basis).toBe("UNAVAILABLE");
    expect(result.unassessable[0].assessment.hoursToBoundary).toBeNull();
  });

  it("does not project a course nobody reported", () => {
    // `heading` is required, so an unreported course arrives as 0 and
    // would read as a confident northerly track.
    const result = assess([vessel({ heading: 90, headingReported: false })], 72);
    expect(result.approaching).toHaveLength(0);
  });

  it("counts only what the officer's horizon admits", () => {
    const near = vessel({ imo: "NEAR", lon: 2.8, lat: 5.0, speed: 20, heading: 90 });
    const far = vessel({ imo: "FAR", lon: -10.0, lat: 5.0, speed: 3, heading: 90 });
    const wide = assess([near, far], 72);
    const narrow = assess([near, far], 24);
    // A tighter horizon can only ever admit fewer vessels.
    expect(narrow.approaching.length).toBeLessThanOrEqual(wide.approaching.length);
  });

  it("separates vessels already inside the boundary", () => {
    const result = assess([vessel({ lon: 5.0, lat: 5.0 })], 24);
    const total = result.approaching.length + result.inside.length + result.unassessable.length;
    // Every vessel lands in exactly one bucket; none is silently dropped.
    expect(total).toBe(1);
  });

  it("carries the boundary's own caveat with the answer", () => {
    const result = assess([vessel({})], 24);
    expect(result.boundaryAccuracy).toBe("APPROXIMATE");
    expect(result.boundaryCaveat).toMatch(/not a legal or navigational boundary/i);
  });

  it("carries position age so a stale arrival is never read as current", () => {
    const old = vessel({ timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() });
    const result = assess([old], 72);
    const entry = [...result.approaching, ...result.unassessable, ...result.inside][0];
    expect(entry.positionAgeMs).toBeGreaterThan(60 * 60 * 1000);
  });
});

describe("the sentence never rounds a partial answer into a confident one", () => {
  it("says how many could not be assessed", () => {
    const said = describeFleetApproach(assess([vessel({ speed: 0 }), vessel({ speed: 0 })], 24));
    expect(said).toMatch(/could not be assessed/i);
  });

  it("states plainly when nothing meets the threshold", () => {
    const said = describeFleetApproach(assess([], 24));
    expect(said).toMatch(/no vessels meet the 24-hour approach threshold/i);
  });
});
