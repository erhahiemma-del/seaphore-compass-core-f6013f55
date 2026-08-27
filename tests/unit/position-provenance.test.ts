/**
 * Whether a position is evidence, and whether the map can say so.
 *
 * The map has always drawn positions and never recorded how it got them.
 * That was harmless while every coordinate came from a source report,
 * because there was only one kind. The moment anything interpolates
 * between two reports for smoothness — which is the next thing anyone
 * will want — every drawn position becomes a claim the data does not
 * support, unless the distinction travels with the coordinate.
 *
 * These tests hold that distinction, and hold it at the model rather than
 * in whichever component happens to draw next.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  POSITION_KINDS,
  POSITION_KIND_LABELS,
  POSITION_KIND_STROKES,
  isObserved,
  mayClaimAsFact,
  strongestPositionKind,
  weakestPositionKind,
  type PositionKind,
} from "@/services/geospatial/position-provenance";
import {
  observedPoints,
  trackContainsUnobserved,
  type VesselTrackPoint,
} from "@/services/geospatial/vessel-history";
import { hasHistory, EmptyVesselSource } from "@/services/geospatial/vessel-source";

function point(kind: PositionKind, timestamp: string): VesselTrackPoint {
  return { position: [3.4, 6.4], timestamp, kind };
}

describe("only a reported position is evidence", () => {
  it("treats exactly one kind as observed", () => {
    expect(isObserved("OBSERVED")).toBe(true);
    for (const kind of ["DISPLAY_INTERPOLATED", "ESTIMATED", "PROJECTED"] as const) {
      expect(isObserved(kind), kind).toBe(false);
    }
  });

  it("defaults an unlabelled position to observed", () => {
    /*
     * Every position predating this field came from a source report —
     * nothing in the codebase generated positions — so absent must mean
     * observed or the change would silently reclassify the entire
     * existing corpus as unverified.
     */
    expect(isObserved(undefined)).toBe(true);
  });

  it("asks the question callers actually have", () => {
    // "Can I say the vessel was here?" should not require translating
    // into a question about enum membership.
    for (const kind of POSITION_KINDS) {
      expect(mayClaimAsFact(kind)).toBe(isObserved(kind));
    }
  });
});

describe("a mixed track describes itself by its weakest claim", () => {
  it("reports the weakest kind present", () => {
    /*
     * A path that is nine-tenths reported and one-tenth projected is not
     * a reported path. Labelling it as one would let a projection be
     * cited as evidence.
     */
    expect(weakestPositionKind(["OBSERVED", "OBSERVED", "PROJECTED"])).toBe("PROJECTED");
    expect(weakestPositionKind(["OBSERVED", "DISPLAY_INTERPOLATED"])).toBe("DISPLAY_INTERPOLATED");
    expect(weakestPositionKind(["OBSERVED"])).toBe("OBSERVED");
  });

  it("keeps the strongest query separate so neither is reached for by accident", () => {
    expect(strongestPositionKind(["PROJECTED", "OBSERVED"])).toBe("OBSERVED");
    expect(strongestPositionKind([])).toBeNull();
    expect(weakestPositionKind([])).toBeNull();
  });

  it("flags a track carrying anything unobserved", () => {
    const reported = [point("OBSERVED", "2026-01-01T00:00:00Z")];
    const mixed = [...reported, point("PROJECTED", "2026-01-01T01:00:00Z")];
    expect(trackContainsUnobserved(reported)).toBe(false);
    expect(trackContainsUnobserved(mixed)).toBe(true);
  });

  it("can hand back only what was reported", () => {
    // What an export or an investigation must cite.
    const mixed = [
      point("OBSERVED", "2026-01-01T00:00:00Z"),
      point("DISPLAY_INTERPOLATED", "2026-01-01T00:30:00Z"),
      point("OBSERVED", "2026-01-01T01:00:00Z"),
    ];
    expect(observedPoints(mixed)).toHaveLength(2);
    expect(observedPoints(mixed).every((p) => p.kind === "OBSERVED")).toBe(true);
  });
});

describe("the difference survives being looked at", () => {
  it("separates the kinds by line style, not by colour alone", () => {
    /*
     * Colour on this map already carries risk and freshness. A fourth
     * meaning on the same channel would be unreadable — and invisible to
     * an officer with a colour vision deficiency. Solid against dashed
     * survives both.
     */
    expect(POSITION_KIND_STROKES.OBSERVED.dashArray).toBeUndefined();
    expect(POSITION_KIND_STROKES.ESTIMATED.dashArray).toBeDefined();
    expect(POSITION_KIND_STROKES.PROJECTED.dashArray).toBeDefined();
  });

  it("never draws an unobserved position at full strength", () => {
    for (const kind of POSITION_KINDS) {
      if (kind === "OBSERVED") continue;
      expect(POSITION_KIND_STROKES[kind].opacity, kind).toBeLessThan(
        POSITION_KIND_STROKES.OBSERVED.opacity,
      );
    }
  });

  it("gives every kind a label an officer can read", () => {
    for (const kind of POSITION_KINDS) {
      expect(POSITION_KIND_LABELS[kind], kind).toBeTruthy();
      // Not the enum shouted back at them.
      expect(POSITION_KIND_LABELS[kind]).not.toBe(kind);
    }
  });
});

describe("this is not the intelligence confidence axis", () => {
  it("stays independent of assessment confidence", () => {
    /*
     * `ConfidenceTier` grades how much Seaphore trusts an assessment.
     * This grades how a coordinate was arrived at. A high-confidence risk
     * assessment can sit on a vessel whose screen position is pure
     * interpolation. Collapsing them would make both meaningless.
     */
    const source = readFileSync(
      resolve(process.cwd(), "src/services/geospatial/position-provenance.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toContain("ConfidenceTier");
    expect(source).not.toContain("confidenceTierFor");
  });
});

describe("history is retrieved, never assumed", () => {
  it("lets a source say it keeps no archive", () => {
    /*
     * Most sources publish a present position and keep nothing. Asking
     * before offering Replay is what stops the control appearing and
     * then failing.
     */
    expect(hasHistory(new EmptyVesselSource())).toBe(false);
  });

  it("distinguishes no archive from no movement at the type level", () => {
    /*
     * An empty array cannot tell those apart, and that ambiguity is
     * exactly how a gap in collection ends up drawn as a stationary
     * ship. The result type makes the two unrepresentable as one.
     */
    const model = readFileSync(
      resolve(process.cwd(), "src/services/geospatial/vessel-history.ts"),
      "utf8",
    );
    expect(model).toContain('status: "available"');
    expect(model).toContain('status: "unavailable"');
    expect(model).toContain("readonly reason: string");
  });
});
