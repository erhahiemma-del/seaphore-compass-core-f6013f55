/**
 * Where Nigerian waters are, and what the answer is worth.
 *
 * The polygon this rests on says of itself: "Simplified outline for
 * operational display only. NOT a legal or navigational boundary […] does
 * not encode negotiated tri-point boundaries with Benin, Cameroon,
 * Equatorial Guinea, or Sao Tome and Principe."
 *
 * That was fine while it was scenery. It stops being fine the moment
 * something computes "this vessel has entered Nigerian waters" from it,
 * because a containment test turns a drawing into a finding — and near
 * the western and eastern approaches, which is exactly where inbound
 * traffic runs, the simplification is wrong by miles.
 *
 * These tests hold the two things that keep that honest: the accuracy
 * grade travels with every answer, and a computed arrival time can never
 * be mistaken for one a source reported.
 */
import { describe, expect, it } from "vitest";

import {
  ARRIVAL_BASIS_LABEL,
  DEFAULT_APPROACH_THRESHOLDS,
  NIGERIAN_WATERS_ACCURACY,
  NIGERIAN_WATERS_CAVEAT,
  assessApproach,
  distanceToRingNm,
  insideBoundingBox,
  pointInRing,
  relationFor,
} from "@/services/geospatial/maritime-boundary";
import type { LonLat } from "@/services/geospatial/types";

/** A simple box off Lagos, standing in for the real ring. */
const RING: readonly LonLat[] = [
  [3, 4],
  [7, 4],
  [7, 6],
  [3, 6],
];

describe("containment", () => {
  it("knows inside from outside", () => {
    expect(pointInRing([5, 5], RING)).toBe(true);
    expect(pointInRing([1, 5], RING)).toBe(false);
    expect(pointInRing([5, 9], RING)).toBe(false);
  });

  it("rejects cheaply before touching the polygon", () => {
    // Most vessels on a global picture are nowhere near Nigeria.
    expect(insideBoundingBox([5, 5])).toBe(true);
    expect(insideBoundingBox([-40, 45])).toBe(false);
  });

  it("measures distance to the edge, not to a vertex", () => {
    /*
     * A vessel abeam the middle of a long edge is nearest that edge, not
     * nearest either corner. Measuring to vertices would overstate the
     * range and delay every approach classification.
     */
    const toEdge = distanceToRingNm([5, 3], RING);
    expect(toEdge).toBeCloseTo(60, 0);
  });
});

describe("an answer carries what it is worth", () => {
  it("grades the boundary as approximate", () => {
    // Until the VLIZ or Hydrographic Office polygon replaces it.
    expect(NIGERIAN_WATERS_ACCURACY).toBe("APPROXIMATE");
  });

  it("states the caveat in words an officer reads", () => {
    expect(NIGERIAN_WATERS_CAVEAT).toContain("Not a legal or navigational boundary");
  });

  it("puts the grade on every assessment", () => {
    const inside = assessApproach({ position: [5, 5], speed: 10, heading: 0 }, RING);
    const outside = assessApproach({ position: [1, 5], speed: 10, heading: 90 }, RING);
    expect(inside.accuracy).toBe("APPROXIMATE");
    expect(outside.accuracy).toBe("APPROXIMATE");
  });

  it("never calls the inside state 'inside Nigerian waters'", () => {
    /*
     * The longer name is what the geometry supports. A shorter one would
     * be quoted back as a determination.
     */
    const inside = assessApproach({ position: [5, 5], speed: 10, heading: 0 }, RING);
    expect(inside.relation).toBe("INSIDE_DISPLAYED_BOUNDARY");
  });

  it("explains itself in one line, always", () => {
    for (const input of [
      { position: [5, 5] as LonLat, speed: 10, heading: 0 },
      { position: [1, 5] as LonLat, speed: 10, heading: 90 },
      { position: [1, 5] as LonLat, speed: 0, heading: 90 },
    ]) {
      expect(assessApproach(input, RING).rationale.length).toBeGreaterThan(20);
    }
  });
});

describe("reported and estimated never render alike", () => {
  it("prefers a reported arrival time and says so", () => {
    const result = assessApproach(
      { position: [1, 5], speed: 10, heading: 90, reportedEtaHours: 40 },
      RING,
    );
    expect(result.basis).toBe("REPORTED");
    expect(result.hoursToBoundary).toBe(40);
    expect(result.rationale).toContain("reported");
  });

  it("marks a computed figure as an estimate", () => {
    const result = assessApproach({ position: [1, 5], speed: 10, heading: 90 }, RING);
    expect(result.basis).toBe("ESTIMATED");
    expect(result.rationale).toContain("Not a reported arrival time");
  });

  it("labels the two differently wherever they are shown", () => {
    expect(ARRIVAL_BASIS_LABEL.REPORTED).not.toBe(ARRIVAL_BASIS_LABEL.ESTIMATED);
    expect(ARRIVAL_BASIS_LABEL.ESTIMATED.toLowerCase()).toContain("estimated");
    // Never the bare word an officer would read as authoritative.
    expect(ARRIVAL_BASIS_LABEL.ESTIMATED).not.toBe("ETA");
  });
});

describe("no arrival time is invented", () => {
  it("gives none to a vessel that is not making way", () => {
    /*
     * Dividing distance by a speed the vessel is not making would be an
     * invented number wearing a unit.
     */
    const result = assessApproach({ position: [1, 5], speed: 0, heading: 90 }, RING);
    expect(result.hoursToBoundary).toBeNull();
    expect(result.basis).toBe("UNAVAILABLE");
    expect(result.rationale).toContain("not making way");
  });

  it("gives none to a vessel steaming away", () => {
    const result = assessApproach({ position: [1, 5], speed: 12, heading: 270 }, RING);
    expect(result.hoursToBoundary).toBeNull();
    expect(result.rationale).toContain("does not close");
  });

  it("gives none when nobody reported a course", () => {
    // The heading-honesty rule, carried into the approach engine: an
    // unreported course must not be used as though it were known.
    const result = assessApproach(
      { position: [1, 5], speed: 12, heading: 90, headingReported: false },
      RING,
    );
    expect(result.basis).toBe("UNAVAILABLE");
  });
});

describe("thresholds are declared once", () => {
  it("bands an arrival time consistently", () => {
    const t = DEFAULT_APPROACH_THRESHOLDS;
    expect(relationFor(80, t)).toBe("OUTSIDE");
    expect(relationFor(60, t)).toBe("APPROACHING");
    expect(relationFor(30, t)).toBe("APPROACHING");
    expect(relationFor(12, t)).toBe("ENTERING_SOON");
  });

  it("orders the thresholds sensibly", () => {
    const t = DEFAULT_APPROACH_THRESHOLDS;
    expect(t.watch).toBeGreaterThan(t.attention);
    expect(t.attention).toBeGreaterThan(t.imminent);
  });

  it("accepts a different policy without editing the engine", () => {
    // So 72 and 48 never end up as literals inside a map component.
    const strict = { watch: 96, attention: 60, imminent: 36 };
    expect(relationFor(80, strict)).toBe("APPROACHING");
    expect(relationFor(30, strict)).toBe("ENTERING_SOON");
  });
});
