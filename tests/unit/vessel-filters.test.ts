/**
 * Vessel filters, proved against the rendered population.
 *
 * `MapFilters` previously declared four dimensions, had one setter nobody
 * called and no reader at all. It typechecked, it serialised, and it
 * changed nothing on the map. So the standard these tests hold is not
 * "the state updated" — it is that a different filter produces a
 * different set of features reaching the renderer.
 *
 * Two rules carry most of the weight.
 *
 * An unreported field never satisfies a filter. Ask for tankers and a
 * vessel whose type nobody published is excluded; ask for nothing and it
 * is shown. Letting unknowns through every filter would return the
 * vessels that answered the officer's question plus the ones that did
 * not, which is not a result set anyone can act on.
 *
 * Filtering narrows the picture, not the record. The engine keeps every
 * vessel a source reported, so a filtered map can still say "3 of 12"
 * rather than quietly claiming 3 is everything.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  activeFilterChips,
  activeFilterCount,
  applyFilters,
  isUnfiltered,
  matchesFilters,
  type MapFilters,
} from "@/services/geospatial/vessel-filter";
import { VesselUpdateEngine } from "@/services/geospatial/update-engine";
import type { Vessel } from "@/services/geospatial/vessel";
import type { MapRenderer } from "@/services/geospatial/renderer";

const NOW = Date.parse("2026-08-27T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function vessel(overrides: {
  imo: string;
  type?: Vessel["identity"]["type"];
  flag?: string;
  mmsi?: string;
  callSign?: string;
  name?: string;
  destination?: string;
  etaHours?: number | null;
  risk?: Vessel["riskLevel"];
  ageHours?: number;
}): Vessel {
  return {
    identity: {
      imo: overrides.imo,
      name: overrides.name ?? `MV ${overrides.imo}`,
      ...(overrides.mmsi ? { mmsi: overrides.mmsi } : {}),
      ...(overrides.callSign ? { callSign: overrides.callSign } : {}),
      ...(overrides.flag ? { flag: overrides.flag } : {}),
      ...(overrides.type ? { type: overrides.type } : {}),
    },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 90,
      speed: 8,
      timestamp: hoursAgo(overrides.ageHours ?? 0),
      ...(overrides.destination ? { destination: overrides.destination } : {}),
      ...(overrides.etaHours !== undefined ? { etaHours: overrides.etaHours } : {}),
    },
    riskLevel: overrides.risk ?? "LOW",
    attentionScore: 0,
  };
}

const TANKER = vessel({ imo: "1000001", type: "TANKER", flag: "NG", destination: "LAGOS" });
const CONTAINER = vessel({ imo: "1000002", type: "CONTAINER", flag: "LR", destination: "ONNE" });
const UNTYPED = vessel({ imo: "1000003", flag: "NG" });
const FLEET = [TANKER, CONTAINER, UNTYPED];

const with_ = (patch: Partial<MapFilters>): MapFilters => ({ ...EMPTY_FILTERS, ...patch });

/* ═══════ 1. The filter changes the set ═══════ */

describe("a filter narrows the result, not merely the state", () => {
  it("returns everything when nothing is narrowed", () => {
    expect(isUnfiltered(EMPTY_FILTERS)).toBe(true);
    expect(applyFilters(FLEET, EMPTY_FILTERS, NOW)).toHaveLength(3);
  });

  it("gives tankers and cargo genuinely different sets", () => {
    /*
     * The specific thing the phase asked to be proved: Ship Type =
     * Tanker must not produce the same result as Ship Type = Container.
     */
    const tankers = applyFilters(FLEET, with_({ vesselType: "TANKER" }), NOW);
    const containers = applyFilters(FLEET, with_({ vesselType: "CONTAINER" }), NOW);
    expect(tankers.map((v) => v.identity.imo)).toEqual(["1000001"]);
    expect(containers.map((v) => v.identity.imo)).toEqual(["1000002"]);
    expect(tankers).not.toEqual(containers);
  });

  it("narrows by flag", () => {
    expect(applyFilters(FLEET, with_({ flag: "NG" }), NOW).map((v) => v.identity.imo)).toEqual([
      "1000001",
      "1000003",
    ]);
  });

  it("matches an identifier across IMO, MMSI, call sign and name", () => {
    const fleet = [vessel({ imo: "9321178", mmsi: "657123456", callSign: "5NAB", name: "Ocean" })];
    for (const query of ["9321178", "657123456", "5nab", "ocea"]) {
      expect(applyFilters(fleet, with_({ identifier: query }), NOW), query).toHaveLength(1);
    }
    expect(applyFilters(fleet, with_({ identifier: "nomatch" }), NOW)).toHaveLength(0);
  });

  it("narrows by declared destination", () => {
    expect(
      applyFilters(FLEET, with_({ destination: "lagos" }), NOW).map((v) => v.identity.imo),
    ).toEqual(["1000001"]);
  });

  it("narrows by risk", () => {
    const fleet = [vessel({ imo: "1", risk: "HIGH" }), vessel({ imo: "2", risk: "LOW" })];
    expect(
      applyFilters(fleet, with_({ riskLevel: "HIGH" }), NOW).map((v) => v.identity.imo),
    ).toEqual(["1"]);
  });

  it("narrows by how recently a position was reported", () => {
    const fleet = [
      vessel({ imo: "fresh", ageHours: 0.5 }),
      vessel({ imo: "mid", ageHours: 5 }),
      vessel({ imo: "old", ageHours: 40 }),
    ];
    expect(
      applyFilters(fleet, with_({ positionAge: "1H" }), NOW).map((v) => v.identity.imo),
    ).toEqual(["fresh"]);
    expect(
      applyFilters(fleet, with_({ positionAge: "6H" }), NOW).map((v) => v.identity.imo),
    ).toEqual(["fresh", "mid"]);
    expect(
      applyFilters(fleet, with_({ positionAge: "OLDER" }), NOW).map((v) => v.identity.imo),
    ).toEqual(["old"]);
  });

  it("narrows by declared arrival window", () => {
    const fleet = [
      vessel({ imo: "soon", etaHours: 6 }),
      vessel({ imo: "later", etaHours: 60 }),
      vessel({ imo: "undeclared", etaHours: null }),
    ];
    expect(
      applyFilters(fleet, with_({ arrivalWindow: "24H" }), NOW).map((v) => v.identity.imo),
    ).toEqual(["soon"]);
  });

  it("combines dimensions rather than replacing them", () => {
    const both = applyFilters(FLEET, with_({ vesselType: "TANKER", flag: "LR" }), NOW);
    expect(both).toHaveLength(0);
  });
});

/* ═══════ 2. Absence is never a match ═══════ */

describe("an unreported field never satisfies a filter", () => {
  it("excludes an untyped vessel from a type filter", () => {
    expect(matchesFilters(UNTYPED, with_({ vesselType: "TANKER" }), NOW)).toBe(false);
    expect(matchesFilters(UNTYPED, with_({ vesselType: "CONTAINER" }), NOW)).toBe(false);
  });

  it("still shows it when nothing is narrowed", () => {
    // Absence of a filter is not a claim about the vessel.
    expect(matchesFilters(UNTYPED, EMPTY_FILTERS, NOW)).toBe(true);
  });

  it("excludes an undeclared destination, ETA and flag", () => {
    const bare = vessel({ imo: "bare" });
    expect(matchesFilters(bare, with_({ destination: "LAGOS" }), NOW)).toBe(false);
    expect(matchesFilters(bare, with_({ arrivalWindow: "24H" }), NOW)).toBe(false);
    expect(matchesFilters(bare, with_({ flag: "NG" }), NOW)).toBe(false);
  });

  it("does not treat an unparseable timestamp as recent", () => {
    const broken = {
      ...vessel({ imo: "x" }),
      position: { ...vessel({ imo: "x" }).position, timestamp: "not-a-date" },
    };
    expect(matchesFilters(broken, with_({ positionAge: "1H" }), NOW)).toBe(false);
  });
});

/* ═══════ 3. It reaches the renderer ═══════ */

describe("the filter reaches the rendered population", () => {
  function recordingRenderer() {
    const calls: { setData: number; lastFeatureIds: string[]; removed: string[] } = {
      setData: 0,
      lastFeatureIds: [],
      removed: [],
    };
    const renderer = {
      setVesselData: (collection: { features: { id?: string | number }[] }) => {
        calls.setData += 1;
        calls.lastFeatureIds = collection.features.map((f) => String(f.id));
      },
      patchVessels: (batch: { removed: readonly string[] }) => {
        calls.removed = [...batch.removed];
      },
    } as unknown as MapRenderer;
    return { renderer, calls };
  }

  it("draws only qualifying vessels", () => {
    /*
     * The end of the trace the phase demanded: UI state → predicate →
     * engine → feature collection → renderer. A test that stopped at the
     * predicate would have passed against the old, unread filter state.
     */
    const { renderer, calls } = recordingRenderer();
    let filters: MapFilters = EMPTY_FILTERS;
    const engine = new VesselUpdateEngine({
      renderer,
      vesselFilter: () => (v) => matchesFilters(v, filters, NOW),
    });

    engine.applyFull(FLEET);
    expect(calls.lastFeatureIds.length).toBe(0); // patch path, not setData
    engine.refreshPresentation();
    expect(calls.lastFeatureIds).toHaveLength(3);

    filters = with_({ vesselType: "TANKER" });
    engine.refreshPresentation();
    expect(calls.lastFeatureIds).toEqual(["1000001"]);
  });

  it("keeps every vessel in the record while the map shows fewer", () => {
    const { renderer } = recordingRenderer();
    let filters: MapFilters = with_({ vesselType: "TANKER" });
    const engine = new VesselUpdateEngine({
      renderer,
      vesselFilter: () => (v) => matchesFilters(v, filters, NOW),
    });
    engine.applyFull(FLEET);

    expect(engine.size).toBe(3);
    expect(engine.visibleCount()).toBe(1);
    filters = EMPTY_FILTERS;
    expect(engine.visibleCount()).toBe(3);
  });

  it("does not let the realtime path bypass the filter", () => {
    /*
     * The hole a projection-only implementation leaves: a vessel
     * arriving by `applyPatch` while a filter is active would be drawn
     * regardless, and the map would slowly fill with what the officer
     * excluded.
     */
    const { renderer, calls } = recordingRenderer();
    const engine = new VesselUpdateEngine({
      renderer,
      vesselFilter: () => (v) => matchesFilters(v, with_({ vesselType: "TANKER" }), NOW),
    });
    engine.applyPatch(CONTAINER);
    expect(calls.removed).toContain("1000002");
  });

  it("restores the full population when the filter is cleared", () => {
    const { renderer, calls } = recordingRenderer();
    let filters: MapFilters = with_({ vesselType: "TANKER" });
    const engine = new VesselUpdateEngine({
      renderer,
      vesselFilter: () => (v) => matchesFilters(v, filters, NOW),
    });
    engine.applyFull(FLEET);
    engine.refreshPresentation();
    expect(calls.lastFeatureIds).toHaveLength(1);

    filters = EMPTY_FILTERS;
    engine.refreshPresentation();
    expect(calls.lastFeatureIds).toHaveLength(3);
  });
});

/* ═══════ 4. The officer can see what is narrowed ═══════ */

describe("active filters are legible", () => {
  it("counts only genuine narrowing", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount(with_({ identifier: "   " }))).toBe(0);
    expect(activeFilterCount(with_({ vesselType: "TANKER", flag: "NG" }))).toBe(2);
  });

  it("produces one chip per narrowed dimension", () => {
    const chips = activeFilterChips(with_({ vesselType: "TANKER", positionAge: "6H" }));
    expect(chips.map((c) => c.key)).toEqual(["vesselType", "positionAge"]);
    expect(chips.map((c) => c.label)).toEqual(["TANKER", "Seen 6H"]);
  });
});
