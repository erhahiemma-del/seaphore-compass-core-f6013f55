/**
 * The UUID → UN/LOCODE boundary.
 *
 * `voyages.origin_port_id` is a UUID foreign key to `ports.id`. The
 * gazetteer resolves UN/LOCODEs. An earlier build wired one straight to
 * the other, which would have made every endpoint in the system resolve
 * to `unknown` — a map reporting, confidently and wrongly, that it
 * could not locate a single port.
 *
 * The whole transformation is exercised here against database-shaped
 * fixtures:
 *
 *     database row (UUID FKs + embedded ports)
 *          ↓  toPortLink
 *     PortLink (UN/LOCODE, or why not)
 *          ↓  toVoyage
 *     Voyage
 *          ↓  PortGazetteer
 *     endpoint GeoJSON
 *
 * The load-bearing assertion: a UUID must never reach
 * `PortGazetteer.resolve()` as though it were a location code.
 */
import { describe, expect, it, vi } from "vitest";

import {
  LayeredPortGazetteer,
  NimasaPortGazetteer,
  UnLocodePortGazetteer,
  looksLikeDatabaseId,
  toPortLink,
  toVoyage,
  toVoyageEndpointCollection,
  type GazetteerAsset,
  type PortGazetteer,
  type PortResolution,
  type VoyageRowLike,
} from "@/services/geospatial";

/* ── Fixtures shaped like the real join ───────────────────────── */

const ORIGIN_UUID = "3f2b1a44-8c1e-4d2a-9f77-1b0c5d8e4a21";
const DESTINATION_UUID = "9a7c0e12-4b33-4f58-8d10-6e2f7c9b1d04";

const ASSET: GazetteerAsset = {
  metadata: {
    name: "TEST_FIXTURE",
    source: "test",
    licence: "PDDL",
    seaportCount: 2,
    locatedCount: 1,
    coordinatePrecision: "degree-and-minute",
    notice: "test",
  },
  ports: {
    NLRTM: { n: "Rotterdam", c: "NL", p: [4.5, 51.9167] },
    GBLON: { n: "London", c: "GB" },
  },
};

async function gazetteer(): Promise<PortGazetteer> {
  const g = new LayeredPortGazetteer([
    new NimasaPortGazetteer(),
    new UnLocodePortGazetteer(async () => ASSET),
  ]);
  await g.load?.();
  return g;
}

/** A voyage row exactly as `VOYAGE_SELECT` returns it. */
function dbRow(overrides: Partial<VoyageRowLike> = {}): VoyageRowLike {
  return {
    id: "0c9d4b77-2e51-4a90-b3f1-77aa0c1d2e33",
    voyage_number: "TEST-001",
    vessel_id: "5b1e9c30-77a2-4c66-9d18-2f4e6a8b0c15",
    origin_port_id: ORIGIN_UUID,
    destination_port_id: DESTINATION_UUID,
    origin_port: { id: ORIGIN_UUID, unlocode: "NGAPP", country: "NG" },
    destination_port: { id: DESTINATION_UUID, unlocode: "NLRTM", country: "NL" },
    status: "in_transit",
    etd: "2026-08-01T00:00:00.000Z",
    eta: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

/* ═══════ The guard ═══════ */

describe("a UUID never reaches the gazetteer", () => {
  it("recognises database identifiers", () => {
    expect(looksLikeDatabaseId(ORIGIN_UUID)).toBe(true);
    expect(looksLikeDatabaseId(ORIGIN_UUID.replace(/-/g, ""))).toBe(true);
    // Real location codes must not be mistaken for keys.
    for (const code of ["NGAPP", "NLRTM", "NGAPAPA", "SGSIN"]) {
      expect(looksLikeDatabaseId(code), code).toBe(false);
    }
  });

  it("only ever asks the gazetteer about UN/LOCODEs", async () => {
    const inner = await gazetteer();
    const asked: string[] = [];
    const spy: PortGazetteer = {
      id: "spy",
      get size() {
        return inner.size;
      },
      resolve(code: string): PortResolution {
        asked.push(code);
        return inner.resolve(code);
      },
    };

    toVoyage(dbRow(), spy);

    expect(asked).toEqual(["NGAPP", "NLRTM"]);
    for (const code of asked) {
      expect(looksLikeDatabaseId(code), `gazetteer was asked about "${code}"`).toBe(false);
    }
    // And specifically: neither foreign key was passed through.
    expect(asked).not.toContain(ORIGIN_UUID);
    expect(asked).not.toContain(DESTINATION_UUID);
  });

  it("throws loudly if a database id is wired in as a code", async () => {
    // A wiring error, not a data condition: it must fail in
    // development and in tests rather than degrading into a
    // plausible-looking "unknown port".
    const g = await gazetteer();
    expect(() =>
      toVoyage(
        dbRow({ origin_port: { id: ORIGIN_UUID, unlocode: ORIGIN_UUID, country: "NG" } }),
        g,
      ),
    ).toThrow(/database identifier .* UN\/LOCODE was expected/i);
  });
});

/* ═══════ toPortLink, in isolation ═══════ */

describe("port link translation", () => {
  it("yields the UN/LOCODE when the join succeeded", () => {
    expect(toPortLink(ORIGIN_UUID, { id: ORIGIN_UUID, unlocode: "NGAPP", country: "NG" })).toEqual({
      state: "identified",
      unlocode: "NGAPP",
      country: "NG",
    });
  });

  it("separates the three ways it can fail", () => {
    expect(toPortLink(null, null).state).toBe("not-recorded");
    expect(toPortLink(ORIGIN_UUID, null).state).toBe("relationship-unavailable");
    expect(toPortLink(ORIGIN_UUID, { id: ORIGIN_UUID, unlocode: null }).state).toBe(
      "identifier-unavailable",
    );
    expect(toPortLink(ORIGIN_UUID, { id: ORIGIN_UUID, unlocode: "   " }).state).toBe(
      "identifier-unavailable",
    );
  });

  it("never carries the UUID forward", () => {
    for (const link of [
      toPortLink(ORIGIN_UUID, null),
      toPortLink(ORIGIN_UUID, { id: ORIGIN_UUID, unlocode: null }),
      toPortLink(ORIGIN_UUID, { id: ORIGIN_UUID, unlocode: "NGAPP" }),
    ]) {
      expect(link.unlocode).not.toBe(ORIGIN_UUID);
    }
  });

  it("accepts an embed returned as a single-element array", () => {
    // PostgREST surfaces to-one embeds either way depending on the
    // client and schema; losing the join silently would be worse.
    expect(toPortLink(ORIGIN_UUID, [{ id: ORIGIN_UUID, unlocode: "NLRTM" }]).unlocode).toBe(
      "NLRTM",
    );
  });
});

/* ═══════ End-to-end through the six cases ═══════ */

describe("database row to endpoint geometry", () => {
  it("case 1 — both ports resolve", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(dbRow(), g);

    expect(voyage.origin.code).toBe("NGAPP");
    expect(voyage.destination.code).toBe("NLRTM");
    expect(voyage.origin.position).toEqual([3.4219, 6.4281]);
    expect(voyage.destination.position).toEqual([4.5, 51.9167]);
    expect(toVoyageEndpointCollection([voyage]).features).toHaveLength(2);
  });

  it("case 2 — origin resolves, destination has no published coordinate", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(
      dbRow({ destination_port: { id: DESTINATION_UUID, unlocode: "GBLON", country: "GB" } }),
      g,
    );

    expect(voyage.origin.position).not.toBeNull();
    expect(voyage.destination.link.state).toBe("identified");
    expect(voyage.destination.resolution?.status).toBe("position-unavailable");
    expect(voyage.destination.position).toBeNull();
    expect(toVoyageEndpointCollection([voyage]).features).toHaveLength(1);
  });

  it("case 3 — joined port carries no UN/LOCODE", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(
      dbRow({ destination_port: { id: DESTINATION_UUID, unlocode: null, country: "NL" } }),
      g,
    );

    expect(voyage.destination.link.state).toBe("identifier-unavailable");
    // Never consulted, so never reported as an unknown *place*.
    expect(voyage.destination.resolution).toBeNull();
    expect(voyage.destination.code).toBeNull();
    expect(voyage.destination.position).toBeNull();
  });

  it("case 4 — the port relationship is absent", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(dbRow({ destination_port: null }), g);

    expect(voyage.destination.link.state).toBe("relationship-unavailable");
    expect(voyage.destination.resolution).toBeNull();
    expect(voyage.destination.position).toBeNull();
    // The voyage itself survives intact.
    expect(voyage.voyageNumber).toBe("TEST-001");
    expect(voyage.status).toBe("in_transit");
  });

  it("case 5 — the UN/LOCODE is unknown to the gazetteer", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(
      dbRow({ destination_port: { id: DESTINATION_UUID, unlocode: "ZZZZZ", country: "ZZ" } }),
      g,
    );

    // Identified by the database, unknown to the gazetteer — two
    // different stages, and both are reported.
    expect(voyage.destination.link.state).toBe("identified");
    expect(voyage.destination.resolution?.status).toBe("unknown");
    expect(voyage.destination.position).toBeNull();
  });

  it("case 6 — a legacy Nigerian repository code resolves through the alias", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(
      dbRow({ origin_port: { id: ORIGIN_UUID, unlocode: "NGAPAPA", country: "NG" } }),
      g,
    );

    expect(voyage.origin.resolution?.status).toBe("resolved");
    expect(voyage.origin.position).toEqual([3.4219, 6.4281]);
    if (voyage.origin.resolution?.status === "resolved") {
      expect(voyage.origin.resolution.precision).toBe("surveyed");
      expect(voyage.origin.resolution.source).toBe("nimasa");
    }
  });

  it("keeps a voyage selectable when neither end can be placed", async () => {
    const g = await gazetteer();
    const voyage = toVoyage(dbRow({ origin_port: null, destination_port: null }), g);

    expect(toVoyageEndpointCollection([voyage]).features).toHaveLength(0);
    expect(voyage.id).toBeTruthy();
    expect(voyage.voyageNumber).toBe("TEST-001");
    expect(voyage.schedule.etd).toBe("2026-08-01T00:00:00.000Z");
  });
});

/* ═══════ Status, from the authoritative enum ═══════ */

describe("voyage status comes from the generated schema types", () => {
  it("accepts every status the database enum declares", async () => {
    const { KNOWN_VOYAGE_STATUSES, toVoyageStatus } = await import("@/services/geospatial");
    // Includes `discharged` and `completed`, which a hand-written list
    // in an earlier draft had omitted — they displayed as "Status not
    // recorded" for every such voyage.
    expect(KNOWN_VOYAGE_STATUSES).toContain("discharged");
    expect(KNOWN_VOYAGE_STATUSES).toContain("completed");

    for (const status of KNOWN_VOYAGE_STATUSES) {
      expect(toVoyageStatus(status), status).toBe(status);
      expect(toVoyageStatus(status.toUpperCase()), status).toBe(status);
    }
  });

  it("reports an unrecognised status rather than swallowing it", async () => {
    const { setUnknownVoyageStatusReporter, toVoyageStatus } =
      await import("@/services/geospatial");
    const seen = vi.fn();
    const previous = setUnknownVoyageStatusReporter(seen);
    try {
      expect(toVoyageStatus("impounded")).toBe("unknown");
      expect(seen).toHaveBeenCalledWith("impounded");
    } finally {
      setUnknownVoyageStatusReporter(previous);
    }
  });

  it("treats an absent status as unknown without reporting drift", async () => {
    const { setUnknownVoyageStatusReporter, toVoyageStatus } =
      await import("@/services/geospatial");
    const seen = vi.fn();
    const previous = setUnknownVoyageStatusReporter(seen);
    try {
      // Absence is not drift. The column is NOT NULL in the schema, so
      // a missing value means a partial select, not a new enum member.
      expect(toVoyageStatus(null)).toBe("unknown");
      expect(toVoyageStatus(undefined)).toBe("unknown");
      expect(toVoyageStatus("  ")).toBe("unknown");
      expect(seen).not.toHaveBeenCalled();
    } finally {
      setUnknownVoyageStatusReporter(previous);
    }
  });
});
