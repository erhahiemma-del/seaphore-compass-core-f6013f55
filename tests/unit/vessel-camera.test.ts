/**
 * Keeping the vessel visible without taking the map away from the officer.
 *
 * Two failures these guard against, and they pull in opposite
 * directions. A camera that never moves leaves the investigated vessel
 * behind the 520px panel describing it. A camera that always moves pins
 * the vessel and slides the world underneath, and overrides the officer
 * the moment they pan.
 */
import { describe, expect, it } from "vitest";

import {
  FOLLOW_LABEL,
  centreTargetFor,
  followShouldMove,
  isManualPan,
  usableRegion,
} from "@/features/maritime/vessel-camera";

/** A 1600x900 canvas with the 520px drawer and the left rail over it. */
const viewport = {
  center: [3.4, 6.4] as [number, number],
  zoom: 12,
  width: 1600,
  height: 900,
};
const obstructions = { left: 360, right: 520, top: 0, bottom: 0 };

describe("the usable map is what is left after the panels", () => {
  it("excludes the drawer and the left rail", () => {
    const region = usableRegion(viewport, obstructions);
    expect(region.left).toBeGreaterThanOrEqual(360);
    expect(region.right).toBeLessThanOrEqual(1600 - 520);
    // 1600 − 360 − 520, less the comfort margins on each side.
    expect(region.width).toBeLessThan(720);
    expect(region.width).toBeGreaterThan(0);
  });
});

describe("centre moves only when it needs to", () => {
  it("returns nothing for a vessel already comfortably in view", () => {
    /*
     * A "centre" button that jumps every time it is pressed, including
     * when the vessel is already in front of the officer, reads as the
     * map twitching rather than as a command being obeyed.
     */
    const region = usableRegion(viewport, obstructions);
    expect(region.width).toBeGreaterThan(0);
    expect(centreTargetFor(viewport.center, viewport, obstructions)).toBeNull();
  });

  it("returns a target for a vessel behind the drawer", () => {
    /*
     * The exact failure: the subject of the investigation hidden by the
     * panel describing it. East of centre at z12 puts the vessel under
     * the right-hand drawer.
     */
    const behindDrawer: [number, number] = [3.44, 6.4];
    const target = centreTargetFor(behindDrawer, viewport, obstructions);
    expect(target).not.toBeNull();
    // The camera moves toward the vessel rather than away from it.
    expect(target![0]).toBeGreaterThan(viewport.center[0]);
  });

  it("declines a degenerate viewport rather than guessing", () => {
    const collapsed = { ...viewport, width: 400 };
    // 400 wide with 880 of panels leaves no map to centre into.
    expect(centreTargetFor([3.4, 6.4], collapsed, obstructions)).toBeNull();
  });
});

describe("follow acts at the edge, not on every update", () => {
  it("does nothing while the vessel is comfortably visible", () => {
    expect(followShouldMove(viewport.center, viewport, obstructions)).toBe(false);
  });

  it("moves once the vessel would leave the usable region", () => {
    expect(followShouldMove([3.44, 6.4], viewport, obstructions)).toBe(true);
  });
});

describe("a pan by the officer is not a move by follow", () => {
  it("treats a centre follow never requested as manual", () => {
    /*
     * Conservative on purpose: with no record of having moved the
     * camera, follow must assume the person did, and pause rather than
     * drag the map back.
     */
    expect(isManualPan([3.4, 6.4], null)).toBe(true);
  });

  it("recognises its own move", () => {
    expect(isManualPan([3.4, 6.4], [3.4, 6.4])).toBe(false);
    // Sub-tolerance drift from rounding is still its own move.
    expect(isManualPan([3.40001, 6.40001], [3.4, 6.4])).toBe(false);
  });

  it("recognises a pan away from where it asked to be", () => {
    expect(isManualPan([3.6, 6.4], [3.4, 6.4])).toBe(true);
  });
});

describe("follow says which state it is in", () => {
  it("never labels a paused follow as following", () => {
    expect(FOLLOW_LABEL.ACTIVE).toBe("Following");
    expect(FOLLOW_LABEL.PAUSED).toMatch(/paused/i);
    expect(FOLLOW_LABEL.PAUSED).not.toMatch(/^following$/i);
    expect(FOLLOW_LABEL.OFF).not.toMatch(/following/i);
  });
});
