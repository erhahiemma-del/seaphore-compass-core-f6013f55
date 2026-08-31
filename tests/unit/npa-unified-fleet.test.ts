/**
 * One fleet from two sources.
 *
 * The rule these hold is that the union is the picture. 52 of 237 NPA
 * identifiers currently match a tracked hull, and 52 is the one number
 * that must never become the vessel count: it describes how much the two
 * providers' coverage overlaps, not how many ships an officer needs to
 * see. An NPA vessel AIS cannot see is not missing, and a tracked vessel
 * NPA never scheduled is not an error.
 *
 * The vessels and port calls below are transcribed from the ingested
 * workbook of 30 Aug 2026.
 */
import { describe, expect, it } from "vitest";

import {
  orderPortCalls,
  placeFromPortCall,
  unifyFleet,
} from "@/services/government/npa/unified-fleet";
import type {
  NpaOperationalDataset,
  NpaPortCall,
  NpaVesselRecord,
} from "@/services/government/npa/workbook-ingest";
import type { Vessel } from "@/services/geospatial";

const SOURCE = {
  file: "NPA Database - Seaphore.xlsx",
  fileHash: "99a284c2d19465756c77b58bd53a8bd20b073720387573a381c256ea660cf4c7",
  importRunId: "run-99a284c2d194",
  sheet: "Sheet1 (17)",
  sheetTitle: null,
  row: 4,
};

const RAW_ROW = {
  Berth: "ABTL-Berth 1",
  "Vessel Name": "DESERT GRACE",
  "IMO Number": "9849502",
};

function tracked(imo: string, name: string, mmsi = "636092837"): Vessel {
  return {
    identity: { imo, name, mmsi },
    position: {
      lon: 3.38,
      lat: 6.44,
      heading: 90,
      headingReported: true,
      speed: 0,
      timestamp: "2026-08-30T08:00:00.000Z",
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  } as Vessel;
}

function call(overrides: Partial<NpaPortCall> = {}): NpaPortCall {
  return {
    id: "call-1",
    vesselKey: "imo:9849502",
    vesselName: "DESERT GRACE",
    imo: "9849502",
    imoStatus: "VALID",
    portLocode: "NGAPP",
    portLabel: "Lagos Apapa",
    terminalCode: "ABTL",
    berth: "Berth 1",
    berthRaw: "ABTL-Berth 1",
    status: "AT_BERTH",
    eta: null,
    arrivalAt: null,
    berthAt: "2026-08-15T09:10:00.000Z",
    departureAt: null,
    etd: "2026-08-22T09:10:00.000Z",
    agent: "ABTL SHIPPING",
    rotation: "B11621",
    lengthM: 199,
    cargo: null,
    source: SOURCE,
    raw: RAW_ROW,
    observedAt: "2026-08-15T09:10:00.000Z",
    ingestedAt: "2026-08-30T02:36:00.000Z",
    confidence: "HIGH",
    ...overrides,
  };
}

function record(overrides: Partial<NpaVesselRecord> = {}): NpaVesselRecord {
  return {
    key: "imo:9849502",
    name: "DESERT GRACE",
    imo: "9849502",
    imoStatus: "VALID",
    lengthM: 199,
    portCallIds: ["call-1"],
    ...overrides,
  };
}

function dataset(
  vessels: readonly NpaVesselRecord[],
  portCalls: readonly NpaPortCall[],
): NpaOperationalDataset {
  return {
    sourceFile: "NPA Database - Seaphore.xlsx",
    sourceFileHash: SOURCE.fileHash,
    importRunId: SOURCE.importRunId,
    ingestedAt: "2026-08-30T02:36:00.000Z",
    vessels,
    portCalls,
    berths: [],
    terminals: [],
    ports: [],
    rejections: [],
    summary: {
      sheets: 1,
      dataRows: portCalls.length,
      portCalls: portCalls.length,
      vessels: vessels.length,
      berths: 0,
      vacantBerths: 0,
      terminals: 0,
      ports: 0,
      rejected: 0,
      byStatus: { AT_BERTH: 0, EXPECTED: 0, AWAITING_BERTH: 0, DEPARTED: 0, UNKNOWN: 0 },
    },
  };
}

describe("the union keeps every vessel", () => {
  const npa = dataset(
    [record(), record({ key: "imo:9285732", name: "ZONDA", imo: "9285732", portCallIds: ["c2"] })],
    [call(), call({ id: "c2", vesselKey: "imo:9285732", vesselName: "ZONDA", imo: "9285732" })],
  );

  /*
   * The defect this file exists to prevent. Rendering only matched
   * vessels would drop every ship the port is waiting for and every hull
   * in the water without a schedule entry.
   */
  it("renders NPA-only, Datalastic-only and matched together", () => {
    const fleet = unifyFleet(
      [tracked("9849502", "DESERT GRACE"), tracked("1111111", "SEA HAWK")],
      npa,
    );

    expect(fleet.summary.total).toBe(3);
    expect(fleet.summary.matched).toBe(1);
    expect(fleet.summary.npaOnly).toBe(1);
    expect(fleet.summary.datalasticOnly).toBe(1);
  });

  it("renders one vessel, not two, when both sources know it", () => {
    const fleet = unifyFleet([tracked("9849502", "DESERT GRACE")], npa);
    const matches = fleet.vessels.filter((vessel) => vessel.imo === "9849502");

    expect(matches).toHaveLength(1);
    expect(matches[0].live).not.toBeNull();
    expect(matches[0].npa).not.toBeNull();
  });

  it("keeps an NPA vessel AIS cannot see, and says which it is", () => {
    const fleet = unifyFleet([], npa);
    const vessel = fleet.vessels.find((entry) => entry.name === "DESERT GRACE")!;

    expect(vessel.correlation).toBe("NPA_ONLY");
    expect(vessel.aisVisible).toBe(false);
    expect(vessel.note).toMatch(/not currently visible/i);
  });

  it("treats a tracked vessel with no NPA record as valid, not an error", () => {
    const fleet = unifyFleet([tracked("1111111", "SEA HAWK")], npa);
    const vessel = fleet.vessels.find((entry) => entry.name === "SEA HAWK")!;

    expect(vessel.correlation).toBe("DATALASTIC_ONLY");
    expect(vessel.npa).toBeNull();
    expect(vessel.note).toMatch(/expected to be absent/i);
  });
});

describe("identity", () => {
  /*
   * 14% of the tracked fleet reports no IMO and carries the MMSI in the
   * field. Joining on it would match a hull to a schedule row by a number
   * that means something else entirely.
   */
  it("never joins on an MMSI standing in for an IMO", () => {
    const daniel = tracked("511100241", "DANIEL", "511100241");
    const npa = dataset(
      [record({ key: "imo:511100241", name: "DANIEL", imo: "511100241" })],
      [call({ vesselKey: "imo:511100241", vesselName: "DANIEL", imo: "511100241" })],
    );
    const fleet = unifyFleet([daniel], npa);

    // Two entries, because nothing established they are the same hull.
    expect(fleet.summary.matched).toBe(0);
    const live = fleet.vessels.find((vessel) => vessel.correlation === "DATALASTIC_ONLY")!;
    expect(live.imo).toBeNull();
    expect(live.mmsi).toBe("511100241");
  });

  it("never merges two vessels on a shared name", () => {
    const npa = dataset(
      [record({ key: "imo:9849502", name: "OCEAN FLOWING", imo: "9849502" })],
      [call({ vesselName: "OCEAN FLOWING" })],
    );
    const fleet = unifyFleet([tracked("2222222", "OCEAN FLOWING")], npa);

    expect(fleet.summary.matched).toBe(0);
    expect(fleet.summary.total).toBe(2);
  });

  /*
   * A matched identifier with a conflicting name is neither accepted
   * silently nor thrown away — a rename, a typo and a reused number all
   * look like this and need different responses.
   */
  it("flags an identifier match whose names disagree", () => {
    const npa = dataset([record()], [call()]);
    const fleet = unifyFleet([tracked("9849502", "ATLANTIC STAR")], npa);
    const vessel = fleet.vessels[0];

    expect(vessel.correlation).toBe("AMBIGUOUS");
    expect(vessel.live).not.toBeNull();
    expect(vessel.note).toMatch(/rename|transcription/i);
  });
});

describe("where a vessel is drawn", () => {
  it("uses the live report when there is one", () => {
    const fleet = unifyFleet([tracked("9849502", "DESERT GRACE")], dataset([record()], [call()]));

    expect(fleet.vessels[0].position!.precision).toBe("OBSERVED");
  });

  /*
   * The workbook names berths and terminals but publishes no geometry for
   * either, and the provider's terminal endpoint is unavailable. So a
   * placement is at the port and says so — a marker an officer could read
   * as a fix would be a fabricated coordinate.
   */
  it("places an unseen vessel at the port, and never calls that a position", () => {
    const position = placeFromPortCall(call())!;

    expect(position.precision).toBe("PORT_APPROXIMATE");
    expect(position.basis).toMatch(/this is the port, not the vessel's position/i);
    expect(position.basis).toMatch(/ABTL-Berth 1/);
  });

  /*
   * Rivers Port has no coordinate in the canonical register. An NPA
   * vessel there stays in the picture and is not drawn, rather than being
   * given a plausible-looking point.
   */
  it("returns no position for a port Seaphore holds no coordinate for", () => {
    expect(placeFromPortCall(call({ portLocode: "NGPHC", portLabel: "Rivers Ports" }))).toBeNull();
  });

  it("returns no position when the port never resolved", () => {
    expect(placeFromPortCall(call({ portLocode: null, portLabel: "Sheet1 (8)" }))).toBeNull();
  });

  it("keeps an unplaceable vessel in the picture and explains it", () => {
    const npa = dataset([record()], [call({ portLocode: "NGPHC", portLabel: "Rivers Ports" })]);
    const fleet = unifyFleet([], npa);

    expect(fleet.summary.total).toBe(1);
    expect(fleet.vessels[0].position).toBeNull();
    expect(fleet.vessels[0].note).toMatch(/cannot be drawn on the map/i);
  });
});

describe("which call describes the vessel now", () => {
  /*
   * Ordering by timestamp would let a departure typed later win over a
   * berthing that is still current — and NPA's departure sheets routinely
   * carry later timestamps than its berth sheets.
   */
  it("prefers presence over recency", () => {
    const ordered = orderPortCalls([
      call({ id: "departed", status: "DEPARTED", observedAt: "2026-08-29T00:00:00.000Z" }),
      call({ id: "berthed", status: "AT_BERTH", observedAt: "2026-08-15T00:00:00.000Z" }),
    ]);

    expect(ordered[0].id).toBe("berthed");
  });

  it("orders the four states by how present the vessel is", () => {
    const ordered = orderPortCalls([
      call({ id: "d", status: "DEPARTED" }),
      call({ id: "e", status: "EXPECTED" }),
      call({ id: "a", status: "AT_BERTH" }),
      call({ id: "w", status: "AWAITING_BERTH" }),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(["a", "w", "e", "d"]);
  });

  it("breaks a tie within one state by the newest observation", () => {
    const ordered = orderPortCalls([
      call({ id: "older", status: "DEPARTED", observedAt: "2026-08-01T00:00:00.000Z" }),
      call({ id: "newer", status: "DEPARTED", observedAt: "2026-08-28T00:00:00.000Z" }),
    ]);

    expect(ordered[0].id).toBe("newer");
  });
});

describe("an empty or absent dataset", () => {
  it("still renders the tracked fleet", () => {
    const fleet = unifyFleet([tracked("1111111", "SEA HAWK")], null);

    expect(fleet.summary.total).toBe(1);
    expect(fleet.summary.datalasticOnly).toBe(1);
  });

  it("renders nothing rather than failing when both are empty", () => {
    expect(unifyFleet([], null).vessels).toHaveLength(0);
  });
});
