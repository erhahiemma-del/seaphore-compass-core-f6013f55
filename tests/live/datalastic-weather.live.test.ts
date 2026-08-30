/**
 * Live proof that marine conditions come back and parse.
 *
 * The parser reads a nested shape — `weather.current` — and applies the
 * provider's own UTC offset to a local wall-clock string. Both are the kind
 * of thing a fixture agrees with and a live provider does not, so this
 * drives the real endpoint.
 *
 * Skips without a credential: an absent secret is not a broken build.
 */
import { describe, expect, it } from "vitest";

import { getMarineWeather } from "@/lib/server/datalastic.server";

const CONFIGURED = Boolean(process.env["DATALASTIC_API_KEY"]);

/** The Lagos approaches, where the anchorage sea state actually matters. */
const LAGOS = { lat: 6.4, lon: 3.4 };

describe.skipIf(!CONFIGURED)("Datalastic weather, live", () => {
  it("returns sea state, not just air temperature", async () => {
    const result = await getMarineWeather(LAGOS);

    expect(result.status).toBe("ok");
    const w = result.data;
    expect(w).not.toBeNull();

    /*
     * Wave height is the reason this endpoint is worth a request. A
     * response carrying only air temperature would be a weather widget,
     * not a maritime one.
     */
    expect(w!.waveHeightM).not.toBeNull();
    expect(w!.windSpeedKph).not.toBeNull();
  }, 45_000);

  it("carries the provider's own observation time, never a substitute", async () => {
    const result = await getMarineWeather(LAGOS);
    const observedAt = result.data?.observedAt;

    expect(observedAt).toBeTruthy();
    const at = Date.parse(String(observedAt));
    expect(Number.isNaN(at)).toBe(false);
    // A recent reading, not a placeholder epoch and not the future.
    expect(at).toBeGreaterThan(Date.now() - 7 * 24 * 60 * 60_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60_000);
  }, 45_000);

  /*
   * The cost control. Two vessels a few kilometres apart must resolve to
   * one request, or an anchorage of four hundred becomes four hundred
   * paid calls for the same patch of water.
   */
  it("answers neighbouring points from one cached request", async () => {
    const first = await getMarineWeather({ lat: 6.41, lon: 3.41 });
    const second = await getMarineWeather({ lat: 6.43, lon: 3.43 });

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    // The second was served from cache rather than bought again.
    expect(second.cached).toBe(true);
  }, 45_000);
});

describe.skipIf(CONFIGURED)("Datalastic weather without a credential", () => {
  it("refuses rather than reporting a calm sea", async () => {
    const result = await getMarineWeather(LAGOS);

    expect(result.status).toBe("credentials-missing");
    expect(result.data).toBeNull();
  });
});
