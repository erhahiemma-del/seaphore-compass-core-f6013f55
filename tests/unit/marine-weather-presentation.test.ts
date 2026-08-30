/**
 * Rendering sea state.
 *
 * The fixture is the real shape `/weather` returned for the Lagos
 * approaches. What matters most is the refusals: an omitted swell must not
 * render as a calm sea, and an unreachable provider must not render as
 * settled weather — both would be a fabricated reassurance about the one
 * thing a small craft's crew would check before going out.
 */
import { describe, expect, it } from "vitest";

import type { DatalasticMarineConditions } from "@/connectors/datalastic/types";
import { presentMarineConditions } from "@/features/maritime/vessel-presentation";

const LAGOS: DatalasticMarineConditions = {
  lat: 6.375,
  lon: 3.375,
  observedAt: "2026-08-30T01:30:00.000Z",
  temperatureC: 26,
  windSpeedKph: 15.7,
  windDirectionDeg: 239,
  windGustsKph: 18.1,
  waveHeightM: 1.3,
  waveDirectionDeg: 212,
  wavePeriodS: 8.7,
  visibilityM: 24140,
  pressureHpa: 1012.8,
  cloudCoverPct: 89,
  humidityPct: 85,
};

const by = (rows: readonly { label: string }[], label: string) =>
  rows.find((r) => r.label === label)!;

describe("sea state", () => {
  it("leads with the readings that decide whether a boat can work", () => {
    const rows = presentMarineConditions(LAGOS);

    expect(by(rows, "Wave height").value).toBe("1.30 m");
    expect(by(rows, "Wave period").value).toBe("8.7 s");
    expect(by(rows, "Wind").value).toMatch(/15.7 km\/h from WSW/);
  });

  /*
   * A mariner reads a direction as a compass point. 212° is SSW; printing
   * the degrees alone makes the reader do the conversion at the moment
   * they are least able to.
   */
  it("gives directions as compass points as well as degrees", () => {
    const rows = presentMarineConditions(LAGOS);

    expect(by(rows, "Wave direction").value).toBe("SSW (212°)");
  });

  it("attributes the reading and its observation time", () => {
    const rows = presentMarineConditions(LAGOS);
    const observed = by(rows, "Observed");

    expect(observed.value).toBe("2026-08-30 01:30 UTC");
    expect(observed.provenance).toBe("Datalastic /weather");
  });
});

describe("absences are never calm water", () => {
  /*
   * The dangerous rendering. A missing swell shown as 0.00 m says the sea
   * is flat, which is the most reassuring possible lie.
   */
  it("says the provider gave no reading rather than showing zero", () => {
    const rows = presentMarineConditions({ ...LAGOS, waveHeightM: null, windSpeedKph: null });

    for (const label of ["Wave height", "Wind"]) {
      const row = by(rows, label);
      expect(row.value).toBeUndefined();
      expect(row.reason).toMatch(/no reading/i);
    }
  });

  it("says a provider failure is a collection failure, not a calm sea", () => {
    const rows = presentMarineConditions(null, { failed: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toMatch(/collection failure/i);
    expect(rows[0].reason).toMatch(/not a calm sea/i);
  });

  it("separates not-loaded from no-reading", () => {
    const notLoaded = presentMarineConditions(null);
    expect(notLoaded[0].availability).toBe("UNKNOWN");
    expect(notLoaded[0].reason).toMatch(/not loaded/i);

    expect(presentMarineConditions(null, { loading: true })[0].reason).toMatch(/loading/i);
  });

  /*
   * A reading with no observation time cannot be aged, and weather ages
   * fast. Substituting the retrieval time would date the sea state to the
   * moment an officer opened the drawer.
   */
  it("refuses to age a reading the provider did not timestamp", () => {
    const rows = presentMarineConditions({ ...LAGOS, observedAt: null });
    const observed = by(rows, "Observed");

    expect(observed.value).toBeUndefined();
    expect(observed.reason).toMatch(/cannot be aged/i);
  });

  it("leaves no row silent", () => {
    for (const rows of [
      presentMarineConditions(LAGOS),
      presentMarineConditions(null),
      presentMarineConditions(null, { failed: true }),
    ]) {
      expect(rows.every((r) => Boolean(r.value) || Boolean(r.reason))).toBe(true);
    }
  });
});
