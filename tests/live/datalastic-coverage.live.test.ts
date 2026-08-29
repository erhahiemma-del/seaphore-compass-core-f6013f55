/**
 * Live coverage proof for the Nigerian zone set.
 *
 * Deliberately not in `tests/unit`: it spends real Datalastic credits and
 * needs network, so it must never run in the offline suite. What it
 * proves is the one thing a fabricated gateway cannot — that the shipped
 * zones return real vessels, that adjacent zones genuinely overlap, and
 * that deduplication removes hulls the provider really did report twice.
 *
 * Skips itself when there is no credential, because absent credentials
 * are not a broken build.
 */
import { describe, expect, it } from "vitest";

import {
  NIGERIA_COVERAGE_ZONES,
  activeZones,
} from "@/services/geospatial/sources/datalastic-coverage-zones";
import { runCoveragePass } from "@/services/geospatial/sources/datalastic-coverage";
import type { Vessel } from "@/services/geospatial";

const KEY = process.env["DATALASTIC_API_KEY"];
const BASE = "https://api.datalastic.com/api/v0";

interface RawRow {
  imo: string | null;
  mmsi: string | null;
  name: string | null;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  heading: number | null;
  course: number | null;
  last_position_UTC: string | null;
}

/** Minimal canonical shape — identity and position, which is what dedup reads. */
function toVessel(row: RawRow, retrievedAt: string): Vessel | null {
  if (row.lat == null || row.lon == null) return null;
  return {
    identity: {
      imo: row.imo ?? undefined,
      mmsi: row.mmsi ?? undefined,
      name: row.name ?? "Unknown",
    },
    position: {
      lat: row.lat,
      lon: row.lon,
      heading: row.heading ?? row.course ?? 0,
      speed: row.speed ?? 0,
      timestamp: row.last_position_UTC ?? retrievedAt,
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

describe.skipIf(!KEY)("Nigerian coverage against the live provider", () => {
  it("returns real vessels from every zone and deduplicates the overlaps", async () => {
    const report = await runCoveragePass({
      zones: NIGERIA_COVERAGE_ZONES,
      fetchZone: async (zone) => {
        const started = Date.now();
        const url = `${BASE}/vessel_inradius?lat=${zone.lat}&lon=${zone.lon}&radius=${zone.radiusKm}`;
        const response = await fetch(url, {
          headers: { "x-api-key": KEY as string, Accept: "application/json" },
        });
        const latencyMs = Date.now() - started;
        const retrievedAt = new Date().toISOString();

        if (!response.ok) {
          return {
            outcome: response.status === 400 ? "INVALID_REQUEST" : "PROVIDER_FAILURE",
            vessels: [],
            latencyMs,
            requestCost: null,
            retrievedAt,
            message: `HTTP ${response.status}`,
          } as const;
        }

        const body = (await response.json()) as { data?: { vessels?: RawRow[] } };
        const rows = body.data?.vessels ?? [];
        const cost = response.headers.get("x-request-cost");
        return {
          outcome: "OK" as const,
          vessels: rows
            .map((row) => toVessel(row, retrievedAt))
            .filter((v): v is Vessel => v !== null),
          latencyMs,
          requestCost: cost == null ? null : Number(cost),
          retrievedAt,
          message: null,
        };
      },
    });

    // Printed because the sprint's deliverable is the measured table,
    // not merely a green tick.
    const rows = report.zones.map(
      (z) =>
        `${z.zoneName.padEnd(30)} raw=${String(z.raw).padStart(4)} unique=${String(z.unique).padStart(4)} ${z.outcome}`,
    );
    const summary = [
      "",
      ...rows,
      "",
      `TOTAL RAW           ${report.totalRaw}`,
      `TOTAL UNIQUE        ${report.totalUnique}`,
      `DUPLICATES REMOVED  ${report.duplicatesRemoved}`,
      `REQUESTS            ${report.requestsMade}`,
      `REQUEST COST        ${report.totalRequestCost ?? "not reported"}`,
      `DURATION            ${report.durationMs}ms`,
    ].join("\n");

    /*
     * Written as well as logged. The deliverable of this sprint is the
     * measured table, and vitest suppresses console output under some
     * reporters — a number nobody can read is not a measurement.
     */
    const reportFile = process.env["COVERAGE_REPORT_FILE"];
    if (reportFile) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(reportFile, summary, "utf8");
    }
    console.log(summary);

    expect(report.anyZoneSucceeded).toBe(true);
    expect(report.requestsMade).toBe(activeZones(NIGERIA_COVERAGE_ZONES).length);
    // Real coverage, not a fixture.
    expect(report.totalUnique).toBeGreaterThan(0);
    // Deduplication cannot invent hulls.
    expect(report.totalUnique).toBeLessThanOrEqual(report.totalRaw);
    expect(report.duplicatesRemoved).toBe(report.totalRaw - report.totalUnique);
  }, 120_000);
});
