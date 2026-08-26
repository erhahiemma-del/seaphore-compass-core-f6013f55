/**
 * M2.7 — Nigeria's canonical port estate.
 *
 * The failure this guards against is not a crash; it is a plausible
 * dot. Three properties matter, and each has a silent failure mode:
 *
 *   Identity. Before this model, a card keyed `APP` and a map feature
 *   keyed `NGAPAPA` described the same quay and could only be matched by
 *   display name. A regression here does not throw — it just means
 *   clicking a card selects nothing.
 *
 *   Position honesty. Rivers Port has no published coordinate anywhere
 *   in this repository. Any change that gives it one, whether from the
 *   demo card data, a country centroid or a neighbouring port, would put
 *   a mark on screen indistinguishable from an operator reference.
 *
 *   Precision. Lekki's coordinate is a UN/LOCODE centroid good to about
 *   a kilometre. Silently promoting it to `surveyed` would render it
 *   solid alongside genuinely surveyed berths.
 */
import { describe, expect, it } from "vitest";

import { NIMASA_PORTS } from "@/services/geospatial/constants";
import {
  NIGERIAN_PORTS,
  NIGERIAN_PORT_LIST,
  canonicalPortId,
  findNigerianPort,
  hasDrawablePosition,
  positionUnavailableReason,
} from "@/services/geospatial/nigerian-ports";

const REQUIRED = ["NGAPAPA", "NGTIN", "NGLKK", "NGONNE", "NGPHC", "NGWARR", "NGCBQ"] as const;

/* ═══════ 1. Coverage ═══════ */

describe("the canonical estate covers Nigeria's seven ports", () => {
  it("contains exactly the seven required ports", () => {
    expect(Object.keys(NIGERIAN_PORTS).sort()).toEqual([...REQUIRED].sort());
    expect(NIGERIAN_PORT_LIST).toHaveLength(7);
  });

  it("gives six of them a drawable position and one none", () => {
    const positioned = NIGERIAN_PORT_LIST.filter(hasDrawablePosition);
    const unavailable = NIGERIAN_PORT_LIST.filter((p) => !hasDrawablePosition(p));
    expect(positioned).toHaveLength(6);
    expect(unavailable.map((p) => p.locode)).toEqual(["NGPHC"]);
  });

  it("places every positioned port inside Nigeria's maritime envelope", () => {
    // Catches a port that inherited a neighbour's coordinate, or a
    // lon/lat transposition — 6.4°N, 3.4°E transposed lands in Somalia.
    for (const port of NIGERIAN_PORT_LIST.filter(hasDrawablePosition)) {
      const [lon, lat] = port.position;
      expect(lon).toBeGreaterThan(2.5);
      expect(lon).toBeLessThan(9.5);
      expect(lat).toBeGreaterThan(3.5);
      expect(lat).toBeLessThan(7.5);
    }
  });

  it("gives no two ports the same coordinate", () => {
    const seen = NIGERIAN_PORT_LIST.filter(hasDrawablePosition).map((p) => p.position.join(","));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("reads its NIMASA positions from the existing store rather than copying them", () => {
    // One place a NIMASA coordinate is written down. A copy here would
    // drift the moment `constants.ts` was corrected.
    expect(NIGERIAN_PORTS.NGAPAPA.position).toEqual([
      NIMASA_PORTS.NGAPAPA.lon,
      NIMASA_PORTS.NGAPAPA.lat,
    ]);
    expect(NIGERIAN_PORTS.NGCBQ.position).toEqual([NIMASA_PORTS.NGCBQ.lon, NIMASA_PORTS.NGCBQ.lat]);
  });
});

/* ═══════ 2. Position honesty ═══════ */

describe("position status is never collapsed", () => {
  it("keeps Rivers Port position-unavailable with no coordinate", () => {
    const rivers = NIGERIAN_PORTS.NGPHC;
    expect(rivers.positionStatus).toBe("position-unavailable");
    expect(rivers.position).toBeUndefined();
    expect(hasDrawablePosition(rivers)).toBe(false);
  });

  it("does not give Rivers Onne's position, or any other port's", () => {
    // Onne and Rivers are distinct facilities. Substituting one for the
    // other would misstate the estate rather than approximate it.
    const others = NIGERIAN_PORT_LIST.filter((p) => p.locode !== "NGPHC").filter(
      hasDrawablePosition,
    );
    for (const other of others) {
      expect(NIGERIAN_PORTS.NGPHC.position).not.toEqual(other.position);
    }
  });

  it("explains the absence rather than staying silent", () => {
    const reason = positionUnavailableReason(NIGERIAN_PORTS.NGPHC);
    expect(reason).toMatch(/no published coordinate/i);
    expect(reason).toMatch(/Rivers Port/i);
  });

  it("keeps Lekki at degree-minute precision, never surveyed", () => {
    const lekki = NIGERIAN_PORTS.NGLKK;
    expect(lekki.positionStatus).toBe("resolved");
    expect(lekki.precision).toBe("degree-minute");
    expect(lekki.provenance.source).toMatch(/UN\/LOCODE/);
    expect(lekki.provenance.note).toMatch(/±1 km|1 km/);
  });

  it("marks the five NIMASA positions as surveyed operator references", () => {
    for (const locode of ["NGAPAPA", "NGTIN", "NGONNE", "NGWARR", "NGCBQ"]) {
      expect(NIGERIAN_PORTS[locode].precision).toBe("surveyed");
      expect(NIGERIAN_PORTS[locode].provenance.source).toMatch(/NIMASA/);
    }
  });

  it("gives every port a provenance, positioned or not", () => {
    for (const port of NIGERIAN_PORT_LIST) {
      expect(port.provenance.source).toBeTruthy();
      expect(port.provenance.note).toBeTruthy();
    }
  });
});

/* ═══════ 3. Identity ═══════ */

describe("one identity per port", () => {
  it("resolves each canonical id to itself", () => {
    for (const locode of REQUIRED) {
      expect(canonicalPortId(locode)).toBe(locode);
    }
  });

  it("resolves the legacy card codes onto canonical ids", () => {
    // These were the competing primary identities in `Ports.tsx`.
    expect(canonicalPortId("APP")).toBe("NGAPAPA");
    expect(canonicalPortId("TCT")).toBe("NGTIN");
    expect(canonicalPortId("ONN")).toBe("NGONNE");
    expect(canonicalPortId("PHC")).toBe("NGPHC");
    expect(canonicalPortId("CAL")).toBe("NGCBQ");
  });

  it("resolves the five-character UN/LOCODE spellings too", () => {
    expect(canonicalPortId("NGAPP")).toBe("NGAPAPA");
    expect(canonicalPortId("NGWAR")).toBe("NGWARR");
    expect(canonicalPortId("NGONN")).toBe("NGONNE");
  });

  it("normalises case and internal spacing", () => {
    expect(canonicalPortId("ng app")).toBe("NGAPAPA");
    expect(canonicalPortId("  ngtin  ")).toBe("NGTIN");
  });

  it("returns null rather than guessing", () => {
    // Coercing an unknown code to the nearest match is how a Lagos
    // click ends up selecting Calabar.
    expect(canonicalPortId("NLRTM")).toBeNull();
    expect(canonicalPortId("")).toBeNull();
    expect(canonicalPortId(null)).toBeNull();
    expect(canonicalPortId(undefined)).toBeNull();
    expect(findNigerianPort("NOT-A-PORT")).toBeNull();
  });

  it("never maps one alias to two ports", () => {
    const aliases = NIGERIAN_PORT_LIST.flatMap((p) => [p.locode, ...p.aliases]);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

/* ═══════ 4. Label priority ═══════ */

describe("label priority is deterministic", () => {
  it("ranks the Lagos complex ahead of its neighbours", () => {
    // Lagos, Tin Can and Lekki contend for the same pixels at regional
    // zoom; without a stable order the survivor changes with viewport.
    expect(NIGERIAN_PORTS.NGAPAPA.labelPriority).toBeLessThan(NIGERIAN_PORTS.NGTIN.labelPriority);
    expect(NIGERIAN_PORTS.NGTIN.labelPriority).toBeLessThan(NIGERIAN_PORTS.NGLKK.labelPriority);
  });

  it("gives every port a priority", () => {
    for (const port of NIGERIAN_PORT_LIST) {
      expect(Number.isFinite(port.labelPriority)).toBe(true);
    }
  });

  it("lists ports in priority order", () => {
    const priorities = NIGERIAN_PORT_LIST.map((p) => p.labelPriority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });
});
