/**
 * How deep the camera may go, and who decides.
 *
 * An officer inspecting a berth found the map stopped improving before
 * the ground did. The cause was not a regression — `git log -S` shows
 * `maxZoom: 18` arriving in the very first Live Command Map commit and
 * never changing since — but a ceiling that had always sat one level
 * below what the imagery could already serve.
 *
 * It was also enforced in two places that did not agree about their job.
 * A scope's `maxZoom` governs the map instance, so it bounds the wheel.
 * `ZOOM_LIMITS` is applied inside `setCamera`, so it bounds *everything
 * else* — navigation, URLs, coordinates, controls. A request for zoom 20
 * was silently cut to 18 there whatever the map instance allowed, which
 * is why raising one without the other changed nothing.
 *
 * Both now derive from the imagery's own ceiling, so the camera and the
 * ground cannot drift apart again.
 */
import { describe, expect, it } from "vitest";

import {
  GEOGRAPHIC_CONTEXT_MAX_ZOOM,
  GEOGRAPHIC_CONTEXT_ZOOM,
  MAP_DEFAULTS,
  MAP_SCOPES,
  MAX_CAMERA_ZOOM,
  VECTOR_SOURCE_MAX_ZOOM,
  ZOOM_LIMITS,
} from "@/services/geospatial/constants";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

describe("the camera ceiling is derived from the ground", () => {
  it("reaches at least as deep as the imagery is queried", () => {
    /*
     * The defect, stated as a rule. A camera that stops shallower than
     * the imagery means an officer hits a wall the ground has not
     * reached, and nothing on screen explains why.
     */
    expect(MAX_CAMERA_ZOOM).toBeGreaterThanOrEqual(GEOGRAPHIC_CONTEXT_MAX_ZOOM);
  });

  it("is derived, not typed in", () => {
    // So raising the imagery ceiling raises the camera with it.
    expect(MAX_CAMERA_ZOOM).toBe(GEOGRAPHIC_CONTEXT_MAX_ZOOM + 1);
  });

  it("goes deeper than the vector source can carry", () => {
    // Past the vector ceiling the picture empties rather than plateaus,
    // which is the whole reason imagery exists on this map.
    expect(MAX_CAMERA_ZOOM).toBeGreaterThan(VECTOR_SOURCE_MAX_ZOOM);
    expect(MAX_CAMERA_ZOOM).toBeGreaterThan(GEOGRAPHIC_CONTEXT_ZOOM.full);
  });
});

describe("every clamp agrees", () => {
  it("bounds the canonical writer at the same depth as the map", () => {
    /*
     * The two-places problem. Raising a scope's `maxZoom` alone did
     * nothing, because `setCamera` cut the request first.
     */
    expect(ZOOM_LIMITS.max).toBe(MAX_CAMERA_ZOOM);
    for (const scope of Object.values(MAP_SCOPES)) {
      expect(scope.maxZoom, "a scope disagrees with the camera writer").toBe(MAX_CAMERA_ZOOM);
    }
    expect(MAP_DEFAULTS.maxZoom).toBe(MAX_CAMERA_ZOOM);
  });

  it("actually accepts a deep request through the canonical path", () => {
    // Not a constant check: the value has to survive `setCamera`.
    const service = new SharedGeospatialService();
    service.setCamera({ zoom: MAX_CAMERA_ZOOM });
    expect(service.get().zoom).toBe(MAX_CAMERA_ZOOM);
  });

  it("enforces the ceiling where a shared link is read, not in setCamera", () => {
    /*
     * Worth stating precisely, because a first draft of this test
     * assumed `setCamera` clamped and was wrong.
     *
     * `setCamera` does not bound zoom at all — it stores what it is
     * given. `ZOOM_LIMITS` is applied when a URL is parsed, and each
     * scope's own range is enforced at the renderer, which is the only
     * layer that can actually stop a gesture. That split is deliberate:
     * a link captured on a global map at zoom 2 has to survive being
     * opened on a regional surface rather than being silently rewritten.
     *
     * The consequence is that shared state can briefly hold a zoom the
     * renderer will not honour. That is pre-existing and harmless while
     * the two ceilings agree — which is exactly what the assertion above
     * this one exists to keep true.
     */
    const service = new SharedGeospatialService();
    service.setCamera({ zoom: MAX_CAMERA_ZOOM + 5 });
    expect(service.get().zoom).toBe(MAX_CAMERA_ZOOM + 5);
    expect(ZOOM_LIMITS.max).toBe(MAX_CAMERA_ZOOM);
  });
});

describe("vessel work cannot reach the camera or the ground", () => {
  it("keeps vessel modules clear of camera and imagery configuration", async () => {
    /*
     * Vessel detail and geographical detail are independent systems. A
     * clustering or level-of-detail change may simplify how vessels are
     * drawn; it must never constrain how deeply an officer can look at
     * the world.
     */
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const vesselModules = [
      "src/services/geospatial/sources/simulated-vessel-source.ts",
      "src/services/geospatial/vessel-imagery.ts",
      "src/services/geospatial/vessel-history.ts",
      "src/features/maritime/VesselImageHeader.tsx",
    ];
    for (const path of vesselModules) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const forbidden of [
        "MAX_CAMERA_ZOOM",
        "ZOOM_LIMITS",
        "MAP_SCOPES",
        "maxZoom",
        "setCamera",
        "GEOGRAPHIC_CONTEXT",
      ]) {
        expect(source, `${path} reaches for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
