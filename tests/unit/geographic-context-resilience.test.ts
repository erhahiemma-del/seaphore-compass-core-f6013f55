/**
 * A supplemental layer must never make the map worse when it fails.
 *
 * The failure this file exists to prevent was not a crash and not an
 * error. Beyond its coverage the imagery service *succeeds*: HTTP 200,
 * `image/jpeg`, a valid picture — of a flat grey card reading "Map data
 * not yet available". Measured at 2.5 KB against 5–24 KB for real
 * imagery, at every location past coverage.
 *
 * Nothing downstream could tell the two apart. MapLibre had no error to
 * detect, so it painted the card, and the raster layer is fully opaque
 * from zoom 15.5, so the card covered the vector geography underneath.
 * The officer zoomed into a harbour and the map turned grey and printed
 * an error across itself: the deeper they looked, the less they saw.
 *
 * The rule these tests hold is the one the failure broke — geography is
 * the base, imagery is an enhancement, and an enhancement that cannot
 * load must cost nothing but itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GEOGRAPHIC_CONTEXT_MAX_ZOOM,
  GEOGRAPHIC_CONTEXT_TILES,
  GEOGRAPHIC_CONTEXT_ZOOM,
  VECTOR_SOURCE_MAX_ZOOM,
} from "@/services/geospatial/constants";

const RENDERER = readFileSync(
  resolve(process.cwd(), "src/services/geospatial/renderers/maplibre-renderer.ts"),
  "utf8",
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const CODE = stripComments(RENDERER);

describe("the imagery service is asked to fail rather than to substitute", () => {
  it("requests a real failure instead of a placeholder picture", () => {
    /*
     * Load-bearing, not a tuning parameter. Without it the service
     * answers out-of-coverage requests with a grey card that every layer
     * below this one is powerless to distinguish from a photograph.
     */
    expect(GEOGRAPHIC_CONTEXT_TILES).toContain("blankTile=false");
  });

  it("stops asking at the depth the service can answer", () => {
    /*
     * Coverage is photography: it ends at different depths in different
     * places. Past this the source is overzoomed rather than queried, so
     * the deepest real tile is stretched instead of leaving a hole.
     */
    expect(GEOGRAPHIC_CONTEXT_MAX_ZOOM).toBeGreaterThan(GEOGRAPHIC_CONTEXT_ZOOM.full);
    expect(CODE).toContain("maxzoom: GEOGRAPHIC_CONTEXT_MAX_ZOOM");
  });

  it("exists to go past where the vector source stops", () => {
    // The whole reason for the layer. If it began after the vector
    // ceiling there would be a band with neither.
    expect(GEOGRAPHIC_CONTEXT_ZOOM.fadeIn).toBeLessThanOrEqual(VECTOR_SOURCE_MAX_ZOOM);
  });
});

describe("a missing photograph is not a fault", () => {
  it("never reports an absent imagery tile as a map error", () => {
    /*
     * Asking for 404s means every tile outside coverage arrives at the
     * error handler — which sets `rendererStatus: "error"` and prints
     * the message in the status bar. Without this the fix would have
     * traded a grey map for a technical diagnostic naming the provider
     * and the URL.
     */
    expect(CODE).toContain("isGeographicContextTileEvent");
    const handler = CODE.slice(CODE.indexOf('map.on("error"'));
    const suppression = handler.indexOf("isGeographicContextTileEvent");
    const emission = handler.indexOf('this.bus?.emit("map:error"');
    expect(suppression).toBeGreaterThan(-1);
    // The suppression must come first, or the error is emitted anyway.
    expect(suppression).toBeLessThan(emission);
  });

  it("suppresses only absent imagery, never errors in general", () => {
    /*
     * Most map errors mean the map is genuinely broken and the officer
     * needs to know. This narrows to one expected, harmless condition.
     */
    expect(CODE).toContain('event?.sourceId === "geographic-context"');
    expect(CODE).toContain("blankTile=false");
    // Still emits for everything else.
    expect(CODE).toContain('this.bus?.emit("map:error"');
  });

  it("does not swap the basemap because a photograph is missing", () => {
    // Losing imagery is cosmetic. Losing the basemap is not, and the
    // fallback style needs a key this deployment does not have.
    const handler = CODE.slice(CODE.indexOf('map.on("error"'));
    const suppression = handler.indexOf("isGeographicContextTileEvent");
    const styleSwap = handler.indexOf("map.setStyle(FALLBACK_BASEMAP)");
    expect(suppression).toBeLessThan(styleSwap);
  });
});

describe("geography is the base and imagery is the enhancement", () => {
  it("installs imagery below everything operational", () => {
    /*
     * Ordering is the honesty rule as much as a visual one: imagery is
     * the ground, and vessels, ports and incidents are what Seaphore
     * observed on it. A ship in a tile is scenery; a vessel on the map
     * is a report.
     */
    /*
     * The order layers are *installed* in, not the order their ids are
     * declared in. An earlier version of this compared `indexOf` against
     * the whole file and passed by matching the `LAYER_IDS` table at the
     * top — it asserted the shape of a constant rather than anything the
     * renderer does.
     */
    const installed = [...CODE.matchAll(/addLayer\(\{\s*id:\s*LAYER_IDS\.(\w+)/g)].map(
      (match) => match[1]!,
    );
    expect(installed).toContain("geographicContext");
    const imagery = installed.indexOf("geographicContext");
    for (const operational of ["vessels", "ports"]) {
      expect(installed, `${operational} is not installed`).toContain(operational);
      expect(imagery, `imagery draws above ${operational}`).toBeLessThan(
        installed.indexOf(operational),
      );
    }
  });

  it("fades in rather than switching", () => {
    // An abrupt swap at a zoom threshold reads as the map breaking.
    expect(GEOGRAPHIC_CONTEXT_ZOOM.fadeIn).toBeLessThan(GEOGRAPHIC_CONTEXT_ZOOM.full);
    expect(CODE).toContain('"raster-opacity"');
  });

  it("keeps the condition observable without showing it to anyone", () => {
    /*
     * A map drawing vector geography because there is no photograph
     * looks exactly like one whose photographs have not arrived yet.
     * This is how a verification run tells them apart — and it drives
     * nothing on screen, because absent imagery is a normal state of
     * the map rather than something to report.
     */
    expect(CODE).toContain("missingGeographicContextTiles");
  });
});

describe("nothing names a port", () => {
  it("carries no per-location imagery behaviour", () => {
    /*
     * Coverage varies by geography, so the temptation is a table of
     * depths per harbour. That would be wrong twice: it would drift the
     * moment the provider reflies an area, and it would put an
     * implementation branch where the canonical registry belongs.
     */
    for (const port of ["Onne", "Apapa", "Lekki", "Calabar", "Warri", "Tin Can"]) {
      expect(CODE, `renderer special-cases ${port}`).not.toContain(port);
    }
  });
});
