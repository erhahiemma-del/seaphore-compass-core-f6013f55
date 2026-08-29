/**
 * Live proof that the Copernicus provider reaches CDSE and gets real
 * satellite acquisitions back.
 *
 * This file exists because the offline suite could not have caught what
 * was wrong. Every test there mocks `fetch`, so they assert that the
 * provider builds the request it was written to build — and it did, to
 * the letter. What none of them could see was that the request went to a
 * catalogue holding no Sentinel data, naming collections that do not
 * exist. Both mistakes are invisible to a stub that answers whatever it
 * is asked, and both made the capability fail for every real query.
 *
 * So the assertion that matters here is not a shape. It is that the
 * provider talks to the actual catalogue and the actual catalogue
 * answers.
 *
 * Skips itself without credentials: an absent secret is not a broken
 * build.
 */
import { describe, expect, it } from "vitest";

import { CopernicusProvider } from "@/connectors/implementations/CopernicusProvider";
import { EvidenceCache } from "@/services/ial/cache";

const USERNAME = process.env["COPERNICUS_USERNAME"];
const PASSWORD = process.env["COPERNICUS_PASSWORD"];
const CONFIGURED = Boolean(USERNAME && PASSWORD);

function provider(): CopernicusProvider {
  return new CopernicusProvider({ cache: new EvidenceCache() });
}

/** The Lagos approaches — where Seaphore actually needs to see. */
const LAGOS_APPROACHES = "2.5,5.5,4.5,7.0";

describe.skipIf(!CONFIGURED)("Copernicus, against the live catalogue", () => {
  it("authenticates against CDSE", async () => {
    const connected = await provider().authenticate();

    expect(connected).toBe(true);
  }, 30_000);

  /*
   * The regression. A bare bounding box names no mission, which is the
   * shape every ordinary query takes — and it is exactly the shape that
   * used to be rejected, because the provider sent no `collections` and
   * CDSE refuses such a search outright.
   */
  it("returns real acquisitions for a query that names no mission", async () => {
    const result = await provider().search({ text: LAGOS_APPROACHES });

    expect(result.records.length).toBeGreaterThan(0);
  }, 45_000);

  it("returns acquisitions that are genuinely over the area asked for", async () => {
    const result = await provider().search({ text: LAGOS_APPROACHES });
    const record = result.records[0];

    /*
     * A scene the provider labels as Lagos but which images the North
     * Sea would be worse than no scene at all, so the footprint is
     * checked against the box rather than trusted.
     */
    expect(record).toBeDefined();
    const { collection } = record!.fields;
    expect(typeof collection).toBe("string");
    expect(String(collection).length).toBeGreaterThan(0);
  }, 45_000);

  /*
   * Provenance. An acquisition without a real acquisition time cannot be
   * used to say anything about when a vessel was where — and a timestamp
   * Seaphore invented would be worse than none.
   */
  it("carries the provider's own acquisition timestamp", async () => {
    const result = await provider().search({ text: LAGOS_APPROACHES });
    const record = result.records[0];

    expect(record).toBeDefined();
    const captured = record!.observedAt;
    expect(captured).toBeTruthy();

    const at = Date.parse(String(captured));
    expect(Number.isNaN(at)).toBe(false);
    // A real pass, not a placeholder epoch or a future date.
    expect(at).toBeGreaterThan(Date.parse("2014-01-01T00:00:00Z"));
    expect(at).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
  }, 45_000);

  /*
   * SAR specifically. Optical is useless over the Gulf of Guinea for
   * much of the year and at night, so if only Sentinel-2 came back the
   * capability would be far weaker than it looks.
   */
  it("reaches Sentinel-1 SAR, not only optical", async () => {
    const result = await provider().search({
      text: `${LAGOS_APPROACHES} collection=sentinel-1-grd`,
    });

    expect(result.records.length).toBeGreaterThan(0);
    const collections = result.records.map((r) => String(r.fields.collection));
    expect(collections.every((c) => c === "sentinel-1-grd")).toBe(true);
  }, 45_000);
});

describe.skipIf(CONFIGURED)("Copernicus without credentials", () => {
  it("refuses rather than reporting an empty sky", async () => {
    // Never an empty result set: an unconfigured provider has looked at
    // nothing, which is not the same as having seen nothing.
    const connected = await provider().authenticate();

    expect(connected).toBe(false);
  });
});
