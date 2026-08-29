/**
 * Live proof for the deep vessel loads — `vessel_info` and `vessel_pro`.
 *
 * These two endpoints carry roughly forty fields that Seaphore has never
 * requested: tonnage, dimensions, year built, home port, call sign, and on
 * the voyage side the departure and destination ports with UNLOCODEs, the
 * actual departure time, and the current draught.
 *
 * The test picks a real vessel out of live traffic rather than hard-coding
 * an IMO, because a fixture IMO rots — the vessel leaves, is scrapped, or
 * changes flag, and the test then proves only that a stale identifier
 * still parses. Whatever is off Lagos today is a real subject.
 *
 * Skips without a credential: an absent secret is not a broken build.
 */
import { describe, expect, it } from "vitest";

import {
  getLocationTraffic,
  getVesselIdentity,
  getVesselVoyage,
} from "@/lib/server/datalastic.server";

const CONFIGURED = Boolean(process.env["DATALASTIC_API_KEY"]);

/** The Lagos approaches — the busiest water Seaphore watches. */
const LAGOS = { lat: 6.4, lon: 3.4, radiusKm: 50 };

/**
 * One real IMO from live traffic.
 *
 * Cached across the cases in this file so the area scan — the one call
 * here that bills per vessel — is paid for once rather than five times.
 */
let subjectImo: string | null | undefined;

async function liveImo(): Promise<string | null> {
  if (subjectImo !== undefined) return subjectImo;
  const traffic = await getLocationTraffic(LAGOS);
  const withImo = (traffic.data ?? []).find((v) => v.imo);
  subjectImo = withImo?.imo ?? null;
  return subjectImo;
}

describe.skipIf(!CONFIGURED)("Datalastic deep vessel loads, live", () => {
  it("finds a real vessel to work with", async () => {
    const imo = await liveImo();

    // Everything below is meaningless without a subject, and a silent
    // skip here would make the rest of the file look like it passed.
    expect(imo).toBeTruthy();
  }, 45_000);

  it("returns static particulars the map never carries", async () => {
    const imo = await liveImo();
    const result = await getVesselIdentity({ imo: imo ?? undefined });

    expect(result.status).toBe("ok");
    const identity = result.data;
    expect(identity).not.toBeNull();
    expect(identity!.imo).toBe(imo);

    /*
     * At least one particular beyond identity must be present, or the
     * endpoint is returning nothing the cheaper `/vessel` did not already
     * have and the extra request is not worth making. Which particular
     * varies by vessel — a tug has no TEU — so the assertion is that the
     * class of data arrived, not that a specific field did.
     */
    const particulars = [
      identity!.grossTonnage,
      identity!.deadweight,
      identity!.length,
      identity!.breadth,
      identity!.yearBuilt,
    ].filter((v) => v !== null);
    expect(particulars.length).toBeGreaterThan(0);
  }, 45_000);

  it("returns voyage context with resolved ports, not just free text", async () => {
    const imo = await liveImo();
    const result = await getVesselVoyage({ imo: imo ?? undefined });

    expect(result.status).toBe("ok");
    const voyage = result.data;
    expect(voyage).not.toBeNull();
    expect(voyage!.imo).toBe(imo);

    /*
     * The point of `vessel_pro` over `/vessel`. A broadcast destination is
     * free text an officer cannot join on; a UNLOCODE and a provider port
     * uuid are what let a voyage reach the port workspace.
     *
     * A vessel at anchor with no declared voyage legitimately has none of
     * this, so the assertion is on the shape rather than on presence.
     */
    const hasResolvedPort =
      voyage!.destinationPortUnlocode !== null || voyage!.departurePortUnlocode !== null;
    const hasVoyageSignal =
      hasResolvedPort || voyage!.navigationStatus !== null || voyage!.currentDraught !== null;
    expect(hasVoyageSignal).toBe(true);
  }, 45_000);

  /*
   * Provenance. A position without the provider's own timestamp cannot be
   * aged, and an aged-wrong position is worse than a missing one — it is
   * the difference between "here an hour ago" and "here now".
   */
  it("carries the provider's own observation time, never a substitute", async () => {
    const imo = await liveImo();
    const result = await getVesselVoyage({ imo: imo ?? undefined });
    const observedAt = result.data?.observedAt;

    expect(observedAt).toBeTruthy();
    const at = Date.parse(String(observedAt));
    expect(Number.isNaN(at)).toBe(false);
    // A real AIS fix, not a placeholder epoch and not the future.
    expect(at).toBeGreaterThan(Date.parse("2000-01-01T00:00:00Z"));
    expect(at).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
  }, 45_000);

  /*
   * The capability registry claims these two endpoints are VERIFIED. That
   * claim is load-bearing — surfaces read it to decide what to render — so
   * it is checked against the provider rather than trusted.
   */
  it("agrees with what the capability registry claims", async () => {
    const imo = await liveImo();
    const [identity, voyage] = await Promise.all([
      getVesselIdentity({ imo: imo ?? undefined }),
      getVesselVoyage({ imo: imo ?? undefined }),
    ]);

    expect(identity.status).toBe("ok");
    expect(voyage.status).toBe("ok");
  }, 45_000);
});

describe.skipIf(CONFIGURED)("Datalastic without a credential", () => {
  it("refuses rather than reporting a vessel with no particulars", async () => {
    const result = await getVesselIdentity({ imo: "9865714" });

    // Never `ok` with null data: that reads downstream as a vessel the
    // provider knows nothing about, which is a different claim entirely.
    expect(result.status).toBe("credentials-missing");
    expect(result.data).toBeNull();
  });
});
