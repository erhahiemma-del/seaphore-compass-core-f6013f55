/**
 * The voyage truth contract.
 *
 * One property dominates this file: a voyage is a *relationship*, not a
 * path, and the model must make it impossible to accidentally claim
 * otherwise. `pathKnown` is required and hard-coded false by the only
 * constructor; the only route to `true` demands real positions.
 *
 * The second property is the gazetteer's three-way resolution. "Port
 * exists, position unpublished" is a distinct state from "unknown port"
 * and from "resolved", and collapsing any pair of them either erases a
 * real port or invents a coordinate.
 */
import { describe, expect, it } from "vitest";

import {
  LayeredPortGazetteer,
  NimasaPortGazetteer,
  UnLocodePortGazetteer,
  arrivalState,
  departureState,
  endpointCoverage,
  hasDrawableRelationship,
  isLocated,
  journeyIntelligence,
  normalizePortCode,
  scheduleProgress,
  toVoyage,
  toVoyageEndpointCollection,
  toVoyageStatus,
  voyageBounds,
  withObservedTrack,
  type GazetteerAsset,
  type PortGazetteer,
  type VoyageRowLike,
} from "@/services/geospatial";

/* ── Fixtures ─────────────────────────────────────────────────── */

/** TEST_FIXTURE gazetteer — a handful of ports, three resolution states. */
const FIXTURE_ASSET: GazetteerAsset = {
  metadata: {
    name: "TEST_FIXTURE",
    source: "test",
    licence: "PDDL",
    seaportCount: 3,
    locatedCount: 2,
    coordinatePrecision: "degree-and-minute",
    notice: "test",
  },
  ports: {
    NLRTM: { n: "Rotterdam", c: "NL", p: [4.5, 51.9167] },
    SGSIN: { n: "Singapore", c: "SG", p: [103.85, 1.2833] },
    // Real port, no published position — the case that matters most.
    GBLON: { n: "London", c: "GB" },
  },
};

function fixtureGazetteer(): UnLocodePortGazetteer {
  return new UnLocodePortGazetteer(async () => FIXTURE_ASSET);
}

/**
 * A voyage row in the shape `VOYAGE_SELECT` returns: UUID foreign keys
 * plus the embedded `ports` rows that carry the UN/LOCODEs.
 *
 * `origin`/`destination` are the *codes*, written into the joined port
 * rows rather than into the UUID columns — putting a code in
 * `origin_port_id` is exactly the confusion this shape exists to
 * prevent. Pass `null` for a code to drop the relationship entirely.
 */
function row(
  overrides: Partial<VoyageRowLike> & {
    origin?: string | null;
    destination?: string | null;
  } = {},
): VoyageRowLike {
  const { origin = "NLRTM", destination = "SGSIN", ...rest } = overrides;
  const originId = "11111111-1111-4111-8111-111111111111";
  const destinationId = "22222222-2222-4222-8222-222222222222";
  return {
    id: "v-1",
    voyage_number: "TEST-001",
    vessel_id: "vessel-1",
    origin_port_id: origin === null ? null : originId,
    destination_port_id: destination === null ? null : destinationId,
    origin_port: origin === null ? null : { id: originId, unlocode: origin },
    destination_port: destination === null ? null : { id: destinationId, unlocode: destination },
    status: "in_transit",
    etd: "2026-08-01T00:00:00.000Z",
    eta: "2026-08-21T00:00:00.000Z",
    ...rest,
  };
}

/* ═══════ pathKnown ═══════ */

describe("a voyage is not a track", () => {
  it("constructs with pathKnown false, always", async () => {
    const g = fixtureGazetteer();
    await g.load();
    const voyage = toVoyage(row(), g);
    expect(voyage.pathKnown).toBe(false);
    expect(voyage.observedTrack).toEqual([]);
  });

  it("stays pathKnown false however complete the row is", async () => {
    // Every schedule field populated, both ports resolved, status
    // arrived — a voyage with nothing missing except the one thing the
    // table never holds.
    const g = fixtureGazetteer();
    await g.load();
    const voyage = toVoyage(
      row({
        atd: "2026-08-01T06:00:00.000Z",
        ata: "2026-08-20T18:00:00.000Z",
        status: "arrived",
      }),
      g,
    );
    expect(voyage.pathKnown).toBe(false);
    expect(journeyIntelligence(voyage)).toBe("VOYAGE_RELATIONSHIP");
  });

  it("only grants pathKnown to a genuine multi-point track", async () => {
    const g = fixtureGazetteer();
    await g.load();
    const voyage = toVoyage(row(), g);

    // One fix is a position, not a path.
    expect(withObservedTrack(voyage, [[4.5, 51.9]]).pathKnown).toBe(false);
    expect(withObservedTrack(voyage, []).pathKnown).toBe(false);

    const tracked = withObservedTrack(voyage, [
      [4.5, 51.9],
      [3.0, 50.0],
      [103.85, 1.28],
    ]);
    expect(tracked.pathKnown).toBe(true);
    expect(journeyIntelligence(tracked)).toBe("OBSERVED_TRACK");
  });

  it("draws nothing between the two endpoints, ever", async () => {
    /*
     * The M2 decision, enforced. An earlier draft connected resolved
     * endpoints with a dotted arc, captioned as derived. A line between
     * two places on a map is read as a route regardless of its caption,
     * so the projection now emits points only.
     *
     * The check is structural: every feature the projection produces
     * must be a Point. A LineString reappearing here — under any name —
     * fails.
     */
    const g = fixtureGazetteer();
    await g.load();
    const voyage = toVoyage(row(), g);
    const features = toVoyageEndpointCollection([voyage]).features;

    expect(features).toHaveLength(2);
    for (const feature of features) {
      expect(feature.geometry.type).toBe("Point");
    }
  });
});

/* ═══════ Gazetteer ═══════ */

describe("port resolution has three outcomes", () => {
  it("resolves a port with a published position", async () => {
    const g = fixtureGazetteer();
    await g.load();
    const result = g.resolve("NLRTM");
    expect(result.status).toBe("resolved");
    expect(isLocated(result)).toBe(true);
    if (result.status === "resolved") {
      expect(result.position).toEqual([4.5, 51.9167]);
      expect(result.precision).toBe("degree-minute");
    }
  });

  it("separates a port with no published position from an unknown code", async () => {
    const g = fixtureGazetteer();
    await g.load();

    const unplaced = g.resolve("GBLON");
    expect(unplaced.status).toBe("position-unavailable");
    if (unplaced.status === "position-unavailable") {
      expect(unplaced.name).toBe("London");
      expect(unplaced.reason).toMatch(/no coordinates/i);
    }

    const nonsense = g.resolve("ZZZZZ");
    expect(nonsense.status).toBe("unknown");
  });

  it("never yields a position for anything but a resolved port", async () => {
    const g = fixtureGazetteer();
    await g.load();
    for (const code of ["GBLON", "ZZZZZ"]) {
      expect(isLocated(g.resolve(code))).toBe(false);
    }
  });

  it("answers unknown, not resolved, before it has loaded", () => {
    // A gazetteer that has not loaded must not report ports as absent
    // in a way that reads as "no such port".
    const g = fixtureGazetteer();
    const result = g.resolve("NLRTM");
    expect(result.status).toBe("unknown");
    if (result.status === "unknown") expect(result.reason).toMatch(/not loaded/i);
  });

  it("survives a gazetteer that fails to load", async () => {
    const g = new UnLocodePortGazetteer(async () => {
      throw new Error("network down");
    });
    await expect(g.load()).resolves.toBeUndefined();
    expect(g.resolve("NLRTM").status).toBe("unknown");
  });

  it("normalises identifiers without coercing them", () => {
    expect(normalizePortCode(" ng app ")).toBe("NGAPP");
    expect(normalizePortCode("nlrtm")).toBe("NLRTM");
    // Not a code it recognises — must stay unrecognisable, not be padded.
    expect(normalizePortCode("XX")).toBe("XX");
  });
});

describe("NIMASA ports keep their real positions", () => {
  const nimasa = new NimasaPortGazetteer();

  it("resolves both the repository key and the real UN/LOCODE", () => {
    for (const code of ["NGAPAPA", "NGAPP"]) {
      const result = nimasa.resolve(code);
      expect(result.status, code).toBe("resolved");
      if (result.status === "resolved") {
        expect(result.position[1]).toBeCloseTo(6.4281, 3);
        expect(result.precision).toBe("surveyed");
      }
    }
  });

  it("outranks the global set, which has no position for Apapa", async () => {
    // The reason the layering order is what it is: UN/LOCODE lists
    // Apapa but publishes no coordinates, so putting the global set
    // first would downgrade the home port to "position unavailable".
    const globalOnly = new UnLocodePortGazetteer(async () => ({
      ...FIXTURE_ASSET,
      ports: { ...FIXTURE_ASSET.ports, NGAPP: { n: "Apapa", c: "NG" } },
    }));
    await globalOnly.load();
    expect(globalOnly.resolve("NGAPP").status).toBe("position-unavailable");

    const layered = new LayeredPortGazetteer([new NimasaPortGazetteer(), globalOnly]);
    expect(layered.resolve("NGAPP").status).toBe("resolved");
  });

  it("prefers a real position but remembers a known-but-unplaced port", async () => {
    const globalOnly = fixtureGazetteer();
    await globalOnly.load();
    const layered = new LayeredPortGazetteer([new NimasaPortGazetteer(), globalOnly]);

    // NIMASA says "unknown", the global set says "no position" — the
    // more informative answer must win.
    expect(layered.resolve("GBLON").status).toBe("position-unavailable");
    expect(layered.resolve("ZZZZZ").status).toBe("unknown");
  });
});

/* ═══════ Rendering ═══════ */

describe("voyage projection never invents geometry", () => {
  async function gz(): Promise<PortGazetteer> {
    const g = new LayeredPortGazetteer([new NimasaPortGazetteer(), fixtureGazetteer()]);
    await g.load();
    return g;
  }

  it("emits an endpoint only where a position genuinely resolved", async () => {
    const g = await gz();
    // Destination is a real port with no published position.
    const voyage = toVoyage(row({ destination: "GBLON" }), g);
    const features = toVoyageEndpointCollection([voyage]).features;
    expect(features).toHaveLength(1);
    expect(features[0].properties.role).toBe("origin");
    expect(hasDrawableRelationship(voyage)).toBe(false);
  });

  it("keeps a voyage as a record even when neither port resolves", async () => {
    // The rule that matters most: unresolved geography is a resolution
    // state, not evidence the voyage did not happen. Nothing is drawn,
    // and the voyage still exists with both endpoints described.
    const g = await gz();
    const voyage = toVoyage(row({ origin: "ZZZZZ", destination: "QQQQQ" }), g);

    expect(toVoyageEndpointCollection([voyage]).features).toHaveLength(0);
    expect(voyage.id).toBe("v-1");
    expect(voyage.voyageNumber).toBe("TEST-001");
    expect(voyage.origin.code).toBe("ZZZZZ");
    expect(voyage.origin.resolution?.status).toBe("unknown");
    expect(voyage.destination.resolution?.status).toBe("unknown");
  });

  it("counts endpoint coverage across a set", async () => {
    const g = await gz();
    const coverage = endpointCoverage([
      toVoyage(row(), g),
      toVoyage(row({ destination: "GBLON" }), g),
      toVoyage(row({ origin: "ZZZZZ", destination: "QQQQQ" }), g),
    ]);
    expect(coverage).toEqual({
      voyages: 3,
      bothResolved: 1,
      oneResolved: 1,
      neitherResolved: 1,
    });
  });

  it("carries precision through to the feature", async () => {
    const g = await gz();
    const voyage = toVoyage(row({ origin: "NGAPAPA" }), g);
    const origin = toVoyageEndpointCollection([voyage]).features.find(
      (f) => f.properties.role === "origin",
    );
    expect(origin?.properties.precision).toBe("surveyed");
    expect(origin?.properties.source).toBe("nimasa");
  });

  it("bounds only the endpoints that resolved", async () => {
    const g = await gz();
    const voyage = toVoyage(row({ destination: "GBLON" }), g);
    const bounds = voyageBounds([voyage]);
    expect(bounds).not.toBeNull();
    expect(bounds?.[0]).toEqual(bounds?.[1]);
    expect(voyageBounds([])).toBeNull();
  });
});

/* ═══════ Schedule ═══════ */

describe("schedule facts are kept apart from each other", () => {
  async function voyageWith(patch: Partial<VoyageRowLike>) {
    const g = fixtureGazetteer();
    await g.load();
    return toVoyage(row(patch), g);
  }

  it("distinguishes actual, estimated and unrecorded", async () => {
    expect(departureState(await voyageWith({ atd: "2026-08-01T06:00:00.000Z" }))).toBe("actual");
    expect(departureState(await voyageWith({}))).toBe("estimated");
    expect(departureState(await voyageWith({ etd: null }))).toBe("unknown");
    expect(arrivalState(await voyageWith({ eta: null }))).toBe("unknown");
  });

  it("reports schedule progress as time, never as a position", async () => {
    const voyage = await voyageWith({});
    const start = Date.parse("2026-08-01T00:00:00.000Z");
    const end = Date.parse("2026-08-21T00:00:00.000Z");

    expect(scheduleProgress(voyage, start)).toBe(0);
    expect(scheduleProgress(voyage, end)).toBe(1);
    expect(scheduleProgress(voyage, (start + end) / 2)).toBeCloseTo(0.5, 6);
    // Clamped: a voyage is not 140% arrived.
    expect(scheduleProgress(voyage, end + 86_400_000)).toBe(1);
    expect(scheduleProgress(voyage, start - 86_400_000)).toBe(0);

    // And nothing about progress produces a coordinate.
    expect(voyage.observedTrack).toEqual([]);
    expect(voyage.pathKnown).toBe(false);
  });

  it("returns null rather than guessing when the window is unusable", async () => {
    expect(scheduleProgress(await voyageWith({ etd: null }), Date.now())).toBeNull();
    expect(
      scheduleProgress(
        await voyageWith({ etd: "2026-08-21T00:00:00.000Z", eta: "2026-08-01T00:00:00.000Z" }),
        Date.now(),
      ),
    ).toBeNull();
  });

  it("rejects an unparseable timestamp rather than carrying it", async () => {
    const voyage = await voyageWith({ etd: "not-a-date" });
    expect(voyage.schedule.etd).toBeNull();
  });

  it("narrows status without guessing", () => {
    expect(toVoyageStatus("in_transit")).toBe("in_transit");
    expect(toVoyageStatus("ARRIVED")).toBe("arrived");
    expect(toVoyageStatus(null)).toBe("unknown");
    expect(toVoyageStatus("something-else")).toBe("unknown");
  });
});
