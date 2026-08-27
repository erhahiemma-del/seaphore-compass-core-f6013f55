/**
 * The map's runtime contract — mount, style, and what survives failure.
 *
 * A blank Maritime Command was reported as a layer-installation bug. It
 * was not: instrumenting the running application showed all nine
 * operational layers installed, `map.loaded()` true, and every network
 * request returning 200. The blank frame was transient, and the thing
 * that made it look permanent was that the diagnostics could not tell an
 * unreachable basemap apart from an application that had failed to
 * install anything.
 *
 * These pin the distinctions that investigation turned on.
 *
 * ## A stalled style is reported, never resolved by a timer
 *
 * The stall timeout speaks and keeps waiting. Resolving on it would let
 * `installSourcesAndLayers` run against a style that does not exist yet,
 * which is how `addLayer` starts throwing on a map the officer can still
 * see. Slow is not the same as broken, and only one of them is worth
 * abandoning a mount for.
 *
 * ## A failing tile is not a failing style
 *
 * Verified in the browser: with the vector tile host returning a CORS
 * error, `load` still fires and every operational layer still installs.
 * Tiles cost geography; they do not cost the operational picture. The
 * error handler must therefore swap the basemap only on a genuine style
 * document failure — a rule that already exists precisely because a
 * broader match once traded a working basemap for a fallback that needed
 * a key this deployment does not hold.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BASEMAP_STYLE, LIGHT_BASEMAP_STYLE } from "@/services/geospatial/constants";

const RENDERER = readFileSync(
  resolve(process.cwd(), "src/services/geospatial/renderers/maplibre-renderer.ts"),
  "utf8",
);

/* ═══════ 1. Mount lifecycle ═══════ */

describe("the mount survives being superseded", () => {
  it("bumps a token and abandons a stale mount", () => {
    /*
     * `mount()` is async. Without this the abandoned call resumes after
     * the await and installs its sources onto whichever map is current —
     * the new one, which has just installed them itself.
     */
    expect(RENDERER).toContain("if (token !== this.mountToken)");
  });

  it("checks the token again after every await", () => {
    // One check is not enough: each await is a fresh opportunity for the
    // host to tear down and remount.
    const checks = RENDERER.match(/token !== this\.mountToken/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(2);
  });

  it("verifies what actually installed rather than assuming", () => {
    expect(RENDERER).toContain("verifyInstalledLayers");
    expect(RENDERER).toContain("INSTALLED_RENDER_LAYERS.filter((id) => !map.getLayer(id))");
  });

  it("distinguishes nothing installed from something declined", () => {
    /*
     * Zero layers means the mount failed. A subset means the engine
     * refused specific layers — usually an invalid expression, which
     * MapLibre declines silently. Different causes, different fixes.
     */
    expect(RENDERER).toContain("No operational layer installed");
    expect(RENDERER).toContain("The map engine declined");
  });
});

/* ═══════ 2. Style stall ═══════ */

describe("a stalled style is reported, not resolved", () => {
  const stall = RENDERER.slice(
    RENDERER.indexOf("private awaitStyleLoad"),
    RENDERER.indexOf("private verifyInstalledLayers"),
  );

  it("has a stall guard at all", () => {
    expect(stall).toContain("setTimeout");
    expect(stall).toContain("has not finished loading");
  });

  it("does not resolve the promise from the timer", () => {
    /*
     * The whole point. A timer that resolved would hand
     * `installSourcesAndLayers` a style that is not there.
     */
    const timerBody = stall.slice(stall.indexOf("setTimeout"), stall.indexOf("map.once"));
    expect(timerBody).not.toContain("resolve()");
  });

  it("resolves only on the engine's own load event", () => {
    expect(stall).toContain('map.once("load"');
    expect(stall).toMatch(/clearTimeout\(stall\);\s*resolve\(\);/);
  });

  it("recovers the one condition that never recovers on its own", () => {
    /*
     * Measured against this engine: a good style loads; a style replaced
     * mid-load still fires `load`; a failed style replaced afterwards
     * fires `load` for the replacement. Only a style document that fails
     * with nothing replacing it never fires `load` at all — zero
     * installed layers for the life of the page.
     *
     * The message-matching error handler cannot be relied on to catch
     * that, because it matches on wording. The stall is observable, so
     * the stall triggers the swap.
     */
    expect(stall).toContain("!this.styleFailed && !map.isStyleLoaded()");
    expect(stall).toContain("map.setStyle(FALLBACK_BASEMAP)");
  });

  it("attempts the fallback at most once from the stall", () => {
    // A fallback that also fails must not start the map thrashing
    // between two styles it cannot load.
    expect(stall).toContain("this.styleFailed = true");
  });

  it("does not swap a style that did load", () => {
    // The stall can also fire because something downstream is slow. A
    // swap in that case would discard a working basemap.
    expect(stall).toMatch(/!map\.isStyleLoaded\(\)/);
  });

  it("says the map is empty rather than only that a host is down", () => {
    // The officer's question is "why is there nothing there", not "which
    // CDN is unreachable".
    expect(stall).toContain("No operational layer has been installed");
  });
});

/* ═══════ 3. Basemap failure is not application failure ═══════ */

describe("a failing tile does not cost the operational picture", () => {
  it("swaps the basemap only on a genuine style document failure", () => {
    /*
     * Verified in the browser: a CORS-blocked vector tile still lets
     * `load` fire and every operational layer install. A broader match
     * here once traded a working CARTO style for a fallback needing a key
     * this deployment does not have, and the map went black and stayed
     * black.
     */
    expect(RENDERER).toContain("styleDocumentFailed");
    const pattern = /const styleDocumentFailed = ([\s\S]*?);/.exec(RENDERER)?.[1] ?? "";
    expect(pattern).toContain("style");
    // A bare sprite or glyph 404 is routine and must not trigger a swap.
    expect(pattern).not.toMatch(/sprite|glyph/i);
  });

  it("swaps at most once", () => {
    // Without the latch a failing fallback re-enters the handler and the
    // map thrashes between two styles it cannot load.
    expect(RENDERER).toContain("!this.styleFailed && styleDocumentFailed");
    expect(RENDERER).toContain("this.styleFailed = true");
  });

  it("names the fallback in the message it emits", () => {
    // A silent style swap makes the next screenshot inexplicable.
    expect(RENDERER).toContain("falling back to ${FALLBACK_BASEMAP}");
  });
});

/* ═══════ 4. Basemap endpoints ═══════ */

describe("the basemaps are key-less and declared once", () => {
  it("uses hosts that need no credential in the browser", () => {
    /*
     * Both CARTO styles are public. A basemap requiring a key would put
     * that key in the client bundle, and the map would be the one place
     * in Seaphore that leaked one.
     */
    for (const style of [BASEMAP_STYLE, LIGHT_BASEMAP_STYLE]) {
      expect(style).toMatch(/^https:\/\//);
      expect(style).not.toMatch(/[?&](key|token|api_key|access_token)=/i);
    }
  });

  it("keeps a distinct light style for institutional surfaces", () => {
    expect(BASEMAP_STYLE).not.toBe(LIGHT_BASEMAP_STYLE);
  });

  it("declares the fallback as a constant rather than inline", () => {
    expect(RENDERER).toMatch(/const FALLBACK_BASEMAP = "https:\/\//);
  });
});
