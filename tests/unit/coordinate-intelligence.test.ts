/**
 * Spatial reading — the arithmetic, and what it refuses.
 *
 * The projection is pure Web Mercator over the camera the shared service
 * already holds, so the readout needs no map reference. That is not
 * tidiness: an overlay unprojecting through MapLibre would be a second
 * thing reading the camera, and the two would disagree the moment one
 * lagged a frame.
 *
 * Parsing gets the same treatment as everything else that resolves an
 * officer's input — it returns null rather than a guess, because
 * navigating somewhere on a misread coordinate is worse than declining to
 * move.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatLatitude,
  formatLongitude,
  parseCoordinates,
  screenToLngLat,
} from "@/features/maritime/coordinate-math";
import { MAP_ZONE, anchorOf, type MapZone } from "@/features/maritime/map-zones";

const HUD = readFileSync(resolve(process.cwd(), "src/features/maritime/CoordinateHud.tsx"), "utf8");

const VIEWPORT = { center: [3.342167, 6.428333] as const, zoom: 12, width: 1000, height: 800 };

describe("screen position resolves to geography", () => {
  it("returns the camera centre at the centre of the container", () => {
    const centre = screenToLngLat({ x: 500, y: 400 }, VIEWPORT);
    expect(centre![0]).toBeCloseTo(3.342167, 6);
    expect(centre![1]).toBeCloseTo(6.428333, 6);
  });

  it("moves east to the right and north upward", () => {
    const right = screenToLngLat({ x: 700, y: 400 }, VIEWPORT)!;
    const up = screenToLngLat({ x: 500, y: 200 }, VIEWPORT)!;
    expect(right[0]).toBeGreaterThan(3.342167);
    expect(up[1]).toBeGreaterThan(6.428333);
  });

  it("covers less ground as the officer zooms in", () => {
    const wide = screenToLngLat({ x: 1000, y: 400 }, { ...VIEWPORT, zoom: 8 })!;
    const close = screenToLngLat({ x: 1000, y: 400 }, { ...VIEWPORT, zoom: 16 })!;
    expect(Math.abs(wide[0] - 3.342167)).toBeGreaterThan(Math.abs(close[0] - 3.342167));
  });

  it("wraps longitude but clamps latitude", () => {
    /*
     * Panning west past the antimeridian is ordinary navigation and
     * should report -179°. Dragging above the Mercator limit is not —
     * there is no such place on this projection.
     */
    const wrapped = screenToLngLat(
      { x: 500, y: 400 },
      { ...VIEWPORT, center: [179.9, 6.4], zoom: 2 },
    )!;
    expect(wrapped[0]).toBeGreaterThanOrEqual(-180);
    expect(wrapped[0]).toBeLessThanOrEqual(180);
    const high = screenToLngLat({ x: 500, y: -100000 }, VIEWPORT)!;
    expect(high[1]).toBeLessThanOrEqual(85.051129);
  });

  it("declines a container that has not laid out", () => {
    // Arithmetically valid, operationally meaningless.
    expect(screenToLngLat({ x: 0, y: 0 }, { ...VIEWPORT, width: 0 })).toBeNull();
  });
});

describe("positions are written the way a chart writes them", () => {
  it("uses degrees and decimal minutes, with hemispheres", () => {
    /*
     * Not decimal degrees. Charts, NPA publications and the handbook that
     * gave Tin Can its coordinate are all in degrees and minutes, and a
     * readout an officer must convert is one they stop consulting.
     */
    expect(formatLatitude(6.428333)).toBe("06° 25.700' N");
    expect(formatLongitude(3.342167)).toBe("003° 20.530' E");
  });

  it("names the other hemispheres correctly", () => {
    expect(formatLatitude(-33.9)).toContain("S");
    expect(formatLongitude(-95.05)).toContain("W");
  });

  it("pads longitude to three degrees, as on a chart", () => {
    expect(formatLongitude(3.342167).startsWith("003")).toBe(true);
  });

  it("round-trips Tin Can's published position", () => {
    // The same figures the NPA handbook gives, formatted back.
    expect(formatLatitude(6 + 25.7 / 60)).toBe("06° 25.700' N");
    expect(formatLongitude(3 + 20.53 / 60)).toBe("003° 20.530' E");
  });
});

describe("parsing accepts what an officer actually writes", () => {
  it("reads degrees and minutes with hemispheres", () => {
    const parsed = parseCoordinates("06° 25.7' N 003° 20.53' E")!;
    expect(parsed[1]).toBeCloseTo(6.428333, 4);
    expect(parsed[0]).toBeCloseTo(3.342167, 4);
  });

  it("reads decimals with hemispheres", () => {
    const parsed = parseCoordinates("6.4283 N, 3.3422 E")!;
    expect(parsed[1]).toBeCloseTo(6.4283, 4);
  });

  it("reads a bare pair as latitude first", () => {
    // The convention everywhere a position is written without labels.
    const parsed = parseCoordinates("6.428333, 3.342167")!;
    expect(parsed).toEqual([3.342167, 6.428333]);
  });

  it("honours southern and western hemispheres", () => {
    const parsed = parseCoordinates("33.9 S, 18.4 E")!;
    expect(parsed[1]).toBeLessThan(0);
  });

  it("returns null rather than guessing", () => {
    /*
     * Navigating somewhere on a misread coordinate is worse than
     * declining to move — the officer would have no reason to doubt it.
     */
    for (const bad of ["", "somewhere near Lagos", "999, 999", "abc, def", "91, 0"]) {
      expect(parseCoordinates(bad), bad).toBeNull();
    }
  });
});

describe("the readout is an instrument, not a camera", () => {
  it("navigates through the canonical path", () => {
    // No `setCamera` here. A second camera caller is exactly what the
    // navigation layer exists to prevent.
    const code = HUD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("navigateToCoordinates");
    /*
     * Camera-driving calls only. The container selector
     * `.maplibregl-map` is legitimate and necessary — the guides have to
     * measure the element they draw over. Asserting against the string
     * "maplibre" banned that too, which is the difference between "holds
     * no camera authority" and "may not mention the map".
     */
    for (const forbidden of ["setCamera", "flyTo(", "jumpTo(", "easeTo(", "setZoom("]) {
      expect(code, `HUD drives the camera via ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps pointer work off the render path", () => {
    // Pointer events outrun any sensible re-render.
    expect(HUD).toContain("requestAnimationFrame");
    expect(HUD).toContain("cancelAnimationFrame");
  });

  it("lets the guides fade rather than vanish", () => {
    // An officer glancing away and back should not have to move the
    // pointer to get the reading again.
    expect(HUD).toContain("IDLE_FADE_MS");
    expect(HUD).toContain("transition-opacity");
  });

  it("never intercepts a map drag", () => {
    expect(HUD).toContain("pointer-events-none absolute inset-0");
  });

  it("occupies a declared zone", () => {
    expect(HUD).toContain("MAP_ZONE.RIGHT_READOUT");
  });

  it("takes an edge nothing else claims", () => {
    /*
     * The top-right is the contextual drawer's and the bottom-right
     * belongs to the legend and the assistant. Mid-height is the one edge
     * an officer's eye reaches without leaving the chart.
     */
    const anchors = (Object.keys(MAP_ZONE) as MapZone[]).map(anchorOf);
    expect(new Set(anchors).size).toBe(anchors.length);
  });
});
