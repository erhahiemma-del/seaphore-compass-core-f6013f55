import { afterEach, describe, expect, it } from "vitest";

import {
  CANDIDATE_FLOOR,
  MATCH_THRESHOLD,
  STRONG_DETECTION_CONFIDENCE,
  classifyDetection,
  classifyGaps,
  clearShipDetector,
  correlateDetection,
  dataAgeMs,
  describeDataAge,
  detectShips,
  findAisGaps,
  gapCouldReach,
  registerShipDetector,
  sweep,
  type AisReport,
  type SarDetection,
  type SarScene,
  type ShipDetector,
} from "@/services/eo";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const ACQUIRED = "2026-08-20T06:00:00.000Z";
const ACQUIRED_MS = Date.parse(ACQUIRED);

function scene(over: Partial<SarScene> = {}): SarScene {
  return {
    sceneId: "S1A_IW_GRDH_001",
    sensor: "sentinel-1",
    platform: "SENTINEL-1A",
    mode: "IW",
    polarisation: "VV+VH",
    acquiredAt: ACQUIRED,
    footprint: null,
    bbox: [3.0, 5.9, 4.0, 6.9],
    groundSampleDistanceM: 10,
    collection: "SENTINEL-1",
    assetHref: "https://catalogue.dataspace.copernicus.eu/scene.SAFE",
    license: "CC-BY-4.0",
    retrievedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function detection(over: Partial<SarDetection> = {}): SarDetection {
  return {
    id: "det-1",
    sceneId: "S1A_IW_GRDH_001",
    sensor: "sentinel-1",
    acquiredAt: ACQUIRED,
    position: { latitude: 6.4, longitude: 3.4 },
    positionUncertaintyM: 100,
    estimatedLengthM: 180,
    estimatedWidthM: 28,
    estimatedHeadingDeg: 90,
    radarCrossSectionDb: 24,
    detectionConfidence: 0.9,
    detector: {
      serviceId: "test-service",
      modelId: "cfar-v1",
      modelVersion: "1.0.0",
      processedAt: new Date(NOW).toISOString(),
    },
    ...over,
  };
}

function ais(over: Partial<AisReport> = {}): AisReport {
  return {
    mmsi: "657123400",
    imo: "9438291",
    name: "MV Test",
    reportedAt: ACQUIRED,
    latitude: 6.4,
    longitude: 3.4,
    speedKnots: 12,
    courseDeg: 90,
    lengthM: 180,
    source: "datalastic",
    ...over,
  };
}

afterEach(() => clearShipDetector());

/* ─────────────────────── detector port ─────────────────────── */

describe("ship detection port", () => {
  it("reports no detector rather than returning an empty sea", async () => {
    // The distinction that stops "nothing configured" reading as "nothing there".
    const run = await detectShips(scene());

    expect(run.status).toBe("no-detector");
    expect(run.detections).toEqual([]);
    expect(run.unavailableReason).toMatch(/absence of detections says nothing/);
  });

  it("refuses a scene mode the model is not calibrated for", async () => {
    registerShipDetector({
      serviceId: "svc",
      modelId: "iw-only",
      modelVersion: "1",
      supportedModes: ["IW"],
      detect: async () => [detection()],
    });

    const run = await detectShips(scene({ mode: "WV" }));

    expect(run.status).toBe("unsupported-scene");
    expect(run.detections).toEqual([]);
    expect(run.unavailableReason).toMatch(/would produce false detections/);
  });

  it("refuses a catalogue entry with no downloadable asset", async () => {
    registerShipDetector({
      serviceId: "svc",
      modelId: "m",
      modelVersion: "1",
      supportedModes: ["IW"],
      detect: async () => [detection()],
    });

    const run = await detectShips(scene({ assetHref: null }));
    expect(run.status).toBe("unsupported-scene");
  });

  it("isolates a failing model instead of losing the scene", async () => {
    registerShipDetector({
      serviceId: "svc",
      modelId: "m",
      modelVersion: "1",
      supportedModes: ["IW"],
      detect: async () => {
        throw new Error("GPU out of memory");
      },
    });

    const run = await detectShips(scene());

    expect(run.status).toBe("processing-failed");
    expect(run.unavailableReason).toMatch(/GPU out of memory/);
    expect(run.unavailableReason).toMatch(/acquired but not analysed/);
  });

  it("records which model produced the detections", async () => {
    registerShipDetector({
      serviceId: "sar-svc",
      modelId: "cfar",
      modelVersion: "2.1.0",
      supportedModes: ["IW"],
      detect: async () => [detection()],
    });

    const run = await detectShips(scene());

    expect(run.status).toBe("ok");
    expect(run.detector?.modelVersion).toBe("2.1.0");
  });
});

/* ──────────────────────── AIS gap engine ───────────────────── */

describe("AIS Gap Engine", () => {
  it("finds a gap between two reports", () => {
    const gaps = findAisGaps(
      [
        ais({ reportedAt: "2026-08-20T00:00:00.000Z" }),
        ais({ reportedAt: "2026-08-20T09:00:00.000Z", latitude: 6.9, longitude: 3.9 }),
      ],
      { now: NOW },
    );

    // Two: the closed 00:00→09:00 gap, plus an open one because the track
    // also falls silent after 09:00 relative to `now`.
    const closed = gaps.filter((g) => !g.open);
    expect(closed).toHaveLength(1);
    expect(closed[0].durationSec).toBe(9 * 3600);
    expect(closed[0].nextReportAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("ignores silences short enough to be collection artefacts", () => {
    const gaps = findAisGaps(
      [
        ais({ reportedAt: "2026-08-20T00:00:00.000Z" }),
        ais({ reportedAt: "2026-08-20T00:20:00.000Z" }),
      ],
      { now: Date.parse("2026-08-20T00:25:00.000Z") },
    );

    expect(gaps).toEqual([]);
  });

  it("reports an open gap when a vessel has not been heard from since", () => {
    const gaps = findAisGaps([ais({ reportedAt: "2026-08-20T00:00:00.000Z" })], { now: NOW });

    expect(gaps).toHaveLength(1);
    expect(gaps[0].open).toBe(true);
    expect(gaps[0].nextReportAt).toBeNull();
  });

  it("separates tracks by MMSI", () => {
    const gaps = findAisGaps(
      [
        ais({ mmsi: "111", reportedAt: "2026-08-20T00:00:00.000Z" }),
        ais({ mmsi: "222", reportedAt: "2026-08-20T00:00:00.000Z" }),
      ],
      { now: NOW },
    );

    expect(new Set(gaps.map((g) => g.mmsi))).toEqual(new Set(["111", "222"]));
  });

  it("bounds the reachable area, assuming fast when speed is unknown", () => {
    // Assuming fast widens the circle, which makes a match LESS likely —
    // the error that costs an officer least.
    const [gap] = findAisGaps(
      [
        ais({ reportedAt: "2026-08-20T00:00:00.000Z", speedKnots: null }),
        ais({ reportedAt: "2026-08-20T12:00:00.000Z" }),
      ],
      { now: NOW },
    );

    const geometry = gapCouldReach(gap, { latitude: 6.4, longitude: 3.4 }, ACQUIRED_MS);
    expect(geometry).not.toBeNull();
    // 20 kn for 6 h ≈ 222 km.
    expect(geometry!.radiusM).toBeGreaterThan(200_000);
  });

  it("returns null for an instant outside the gap", () => {
    const [gap] = findAisGaps(
      [
        ais({ reportedAt: "2026-08-20T08:00:00.000Z" }),
        ais({ reportedAt: "2026-08-20T11:00:00.000Z" }),
      ],
      { now: NOW },
    );

    // Acquisition at 06:00 is before this gap opened.
    expect(gapCouldReach(gap, { latitude: 6.4, longitude: 3.4 }, ACQUIRED_MS)).toBeNull();
  });
});

/* ────────────────── dark contact correlation ───────────────── */

describe("Dark Contact Correlation Engine", () => {
  it("never returns an identity — only ranked candidates", () => {
    const result = correlateDetection(detection(), [ais()], { now: NOW });

    expect(result).not.toHaveProperty("vessel");
    expect(result).not.toHaveProperty("identifiedAs");
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates[0].confidence).toBeLessThanOrEqual(1);
  });

  it("distinguishes no-AIS-coverage from unmatched", () => {
    // The most consequential distinction in this engine: one is a hole in
    // our data, the other is an observation about the world.
    const noCoverage = correlateDetection(detection(), [], { now: NOW });
    expect(noCoverage.status).toBe("no-ais-coverage");
    expect(noCoverage.aisReportsConsidered).toBe(0);

    const unmatched = correlateDetection(detection(), [ais({ latitude: 20.0, longitude: 30.0 })], {
      now: NOW,
    });
    expect(unmatched.status).toBe("unmatched");
    expect(unmatched.aisReportsConsidered).toBe(1);
  });

  it("matches a co-located, contemporaneous, length-agreeing track", () => {
    const result = correlateDetection(detection(), [ais()], { now: NOW });

    expect(result.status).toBe("matched");
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("carries signed evidence so what argued against is visible too", () => {
    const result = correlateDetection(
      detection({ estimatedLengthM: 60 }),
      [ais({ lengthM: 300 })],
      { now: NOW },
    );

    const conflict = result.candidates[0]?.evidence.find((e) => e.factor === "length-conflict");
    expect(conflict).toBeTruthy();
    expect(conflict!.contribution).toBeLessThan(0);
  });

  it("lets a length conflict demote a spatially perfect candidate", () => {
    // A 60 m return is not a 300 m tanker, however well the positions agree.
    const perfect = correlateDetection(detection(), [ais()], { now: NOW });
    const conflicting = correlateDetection(
      detection({ estimatedLengthM: 60 }),
      [ais({ lengthM: 300 })],
      { now: NOW },
    );

    expect(conflicting.candidates[0].confidence).toBeLessThan(perfect.candidates[0].confidence);
    expect(conflicting.status).not.toBe("matched");
  });

  it("treats SAR heading as an axis, not a direction", () => {
    // SAR cannot resolve bow from stern in a single look, so a course
    // 180° from the detection heading must still agree.
    const reciprocal = correlateDetection(
      detection({ estimatedHeadingDeg: 270 }),
      [ais({ courseDeg: 90 })],
      { now: NOW },
    );

    const heading = reciprocal.candidates[0].evidence.find((e) => e.factor === "heading-agreement");
    expect(heading).toBeTruthy();
  });

  it("flags when the AIS position had to be extrapolated", () => {
    // Reported 20 min before acquisition, far enough west that dead
    // reckoning east at 12 kn lands the track on the detection.
    const result = correlateDetection(
      detection(),
      [ais({ reportedAt: "2026-08-20T05:40:00.000Z", longitude: 3.3331 })],
      { now: NOW },
    );

    expect(result.candidates[0].positionExtrapolated).toBe(true);
    expect(result.candidates[0].timeDeltaSec).toBe(1200);
  });

  it("excludes a track whose own course carries it away from the detection", () => {
    // Same report time, but starting *at* the detection and steaming east
    // means it was 7 km away by acquisition — correctly not a candidate.
    const result = correlateDetection(
      detection(),
      [ais({ reportedAt: "2026-08-20T05:40:00.000Z" })],
      { now: NOW },
    );

    expect(result.candidates).toEqual([]);
  });

  it("excludes a distant track rather than scoring it near zero", () => {
    const result = correlateDetection(detection(), [ais({ latitude: 7.5, longitude: 4.5 })], {
      now: NOW,
    });

    expect(result.candidates).toEqual([]);
    expect(result.status).toBe("unmatched");
  });

  it("keeps every surviving candidate above the floor", () => {
    const result = correlateDetection(
      detection(),
      [ais(), ais({ mmsi: "999", latitude: 6.405, longitude: 3.405, lengthM: 175 })],
      { now: NOW },
    );

    for (const candidate of result.candidates) {
      expect(candidate.confidence).toBeGreaterThanOrEqual(CANDIDATE_FLOOR);
    }
  });

  it("grades correlation with the OSINT vocabulary", () => {
    const result = correlateDetection(detection(), [ais()], { now: NOW });
    expect(["AUDITED", "VERIFIED", "CORROBORATED", "INFERRED", "DECLARED", "OBSERVED"]).toContain(
      result.candidates[0].grade,
    );
  });
});

/* ───────────────────── event classification ────────────────── */

describe("event classification", () => {
  const gapReports = [
    ais({ reportedAt: "2026-08-20T02:00:00.000Z", latitude: 6.4, longitude: 3.4 }),
    ais({ reportedAt: "2026-08-20T10:00:00.000Z", latitude: 6.5, longitude: 3.5 }),
  ];

  it("classifies an explained detection as SAR_DETECTION", () => {
    const correlation = correlateDetection(detection(), [ais()], { now: NOW });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });

    expect(event.type).toBe("SAR_DETECTION");
    expect(event.promotionRequires).toEqual([]);
  });

  it("never calls a detection unmatched when there was no AIS coverage", () => {
    // Our blind spot must not become the vessel's guilt.
    const correlation = correlateDetection(detection(), [], { now: NOW });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });

    expect(event.type).toBe("SAR_DETECTION");
    expect(event.type).not.toBe("UNMATCHED_SAR");
    expect(event.classificationRationale).toMatch(/gap in Seaphore's collection/);
  });

  it("classifies UNMATCHED_SAR when coverage existed and explained nothing", () => {
    const correlation = correlateDetection(detection(), [ais({ latitude: 20, longitude: 30 })], {
      now: NOW,
    });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });

    expect(event.type).toBe("UNMATCHED_SAR");
    expect(event.promotionRequires[0]).toMatch(/AIS gap/);
  });

  it("reaches HIGH_CONFIDENCE_DARK_CONTACT only with a strong detection and tight geometry", () => {
    const far = [ais({ mmsi: "other", latitude: 20, longitude: 30 })];
    const correlation = correlateDetection(detection(), far, { now: NOW });
    const gaps = findAisGaps(gapReports, { now: NOW });

    const event = classifyDetection(detection(), correlation, gaps, { now: NOW });

    expect(event.type).toBe("HIGH_CONFIDENCE_DARK_CONTACT");
    expect(event.aisGap).not.toBeNull();
    // Even at the top rung it is a correlation, not an identification.
    expect(event.classificationRationale).toMatch(/not a confirmed identification/);
  });

  it("holds at POTENTIAL_DARK_CONTACT when the detection is weak", () => {
    const far = [ais({ mmsi: "other", latitude: 20, longitude: 30 })];
    const weak = detection({ detectionConfidence: 0.4 });
    const correlation = correlateDetection(weak, far, { now: NOW });
    const gaps = findAisGaps(gapReports, { now: NOW });

    const event = classifyDetection(weak, correlation, gaps, { now: NOW });

    expect(event.type).toBe("POTENTIAL_DARK_CONTACT");
    expect(event.promotionRequires.join(" ")).toMatch(/false alarm/);
    expect(STRONG_DETECTION_CONFIDENCE).toBeGreaterThan(weak.detectionConfidence);
  });

  it("always names what would promote an event that stopped short", () => {
    const correlation = correlateDetection(detection(), [], { now: NOW });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });
    expect(event.promotionRequires.length).toBeGreaterThan(0);
  });

  it("emits AIS_GAP for gaps no detection explained", () => {
    const gaps = findAisGaps(gapReports, { now: NOW });
    const events = classifyGaps(gaps, []);

    expect(events).toHaveLength(gaps.length);
    expect(events[0].type).toBe("AIS_GAP");
    expect(events[0].detection).toBeNull();
    // Absence of imagery is not evidence: revisit is days, not seconds.
    expect(events[0].classificationRationale).toMatch(/revisits an area every few days/);
  });

  it("does not re-report a gap already explained by a detection", () => {
    const gaps = findAisGaps(gapReports, { now: NOW });
    const far = [ais({ mmsi: "other", latitude: 20, longitude: 30 })];
    const correlation = correlateDetection(detection(), far, { now: NOW });
    const event = classifyDetection(detection(), correlation, gaps, { now: NOW });

    const remaining = classifyGaps(gaps, [event]);
    expect(remaining.map((e) => e.aisGap?.id)).not.toContain(event.aisGap?.id);
    expect(remaining).toHaveLength(gaps.length - 1);
  });
});

/* ────────────────────────── data age ───────────────────────── */

describe("acquisition age is always available", () => {
  it("computes age from acquisition, not from retrieval", () => {
    expect(dataAgeMs(ACQUIRED, NOW)).toBe(6 * 3_600_000);
  });

  it("describes multi-day age in days, matching the revisit cadence", () => {
    expect(describeDataAge(6 * 24 * 3_600_000)).toBe("6 days old");
    expect(describeDataAge(6 * 3_600_000)).toBe("6 h old");
  });

  it("states the age in every detection event statement", () => {
    const correlation = correlateDetection(detection(), [ais()], { now: NOW });
    const event = classifyDetection(detection(), correlation, [], { now: NOW });
    expect(event.statement).toMatch(/6 h old/);
  });
});

/* ───────────────────────── the pipeline ────────────────────── */

describe("sweep", () => {
  it("states the caveat when no detector is configured", async () => {
    const result = await sweep([scene()], [ais()], { now: NOW });

    expect(result.detections).toEqual([]);
    expect(result.caveats.join(" ")).toMatch(/No SAR ship-detection service is configured/);
  });

  it("explains an empty scene list as a revisit gap, not an empty sea", async () => {
    const result = await sweep([], [ais()], { now: NOW });
    expect(result.caveats.join(" ")).toMatch(/revisits a given area every few days/);
    expect(result.freshestAcquisitionAgeMs).toBeNull();
  });

  it("reports the freshest acquisition age", async () => {
    const result = await sweep([scene()], [ais()], { now: NOW });
    expect(result.freshestAcquisitionAgeMs).toBe(6 * 3_600_000);
  });

  it("runs scenes in parallel and reports each one", async () => {
    registerShipDetector({
      serviceId: "svc",
      modelId: "m",
      modelVersion: "1",
      supportedModes: ["IW"],
      detect: async (s) => [detection({ id: `det-${s.sceneId}`, sceneId: s.sceneId })],
    });

    const result = await sweep([scene({ sceneId: "a" }), scene({ sceneId: "b" })], [ais()], {
      now: NOW,
    });

    expect(result.runs).toHaveLength(2);
    expect(result.detections).toHaveLength(2);
  });

  it("orders events by consequence, dark contacts first", async () => {
    registerShipDetector({
      serviceId: "svc",
      modelId: "m",
      modelVersion: "1",
      supportedModes: ["IW"],
      detect: async () => [detection()],
    });

    const reports = [
      ais({ mmsi: "gapper", reportedAt: "2026-08-20T02:00:00.000Z" }),
      ais({ mmsi: "gapper", reportedAt: "2026-08-20T10:00:00.000Z" }),
      ais({ mmsi: "far", latitude: 20, longitude: 30, reportedAt: ACQUIRED }),
    ];

    const result = await sweep([scene()], reports, { now: NOW });

    expect(result.events[0].type).toBe("HIGH_CONFIDENCE_DARK_CONTACT");
  });
});
