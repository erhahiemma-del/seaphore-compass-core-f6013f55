/**
 * The port truth contract.
 *
 * Two properties dominate.
 *
 * First, a port's position comes from a source or it does not exist.
 * There is no fallback, no centroid, no nearest match, and above all no
 * `[0, 0]` — the origin is a real location in the Gulf of Guinea about
 * 600 km south of Lagos, so a port silently placed there would look
 * entirely plausible on this particular map.
 *
 * Second, `none` and `unavailable` are different answers. "No voyage
 * names this port" is a finding; "we could not read the register" is
 * the absence of one. An officer who cannot tell them apart will read
 * the second as the first, which is how a collection gap becomes a
 * statement about the world.
 */
import { describe, expect, it } from "vitest";

import {
  LayeredPortGazetteer,
  NimasaPortGazetteer,
  UnLocodePortGazetteer,
  portCodeAliases,
  portVoyageRelationships,
  resolvePort,
  toVoyage,
  type GazetteerAsset,
  type PortGazetteer,
  type Voyage,
  type VoyageRowLike,
} from "@/services/geospatial";

/* ── Fixtures ─────────────────────────────────────────────────── */

const ASSET: GazetteerAsset = {
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
    /** Real port, no published position — the middle resolution state. */
    GBLON: { n: "London", c: "GB" },
    /** Apapa exists in UN/LOCODE with no coordinates. Mirrors reality. */
    NGAPP: { n: "Apapa", c: "NG" },
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

const ORIGIN_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_ID = "22222222-2222-4222-8222-222222222222";

function voyage(origin: string | null, destination: string | null, g: PortGazetteer): Voyage {
  const row: VoyageRowLike = {
    id: `v-${origin}-${destination}`,
    voyage_number: "TEST-001",
    origin_port_id: origin === null ? null : ORIGIN_ID,
    destination_port_id: destination === null ? null : DESTINATION_ID,
    origin_port: origin === null ? null : { id: ORIGIN_ID, unlocode: origin },
    destination_port: destination === null ? null : { id: DESTINATION_ID, unlocode: destination },
    status: "in_transit",
  };
  return toVoyage(row, g);
}

/* ═══════ Identity ═══════ */

describe("port identity resolution", () => {
  it("resolves a NIMASA port to its operator reference position", async () => {
    const port = resolvePort({ id: "NGAPAPA" }, await gazetteer());
    expect(port.identitySource).toBe("nimasa");
    expect(port.identity.name).toBe("Apapa (Lagos)");
    expect(port.identity.country).toBe("NG");
    // The real UN/LOCODE is carried alongside the repository key.
    expect(port.identity.unlocode).toBe("NGAPP");
    expect(port.position).toEqual([3.4219, 6.4281]);
    expect(port.reference).toEqual({ berths: 14, anchorageRadiusKm: 3 });
  });

  it("keeps the NIMASA key as the selection id", async () => {
    // `MaritimeCommand` narrows the fleet in PORT mode via
    // `NIMASA_PORTS[selection.id]`. A UN/LOCODE here would silently
    // break that scoping while looking correct.
    expect(resolvePort({ id: "NGAPAPA" }, await gazetteer()).identity.id).toBe("NGAPAPA");
  });

  it("outranks the gazetteer, which has no position for Apapa", async () => {
    const g = await gazetteer();
    // The global set lists Apapa but publishes no coordinates, so
    // ordering NIMASA second would downgrade the home port.
    expect(g.resolve("NGAPP").status).toBe("resolved");
    expect(resolvePort({ id: "NGAPAPA" }, g).position).not.toBeNull();
  });

  it("resolves a global port through the gazetteer", async () => {
    const port = resolvePort({ id: "NLRTM" }, await gazetteer());
    expect(port.identitySource).toBe("un-locode");
    expect(port.identity.name).toBe("Rotterdam");
    expect(port.identity.country).toBe("NL");
    expect(port.position).toEqual([4.5, 51.9167]);
    // Reference figures belong to NIMASA ports alone.
    expect(port.reference).toBeNull();
  });

  it("reports a database-known port that no gazetteer recognises", async () => {
    const port = resolvePort({ id: "ZZZZZ", country: "ZZ", unlocode: "ZZZZZ" }, await gazetteer());
    expect(port.identitySource).toBe("database");
    expect(port.resolution?.status).toBe("unknown");
    expect(port.position).toBeNull();
  });

  it("reports a port nothing recognises as unresolved", async () => {
    const port = resolvePort({ id: "QQQQQ" }, await gazetteer());
    expect(port.identitySource).toBe("unresolved");
    expect(port.position).toBeNull();
  });
});

/* ═══════ Ambiguity ═══════ */

describe("conflicting identifiers are preserved, not adjudicated", () => {
  it("withholds the position when country and UN/LOCODE disagree", async () => {
    // A row claiming Nigeria whose UN/LOCODE is Rotterdam. Preferring
    // either side would place the port somewhere no source put it.
    const port = resolvePort({ id: "NLRTM", country: "NG", unlocode: "NLRTM" }, await gazetteer());
    expect(port.ambiguity).not.toBeNull();
    expect(port.ambiguity?.declaredCountry).toBe("NG");
    expect(port.ambiguity?.resolvedCountry).toBe("NL");
    expect(port.position).toBeNull();
    expect(port.identitySource).toBe("database");
  });

  it("does not flag agreement as ambiguity", async () => {
    const port = resolvePort({ id: "NLRTM", country: "nl", unlocode: "NLRTM" }, await gazetteer());
    expect(port.ambiguity).toBeNull();
    expect(port.position).toEqual([4.5, 51.9167]);
  });
});

/* ═══════ Location ═══════ */

describe("a position exists only when a source published one", () => {
  it("separates position-unavailable from unknown", async () => {
    const g = await gazetteer();
    const london = resolvePort({ id: "GBLON" }, g);
    expect(london.resolution?.status).toBe("position-unavailable");
    expect(london.identity.name).toBe("London");
    expect(london.position).toBeNull();

    const nonsense = resolvePort({ id: "QQQQQ" }, g);
    expect(nonsense.resolution?.status).toBe("unknown");
    expect(nonsense.position).toBeNull();
  });

  /*
   * The negative test that matters most on this map. [0, 0] is a real
   * location in the Gulf of Guinea, inside the operational area — a
   * port defaulted there would not look like an error.
   */
  it("never produces a coordinate for an unplaceable port", async () => {
    const g = await gazetteer();
    for (const id of ["GBLON", "QQQQQ", "ZZZZZ", ""]) {
      const port = resolvePort({ id, country: "ZZ" }, g);
      expect(port.position, `port "${id}" invented a position`).toBeNull();
      expect(JSON.stringify(port)).not.toContain("[0,0]");
    }
  });

  it("carries the gazetteer's precision rather than restating it", async () => {
    const g = await gazetteer();
    const nimasa = resolvePort({ id: "NGCBQ" }, g);
    const global = resolvePort({ id: "SGSIN" }, g);
    if (nimasa.resolution?.status === "resolved") {
      expect(nimasa.resolution.precision).toBe("surveyed");
    }
    if (global.resolution?.status === "resolved") {
      expect(global.resolution.precision).toBe("degree-minute");
    }
  });
});

/* ═══════ Aliases ═══════ */

describe("port code aliases", () => {
  it("treats the repository key and the UN/LOCODE as one port", () => {
    expect([...portCodeAliases("NGAPAPA")].sort()).toEqual(["NGAPAPA", "NGAPP"]);
    expect([...portCodeAliases("NGAPP")].sort()).toEqual(["NGAPAPA", "NGAPP"]);
  });

  it("leaves an unrelated code alone", () => {
    expect([...portCodeAliases("NLRTM")]).toEqual(["NLRTM"]);
  });
});

/* ═══════ Voyage relationships ═══════ */

describe("voyage relationships keep none and unavailable apart", () => {
  it("finds voyages that name the port, split by recorded role", async () => {
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    const voyages = [
      voyage("NGAPP", "NLRTM", g), // Apapa as origin
      voyage("SGSIN", "NGAPP", g), // Apapa as destination
      voyage("SGSIN", "NLRTM", g), // unrelated
    ];

    const rel = portVoyageRelationships(port, voyages, "ready");
    expect(rel.state).toBe("known");
    expect(rel.asOrigin).toHaveLength(1);
    expect(rel.asDestination).toHaveLength(1);
    expect(rel.reason).toBeNull();
  });

  it("matches across the NIMASA alias boundary", async () => {
    // The voyage row carries NGAPP; the selection carries NGAPAPA.
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    expect(portVoyageRelationships(port, [voyage("NGAPP", "NLRTM", g)], "ready").state).toBe(
      "known",
    );
  });

  it("reports none when the register was readable and holds no match", async () => {
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    const rel = portVoyageRelationships(port, [voyage("SGSIN", "NLRTM", g)], "ready");
    expect(rel.state).toBe("none");
    expect(rel.reason).toMatch(/no voyage in the loaded records/i);
  });

  it("reports unavailable when the register could not be read", async () => {
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    const rel = portVoyageRelationships(port, [], "unavailable");
    expect(rel.state).toBe("unavailable");
    expect(rel.reason).toMatch(/could not be read/i);
    expect(rel.reason).toMatch(/not the same as there being none/i);
  });

  it("reports unavailable while the register is still loading", async () => {
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    expect(portVoyageRelationships(port, [], "loading").state).toBe("unavailable");
  });

  it("reports unavailable when the port has nothing to match on", async () => {
    // An unresolved port carries no UN/LOCODE, so the register cannot
    // be searched for it. Saying `none` would claim it had been.
    const g = await gazetteer();
    const port = resolvePort({ id: "" }, g);
    const rel = portVoyageRelationships(port, [voyage("NGAPP", "NLRTM", g)], "ready");
    expect(rel.state).toBe("unavailable");
    expect(rel.reason).toMatch(/no UN\/LOCODE/i);
  });

  /*
   * The distinction, asserted directly. If these two states ever
   * produced the same words, the whole contract would be decorative.
   */
  it("never gives none and unavailable the same explanation", async () => {
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    const none = portVoyageRelationships(port, [voyage("SGSIN", "NLRTM", g)], "ready");
    const unavailable = portVoyageRelationships(port, [], "unavailable");
    expect(none.state).not.toBe(unavailable.state);
    expect(none.reason).not.toBe(unavailable.reason);
  });

  it("an empty register is a finding, not a failure", async () => {
    const g = await gazetteer();
    const port = resolvePort({ id: "NGAPAPA" }, g);
    // `empty` means the query succeeded and returned nothing.
    expect(portVoyageRelationships(port, [], "empty").state).toBe("none");
  });
});
