import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GlobalFishingWatchVesselSource,
  SharedGeospatialService,
  clearVesselSources,
  computeIntelligenceMetrics,
  defaultEnabledSourceIds,
  getVesselSource,
  isDescribable,
  listVesselSources,
  registerGlobalFishingWatchSource,
  registerVesselSource,
  EmptyVesselSource,
  type DescribableVesselSource,
  type SourceHealthReport,
  type VesselSourceDescriptor,
} from "@/services/geospatial";

/** A provider that names nothing real — proves the UI is name-agnostic. */
function fakeSource(
  descriptor: Partial<VesselSourceDescriptor> & { id: string },
): DescribableVesselSource {
  const full: VesselSourceDescriptor = {
    label: descriptor.id,
    type: "OSINT",
    description: "Test provider.",
    defaultEnabled: false,
    ...descriptor,
  };
  return {
    id: full.id,
    list: async () => [],
    describe: () => full,
    report: (): SourceHealthReport => ({
      sourceId: full.id,
      status: "not-queried",
      connected: false,
      message: null,
      lastCheckedAt: null,
      lastLatencyMs: null,
      recordCount: 0,
      confidence: null,
      confidenceLevel: null,
      freshnessMs: null,
      requestCount: 0,
      failureCount: 0,
      successRate: null,
      averageLatencyMs: null,
      cacheState: "unknown",
      lastSuccessfulSync: null,
      warnedCount: 0,
      rejectedCount: 0,
    }),
  };
}

afterEach(() => clearVesselSources());

describe("vessel source discovery", () => {
  it("starts empty", () => {
    expect(listVesselSources()).toEqual([]);
  });

  it("registers and finds a source by id", () => {
    registerVesselSource(fakeSource({ id: "alpha" }));

    expect(getVesselSource("alpha")).toBeDefined();
    expect(listVesselSources()).toHaveLength(1);
  });

  it("replaces rather than duplicates on re-registration", () => {
    registerVesselSource(fakeSource({ id: "alpha", label: "First" }));
    registerVesselSource(fakeSource({ id: "alpha", label: "Second" }));

    expect(listVesselSources()).toHaveLength(1);
    expect(listVesselSources()[0].describe().label).toBe("Second");
  });

  it("unregisters via the returned handle", () => {
    const off = registerVesselSource(fakeSource({ id: "alpha" }));

    off();

    expect(listVesselSources()).toEqual([]);
  });

  it("orders GOVERNMENT, then COMMERCIAL, then OSINT", () => {
    registerVesselSource(fakeSource({ id: "c", type: "OSINT", label: "C" }));
    registerVesselSource(fakeSource({ id: "a", type: "GOVERNMENT", label: "A" }));
    registerVesselSource(fakeSource({ id: "b", type: "COMMERCIAL", label: "B" }));

    expect(listVesselSources().map((s) => s.describe().id)).toEqual(["a", "b", "c"]);
  });

  it("reports default-enabled ids", () => {
    registerVesselSource(fakeSource({ id: "on", defaultEnabled: true }));
    registerVesselSource(fakeSource({ id: "off", defaultEnabled: false }));

    expect(defaultEnabledSourceIds()).toEqual(["on"]);
  });

  it("recognises a describable source and rejects a bare one", () => {
    expect(isDescribable(fakeSource({ id: "alpha" }))).toBe(true);
    expect(isDescribable(new EmptyVesselSource())).toBe(false);
  });
});

describe("Global Fishing Watch registration", () => {
  it("describes itself without the UI knowing its name", () => {
    registerGlobalFishingWatchSource({ areaSearch: async () => ({}) as never });

    const [source] = listVesselSources();
    const descriptor = source.describe();

    expect(descriptor.id).toBe("global-fishing-watch");
    expect(descriptor.type).toBe("OSINT");
    expect(descriptor.defaultEnabled).toBe(true);
    // The event-derived limit must reach the screen, not stay in the code.
    expect(descriptor.caveat).toMatch(/not a continuous live feed/i);
  });

  it("reports not-queried before its first request", () => {
    const source = new GlobalFishingWatchVesselSource({ areaSearch: async () => ({}) as never });

    const report = source.report();

    expect(report.status).toBe("not-queried");
    expect(report.recordCount).toBe(0);
    expect(report.freshnessMs).toBeNull();
    expect(report.confidence).toBe(0.6);
  });

  it("reports record count and freshness after a query", async () => {
    const now = Date.parse("2026-08-04T12:00:00.000Z");
    const source = new GlobalFishingWatchVesselSource({
      now: () => now,
      areaSearch: async () => ({
        status: "ok",
        message: null,
        vessels: [
          {
            vesselId: "v1",
            imo: "9411765",
            mmsi: "1",
            name: "A",
            flag: "NGA",
            latitude: 5,
            longitude: 4,
            speedKnots: 1,
            courseDeg: 1,
            timestamp: "2026-08-04T11:50:00.000Z",
            eventType: "fishing",
            source: "global-fishing-watch",
            retrievedAt: "2026-08-04T12:00:00.000Z",
          },
        ],
        diagnostics: {
          requestedAt: "2026-08-04T12:00:00.000Z",
          latencyMs: 10,
          entriesReceived: 1,
          entriesDiscarded: 0,
          vesselsReturned: 1,
          fromCache: false,
        },
      }),
    });

    await source.list();
    const report = source.report();

    expect(report.status).toBe("ok");
    expect(report.recordCount).toBe(1);
    expect(report.freshnessMs).toBe(10 * 60 * 1000);
    expect(report.confidenceLevel).toBe("INFERRED");
  });
});

describe("SGS — enabled sources", () => {
  function svc() {
    return new SharedGeospatialService({ urlSync: false });
  }

  it("seeds from default-enabled providers", () => {
    registerVesselSource(fakeSource({ id: "on", defaultEnabled: true }));
    registerVesselSource(fakeSource({ id: "off" }));

    expect(svc().get().enabledSources).toEqual(["on"]);
  });

  it("toggles a provider on and off", () => {
    const service = svc();

    service.toggleSource("alpha");
    expect(service.isSourceEnabled("alpha")).toBe(true);

    service.toggleSource("alpha");
    expect(service.isSourceEnabled("alpha")).toBe(false);
  });

  it("does not notify when the same set is reapplied", () => {
    const service = svc();
    service.setEnabledSources(["alpha"]);
    const handler = vi.fn();
    service.subscribe(handler);

    service.setEnabledSources(["alpha"]);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates on set", () => {
    const service = svc();

    service.setEnabledSources(["alpha", "alpha", "beta"]);

    expect(service.get().enabledSources).toEqual(["alpha", "beta"]);
  });

  it("round-trips enabled sources through the URL", () => {
    const source = svc();
    source.setEnabledSources(["alpha", "beta"]);
    const target = svc();

    target.loadFromURL(`?${source.toSearchParams().toString()}`);

    expect(target.get().enabledSources).toEqual(["alpha", "beta"]);
  });

  it("honours an explicitly empty source list", () => {
    const service = svc();
    service.setEnabledSources(["alpha"]);

    service.loadFromURL("?sources=");

    expect(service.get().enabledSources).toEqual([]);
  });
});

describe("source diagnostics (commit 3)", () => {
  const OK_DIAG = {
    requestedAt: "2026-08-04T12:00:00.000Z",
    latencyMs: 20,
    entriesReceived: 0,
    entriesDiscarded: 0,
    vesselsReturned: 0,
    fromCache: false,
  };

  function source(results: Array<Record<string, unknown>>) {
    let i = 0;
    return new GlobalFishingWatchVesselSource({
      now: () => Date.parse("2026-08-04T12:00:00.000Z"),
      areaSearch: async () => (results[Math.min(i++, results.length - 1)] ?? {}) as never,
    });
  }

  it("reports zero-state before any request", () => {
    const report = source([]).report();

    expect(report.requestCount).toBe(0);
    expect(report.successRate).toBeNull();
    expect(report.averageLatencyMs).toBeNull();
    expect(report.cacheState).toBe("unknown");
    expect(report.lastSuccessfulSync).toBeNull();
  });

  it("computes success rate across mixed outcomes", async () => {
    const s = source([
      { status: "ok", vessels: [], message: null, diagnostics: OK_DIAG },
      { status: "upstream-error", vessels: [], message: "boom", diagnostics: OK_DIAG },
    ]);

    await s.list();
    await s.list();
    const report = s.report();

    expect(report.requestCount).toBe(2);
    expect(report.failureCount).toBe(1);
    expect(report.successRate).toBe(0.5);
  });

  it("averages latency over successful requests only", async () => {
    const s = source([
      { status: "ok", vessels: [], message: null, diagnostics: { ...OK_DIAG, latencyMs: 10 } },
      { status: "ok", vessels: [], message: null, diagnostics: { ...OK_DIAG, latencyMs: 30 } },
    ]);

    await s.list();
    await s.list();

    expect(s.report().averageLatencyMs).toBe(20);
  });

  it("reports cache state from the last response", async () => {
    const s = source([
      { status: "ok", vessels: [], message: null, diagnostics: { ...OK_DIAG, fromCache: true } },
    ]);

    await s.list();

    expect(s.report().cacheState).toBe("hit");
  });

  it("records the last successful sync but not a failed one", async () => {
    const s = source([
      { status: "ok", vessels: [], message: null, diagnostics: OK_DIAG },
      {
        status: "upstream-error",
        vessels: [],
        message: "boom",
        diagnostics: { ...OK_DIAG, requestedAt: "2026-08-04T13:00:00.000Z" },
      },
    ]);

    await s.list();
    await s.list();

    expect(s.report().lastSuccessfulSync).toBe("2026-08-04T12:00:00.000Z");
  });

  it("surfaces validation counts", async () => {
    const s = source([
      {
        status: "ok",
        message: null,
        diagnostics: { ...OK_DIAG, entriesReceived: 1, vesselsReturned: 1 },
        vessels: [
          {
            vesselId: "v1",
            imo: "9411765",
            mmsi: null,
            name: "No MMSI",
            flag: null,
            latitude: 5,
            longitude: 4,
            speedKnots: 1,
            courseDeg: 1,
            timestamp: "2026-08-04T11:59:00.000Z",
            eventType: "fishing",
            source: "global-fishing-watch",
            retrievedAt: "2026-08-04T12:00:00.000Z",
          },
        ],
      },
    ]);

    await s.list();

    // Missing MMSI is a warning, not a rejection — it still reaches the map.
    expect(s.report().warnedCount).toBe(1);
    expect(s.report().rejectedCount).toBe(0);
    expect(s.report().recordCount).toBe(1);
  });
});

describe("intelligence metrics (commit 7)", () => {
  function reporting(id: string, over: Partial<SourceHealthReport> = {}): DescribableVesselSource {
    const base = fakeSource({ id });
    return {
      ...base,
      report: () => ({ ...base.report(), ...over, sourceId: id }),
    };
  }

  it("counts active, healthy, disabled and degraded providers", () => {
    const sources = [
      reporting("a", { connected: true }),
      reporting("b", { connected: false }),
      reporting("c", { connected: true }),
    ];

    const metrics = computeIntelligenceMetrics(["a", "b"], sources);

    expect(metrics.totalProviders).toBe(3);
    expect(metrics.activeProviders).toBe(2);
    expect(metrics.healthyProviders).toBe(1);
    expect(metrics.disabledProviders).toBe(1);
    expect(metrics.degradedProviders).toBe(1);
  });

  it("sums vessels across enabled providers only", () => {
    const sources = [reporting("a", { recordCount: 10 }), reporting("b", { recordCount: 5 })];

    expect(computeIntelligenceMetrics(["a"], sources).totalVessels).toBe(10);
  });

  it("averages confidence across enabled providers only", () => {
    // A switched-off provider must not drag the picture's confidence down.
    const sources = [reporting("a", { confidence: 0.9 }), reporting("b", { confidence: 0.1 })];

    expect(computeIntelligenceMetrics(["a"], sources).averageConfidence).toBe(0.9);
    expect(computeIntelligenceMetrics(["a", "b"], sources).averageConfidence).toBeCloseTo(0.5, 5);
  });

  it("averages freshness, ignoring providers that report none", () => {
    const sources = [
      reporting("a", { freshnessMs: 60_000 }),
      reporting("b", { freshnessMs: null }),
      reporting("c", { freshnessMs: 180_000 }),
    ];

    expect(computeIntelligenceMetrics(["a", "b", "c"], sources).averageFreshnessMs).toBe(120_000);
  });

  it("reports the most recent successful sync", () => {
    const sources = [
      reporting("a", { lastSuccessfulSync: "2026-08-04T10:00:00.000Z" }),
      reporting("b", { lastSuccessfulSync: "2026-08-04T12:00:00.000Z" }),
    ];

    expect(computeIntelligenceMetrics(["a", "b"], sources).lastIntelligenceUpdate).toBe(
      "2026-08-04T12:00:00.000Z",
    );
  });

  it("returns nulls rather than zeros when nothing is measurable", () => {
    const metrics = computeIntelligenceMetrics([], []);

    expect(metrics.averageConfidence).toBeNull();
    expect(metrics.averageFreshnessMs).toBeNull();
    expect(metrics.lastIntelligenceUpdate).toBeNull();
    expect(metrics.totalProviders).toBe(0);
  });

  it("reads from the live registry by default", () => {
    registerVesselSource(fakeSource({ id: "registered" }));

    expect(computeIntelligenceMetrics(["registered"]).activeProviders).toBe(1);
  });
});
