/**
 * M2.6 — Adaptive 2D → 3D perspective policy.
 *
 * The policy is pure arithmetic over a zoom level, so everything that
 * matters about it can be pinned here without a WebGL context: the band
 * boundaries, the ceiling, monotonicity, and the whole latch state
 * machine.
 *
 * Three properties are load-bearing and each has a failure that would be
 * invisible in review:
 *
 *   Monotonicity. A ramp that dipped anywhere would make the map lurch
 *   the wrong way mid-gesture, and a single mistyped stop would do it.
 *   Asserted by sweeping the range rather than by reading the table.
 *
 *   The latch. An automatic system that reasserted itself after a manual
 *   tilt is a fight the officer cannot win. Tested from both sides —
 *   that manual ownership suppresses the ramp, and that reset restores
 *   it *from the current zoom* rather than from history.
 *
 *   Gesture discrimination. If the controller's own easing counted as a
 *   manual tilt, the policy would latch itself out the first time it
 *   ever ran.
 */
import { describe, expect, it } from "vitest";

import { MAP_SCOPES, ZOOM_LIMITS } from "@/services/geospatial/constants";
import {
  MAX_AUTOMATIC_PITCH,
  PITCH_EPSILON,
  PITCH_STOPS,
  isManualPitchGesture,
  pitchForZoom,
  planPerspective,
  planPerspectiveReset,
} from "@/services/geospatial/perspective";

/* ═══════ 1. The ramp ═══════ */

describe("the zoom→pitch ramp", () => {
  it("is flat at world zoom", () => {
    expect(pitchForZoom(MAP_SCOPES.global.minZoom)).toBe(0);
    expect(pitchForZoom(1)).toBe(0);
    expect(pitchForZoom(2)).toBe(0);
    expect(pitchForZoom(3.5)).toBe(0);
  });

  it("keeps the Gulf of Guinea home view completely flat", () => {
    // The home context is [3.5, 4.5] @ zoom 6. M2.5's entire label, EEZ,
    // coastline and graticule hierarchy was designed and verified at
    // pitch 0 across that band; tilting it would silently invalidate
    // that work.
    expect(pitchForZoom(6)).toBe(0);
    expect(pitchForZoom(7)).toBe(0);
    expect(pitchForZoom(7.5)).toBe(0);
  });

  it("ramps through each band to its declared value", () => {
    expect(pitchForZoom(10)).toBeCloseTo(20, 5);
    expect(pitchForZoom(13)).toBeCloseTo(40, 5);
    expect(pitchForZoom(18)).toBeCloseTo(50, 5);
  });

  it("interpolates inside a band rather than stepping", () => {
    // Midpoint of 7.5→10 is 8.75, halfway from 0° to 20°.
    expect(pitchForZoom(8.75)).toBeCloseTo(10, 5);
    // Midpoint of 10→13 is 11.5, halfway from 20° to 40°.
    expect(pitchForZoom(11.5)).toBeCloseTo(30, 5);
    // A small positive tilt must have begun by zoom 8.
    expect(pitchForZoom(8)).toBeGreaterThan(0);
    expect(pitchForZoom(8)).toBeLessThan(6);
  });

  it("is monotonically non-decreasing across the whole navigable range", () => {
    let previous = -1;
    for (let zoom = ZOOM_LIMITS.min; zoom <= ZOOM_LIMITS.max; zoom += 0.05) {
      const pitch = pitchForZoom(zoom);
      expect(pitch).toBeGreaterThanOrEqual(previous);
      previous = pitch;
    }
  });

  it("never exceeds the ceiling, and reaches it", () => {
    let max = 0;
    for (let zoom = ZOOM_LIMITS.min; zoom <= ZOOM_LIMITS.max + 5; zoom += 0.05) {
      max = Math.max(max, pitchForZoom(zoom));
      expect(pitchForZoom(zoom)).toBeLessThanOrEqual(MAX_AUTOMATIC_PITCH);
    }
    expect(max).toBeCloseTo(MAX_AUTOMATIC_PITCH, 5);
    expect(MAX_AUTOMATIC_PITCH).toBe(50);
  });

  it("clamps outside the declared range instead of extrapolating", () => {
    // Below the first stop and above the last, a linear extrapolation
    // would produce a negative pitch and one past MapLibre's own 60.
    expect(pitchForZoom(-5)).toBe(0);
    expect(pitchForZoom(0)).toBe(0);
    expect(pitchForZoom(25)).toBe(MAX_AUTOMATIC_PITCH);
  });

  it("returns level for any zoom that is not a finite number", () => {
    // Both non-finite cases go flat rather than to the ceiling. Infinity
    // is not a zoom the map can ever be at, so treating it as "maximum
    // tilt" would be reading meaning into a broken value; level is the
    // only safe direction when the input cannot be trusted.
    expect(pitchForZoom(Number.NaN)).toBe(0);
    expect(pitchForZoom(Number.POSITIVE_INFINITY)).toBe(0);
    expect(pitchForZoom(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("anchors its first stop at the global zoom floor", () => {
    expect(PITCH_STOPS[0].zoom).toBe(MAP_SCOPES.global.minZoom);
    expect(PITCH_STOPS[PITCH_STOPS.length - 1].zoom).toBe(ZOOM_LIMITS.max);
  });
});

/* ═══════ 2. The plan ═══════ */

describe("the perspective plan", () => {
  it("asks for the ramp's pitch when automatic and off target", () => {
    const plan = planPerspective({ zoom: 13, currentPitch: 0, owner: "automatic" });
    expect(plan.change).toBe(true);
    expect(plan.pitch).toBeCloseTo(40, 5);
  });

  it("holds when already within the dead band", () => {
    // Without a dead band the controller would issue a camera command
    // after every pan — `moveend` fires on a pan too — which is how a
    // perspective system becomes an animation loop.
    const plan = planPerspective({
      zoom: 13,
      currentPitch: 40 - PITCH_EPSILON / 2,
      owner: "automatic",
    });
    expect(plan.change).toBe(false);
  });

  it("holds at world zoom when already level", () => {
    expect(planPerspective({ zoom: 2, currentPitch: 0, owner: "automatic" }).change).toBe(false);
  });

  it("flattens on the way back out", () => {
    const plan = planPerspective({ zoom: 2, currentPitch: 40, owner: "automatic" });
    expect(plan.change).toBe(true);
    expect(plan.pitch).toBe(0);
  });

  it("recovers from an unreadable pitch", () => {
    const plan = planPerspective({ zoom: 13, currentPitch: Number.NaN, owner: "automatic" });
    expect(plan.change).toBe(true);
    expect(plan.pitch).toBeCloseTo(40, 5);
  });

  it("never reports a bearing", () => {
    // Structural: bearing is not a field of the plan, so the policy
    // cannot express an opinion about rotation even by accident.
    const plan = planPerspective({ zoom: 13, currentPitch: 0, owner: "automatic" });
    expect(Object.keys(plan).sort()).toEqual(["change", "pitch", "reason"]);
    expect("bearing" in plan).toBe(false);
  });

  it("always carries a reason, whether or not it moves", () => {
    expect(planPerspective({ zoom: 2, currentPitch: 0, owner: "automatic" }).reason).toBeTruthy();
    expect(planPerspective({ zoom: 13, currentPitch: 0, owner: "manual" }).reason).toBeTruthy();
  });
});

/* ═══════ 3. Manual ownership ═══════ */

describe("manual pitch ownership", () => {
  it("suppresses the ramp entirely", () => {
    const plan = planPerspective({ zoom: 13, currentPitch: 5, owner: "manual" });
    expect(plan.change).toBe(false);
  });

  it("survives zooming in and out while latched", () => {
    // The officer's angle must not drift as they navigate — this is the
    // whole point of the latch.
    for (const zoom of [1, 5, 8, 11, 14, 18]) {
      const plan = planPerspective({ zoom, currentPitch: 27, owner: "manual" });
      expect(plan.change).toBe(false);
      expect(plan.pitch).toBe(27);
    }
  });

  it("reset returns ownership to the policy", () => {
    expect(planPerspectiveReset(13).owner).toBe("automatic");
  });

  it("reset derives pitch from the current zoom, not from history", () => {
    expect(planPerspectiveReset(2).pitch).toBe(0);
    expect(planPerspectiveReset(10).pitch).toBeCloseTo(20, 5);
    expect(planPerspectiveReset(18).pitch).toBeCloseTo(50, 5);
  });

  it("reset reports nothing but an owner, a pitch and a reason", () => {
    // Centre, zoom and bearing are preserved by construction: the reset
    // cannot name them, so it cannot change them.
    expect(Object.keys(planPerspectiveReset(10)).sort()).toEqual(["owner", "pitch", "reason"]);
  });

  it("resumes correctly immediately after a reset", () => {
    const reset = planPerspectiveReset(13);
    const next = planPerspective({ zoom: 13, currentPitch: reset.pitch, owner: reset.owner });
    expect(next.change).toBe(false);
  });
});

/* ═══════ 4. Gesture discrimination ═══════ */

describe("distinguishing a real tilt from the controller's own easing", () => {
  it("treats a pointer-driven event as manual", () => {
    expect(isManualPitchGesture({ originalEvent: { type: "pointermove" } }, false)).toBe(true);
  });

  it("ignores a programmatic camera event", () => {
    // Verified against the live map: a programmatic `easeTo({pitch})`
    // fires pitchstart, many `pitch` events and pitchend with
    // `originalEvent` absent on every one.
    expect(isManualPitchGesture({}, false)).toBe(false);
    expect(isManualPitchGesture(undefined, false)).toBe(false);
  });

  it("ignores any event raised while the renderer is driving", () => {
    // Belt to the braces: even a MapLibre version that began attaching
    // an originalEvent to programmatic easing could not latch the
    // officer out of the policy that just ran.
    expect(isManualPitchGesture({ originalEvent: { type: "pointermove" } }, true)).toBe(false);
  });
});

/* ═══════ 5. Global navigation regression ═══════ */

describe("M2.6 does not disturb the global navigation contract", () => {
  it("leaves global scope unbounded with a floor of 1", () => {
    expect(MAP_SCOPES.global.maxBounds).toBeNull();
    expect(MAP_SCOPES.global.minZoom).toBe(1);
  });

  it("is flat everywhere the world view is usable", () => {
    for (let zoom = MAP_SCOPES.global.minZoom; zoom <= 7.5; zoom += 0.1) {
      expect(pitchForZoom(zoom)).toBe(0);
    }
  });
});
