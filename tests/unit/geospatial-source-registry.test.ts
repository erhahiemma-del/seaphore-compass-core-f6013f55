import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GlobalFishingWatchVesselSource,
  SharedGeospatialService,
  clearVesselSources,
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
