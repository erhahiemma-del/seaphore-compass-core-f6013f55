/**
 * Assembling what is happening at a port.
 *
 * The records below are transcribed from the ingested NPA workbook of
 * 30 Aug 2026. Lagos Apapa really does hold 62 occupied and 52 vacant
 * berths across 9 terminals, and the vessels named are the ones the
 * workbook places at those berths.
 *
 * Two defects this file exists to prevent:
 *
 * The port panel reads berth rows straight onto the screen, so a vessel
 * name leaking onto a vacant berth would put a ship in an empty berth in
 * front of an officer.
 *
 * And the two registers spell ports differently — NPA's sheets resolve to
 * `NGAPP` where the canonical register says `NGAPAPA`. Comparing the raw
 * strings returns an empty port for Apapa, Warri and Onne, which is three
 * of the seven, and an empty port reads as a quiet one.
 */
import { describe, expect, it } from "vitest";

import {
  berthsForTerminal,
  geometryStateFor,
  portIntelligence,
  portsInDataset,
  vesselsForTerminal,
} from "@/services/government/npa/port-intelligence";
import type {
  NpaBerthRecord,
  NpaOperationalDataset,
  NpaPortCall,
  NpaTerminalRecord,
} from "@/services/government/npa/workbook-ingest";

/*
 * The full provenance shape, including the file hash and import run.
 * Spelled out rather than partially filled because tests are outside
 * `tsconfig`'s `include`, so a field added to `SourceRef` will not fail
 * typecheck here — the fixture has to carry the real shape deliberately.
 */
const SOURCE = {
  file: "NPA Database - Seaphore.xlsx",
  fileHash: "99a284c2d19465756c77b58bd53a8bd20b073720387573a381c256ea660cf4c7",
  importRunId: "run-99a284c2d194",
  sheet: "Sheet1 (17)",
  sheetTitle: null,
  row: 4,
};

/** One row as the spreadsheet held it, keyed by NPA's own headers. */
const RAW_ROW = {
  Berth: "ABTL-Berth 1",
  "Vessel Name": "DESERT GRACE",
  "IMO Number": "9849502",
  "Berth Date": "15/08/26 09:10 AM",
};

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
    cargo: {
      raw: "BULK SUGAR",
      category: "DRY_BULK",
      direction: "UNSPECIFIED",
      quantity: null,
    },
    source: SOURCE,
    raw: RAW_ROW,
    observedAt: "2026-08-15T09:10:00.000Z",
    ingestedAt: "2026-08-30T02:36:00.000Z",
    confidence: "HIGH",
    ...overrides,
  };
}

function berth(overrides: Partial<NpaBerthRecord> = {}): NpaBerthRecord {
  return {
    id: "berth-1",
    name: "Berth 1",
    raw: "ABTL-Berth 1",
    terminalCode: "ABTL",
    portLocode: "NGAPP",
    portLabel: "Lagos Apapa",
    status: "OCCUPIED",
    portCallId: "call-1",
    source: SOURCE,
    rawRow: RAW_ROW,
    ...overrides,
  };
}

function terminal(overrides: Partial<NpaTerminalRecord> = {}): NpaTerminalRecord {
  return {
    id: "term-1",
    code: "ABTL",
    portLocode: "NGAPP",
    portLabel: "Lagos Apapa",
    berthIds: ["berth-1"],
    attributes: "CODE_ONLY",
    ...overrides,
  };
}

function dataset(parts: Partial<NpaOperationalDataset> = {}): NpaOperationalDataset {
  return {
    sourceFile: "NPA Database - Seaphore.xlsx",
    sourceFileHash: SOURCE.fileHash,
    importRunId: SOURCE.importRunId,
    ingestedAt: "2026-08-30T02:36:00.000Z",
    vessels: [],
    portCalls: [],
    berths: [],
    terminals: [],
    ports: [],
    rejections: [],
    summary: {
      sheets: 1,
      dataRows: 0,
      portCalls: 0,
      vessels: 0,
      berths: 0,
      vacantBerths: 0,
      terminals: 0,
      ports: 0,
      rejected: 0,
      byStatus: { AT_BERTH: 0, EXPECTED: 0, AWAITING_BERTH: 0, DEPARTED: 0, UNKNOWN: 0 },
    },
    ...parts,
  };
}

describe("reconciling the two port registers", () => {
  /*
   * The defect that would empty three of the seven Nigerian ports. NPA
   * resolves Apapa to NGAPP; the canonical register calls it NGAPAPA and
   * carries NGAPP as an alias.
   */
  it("finds NPA's NGAPP records when asked for canonical NGAPAPA", () => {
    const view = portIntelligence(
      "NGAPAPA",
      dataset({ portCalls: [call()], berths: [berth()], terminals: [terminal()] }),
    );

    expect(view.activity.atBerth).toHaveLength(1);
    expect(view.berths).toHaveLength(1);
    expect(view.terminals).toHaveLength(1);
  });

  it("finds the same records when asked by NPA's own spelling", () => {
    const view = portIntelligence("NGAPP", dataset({ portCalls: [call()] }));

    expect(view.activity.atBerth).toHaveLength(1);
    // Resolved to the canonical identifier whichever way it was asked.
    expect(view.locode).toBe("NGAPAPA");
  });

  it("does not pull another port's records in", () => {
    const view = portIntelligence(
      "NGTIN",
      dataset({
        portCalls: [call(), call({ id: "c2", portLocode: "NGTIN", vesselName: "ZONDA" })],
      }),
    );

    expect(view.activity.atBerth).toHaveLength(1);
    expect(view.activity.atBerth[0].name).toBe("ZONDA");
  });

  it("keeps NPA's own spelling alongside the canonical name", () => {
    const view = portIntelligence("NGAPAPA", dataset({ portCalls: [call()] }));

    expect(view.name).toBe("Lagos Port Complex (Apapa)");
    expect(view.npaLabels).toContain("Lagos Apapa");
  });
});

describe("geometry states", () => {
  /*
   * Nothing publishes terminal or berth coordinates — not the workbook,
   * not any connected provider — so `VERIFIED_GEOMETRY` is unreachable
   * today. A facility attributed to a port is `PORT_ANCHORED`, which is
   * the panel's cue to list it rather than draw it.
   */
  it("anchors a facility to its port without claiming a position", () => {
    expect(geometryStateFor("NGAPP")).toBe("PORT_ANCHORED");
  });

  it("claims nothing at all for a facility with no port", () => {
    expect(geometryStateFor(null)).toBe("GEOMETRY_PENDING");
  });

  it("never reports verified geometry from workbook records", () => {
    const view = portIntelligence(
      "NGAPAPA",
      dataset({ portCalls: [call()], berths: [berth()], terminals: [terminal()] }),
    );

    expect(view.terminals[0].geometry).toBe("PORT_ANCHORED");
    expect(view.berths[0].geometry).toBe("PORT_ANCHORED");
    expect(view.terminals[0].geometryNote).toMatch(/not yet verified/i);
  });

  /*
   * The port has a coordinate and the terminal does not, and the panel
   * must never present the first as the second.
   */
  it("does not copy the port's coordinate onto a terminal", () => {
    const view = portIntelligence("NGAPAPA", dataset({ terminals: [terminal()] }));

    expect(view.canonical?.position).toBeDefined();
    expect(view.terminals[0]).not.toHaveProperty("position");
    expect(JSON.stringify(view.terminals[0])).not.toContain("3.42");
  });

  it("claims no operator, because NPA publishes none", () => {
    const view = portIntelligence("NGAPAPA", dataset({ terminals: [terminal()] }));

    expect(view.terminals[0].operator).toBeNull();
  });
});

describe("the four operational states are counted separately", () => {
  const view = portIntelligence(
    "NGAPAPA",
    dataset({
      portCalls: [
        call(),
        call({ id: "c2", status: "AWAITING_BERTH", vesselName: "ABIOLA", berthRaw: null }),
        call({ id: "c3", status: "EXPECTED", vesselName: "MITERA", berthRaw: null }),
        call({ id: "c4", status: "DEPARTED", vesselName: "KOTA OCEAN" }),
      ],
    }),
  );

  it("puts each vessel in exactly one list", () => {
    expect(view.activity.atBerth).toHaveLength(1);
    expect(view.activity.awaitingBerth).toHaveLength(1);
    expect(view.activity.expected).toHaveLength(1);
    expect(view.activity.departed).toHaveLength(1);
  });

  /*
   * Expected is a plan, not a presence. A vessel that has not arrived
   * must never appear in the at-berth list.
   */
  it("never counts an expected vessel as present", () => {
    expect(view.activity.atBerth.map((v) => v.name)).not.toContain("MITERA");
    expect(view.activity.awaitingBerth.map((v) => v.name)).not.toContain("MITERA");
  });

  it("carries the cargo and its quantity through, unit intact", () => {
    const withCargo = portIntelligence(
      "NGAPAPA",
      dataset({
        portCalls: [
          call({
            cargo: {
              raw: "AGO",
              category: "WET_BULK",
              direction: "IMPORT",
              quantity: { raw: "15,000 MTS", value: 15000, unit: "MTS" },
            },
          }),
        ],
      }),
    );

    expect(withCargo.activity.atBerth[0].cargo).toBe("AGO");
    expect(withCargo.activity.atBerth[0].cargoQuantity).toBe("15,000 MTS");
  });

  it("orders each list newest observation first", () => {
    const ordered = portIntelligence(
      "NGAPAPA",
      dataset({
        portCalls: [
          call({ id: "old", vesselName: "OLDER", observedAt: "2026-08-01T00:00:00.000Z" }),
          call({ id: "new", vesselName: "NEWER", observedAt: "2026-08-28T00:00:00.000Z" }),
        ],
      }),
    );

    expect(ordered.activity.atBerth.map((v) => v.name)).toEqual(["NEWER", "OLDER"]);
  });
});

describe("berths", () => {
  const view = portIntelligence(
    "NGAPAPA",
    dataset({
      portCalls: [call()],
      berths: [
        berth(),
        berth({ id: "b2", raw: "ABTL-Berth 3", status: "VACANT", portCallId: null }),
        berth({
          id: "b3",
          raw: "ENL-Berth 7",
          terminalCode: "ENL",
          status: "VACANT",
          portCallId: null,
        }),
      ],
    }),
  );

  it("counts occupied and vacant separately", () => {
    expect(view.berthCount).toBe(3);
    expect(view.occupiedBerths).toBe(1);
    expect(view.vacantBerths).toBe(2);
  });

  /*
   * The assertion that keeps a ship out of an empty berth. The panel
   * renders `vesselName` directly, so a name reaching a vacant row would
   * be visible on screen.
   */
  it("attaches no vessel to a vacant berth", () => {
    for (const entry of view.berths.filter((b) => b.status === "VACANT")) {
      expect(entry.vesselName).toBeNull();
      expect(entry.vesselImo).toBeNull();
      expect(entry.portCallId).toBeNull();
    }
  });

  it("names the vessel occupying an occupied berth", () => {
    const occupied = view.berths.find((b) => b.status === "OCCUPIED")!;

    expect(occupied.vesselName).toBe("DESERT GRACE");
    expect(occupied.vesselImo).toBe("9849502");
  });

  it("reports occupancy as a fraction of what is recorded", () => {
    expect(view.occupancy).toBeCloseTo(1 / 3, 5);
  });

  /*
   * Zero would say the port is empty. Null says nobody recorded any
   * berths, which is a statement about the workbook, not the quay.
   */
  it("reports no occupancy rather than zero when no berths are recorded", () => {
    expect(portIntelligence("NGAPAPA", dataset()).occupancy).toBeNull();
  });
});

describe("terminals", () => {
  const view = portIntelligence(
    "NGAPAPA",
    dataset({
      portCalls: [call()],
      berths: [
        berth(),
        berth({ id: "b2", raw: "ABTL-Berth 3", status: "VACANT", portCallId: null }),
        berth({
          id: "b3",
          raw: "ENL-Berth 7",
          terminalCode: "ENL",
          status: "VACANT",
          portCallId: null,
        }),
      ],
      terminals: [terminal(), terminal({ id: "t2", code: "ENL", berthIds: ["b3"] })],
    }),
  );

  it("counts each terminal's own berths", () => {
    const abtl = view.terminals.find((t) => t.code === "ABTL")!;

    expect(abtl.berthCount).toBe(2);
    expect(abtl.occupiedBerths).toBe(1);
    expect(abtl.vacantBerths).toBe(1);
  });

  /*
   * Matched on the whole code, never a prefix: `Terminal A` and
   * `Terminal A1` are two facilities, and a `startsWith` would fold one
   * into the other's berth count.
   */
  it("does not fold one terminal's berths into a similarly named one", () => {
    const similar = portIntelligence(
      "NGAPAPA",
      dataset({
        berths: [
          berth({ id: "x", raw: "Terminal A-Berth 1", terminalCode: "Terminal A" }),
          berth({ id: "y", raw: "Terminal A1-Berth 1", terminalCode: "Terminal A1" }),
        ],
        terminals: [
          terminal({ id: "ta", code: "Terminal A" }),
          terminal({ id: "ta1", code: "Terminal A1" }),
        ],
      }),
    );

    expect(similar.terminals.find((t) => t.code === "Terminal A")!.berthCount).toBe(1);
    expect(similar.terminals.find((t) => t.code === "Terminal A1")!.berthCount).toBe(1);
  });

  it("lists a terminal's berths and vessels for the terminal view", () => {
    expect(berthsForTerminal(view, "ABTL")).toHaveLength(2);
    expect(vesselsForTerminal(view, "ABTL").map((v) => v.name)).toEqual(["DESERT GRACE"]);
  });

  it("matches a terminal code case-insensitively", () => {
    expect(berthsForTerminal(view, "abtl")).toHaveLength(2);
  });
});

describe("provenance and freshness", () => {
  it("reports the newest NPA observation, not the ingestion time", () => {
    const view = portIntelligence(
      "NGAPAPA",
      dataset({
        portCalls: [
          call({ id: "a", observedAt: "2026-08-15T09:10:00.000Z" }),
          call({ id: "b", observedAt: "2026-08-26T03:34:00.000Z" }),
        ],
      }),
    );

    expect(view.observedAt).toBe("2026-08-26T03:34:00.000Z");
    expect(view.observedAt).not.toBe(view.ingestedAt);
  });

  it("names the source file the records came from", () => {
    const view = portIntelligence("NGAPAPA", dataset({ portCalls: [call()] }));

    expect(view.sourceFile).toBe("NPA Database - Seaphore.xlsx");
    expect(view.ingestedAt).toBe("2026-08-30T02:36:00.000Z");
  });

  /*
   * Null rather than a fallback. A port whose records carry no time
   * cannot be aged, and substituting the ingestion time would make every
   * record look freshly observed.
   */
  it("reports no observation time when no record carried one", () => {
    const view = portIntelligence("NGAPAPA", dataset({ portCalls: [call({ observedAt: null })] }));

    expect(view.observedAt).toBeNull();
  });
});

describe("missing data", () => {
  it("returns an empty but real view for a port with no NPA records", () => {
    const view = portIntelligence("NGCBQ", dataset());

    expect(view.locode).toBe("NGCBQ");
    expect(view.activity.atBerth).toHaveLength(0);
    expect(view.berthCount).toBe(0);
    expect(view.observedAt).toBeNull();
  });

  it("survives a dataset that never loaded", () => {
    const view = portIntelligence("NGAPAPA", null);

    expect(view.name).toBe("Lagos Port Complex (Apapa)");
    expect(view.activity.departed).toHaveLength(0);
    expect(view.sourceFile).toBeNull();
  });

  /*
   * Rivers Port is in the canonical register with no coordinate. The
   * panel needs the register entry to say so rather than a null port.
   */
  it("still resolves a port Seaphore holds no coordinate for", () => {
    const view = portIntelligence("NGPHC", dataset());

    expect(view.canonical).not.toBeNull();
    expect(view.canonical!.positionStatus).toBe("position-unavailable");
  });

  it("falls back to the record's own label for an unrecognised port", () => {
    const view = portIntelligence(
      "ZZUNKNOWN",
      dataset({ portCalls: [call({ portLocode: null, portLabel: "Somewhere" })] }),
    );

    expect(view.locode).toBeNull();
    expect(view.canonical).toBeNull();
  });
});

describe("listing ports in the dataset", () => {
  it("returns canonical identifiers, de-duplicated", () => {
    const codes = portsInDataset(
      dataset({
        ports: [
          {
            locode: "NGAPP",
            label: "Lagos Apapa",
            resolved: true,
            note: null,
            portCallIds: [],
            berthIds: [],
          },
          {
            locode: "NGTIN",
            label: "Lagos Tincan",
            resolved: true,
            note: null,
            portCallIds: [],
            berthIds: [],
          },
          {
            locode: null,
            label: "Sheet1 (8)",
            resolved: false,
            note: null,
            portCallIds: [],
            berthIds: [],
          },
        ],
      }),
    );

    expect(codes).toContain("NGAPAPA");
    expect(codes).toContain("NGTIN");
    // The unresolved sheet contributes no port rather than a placeholder.
    expect(codes).toHaveLength(2);
  });
});
