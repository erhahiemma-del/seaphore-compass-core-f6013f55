/**
 * TEST_FIXTURE — every AIS report, SAR detection and candidate in this
 * file is synthetic and exists only to exercise the correlation logic.
 * None of it is production data, and none of it may be surfaced as such.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  AisProviderRegistry,
  AisProviderRegistryError,
  DATALASTIC_ENTRY,
  DEFAULT_AIS_WINDOW_MS,
  SEAVANTAGE_ENTRY,
  aisWindowFor,
  bboxAround,
  classifyDetection,
  clearAisHistoryProvider,
  correlateDetection,
  describeAisAvailability,
  describeCoverage,
  queryAisAroundAcquisition,
  registerAisHistoryProvider,
  supportsUnmatchedConclusion,
  type AisCoverage,
  type AisReport,
  type BoundingBox,
  type SarDetection,
} from "@/services/eo";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const ACQUIRED = "2026-08-20T05:42:00.000Z";
const ACQUIRED_MS = Date.parse(ACQUIRED);

const AOI: BoundingBox = { west: 3.0, south: 6.0, east: 3.8, north: 6.8 };

/** TEST_FIXTURE */
function detection(over: Partial<SarDetection> = {}): SarDetection {
  return {
    id: "TEST_FIXTURE-det-1",
    sceneId: "TEST_FIXTURE-scene",
    sensor: "sentinel-1",
    acquiredAt: ACQUIRED,
    position: { latitude: 6.4, longitude: 3.4 },
    positionUncertaintyM: 100,
    estimatedLengthM: 180,
    estimatedWidthM: 28,
    estimatedHeadingDeg: 90,
    radarCrossSectionDb: 24,
    detectionConfidence: 0.91,
    detector: {
      serviceId: "TEST_FIXTURE",
      modelId: "TEST_FIXTURE-model",
      modelVersion: "0",
      processedAt: ACQUIRED,
    },
    ...over,
  };
}

/** TEST_FIXTURE */
function ais(over: Partial<AisReport> = {}): AisReport {
  return {
    mmsi: "657123400",
    imo: "9074729",
    name: "TEST_FIXTURE MV ABC",
    reportedAt: ACQUIRED,
    latitude: 6.4,
    longitude: 3.4,
    speedKnots: 12,
    courseDeg: 90,
    lengthM: 180,
    source: "TEST_FIXTURE-provider",
    ...over,
  };
}

/** Coverage a real provider would declare after actually running. */
function covered(reportCount: number, providerId = "TEST_FIXTURE-provider"): AisCoverage {
  return {
    queried: true,
    providerId,
    bbox: AOI,
    fromMs: ACQUIRED_MS - DEFAULT_AIS_WINDOW_MS,
    toMs: ACQUIRED_MS + DEFAULT_AIS_WINDOW_MS,
    windowMs: DEFAULT_AIS_WINDOW_MS,
    reportCount,
    areaCovered: true,
    unavailableReason: null,
  };
}

afterEach(() => clearAisHistoryProvider());

/* ─────────────────── the temporal window ─────────────────── */

describe("SAR acquisition window", () => {
  it("centres on acquisition, not on now", () => {
    // The whole point: "what was here when the satellite looked?", never
    // "what is here now?".
    const window = aisWindowFor(ACQUIRED)!;

    expect(window.fromMs).toBe(ACQUIRED_MS - DEFAULT_AIS_WINDOW_MS);
    expect(window.toMs).toBe(ACQUIRED_MS + DEFAULT_AIS_WINDOW_MS);
    expect(window.toMs).toBeLessThan(NOW);
  });

  it("defaults to ±1 hour and is configurable", () => {
    expect(DEFAULT_AIS_WINDOW_MS).toBe(3_600_000);
    const narrow = aisWindowFor(ACQUIRED, 600_000)!;
    expect(narrow.toMs - narrow.fromMs).toBe(1_200_000);
  });

  it("returns null for an unparseable acquisition time", () => {
    expect(aisWindowFor("not a date")).toBeNull();
  });

  it("builds a bounding box that widens with radius", () => {
    const small = bboxAround(6.4, 3.4, 1_000);
    const large = bboxAround(6.4, 3.4, 50_000);
    expect(large.north - large.south).toBeGreaterThan(small.north - small.south);
  });
});

/* ──────────────── coverage is declared, not inferred ─────────────── */

describe("AIS coverage", () => {
  it("reports no-provider when none is registered", async () => {
    const result = await queryAisAroundAcquisition(ACQUIRED, AOI);

    expect(result.status).toBe("no-provider");
    expect(result.coverage.queried).toBe(false);
    expect(result.coverage.unavailableReason).toMatch(/must not be read as a dark contact/);
  });

  it("reports not-covered when a provider declines the area", async () => {
    registerAisHistoryProvider({
      providerId: "TEST_FIXTURE-provider",
      covers: () => false,
      query: async () => [ais()],
    });

    const result = await queryAisAroundAcquisition(ACQUIRED, AOI);

    expect(result.status).toBe("not-covered");
    expect(result.coverage.queried).toBe(false);
    expect(result.reports).toEqual([]);
  });

  it("distinguishes a covered empty result from an unasked one", async () => {
    // The defect this module exists to fix. Both return zero reports.
    registerAisHistoryProvider({
      providerId: "TEST_FIXTURE-provider",
      covers: () => true,
      query: async () => [],
    });

    const asked = await queryAisAroundAcquisition(ACQUIRED, AOI);
    expect(asked.status).toBe("ok");
    expect(asked.coverage.queried).toBe(true);
    expect(asked.coverage.areaCovered).toBe(true);
    expect(supportsUnmatchedConclusion(asked.coverage)).toBe(true);

    clearAisHistoryProvider();
    const unasked = await queryAisAroundAcquisition(ACQUIRED, AOI);
    expect(supportsUnmatchedConclusion(unasked.coverage)).toBe(false);
  });

  it("treats a failed query as our blindness, not the sea's emptiness", async () => {
    registerAisHistoryProvider({
      providerId: "TEST_FIXTURE-provider",
      covers: () => true,
      query: async () => {
        throw new Error("upstream 503");
      },
    });

    const result = await queryAisAroundAcquisition(ACQUIRED, AOI);

    expect(result.status).toBe("failed");
    expect(supportsUnmatchedConclusion(result.coverage)).toBe(false);
    expect(result.coverage.unavailableReason).toMatch(/not observed by Seaphore/);
  });

  it("never phrases absent coverage as absent vessels", async () => {
    const result = await queryAisAroundAcquisition(ACQUIRED, AOI);
    expect(describeCoverage(result.coverage)).not.toMatch(/no vessels/i);
  });
});

/* ─────────── §7 scenarios 1-10, on declared coverage ─────────── */

describe("candidate scoring — the ten fixture scenarios", () => {
  it("1. perfect spatial and temporal match", () => {
    const result = correlateDetection(detection(), [ais()], {
      now: NOW,
      coverage: covered(1),
    });

    expect(result.status).toBe("matched");
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("2. spatially close but temporally incompatible", () => {
    // Reported 3 h before acquisition — outside the correlation window.
    const result = correlateDetection(
      detection(),
      [ais({ reportedAt: "2026-08-20T02:42:00.000Z" })],
      { now: NOW, coverage: covered(1) },
    );

    expect(result.candidates).toEqual([]);
    // Coverage existed, so silence means something.
    expect(result.status).toBe("unmatched");
  });

  it("3. correct position, incompatible vessel length", () => {
    const result = correlateDetection(
      detection({ estimatedLengthM: 60 }),
      [ais({ lengthM: 300 })],
      { now: NOW, coverage: covered(1) },
    );

    expect(result.status).not.toBe("matched");
    const conflict = result.candidates[0]?.evidence.find((e) => e.factor === "length-conflict");
    expect(conflict?.contribution).toBeLessThan(0);
  });

  it("4. multiple candidate vessels, ranked", () => {
    const result = correlateDetection(
      detection(),
      [ais(), ais({ mmsi: "999", imo: null, latitude: 6.405, longitude: 3.405, lengthM: 175 })],
      { now: NOW, coverage: covered(2) },
    );

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(result.candidates[1].confidence);
  });

  it("5. no AIS coverage — never unmatched", () => {
    const uncovered: AisCoverage = { ...covered(0), queried: false, areaCovered: false };
    const result = correlateDetection(detection(), [], { now: NOW, coverage: uncovered });

    expect(result.status).toBe("no-ais-coverage");
    expect(result.status).not.toBe("unmatched");
  });

  it("6. AIS coverage with no candidate — genuinely unmatched", () => {
    const result = correlateDetection(detection(), [ais({ latitude: 20, longitude: 30 })], {
      now: NOW,
      coverage: covered(1),
    });

    expect(result.status).toBe("unmatched");
    expect(result.candidates).toEqual([]);
  });

  it("7. stale AIS is excluded by the window, not silently accepted", () => {
    const result = correlateDetection(
      detection(),
      [ais({ reportedAt: "2026-08-19T05:42:00.000Z" })],
      { now: NOW, coverage: covered(1) },
    );

    expect(result.candidates).toEqual([]);
  });

  it("8. conflicting providers both retained as candidates", () => {
    // Two providers, same vessel, different positions. Neither is
    // discarded — the evidence layer decides, not the correlator.
    const result = correlateDetection(
      detection(),
      [
        ais({ source: "provider-a", latitude: 6.4, longitude: 3.4 }),
        ais({ source: "provider-b", mmsi: "657123401", latitude: 6.404, longitude: 3.404 }),
      ],
      { now: NOW, coverage: covered(2) },
    );

    expect(result.candidates.length).toBe(2);
    expect(result.aisReportsConsidered).toBe(2);
  });

  it("9. identity ambiguity yields candidates, never a decision", () => {
    const result = correlateDetection(
      detection(),
      [
        ais({ mmsi: "111", imo: null, name: "TEST_FIXTURE A" }),
        ais({ mmsi: "222", imo: null, name: "TEST_FIXTURE B" }),
      ],
      { now: NOW, coverage: covered(2) },
    );

    // The correlator ranks; it does not choose.
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result).not.toHaveProperty("identifiedAs");
  });

  it("10. a SAR detection never carries an identity", () => {
    const det = detection();
    expect(det).not.toHaveProperty("imo");
    expect(det).not.toHaveProperty("mmsi");
    expect(det).not.toHaveProperty("vesselName");
  });
});

/* ──────────────── negative tests the brief demands ──────────────── */

describe("structural guarantees", () => {
  it("NO_AIS_COVERAGE never becomes UNMATCHED_SAR", () => {
    const uncovered: AisCoverage = { ...covered(0), queried: false, areaCovered: false };
    const correlation = correlateDetection(detection(), [], { now: NOW, coverage: uncovered });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });

    expect(event.type).toBe("SAR_DETECTION");
    expect(event.type).not.toBe("UNMATCHED_SAR");
    expect(event.classificationRationale).toMatch(/gap in Seaphore's collection/);
  });

  it("SAR_DETECTION never becomes a vessel identity without evidence", () => {
    const correlation = correlateDetection(detection(), [], {
      now: NOW,
      coverage: { ...covered(0), queried: false, areaCovered: false },
    });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });

    expect(event.correlation?.candidates).toEqual([]);
    expect(event.statement).not.toMatch(/MV ABC/);
  });

  it("a covered, empty picture does support an unmatched conclusion", () => {
    // The inverse guarantee — coverage must be able to mean something,
    // or the distinction would be useless in the other direction.
    const correlation = correlateDetection(detection(), [ais({ latitude: 20, longitude: 30 })], {
      now: NOW,
      coverage: covered(1),
    });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });

    expect(event.type).toBe("UNMATCHED_SAR");
  });

  it("preserves pre-Phase-7 behaviour when no coverage is supplied", () => {
    // Backward compatibility: absent a declaration, ambiguity resolves
    // toward no-ais-coverage, which is the safe direction.
    const result = correlateDetection(detection(), [], { now: NOW });
    expect(result.status).toBe("no-ais-coverage");
  });
});

/* ────────────────────── provider registry ─────────────────────── */

describe("AIS provider registry", () => {
  it("registers Datalastic and SeaVantage as pending, not connected", () => {
    const registry = new AisProviderRegistry().registerAll([DATALASTIC_ENTRY, SEAVANTAGE_ENTRY]);

    expect(registry.pending()).toHaveLength(2);
    expect(registry.connected()).toEqual([]);
    expect(registry.hasCoverage()).toBe(false);
  });

  it("records capabilities as unverified rather than false", () => {
    // "We have not checked" and "the provider cannot" are different claims.
    for (const value of Object.values(DATALASTIC_ENTRY.capabilities)) {
      expect(value).toBeNull();
    }
  });

  it("requires a pending provider to state its blockers", () => {
    const registry = new AisProviderRegistry();
    expect(() => registry.register({ ...DATALASTIC_ENTRY, providerId: "x", blockers: [] })).toThrow(
      AisProviderRegistryError,
    );
  });

  it("refuses a CONNECTED provider with no implementation", () => {
    const registry = new AisProviderRegistry();
    expect(() =>
      registry.register({ ...DATALASTIC_ENTRY, providerId: "y", status: "CONNECTED" }),
    ).toThrow(/carries no implementation/);
  });

  it("names Datalastic's blockers precisely", () => {
    const blockers = DATALASTIC_ENTRY.blockers.join(" ");
    // The upgraded credential is verified against /stat and the data
    // endpoints answer 200, so the remaining blocker is that no add-on
    // endpoint path has been observed and this EO slot has no provider.
    expect(blockers).toMatch(/key_status = Valid/);
    expect(blockers).toMatch(/addons = true/);
    expect(blockers).toMatch(/no add-on endpoint path has been observed/);
    expect(DATALASTIC_ENTRY.capabilities.areaQuery).toBeNull();
  });

  it("activates a provider once an implementation exists", () => {
    const registry = new AisProviderRegistry().register(DATALASTIC_ENTRY);
    registry.activate("datalastic", {
      providerId: "datalastic",
      covers: () => true,
      query: async () => [],
    });

    expect(registry.get("datalastic")?.status).toBe("CONNECTED");
    expect(registry.hasCoverage()).toBe(true);
  });

  it("describes unavailability without implying an empty sea", () => {
    const registry = new AisProviderRegistry().registerAll([DATALASTIC_ENTRY, SEAVANTAGE_ENTRY]);
    const description = describeAisAvailability(registry);

    expect(description).toMatch(/awaiting credentials/);
    expect(description).toMatch(/not the absence of vessels/);
  });
});

/* ─────────────────────── provenance ───────────────────────── */

describe("AIS report provenance", () => {
  it("carries the provider and the transmission time", () => {
    const report = ais();
    expect(report.source).toBe("TEST_FIXTURE-provider");
    expect(report.reportedAt).toBe(ACQUIRED);
  });

  it("keeps receipt time separate from transmission time", () => {
    // Satellite AIS lags transmission; conflating them makes a stale
    // report look current.
    const report = ais({ receivedAt: "2026-08-20T05:55:00.000Z" });
    expect(report.receivedAt).not.toBe(report.reportedAt);
  });

  it("keeps heading separate from course", () => {
    const report = ais({ headingDeg: 85, courseDeg: 90 });
    expect(report.headingDeg).not.toBe(report.courseDeg);
  });
});
