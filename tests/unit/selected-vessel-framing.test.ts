/**
 * Keeping the vessel an officer just chose where they can see it.
 *
 * Selecting a vessel opens a 380px drawer. The camera does not change, so
 * the canvas is the same size and the *visible* map is narrower — a
 * vessel that was comfortably in view can end up behind the panel
 * describing it, leaving the officer reading intelligence about a ship
 * they cannot see.
 *
 * This was not theoretical: it is what blocked the selected-vessel
 * emphasis verification. Clicking the vessel opened the drawer and the
 * vessel left the visible strip, so the selected glyph could not be
 * compared against the unselected one at all.
 */
import { describe, expect, it } from "vitest";

import {
  framingCentreFor,
  isComfortablyVisible,
  usableRegion,
  type MapObstructions,
} from "@/features/maritime/selected-vessel-framing";
import { lngLatToScreen, type Viewport } from "@/features/maritime/coordinate-math";
import type { LonLat } from "@/services/geospatial/types";

const VIEWPORT: Viewport = { center: [3.2, 6.3], zoom: 12, width: 1400, height: 800 };
const DRAWER_OPEN: MapObstructions = { right: 380, left: 360, top: 0, bottom: 0 };
const NO_DRAWER: MapObstructions = { right: 0, left: 360, top: 0, bottom: 0 };

describe("the usable region is not the canvas", () => {
  it("shrinks by whatever is covering the map", () => {
    /*
     * Most of the defects in this area come from reasoning about the
     * canvas when the question was about the visible rectangle.
     */
    const open = usableRegion(VIEWPORT, DRAWER_OPEN);
    const closed = usableRegion(VIEWPORT, NO_DRAWER);
    expect(open.width).toBeLessThan(closed.width);
    expect(closed.width - open.width).toBe(380);
  });

  it("keeps a margin so a vessel is not pinned to the edge", () => {
    // A vessel exactly on the boundary is technically visible and
    // practically useless: its label runs off and its heading points at
    // nothing.
    const region = usableRegion(VIEWPORT, NO_DRAWER);
    expect(region.left).toBeGreaterThan(NO_DRAWER.left);
    expect(region.right).toBeLessThan(VIEWPORT.width);
  });
});

describe("it moves the camera only when it must", () => {
  it("leaves a vessel that is already comfortably visible", () => {
    /*
     * A camera that re-centres on a vessel in plain sight is a jump with
     * no purpose, and an officer learns to distrust it.
     */
    const centre: LonLat = [3.2, 6.3];
    expect(framingCentreFor(centre, VIEWPORT, NO_DRAWER)).toBeNull();
  });

  it("moves a vessel that the drawer would hide", () => {
    // Put the vessel where the drawer will be: right of the usable edge.
    const region = usableRegion(VIEWPORT, DRAWER_OPEN);
    const hidden = screenToPosition(region.right + 120, VIEWPORT.height / 2);
    expect(isComfortablyVisible(hidden, VIEWPORT, DRAWER_OPEN)).toBe(false);
    expect(framingCentreFor(hidden, VIEWPORT, DRAWER_OPEN)).not.toBeNull();
  });

  it("puts the vessel in the usable centre, not the canvas centre", () => {
    /*
     * The specific mistake this exists to avoid. Centring on the canvas
     * places the vessel under the drawer's inner edge — which looks
     * deliberate and is wrong.
     */
    const region = usableRegion(VIEWPORT, DRAWER_OPEN);
    const hidden = screenToPosition(region.right + 120, VIEWPORT.height / 2);
    const centre = framingCentreFor(hidden, VIEWPORT, DRAWER_OPEN)!;

    const after: Viewport = { ...VIEWPORT, center: centre };
    const point = lngLatToScreen(hidden, after)!;
    const usableCentreX = (region.left + region.right) / 2;
    expect(point.x).toBeCloseTo(usableCentreX, 0);

    /*
     * The claim worth holding is the move itself: outside the usable
     * region before, inside it after.
     *
     * A first draft asserted the usable centre sits far from the canvas
     * centre. It does not — the left context column is 360px against the
     * drawer's 380px, so the two centres are about ten pixels apart. That
     * makes the *offset* small and the *correction* large, because the
     * vessel was behind the drawer rather than merely off-centre, and
     * conflating the two is what the failed assertion was doing.
     */
    expect(isComfortablyVisible(hidden, VIEWPORT, DRAWER_OPEN)).toBe(false);
    expect(isComfortablyVisible(hidden, after, DRAWER_OPEN)).toBe(true);
  });

  it("leaves latitude alone", () => {
    // The obstructions are vertical panels; a north-south correction
    // would move the officer's view for no reason.
    const region = usableRegion(VIEWPORT, DRAWER_OPEN);
    const hidden = screenToPosition(region.right + 120, VIEWPORT.height / 2);
    const centre = framingCentreFor(hidden, VIEWPORT, DRAWER_OPEN)!;
    expect(centre[1]).toBeCloseTo(VIEWPORT.center[1], 6);
  });

  it("declines rather than guessing when there is no room", () => {
    const cramped: MapObstructions = { right: 900, left: 900, top: 0, bottom: 0 };
    const centre: LonLat = [3.2, 6.3];
    expect(isComfortablyVisible(centre, VIEWPORT, cramped)).toBe(false);
    expect(framingCentreFor(centre, VIEWPORT, cramped)).toBeNull();
  });
});

describe("the projection round-trips", () => {
  it("agrees with the forward projection it inverts", () => {
    // The two share one set of formulae so they cannot drift apart.
    const point = lngLatToScreen([3.2, 6.3], VIEWPORT)!;
    expect(point.x).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect(point.y).toBeCloseTo(VIEWPORT.height / 2, 6);
  });

  it("takes longitude the short way round the world", () => {
    /*
     * Without wrapping, a vessel just east of the antimeridian viewed
     * from just west of it projects most of a world away and is judged
     * off-screen when it is beside the camera.
     */
    const antimeridian: Viewport = { ...VIEWPORT, center: [179.9, 0], zoom: 6 };
    const nearby = lngLatToScreen([-179.9, 0], antimeridian)!;
    expect(Math.abs(nearby.x - antimeridian.width / 2)).toBeLessThan(200);
  });
});

/** Inverse helper for the tests: a position that lands on a given pixel. */
function screenToPosition(x: number, y: number): LonLat {
  const degreesPerPixel = 360 / (512 * Math.pow(2, VIEWPORT.zoom));
  const lon = VIEWPORT.center[0] + (x - VIEWPORT.width / 2) * degreesPerPixel;
  const lat = VIEWPORT.center[1] - (y - VIEWPORT.height / 2) * degreesPerPixel;
  return [lon, lat];
}
