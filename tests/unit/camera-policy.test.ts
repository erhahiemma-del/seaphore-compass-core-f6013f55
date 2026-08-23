/**
 * When the map is allowed to move.
 *
 * The policy is pure, so it is tested directly rather than through a
 * WebGL context. The behaviour it protects: an officer's mental picture
 * survives their own clicks.
 */
import { describe, expect, it } from "vitest";

import { isComfortablyVisible, planCameraMove } from "@/services/geospatial";
import type { BoundingBox, LonLat } from "@/services/geospatial";

/** Gulf of Guinea-ish window used throughout. */
const VIEWPORT: BoundingBox = [
  [0, 0],
  [10, 10],
];
const CENTRE: LonLat = [5, 5];
const FAR_AWAY: LonLat = [40, 40];

/* ═══════ Clicking never moves the map ═══════ */

describe("a selection without a focus point leaves the viewport alone", () => {
  it("does not move", () => {
    // The contract on MapSelection.focus: absent means the officer
    // clicked something they were already looking at.
    const plan = planCameraMove({ focus: null, viewport: VIEWPORT, reducedMotion: false });
    expect(plan.move).toBe(false);
  });

  it("treats undefined the same as null", () => {
    expect(
      planCameraMove({ focus: undefined, viewport: VIEWPORT, reducedMotion: false }).move,
    ).toBe(false);
  });

  it("explains itself", () => {
    const plan = planCameraMove({ focus: null, viewport: VIEWPORT, reducedMotion: false });
    expect(plan.reason).toMatch(/no focus point/i);
  });
});

/* ═══════ Already visible means stay put ═══════ */

describe("a focus point already on screen does not trigger movement", () => {
  it("stays for a target at the centre", () => {
    const plan = planCameraMove({ focus: CENTRE, viewport: VIEWPORT, reducedMotion: false });
    expect(plan.move).toBe(false);
    expect(plan.reason).toMatch(/already on screen/i);
  });

  it("moves for a target hugging the edge", () => {
    // Inside the bounds, but in the outer eighth — visible in principle,
    // awkward to read in practice.
    const plan = planCameraMove({ focus: [0.5, 5], viewport: VIEWPORT, reducedMotion: false });
    expect(plan.move).toBe(true);
  });

  it("moves for a target well outside", () => {
    const plan = planCameraMove({ focus: FAR_AWAY, viewport: VIEWPORT, reducedMotion: false });
    expect(plan.move).toBe(true);
    expect(plan.center).toEqual(FAR_AWAY);
  });

  it("moves when the viewport is unknown", () => {
    // Cannot prove it is visible, so the safe direction is to show it.
    expect(planCameraMove({ focus: FAR_AWAY, viewport: null, reducedMotion: false }).move).toBe(
      true,
    );
  });
});

/* ═══════ Reduced motion ═══════ */

describe("reduced motion is honoured", () => {
  it("still arrives, but without animating", () => {
    const plan = planCameraMove({ focus: FAR_AWAY, viewport: VIEWPORT, reducedMotion: true });
    expect(plan.move).toBe(true);
    expect(plan.animate).toBe(false);
  });

  it("animates when motion is not restricted", () => {
    expect(
      planCameraMove({ focus: FAR_AWAY, viewport: VIEWPORT, reducedMotion: false }).animate,
    ).toBe(true);
  });

  it("does not turn a no-op into a move", () => {
    // The preference changes how we travel, never whether we do.
    const plan = planCameraMove({ focus: CENTRE, viewport: VIEWPORT, reducedMotion: true });
    expect(plan.move).toBe(false);
  });
});

/* ═══════ Bad input ═══════ */

describe("broken coordinates never reach the renderer", () => {
  it.each([
    ["NaN", [NaN, 5]],
    ["Infinity", [Infinity, 5]],
    ["NaN latitude", [5, NaN]],
  ])("refuses to fly to %s", (_label, focus) => {
    const plan = planCameraMove({
      focus: focus as LonLat,
      viewport: VIEWPORT,
      reducedMotion: false,
    });
    expect(plan.move).toBe(false);
    expect(plan.reason).toMatch(/not a finite coordinate/i);
  });

  it("does not trust a degenerate viewport", () => {
    const collapsed: BoundingBox = [
      [5, 5],
      [5, 5],
    ];
    // A zero-area viewport cannot vouch for anything being visible.
    expect(isComfortablyVisible(CENTRE, collapsed)).toBe(false);
  });
});

/* ═══════ Every decision is inspectable ═══════ */

describe("the plan always records why", () => {
  it.each([
    [{ focus: null, viewport: VIEWPORT, reducedMotion: false }],
    [{ focus: CENTRE, viewport: VIEWPORT, reducedMotion: false }],
    [{ focus: FAR_AWAY, viewport: VIEWPORT, reducedMotion: false }],
    [{ focus: FAR_AWAY, viewport: VIEWPORT, reducedMotion: true }],
  ])("gives a reason for %o", (input) => {
    expect(planCameraMove(input).reason.length).toBeGreaterThan(10);
  });
});
