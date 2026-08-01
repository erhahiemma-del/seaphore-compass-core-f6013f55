/**
 * Client-proxy tests for the Global Fishing Watch connector.
 *
 * The connector no longer speaks HTTP directly — all authenticated
 * work lives in `src/lib/server/gfw.server.ts` behind a
 * `createServerFn` in `src/lib/gfw.functions.ts`. These tests mock
 * that server-function surface and verify the client-side contract:
 *
 *   • search() delegates to `gfwSearch` and never reads env
 *   • Evidence Packages are published to OSAE
 *   • Errors from the server function are absorbed as `null` results
 *   • healthCheck() delegates to `gfwHealth`
 *
 * Server-side logic (auth, upstream HTTP, analyser wiring) is covered
 * by the AISBehaviourAnalyzer tests below and by direct calls in
 * production; the browser never authenticates against GFW.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gfw.functions", () => ({
  gfwSearch: vi.fn(),
  gfwHealth: vi.fn(),
}));

import { GlobalFishingWatchConnector } from "./index";
import { AISBehaviourAnalyzer } from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";
import { gfwSearch, gfwHealth } from "@/lib/gfw.functions";

const mockedSearch = gfwSearch as unknown as ReturnType<typeof vi.fn>;
const mockedHealth = gfwHealth as unknown as ReturnType<typeof vi.fn>;

describe("GlobalFishingWatchConnector (client proxy)", () => {
  let connector: GlobalFishingWatchConnector;

  beforeEach(() => {
    connector = new GlobalFishingWatchConnector();
    connector.__clearCache();
    OSAE.__reset();
    mockedSearch.mockReset();
    mockedHealth.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares tier-1 AIS metadata and never claims risk semantics", () => {
    expect(connector.name).toBe("global-fishing-watch");
    expect(connector.category).toBe("AIS");
    expect(connector.authMethod).toBe("api_key");
    expect(connector.description.toLowerCase()).not.toMatch(/\b(high|medium|low) risk\b/);
  });

  it("registers unconditionally — never inspects env on the client", () => {
    // The connector is intentionally credential-agnostic in the browser.
    expect(connector.hasCredentials()).toBe(true);
  });

  it("healthCheck delegates to the server function and surfaces auth failures", async () => {
    mockedHealth.mockResolvedValueOnce({
      status: "down",
      latencyMs: 42,
      message: "Authentication Failed",
    });
    const h = await connector.healthCheck();
    expect(mockedHealth).toHaveBeenCalledTimes(1);
    expect(h.status).toBe("down");
    expect(h.message).toMatch(/Authentication Failed/);
  });

  it("healthCheck surfaces missing credentials without touching env on the client", async () => {
    mockedHealth.mockResolvedValueOnce({
      status: "down",
      latencyMs: 0,
      message: "GLOBAL_FISHING_WATCH_API_KEY not configured",
    });
    const h = await connector.healthCheck();
    expect(h.status).toBe("down");
    expect(h.message).toMatch(/not configured/);
  });

  it("caches Evidence Packages by query — no duplicate server calls", async () => {
    mockedSearch.mockResolvedValue({
      package: {
        vessel: {
          vesselId: "v1",
          imo: "9074729",
          mmsi: null,
          callSign: null,
          flag: "NG",
          name: "MV Test",
        },
        lastPosition: null,
        movementHistory: [],
        continuityReport: AISBehaviourAnalyzer.analyse({ vesselId: "v1", events: [] }),
        evidenceUrl: "https://globalfishingwatch.org/vessel-search/vessels/v1",
      },
    });
    await connector.search("MV Test");
    await connector.search("MV Test");
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });

  it("publishes AIS continuity evidence to OSAE (connector never assigns risk)", async () => {
    const continuityReport = AISBehaviourAnalyzer.analyse({
      vesselId: "v1",
      events: [
        {
          timestamp: "2026-01-01T00:00:00Z",
          latitude: 6.4,
          longitude: 3.4,
          weather: "clear",
          nearestPort: "Lagos",
          distanceFromPortNm: 43,
        },
        { timestamp: "2026-01-01T09:00:00Z", latitude: 6.5, longitude: 3.5 },
      ],
    });
    mockedSearch.mockResolvedValueOnce({
      package: {
        vessel: {
          vesselId: "v1",
          imo: "9074729",
          mmsi: null,
          callSign: null,
          flag: null,
          name: "MV Test",
        },
        lastPosition: null,
        movementHistory: [],
        continuityReport,
        evidenceUrl: "https://globalfishingwatch.org/vessel-search/vessels/v1",
      },
    });

    const result = await connector.search("MV Test");
    expect(result).not.toBeNull();
    expect(result!.continuityReport.gapsDetected).toBe(1);
    const assessment = OSAE.getAssessment("v1");
    expect(assessment).toBeDefined();
    expect((result as unknown as Record<string, unknown>).risk).toBeUndefined();
    expect(result!.continuityReport.darkEvents[0].explanation.toLowerCase()).not.toMatch(
      /\b(high|medium|low) risk\b/,
    );
  });

  it("returns null when the server function reports missing credentials", async () => {
    mockedSearch.mockResolvedValueOnce({
      package: null,
      error: { code: "GFW_CREDENTIALS_MISSING", message: "Missing GLOBAL_FISHING_WATCH_API_KEY" },
    });
    const result = await connector.search("MV Test");
    expect(result).toBeNull();
    expect(OSAE.getAssessment("v1")).toBeUndefined();
  });

  it("normalize never throws on malformed input", () => {
    expect(() => connector.normalize({ sourceRef: "junk" })).not.toThrow();
    expect(connector.normalize({ sourceRef: "junk" }).entityId).toBe("");
  });
});

describe("AISBehaviourAnalyzer", () => {
  it("detects a >6h gap and produces evidence, not a risk label", () => {
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: "v1",
      events: [
        {
          timestamp: "2026-01-01T00:00:00Z",
          latitude: 6.4,
          longitude: 3.4,
          weather: "clear",
          nearestPort: "Lagos",
          distanceFromPortNm: 43,
        },
        { timestamp: "2026-01-01T09:00:00Z", latitude: 6.5, longitude: 3.5 },
      ],
      historicalDarkEvents: [
        {
          type: "AIS_DARK",
          kind: "disabling",
          startAt: "2025-12-01T00:00:00Z",
          endAt: "2025-12-01T08:00:00Z",
          durationHours: 8,
          startLocation: null,
          endLocation: null,
          weatherContext: "clear",
          nearestPort: "Lagos",
          nearestPortEnd: null,
          distanceFromPortNm: 40,
          distanceFromCoastNm: null,
          trafficDensity: "moderate",
          historicalFrequency: 0,
          confidence: 0.7,
          explanation: "prior",
        },
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
