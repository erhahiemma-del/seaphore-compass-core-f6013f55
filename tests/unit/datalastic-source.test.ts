/**
 * Datalastic — provider contract tests.
 *
 * The assertions here are the honesty rules of the integration, not
 * implementation trivia: a billing state must not read as an empty sea, a
 * provider failure must not read as "no vessels", a timestamp must be the
 * provider's own, and the credential must not exist anywhere the browser
 * can reach.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DatalasticVesselSource,
  DATALASTIC_SOURCE_ID,
  circleForBbox,
  sourceStatusForDatalastic,
  toCanonicalVessel,
  type DatalasticGateway,
} from "@/services/geospatial/sources/datalastic-vessel-source";
import { datalasticStatusForHttp, parseVesselRow } from "@/lib/server/datalastic.server";
import type {
  DatalasticHistoryPoint,
  DatalasticResult,
  DatalasticStatus,
  DatalasticVesselRecord,
} from "@/connectors/datalastic/types";
import { clearVesselSources, listVesselSources } from "@/services/geospatial/vessel-source";
import { registerDatalasticSource } from "@/services/geospatial/sources/datalastic-vessel-source";

const OBSERVED_AT = "2026-08-28T20:00:00.000Z";
const NOW = Date.parse("2026-08-28T20:10:00.000Z");

function result<T>(
  status: DatalasticStatus,
  data: T | null,
  message: string | null = null,
): DatalasticResult<T> {
  return {
    status,
    data,
    message,
    endpoint: "/api/v0/vessel_inarea",
    httpStatus: status === "ok" ? 200 : 402,
    latencyMs: 12,
    retrievedAt: "2026-08-28T20:10:00.000Z",
    retryAfterSeconds: null,
    cached: false,
  };
}

const LAGOS_RECORD: DatalasticVesselRecord = {
  uuid: "abc",
  imo: "9837456",
  mmsi: "657123456",
  name: "MV EXAMPLE",
  callSign: "5NAB1",
  flag: "NG",
  type: "Crude Oil Tanker",
  lat: 6.3,
  lon: 3.4,
  speed: 11.2,
  course: 214,
  heading: 213,
  destination: "NGLOS",
  eta: null,
  observedAt: OBSERVED_AT,
  navigationStatus: "Under way using engine",
};

function gatewayReturning(
  area: DatalasticResult<readonly DatalasticVesselRecord[]>,
  history?: DatalasticResult<readonly DatalasticHistoryPoint[]>,
): DatalasticGateway {
  return {
    areaTraffic: async () => area,
    history: async () =>
      history ?? result<readonly DatalasticHistoryPoint[]>("empty", null, "No archive held."),
    find: async () => area,
  };
}

describe("Datalastic · HTTP status → honest provider state", () => {
  it("distinguishes credential, entitlement, rate and outage failures", () => {
    expect(datalasticStatusForHttp(401)).toBe("unauthorized");
    expect(datalasticStatusForHttp(403)).toBe("unauthorized");
    expect(datalasticStatusForHttp(402)).toBe("subscription-inactive");
    expect(datalasticStatusForHttp(429)).toBe("rate-limited");
    expect(datalasticStatusForHttp(500)).toBe("unavailable");
    expect(datalasticStatusForHttp(503)).toBe("unavailable");
  });

  it("treats a 404 as no record rather than a provider failure", () => {
    expect(datalasticStatusForHttp(404)).toBe("empty");
  });

  it("never maps a failure onto the source registry's empty state", () => {
    for (const status of [
      "unauthorized",
      "subscription-inactive",
      "rate-limited",
      "unavailable",
    ] as const) {
      expect(sourceStatusForDatalastic(status)).not.toBe("empty");
    }
    expect(sourceStatusForDatalastic("empty")).toBe("empty");
    expect(sourceStatusForDatalastic("subscription-inactive")).toBe("subscription-inactive");
    expect(sourceStatusForDatalastic("credentials-missing")).toBe("credentials-missing");
  });
});

describe("Datalastic · normalization", () => {
  it("preserves identity, position and the provider timestamp", () => {
    const vessel = toCanonicalVessel(LAGOS_RECORD, "2026-08-28T20:10:00.000Z");
    expect(vessel).not.toBeNull();
    expect(vessel?.identity).toMatchObject({
      imo: "9837456",
      mmsi: "657123456",
      name: "MV EXAMPLE",
      callSign: "5NAB1",
      flag: "NG",
    });
    expect(vessel?.position.lat).toBe(6.3);
    expect(vessel?.position.lon).toBe(3.4);
    expect(vessel?.position.speed).toBe(11.2);
    expect(vessel?.position.heading).toBe(214);
    expect(vessel?.position.headingReported).toBe(true);
    expect(vessel?.position.destination).toBe("NGLOS");
  });

  it("uses the provider timestamp, never the retrieval time", () => {
    const vessel = toCanonicalVessel(LAGOS_RECORD, "2026-08-28T20:10:00.000Z");
    expect(vessel?.position.timestamp).toBe(OBSERVED_AT);
    expect(vessel?.provenance?.observedAt).toBe(OBSERVED_AT);
    expect(vessel?.provenance?.retrievedAt).toBe("2026-08-28T20:10:00.000Z");
  });

  it("carries commercial provenance and never claims a government source", () => {
    const vessel = toCanonicalVessel(LAGOS_RECORD, "2026-08-28T20:10:00.000Z");
    expect(vessel?.provenance?.source).toBe(DATALASTIC_SOURCE_ID);
    expect(vessel?.provenance?.provider).toBe("Datalastic");
    expect(JSON.stringify(vessel)).not.toMatch(/NIMASA|official|government/i);
  });

  it("marks heading as unreported when the provider reported no course", () => {
    const vessel = toCanonicalVessel(
      { ...LAGOS_RECORD, course: null, heading: null },
      "2026-08-28T20:10:00.000Z",
    );
    expect(vessel?.position.headingReported).toBe(false);
    expect(vessel?.position.heading).toBe(0);
  });

  it("refuses a row with no provider timestamp rather than stamping now", () => {
    expect(toCanonicalVessel({ ...LAGOS_RECORD, observedAt: null }, OBSERVED_AT)).toBeNull();
  });

  it("falls back to MMSI when no IMO is reported, and never invents a key", () => {
    const vessel = toCanonicalVessel({ ...LAGOS_RECORD, imo: null }, OBSERVED_AT);
    expect(vessel?.identity.imo).toBe("657123456");
    expect(toCanonicalVessel({ ...LAGOS_RECORD, imo: null, mmsi: null }, OBSERVED_AT)).toBeNull();
  });

  it("reads the provider row shape, including the epoch timestamp form", () => {
    const parsed = parseVesselRow({
      uuid: "u",
      name: "TEST",
      mmsi: 657000000,
      lat: 5,
      lon: 4,
      speed: 8,
      course: 90,
      last_position_epoch: 1787000000,
    });
    expect(parsed?.mmsi).toBe("657000000");
    expect(parsed?.observedAt).toBe(new Date(1787000000 * 1000).toISOString());
  });
});

describe("Datalastic · vessel source behaviour", () => {
  beforeEach(() => clearVesselSources());

  it("returns validated vessels for the Nigerian EEZ by default", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("ok", [LAGOS_RECORD])),
      now: () => NOW,
    });
    const vessels = await source.list();
    expect(vessels).toHaveLength(1);
    const report = source.report();
    expect(report.status).toBe("ok");
    expect(report.connected).toBe(true);
    expect(report.recordCount).toBe(1);
  });

  it("applies the existing validation layer — 0,0 is warned, not silently accepted", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("ok", [{ ...LAGOS_RECORD, lat: 0, lon: 0 }])),
      now: () => NOW,
    });
    await source.list();
    // 0,0 sits in the Gulf of Guinea approach, so the existing rules warn
    // rather than reject. The point is that the commercial feed is graded
    // by the same rules, not exempted from them.
    expect(source.validation()?.warningsByCode["null-island"]).toBe(1);
  });

  it("rejects an impossible coordinate from the commercial feed", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("ok", [{ ...LAGOS_RECORD, lat: 91 }])),
      now: () => NOW,
    });
    expect(await source.list()).toHaveLength(0);
    expect(source.report().rejectedCount).toBeGreaterThan(0);
  });

  it("flags a future provider timestamp instead of accepting it silently", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(
        result("ok", [{ ...LAGOS_RECORD, observedAt: "2027-01-01T00:00:00.000Z" }]),
      ),
      now: () => NOW,
    });
    await source.list();
    expect(source.validation()?.warningsByCode["future-timestamp"]).toBe(1);
  });

  it("reports a plan limit as a plan limit, not as an empty sea", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("subscription-inactive", null, "Plan does not include it.")),
      now: () => NOW,
    });
    expect(await source.list()).toHaveLength(0);
    const report = source.report();
    expect(report.status).toBe("subscription-inactive");
    expect(report.connected).toBe(false);
    expect(report.message).toContain("Plan");
  });

  it("reports an outage as unreachable and refuses to claim confidence", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("unavailable", null, "Datalastic is unreachable.")),
      now: () => NOW,
    });
    await source.list();
    const report = source.report();
    expect(report.status).toBe("upstream-error");
    expect(report.confidence).toBeNull();
    expect(report.failureCount).toBe(1);
  });

  it("reports rate limiting without spinning retries", async () => {
    let calls = 0;
    const source = new DatalasticVesselSource({
      gateway: {
        areaTraffic: async () => {
          calls += 1;
          return result<readonly DatalasticVesselRecord[]>("rate-limited", null, "Slow down.");
        },
        history: async () => result<readonly DatalasticHistoryPoint[]>("empty", null),
        find: async () => result<readonly DatalasticVesselRecord[]>("empty", null),
      },
      now: () => NOW,
    });
    await source.list();
    expect(calls).toBe(1);
    expect(source.report().status).toBe("upstream-error");
  });

  it("returns an unavailable history with a reason rather than an empty track", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("ok", [LAGOS_RECORD])),
      now: () => NOW,
    });
    const history = await source.history("9837456");
    expect(history.status).toBe("unavailable");
    if (history.status === "unavailable") expect(history.reason.length).toBeGreaterThan(0);
  });

  it("normalizes provider history into an observed recorded track", async () => {
    const points: DatalasticHistoryPoint[] = [
      { lat: 6.1, lon: 3.2, speed: 10, course: 200, heading: null, observedAt: OBSERVED_AT },
      {
        lat: 6.3,
        lon: 3.4,
        speed: 11,
        course: 210,
        heading: null,
        observedAt: "2026-08-28T20:05:00.000Z",
      },
    ];
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(result("ok", [LAGOS_RECORD]), result("ok", points)),
      now: () => NOW,
    });
    const history = await source.history("9837456");
    expect(history.status).toBe("available");
    if (history.status === "available") {
      expect(history.track).toHaveLength(2);
      expect(history.track[0]?.kind).toBe("OBSERVED");
      expect(history.track[0]?.timestamp).toBe(OBSERVED_AT);
      expect(history.events).toHaveLength(0);
    }
  });

  it("returns every search match so ambiguity is resolved explicitly", async () => {
    const source = new DatalasticVesselSource({
      gateway: gatewayReturning(
        result("ok", [LAGOS_RECORD, { ...LAGOS_RECORD, imo: "9000001", name: "MV EXAMPLE II" }]),
      ),
      now: () => NOW,
    });
    const matches = await source.search({ name: "EXAMPLE" });
    expect(matches.map((vessel) => vessel.identity.imo)).toEqual(["9837456", "9000001"]);
  });

  it("registers itself as a commercial source that may claim live", () => {
    registerDatalasticSource({ gateway: gatewayReturning(result("ok", [LAGOS_RECORD])) });
    const descriptor = listVesselSources()
      .map((source) => source.describe())
      .find((entry) => entry.id === DATALASTIC_SOURCE_ID);
    expect(descriptor?.type).toBe("COMMERCIAL");
    expect(descriptor?.defaultEnabled).toBe(true);
    expect(descriptor?.caveat).toBeTruthy();
  });

  it("derives the area circle from the one existing EEZ definition", () => {
    const circle = circleForBbox([2.5, 3.0, 9.5, 8.5]);
    expect(circle.lat).toBeCloseTo(5.75, 5);
    expect(circle.lon).toBeCloseTo(6, 5);
    expect(circle.radiusKm).toBeGreaterThan(0);
  });
});

describe("Datalastic · credential containment", () => {
  it("keeps DATALASTIC_API_KEY out of every client-reachable module", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(join(process.cwd(), "src"));
    /*
     * The rule is about *reading* the credential, not naming it: the AIS
     * provider registry deliberately lists env var names so an officer
     * can see what a provider is waiting for, and a name is not a secret.
     */
    const leaks = files.filter(
      (file) =>
        !/\.server\.tsx?$/.test(file) &&
        !/\.functions\.tsx?$/.test(file) &&
        /process\.env\[?["']?DATALASTIC_API_KEY/.test(readFileSync(file, "utf8")),
    );
    expect(leaks, `Client-reachable references: ${leaks.join(", ")}`).toEqual([]);
    // And no VITE_ alias may exist anywhere.
    const viteAliases = files.filter((file) =>
      readFileSync(file, "utf8").includes("VITE_DATALASTIC"),
    );
    expect(viteAliases).toEqual([]);
  });
});
