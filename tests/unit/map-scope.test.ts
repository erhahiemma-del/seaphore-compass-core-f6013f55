/**
 * The camera is not a cage.
 *
 * Nigeria and the Gulf of Guinea remain Seaphore's home context — the
 * opening `center` and `zoom` are unchanged. What these tests protect is
 * that "home" never becomes "boundary" again.
 *
 * The regression being guarded against was measured on the running map,
 * not theorised: with the previous `regional` default, `maxBounds` was
 * narrower than the viewport at zoom 5, so the camera froze outright.
 * Every pan target returned the same coordinate — including a request to
 * return to Nigeria's own centre.
 */
import { describe, expect, it } from "vitest";

import {
  MAP_DEFAULTS,
  MAP_SCOPES,
  SharedGeospatialService,
  graticuleFeatures,
  type MapScopeId,
} from "@/services/geospatial";

function service() {
  return new SharedGeospatialService({ urlSync: false });
}

describe("the map opens on Nigeria but is not bounded by it", () => {
  it("defaults to global scope", () => {
    expect(service().get().scope).toBe("global");
  });

  it("keeps the Gulf of Guinea as the opening view", () => {
    // The home context is the camera, not the constraint.
    const state = service().get();
    expect(state.center).toEqual(MAP_DEFAULTS.center);
    expect(state.zoom).toBe(MAP_DEFAULTS.zoom);
  });

  it("places no panning constraint on the default scope", () => {
    const scope = MAP_SCOPES[service().get().scope];
    expect(scope.maxBounds).toBeNull();
  });

  it("allows zooming out far enough to see the world", () => {
    expect(MAP_SCOPES.global.minZoom).toBeLessThan(MAP_DEFAULTS.minZoom);
    expect(MAP_SCOPES.global.minZoom).toBe(1);
  });

  it("retains the regional scope for surfaces that ask for it", () => {
    // Removing it would be a different decision from un-defaulting it.
    expect(MAP_SCOPES.regional.maxBounds).not.toBeNull();
    expect(MAP_SCOPES.regional.minZoom).toBe(4);
  });
});

describe("scope survives reload, navigation and shared links", () => {
  it("round-trips through the URL", () => {
    const a = service();
    a.setScope("regional");
    const search = a.toSearchParams().toString();
    expect(search).toContain("scope=regional");

    const b = service();
    b.loadFromURL(`?${search}`);
    expect(b.get().scope).toBe("regional");
  });

  it("omits the default to keep links short", () => {
    const s = service();
    expect(s.get().scope).toBe("global");
    expect(s.toSearchParams().toString()).not.toContain("scope=");
  });

  it("restores global from a link that pins it back", () => {
    const s = service();
    s.setScope("regional");
    s.loadFromURL("?scope=global");
    expect(s.get().scope).toBe("global");
  });

  /*
   * A truncated or hand-edited link must not silently re-cage the map.
   * Ignoring the value leaves the default, which is open.
   */
  it("ignores an unknown scope rather than falling back to regional", () => {
    const s = service();
    s.loadFromURL("?scope=lagos-only");
    expect(s.get().scope).toBe("global");
  });

  it("notifies subscribers so every surface follows one choice", () => {
    const s = service();
    const seen: MapScopeId[] = [];
    s.subscribe((state) => seen.push(state.scope));
    s.setScope("regional");
    expect(seen).toContain("regional");
  });
});

describe("the graticule is continuous worldwide", () => {
  it("spans the globe at the default scope", () => {
    const g = graticuleFeatures(
      MAP_SCOPES.global.extent as never,
      MAP_SCOPES.global.graticuleSteps,
    );
    const lons = g.features
      .filter((f) => f.properties.axis === "meridian")
      .map((f) => f.properties.degrees);
    expect(Math.min(...lons)).toBeLessThanOrEqual(-180);
    expect(Math.max(...lons)).toBeGreaterThanOrEqual(180);
  });

  it("gives every world line the same opacity tier, leaving no gaps", () => {
    // With `[30, 10]` every thirtieth meridian tagged 30 and fell to the
    // finest ramp, invisible until zoom 7.5 — a gap every third line.
    const g = graticuleFeatures(
      MAP_SCOPES.global.extent as never,
      MAP_SCOPES.global.graticuleSteps,
    );
    const steps = new Set(g.features.map((f) => f.properties.step));
    expect([...steps]).toEqual([10]);
  });

  it("stays small enough to be free", () => {
    const g = graticuleFeatures(
      MAP_SCOPES.global.extent as never,
      MAP_SCOPES.global.graticuleSteps,
    );
    expect(g.features.length).toBeLessThan(80);
  });
});

describe("zoom limits come from the active scope", () => {
  it("differs between scopes, so a control reading one constant is wrong", () => {
    // The toolbar clamped to MAP_DEFAULTS (4-18) and therefore disabled
    // zoom-out below 4 even when the map itself allowed 1.
    expect(MAP_SCOPES.global.minZoom).not.toBe(MAP_SCOPES.regional.minZoom);
    expect(MAP_DEFAULTS.minZoom).toBe(MAP_SCOPES.regional.minZoom);
  });
});
