import { describe, expect, it, vi } from "vitest";

import type { GfwAreaResult, GfwAreaVessel } from "@/connectors/global-fishing-watch/types";
import { GlobalFishingWatchVesselSource, type Vessel } from "@/services/geospatial";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function areaVessel(overrides: Partial<GfwAreaVessel> = {}): GfwAreaVessel {
  return {
    vesselId: "gfw-1",
    imo: "9411765",
    mmsi: "657123456",
    name: "MV Test",
    flag: "NGA",
    latitude: 5.2,
    longitude: 4.1,
    speedKnots: 8.4,
    courseDeg: 145,
    timestamp: "2026-08-04T11:30:00.000Z",
    eventType: "fishing",
    source: "global-fishing-watch",
    retrievedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  };
}

function result(overrides: Partial<GfwAreaResult> = {}): GfwAreaResult {
  return {
    status: "ok",
    vessels: [areaVessel()],
    message: null,
    diagnostics: {
      requestedAt: "2026-08-04T12:00:00.000Z",
      latencyMs: 42,
      entriesReceived: 1,
      entriesDiscarded: 0,
      vesselsReturned: 1,
      fromCache: false,
    },
    ...overrides,
  };
}

function makeSource(areaResult: GfwAreaResult | (() => Promise<GfwAreaResult>)) {
  const areaSearch = vi.fn(typeof areaResult === "function" ? areaResult : async () => areaResult);
  const source = new GlobalFishingWatchVesselSource({
    areaSearch,
    now: () => NOW,
  });
  return { source, areaSearch };
}

describe("GlobalFishingWatchVesselSource — VesselSource contract", () => {
  it("declares the connector id, not an invented one", () => {
    const { source } = makeSource(result());
    expect(source.id).toBe("global-fishing-watch");
  });

  it("returns normalised vessels from list()", async () => {
    const { source } = makeSource(result());

    const vessels = await source.list();

    expect(vessels).toHaveLength(1);
    expect(vessels[0].identity.imo).toBe("9411765");
  });

  it("defaults to the Nigerian EEZ bounding box", async () => {
    const { source, areaSearch } = makeSource(result());

    await source.list();

    expect(areaSearch).toHaveBeenCalledTimes(1);
    const query = areaSearch.mock.calls[0][0];
    expect(query.bbox).toEqual([2.5, 3.0, 9.5, 8.5]);
  });

  it("honours a caller-supplied bounding box and limit", async () => {
    const { source, areaSearch } = makeSource(result());

    await source.list({ bbox: [0, 0, 1, 1], limit: 25 });

    const query = areaSearch.mock.calls[0][0];
    expect(query.bbox).toEqual([0, 0, 1, 1]);
    expect(query.limit).toBe(25);
  });

  it("requests a 30-day activity window by default", async () => {
    // Verified live: a 24-hour window over the Gulf of Guinea returns ZERO
    // GFW events. 30 days is the smallest window that yields a picture.
    const { source, areaSearch } = makeSource(result());

    await source.list();

    const query = areaSearch.mock.calls[0][0];
    expect(query.until).toBe("2026-08-04T12:00:00.000Z");
    expect(query.since).toBe("2026-07-05T12:00:00.000Z");
  });
});

describe("GlobalFishingWatchVesselSource — normalize()", () => {
  const { source } = makeSource(result());

  it("maps every required field", () => {
    const vessel = source.normalize(areaVessel()) as Vessel;

    expect(vessel.identity.imo).toBe("9411765");
    expect(vessel.identity.mmsi).toBe("657123456");
    expect(vessel.identity.flag).toBe("NGA");
    expect(vessel.position.lat).toBe(5.2);
    expect(vessel.position.lon).toBe(4.1);
    expect(vessel.position.speed).toBe(8.4);
    expect(vessel.position.heading).toBe(145);
    expect(vessel.position.timestamp).toBe("2026-08-04T11:30:00.000Z");
  });

  it("attaches provenance from the confidence engine", () => {
    const vessel = source.normalize(areaVessel()) as Vessel;

    expect(vessel.provenance).toMatchObject({
      source: "global-fishing-watch",
      provider: "Global Fishing Watch",
      datasetId: "public-global-events:latest",
      observedAt: "2026-08-04T11:30:00.000Z",
    });
    // `aggregated` provenance → 0.6 → INFERRED band.
    expect(vessel.confidence).toBe(0.6);
    expect(vessel.confidenceLevel).toBe("INFERRED");
  });

  it("enters the map as UNKNOWN risk — a position asserts nothing about risk", () => {
    const vessel = source.normalize(areaVessel()) as Vessel;

    expect(vessel.riskLevel).toBe("UNKNOWN");
    expect(vessel.attentionScore).toBe(0);
  });

  it("falls back to MMSI then vessel id when there is no IMO", () => {
    expect(source.normalize(areaVessel({ imo: null }))?.identity.imo).toBe("657123456");
    expect(source.normalize(areaVessel({ imo: null, mmsi: null }))?.identity.imo).toBe("gfw-1");
  });

  it("labels an unnamed vessel rather than leaving it blank", () => {
    const vessel = source.normalize(areaVessel({ name: null })) as Vessel;

    expect(vessel.identity.name).toBe("Unidentified (9411765)");
  });

  it("defaults missing speed and course to zero rather than inventing them", () => {
    const vessel = source.normalize(areaVessel({ speedKnots: null, courseDeg: null })) as Vessel;

    expect(vessel.position.speed).toBe(0);
    expect(vessel.position.heading).toBe(0);
  });

  it("rejects an unusable observation", () => {
    expect(source.normalize(areaVessel({ timestamp: "not-a-date" }))).toBeNull();
    expect(source.normalize(areaVessel({ latitude: Number.NaN }))).toBeNull();
  });
});

describe("GlobalFishingWatchVesselSource — status handling", () => {
  it("reports credentials-missing and returns no vessels", async () => {
    const { source } = makeSource(
      result({
        status: "credentials-missing",
        vessels: [],
        message: "Credentials Missing — set GFW_API_TOKEN.",
      }),
    );

    const vessels = await source.list();

    expect(vessels).toEqual([]);
    expect(source.health().status).toBe("credentials-missing");
    expect(source.health().connected).toBe(false);
    expect(source.health().message).toMatch(/GFW_API_TOKEN/);
  });

  it("reports upstream-error without throwing", async () => {
    const { source } = makeSource(
      result({ status: "upstream-error", vessels: [], message: "HTTP 500" }),
    );

    await expect(source.list()).resolves.toEqual([]);
    expect(source.health().status).toBe("upstream-error");
    expect(source.health().connected).toBe(false);
  });

  it("treats empty as connected — the feed works, the box is quiet", async () => {
    const { source } = makeSource(result({ status: "empty", vessels: [], message: "No activity" }));

    await source.list();

    expect(source.health().status).toBe("empty");
    expect(source.health().connected).toBe(true);
  });

  it("reports success", async () => {
    const { source } = makeSource(result());

    await source.list();

    expect(source.health().status).toBe("ok");
    expect(source.health().connected).toBe(true);
    expect(source.health().lastLatencyMs).toBe(42);
  });

  it("converts a transport throw into upstream-error", async () => {
    const { source } = makeSource(async () => {
      throw new Error("socket hang up");
    });

    await expect(source.list()).resolves.toEqual([]);
    expect(source.health().status).toBe("upstream-error");
    expect(source.stats().failures).toBe(1);
  });
});

describe("GlobalFishingWatchVesselSource — stats and citations", () => {
  it("accumulates counters across requests", async () => {
    const { source } = makeSource(result());

    await source.list();
    await source.list();

    const stats = source.stats();
    expect(stats.requests).toBe(2);
    expect(stats.vesselsAccepted).toBe(2);
    expect(stats.entriesReceived).toBe(2);
    expect(stats.lastDiagnostics?.latencyMs).toBe(42);
  });

  it("counts a rejected observation without dropping it silently", async () => {
    const { source } = makeSource(
      result({ vessels: [areaVessel(), areaVessel({ timestamp: "bad" })] }),
    );

    const vessels = await source.list();

    expect(vessels).toHaveLength(1);
    expect(source.stats().vesselsRejected).toBe(1);
  });

  it("produces a citation carrying provenance and confidence", async () => {
    const { source } = makeSource(result());
    const [vessel] = await source.list();

    const citations = source.citations(vessel);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      sourceId: "global-fishing-watch",
      provider: "Global Fishing Watch",
      datasetId: "public-global-events:latest",
      confidence: 0.6,
      confidenceLevel: "INFERRED",
    });
    // The citation must state the event-derived limit, not imply a track.
    expect(citations[0].statement).toMatch(/not a continuous track/i);
  });

  it("does not claim another provider's vessel", () => {
    const { source } = makeSource(result());
    const foreign: Vessel = {
      identity: { imo: "1", name: "Other" },
      position: { lon: 0, lat: 0, heading: 0, speed: 0, timestamp: "2026-08-04T00:00:00.000Z" },
      riskLevel: "UNKNOWN",
      attentionScore: 0,
      provenance: {
        source: "marine-traffic",
        provider: "MarineTraffic",
        retrievedAt: "2026-08-04T00:00:00.000Z",
        observedAt: "2026-08-04T00:00:00.000Z",
      },
    };

    expect(source.citations(foreign)).toEqual([]);
  });

  it("returns no citations for a vessel with no provenance", () => {
    const { source } = makeSource(result());
    const bare: Vessel = {
      identity: { imo: "1", name: "Bare" },
      position: { lon: 0, lat: 0, heading: 0, speed: 0, timestamp: "2026-08-04T00:00:00.000Z" },
      riskLevel: "UNKNOWN",
      attentionScore: 0,
    };

    expect(source.citations(bare)).toEqual([]);
  });
});
