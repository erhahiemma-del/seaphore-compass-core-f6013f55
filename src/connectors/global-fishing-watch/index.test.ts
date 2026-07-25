import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalFishingWatchConnector } from "./index";
import { AISBehaviourAnalyzer } from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GLOBAL_FISHING_WATCH_API_KEY;

function mockFetchOk(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("GlobalFishingWatchConnector", () => {
  let connector: GlobalFishingWatchConnector;

  beforeEach(() => {
    process.env.GLOBAL_FISHING_WATCH_API_KEY = "test-key";
    connector = new GlobalFishingWatchConnector();
    connector.__clearCache();
    OSAE.__reset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GLOBAL_FISHING_WATCH_API_KEY;
    else process.env.GLOBAL_FISHING_WATCH_API_KEY = originalKey;
  });

  it("declares tier-1 AIS metadata and never claims risk semantics", () => {
    expect(connector.name).toBe("global-fishing-watch");
    expect(connector.category).toBe("AIS");
    expect(connector.authMethod).toBe("api_key");
    // Intelligence rule: the connector's own description must not classify risk.
    expect(connector.description.toLowerCase()).not.toMatch(/\b(high|medium|low) risk\b/);
  });

  it("healthCheck reports Authentication Failed when API rejects the key", async () => {
    mockFetchOk({}, 401);
    const h = await connector.healthCheck();
    expect(h.status).toBe("down");
    expect(h.message).toMatch(/Authentication Failed/);
  });

  it("healthCheck reports unavailable when API is not credentialed", async () => {
    delete process.env.GLOBAL_FISHING_WATCH_API_KEY;
    const h = await connector.healthCheck();
    expect(h.status).toBe("down");
    expect(h.message).toMatch(/not configured/);
  });

  it("caches vessel search results (24h)", async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ entries: [{ id: "v1", imo: "9074729", shipname: "MV Test", flag: "NG" }] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    // Second call: movement events (empty).
    // For simplicity, both calls return the vessel body, then movement path returns entries=[]
    let call = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      call += 1;
      const url = String(input);
      if (url.includes("/vessels/search")) {
        return new Response(JSON.stringify({ entries: [{ id: "v1", imo: "9074729", shipname: "MV Test", flag: "NG" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await connector.search("MV Test");
    const before = call;
    await connector.search("MV Test");
    // Vessel search cached → total calls should NOT double from search endpoint.
    expect(call - before).toBeLessThanOrEqual(1);
  });

  it("normalize never throws on malformed input", () => {
    expect(() => connector.normalize({ sourceRef: "junk" })).not.toThrow();
    expect(connector.normalize({ sourceRef: "junk" }).entityId).toBe("");
  });

  it("search publishes AIS continuity evidence to OSAE (but never assigns risk)", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/vessels/search")) {
        return new Response(
          JSON.stringify({ entries: [{ id: "v1", imo: "9074729", shipname: "MV Test" }] }),
          { status: 200 },
        );
      }
      // Two positions with a 9-hour gap.
      return new Response(
        JSON.stringify({
          entries: [
            { start: "2026-01-01T00:00:00Z", position: { lat: 6.4, lon: 3.4 }, weather: "clear", nearestPort: "Lagos", distanceFromPortNm: 43 },
            { start: "2026-01-01T09:00:00Z", position: { lat: 6.5, lon: 3.5 }, weather: "clear" },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await connector.search("MV Test");
    expect(result).not.toBeNull();
    expect(result!.continuityReport.gapsDetected).toBe(1);
    const assessment = OSAE.getAssessment("v1");
    expect(assessment).toBeDefined();
    // Rule: OSAE — not the connector — assigns priority. The connector output has no risk field.
    expect((result as unknown as Record<string, unknown>).risk).toBeUndefined();
    // Officer-safe narrative must never say "high risk".
    expect(result!.continuityReport.darkEvents[0].explanation.toLowerCase()).not.toMatch(/\b(high|medium|low) risk\b/);
  });
});

describe("AISBehaviourAnalyzer", () => {
  it("detects a >6h gap and produces evidence, not a risk label", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v1",
      events: [
        { timestamp: "2026-01-01T00:00:00Z", latitude: 6.4, longitude: 3.4, weather: "clear", nearestPort: "Lagos", distanceFromPortNm: 43 },
        { timestamp: "2026-01-01T09:00:00Z", latitude: 6.5, longitude: 3.5 },
      ],
      historicalDarkEvents: [
        { type: "AIS_DARK", startAt: "2025-12-01T00:00:00Z", endAt: "2025-12-01T08:00:00Z", durationHours: 8, weatherContext: "clear", nearestPort: "Lagos", distanceFromPortNm: 40, distanceFromCoastNm: null, trafficDensity: "moderate", historicalFrequency: 0, confidence: 0.7, explanation: "prior" },
      ],
    });
    expect(report.gapsDetected).toBe(1);
    expect(report.continuous).toBe(false);
    const d = report.darkEvents[0];
    expect(d.type).toBe("AIS_DARK");
    expect(d.nearestPort).toBe("Lagos");
    expect(d.explanation).toMatch(/AIS transmission ceased/);
    expect(d.explanation.toLowerCase()).not.toMatch(/\b(high|medium|low) risk\b/);
  });

  it("reports continuous coverage when no gap exceeds threshold", () => {
    const r = AISBehaviourAnalyzer.analyse({
      vesselId: "v2",
      events: [
        { timestamp: "2026-01-01T00:00:00Z", latitude: 0, longitude: 0 },
        { timestamp: "2026-01-01T02:00:00Z", latitude: 0, longitude: 0 },
      ],
    });
    expect(r.continuous).toBe(true);
    expect(r.gapsDetected).toBe(0);
  });
});
