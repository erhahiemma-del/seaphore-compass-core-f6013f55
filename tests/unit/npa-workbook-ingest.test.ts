/**
 * Turning workbook rows into operational records.
 *
 * The rows below are transcribed from the supplied NPA workbook, including
 * its inconsistencies: four different sheet shapes, a sheet with no title,
 * berth cells that repeat the terminal after the designation, and the word
 * VACANT sitting in the vessel-name column.
 *
 * The defect this file exists to prevent is that last one. NPA writes
 * VACANT where a ship's name goes, and a reader that took the column at
 * face value would put 268 vessels called VACANT on the map — each with a
 * berth, a port and no IMO, and every one of them a fabrication.
 */
import { describe, expect, it } from "vitest";

import {
  cargoDirection,
  ingestWorkbook,
  portLabelFromTitle,
  readHeader,
  readSheetTitle,
  type RawSheet,
} from "@/services/government/npa/workbook-ingest";

const OPTIONS = { sourceFile: "NPA Database (1).xlsx", ingestedAt: "2026-08-30T02:36:00.000Z" };

/** A berth sheet, exactly as the workbook lays one out. */
const AT_BERTH: RawSheet = {
  name: "Sheet1 (17)",
  rows: [
    ["Daily Shipping Schedule - Vessels at Berth - Lagos Apapa"],
    [],
    [
      "Berth",
      "Vessel Name",
      "IMO Number",
      "Length(M)",
      "Berth Date",
      "ETD",
      "Rotation",
      "Agent",
      "Comm",
    ],
    [
      "ABTL-Berth 1",
      "DESERT GRACE",
      "9849502",
      "199",
      "15/08/26 09:10 AM",
      "22/08/26 09:10 AM",
      "B11621",
      "ABTL SHIPPING",
      "BULK SUGAR",
    ],
    ["ENL-Berth 7A", "VACANT", "", "", "", "", "", "", ""],
  ],
};

const EXPECTED: RawSheet = {
  name: "Sheet1 (9)",
  rows: [
    ["Daily Shipping Schedule - Vessels Expected - Lagos Tincan"],
    [
      "Ship",
      "IMO NUMBER",
      "Terminal",
      "Expected Time (ETA)",
      "Length(M)",
      "Agent",
      "Cargo",
      "Tonnage (Import)",
    ],
    [
      "ZONDA",
      "9285732",
      "KLT PHASE 3A",
      "Fri, August 28, 2026 06:00",
      "183.2",
      "GOBEL MARINE SERVICES",
      "AGO",
      "15,000 MTS",
    ],
    [
      "GRANDE BUENOS AIRES",
      "9253210",
      "PORTS & TERMINAL MULTI",
      "Fri, August 28, 2026 09:00",
      "213.88",
      "GRIMALDI AG. NIG.",
      "CONTS & USED VEHS",
      "450 UNITS",
    ],
  ],
};

const DEPARTED: RawSheet = {
  name: "Sheet1 (12)",
  rows: [
    ["Daily Shipping Schedule - Departed Vessels - Lagos Apapa"],
    [
      "Ship",
      "IMO Number",
      "ETD",
      "Departure Date",
      "Berth",
      "Length(M)",
      "Agent",
      "Cargo(Export)",
      "Tonnage(Export)",
    ],
    [
      "KOTA OCEAN",
      "9977854",
      "Sat, August 29, 2026 06:00",
      "Wed, August 26, 2026 04:00",
      "Berth 18",
      "260",
      "PIL SHIPPING",
      "",
      "",
    ],
  ],
};

describe("locating the header", () => {
  /*
   * The header is not always the same row: one shape puts it at index 1,
   * another at 2, and the untitled sheet at 0. Reading a fixed row would
   * treat a title as a header and lose every record beneath it.
   */
  it("finds the header wherever the sheet puts it", () => {
    expect(readHeader(AT_BERTH.rows)?.index).toBe(2);
    expect(readHeader(EXPECTED.rows)?.index).toBe(1);
  });

  /*
   * Reading by column position would put the berth in the vessel-name
   * field on berth sheets, where `Vessel Name` is column B and `Ship` is
   * column A everywhere else.
   */
  it("maps columns by name, not by position", () => {
    expect(readHeader(AT_BERTH.rows)?.columns.get("vessel")).toBe(1);
    expect(readHeader(EXPECTED.rows)?.columns.get("vessel")).toBe(0);
  });

  it("refuses a row that is not a header", () => {
    expect(
      readHeader([["Daily Shipping Schedule - Vessels at Berth - Lagos Apapa"], []]),
    ).toBeNull();
  });
});

describe("reading the sheet title", () => {
  it("takes the port from the trailing segment", () => {
    expect(portLabelFromTitle(readSheetTitle(AT_BERTH.rows))).toBe("Lagos Apapa");
    expect(portLabelFromTitle(readSheetTitle(EXPECTED.rows))).toBe("Lagos Tincan");
  });

  it("claims no port when the title names none", () => {
    expect(portLabelFromTitle("Daily Shipping Schedule")).toBeNull();
    expect(portLabelFromTitle(null)).toBeNull();
  });
});

describe("cargo direction comes from the heading", () => {
  /*
   * A departed vessel usually loaded for export, but "usually" is not a
   * fact about the row. Only a heading that says so establishes it.
   */
  it("reads import and export from the column that states it", () => {
    expect(cargoDirection(["Ship", "Cargo(Export)", "Tonnage(Export)"])).toBe("EXPORT");
    expect(cargoDirection(["Ship", "Cargo", "Tonnage (Import)"])).toBe("IMPORT");
  });

  it("leaves a bare cargo column unspecified", () => {
    expect(cargoDirection(["Berth", "Vessel Name", "Comm"])).toBe("UNSPECIFIED");
  });
});

describe("VACANT is a berth state, never a vessel", () => {
  const dataset = ingestWorkbook([AT_BERTH], OPTIONS);

  /*
   * The single most important assertion in this file. 268 rows of the
   * real workbook say VACANT in the vessel-name column.
   */
  it("creates no vessel and no port call for a vacant berth", () => {
    expect(dataset.vessels.map((vessel) => vessel.name)).not.toContain("VACANT");
    expect(dataset.portCalls.map((call) => call.vesselName)).not.toContain("VACANT");
    expect(dataset.portCalls).toHaveLength(1);
  });

  it("records the berth as infrastructure, marked vacant", () => {
    const vacant = dataset.berths.find((berth) => berth.status === "VACANT");

    expect(vacant).toBeDefined();
    expect(vacant!.raw).toBe("ENL-Berth 7A");
    expect(vacant!.terminalCode).toBe("ENL");
    expect(vacant!.portCallId).toBeNull();
  });

  it("still attributes the vacant berth to its terminal and port", () => {
    const vacant = dataset.berths.find((berth) => berth.status === "VACANT")!;

    expect(vacant.portLocode).toBe("NGAPP");
    expect(dataset.terminals.map((terminal) => terminal.code)).toContain("ENL");
  });
});

describe("port calls", () => {
  const dataset = ingestWorkbook([AT_BERTH, EXPECTED, DEPARTED], OPTIONS);

  it("keeps the four operational states apart", () => {
    expect(dataset.summary.byStatus.AT_BERTH).toBe(1);
    expect(dataset.summary.byStatus.EXPECTED).toBe(2);
    expect(dataset.summary.byStatus.DEPARTED).toBe(1);
    expect(dataset.summary.byStatus.UNKNOWN).toBe(0);
  });

  it("splits the terminal off the berth on the first hyphen", () => {
    const call = dataset.portCalls.find((entry) => entry.vesselName === "DESERT GRACE")!;

    expect(call.terminalCode).toBe("ABTL");
    expect(call.berth).toBe("Berth 1");
    // The cell is kept verbatim so the split can always be re-checked.
    expect(call.berthRaw).toBe("ABTL-Berth 1");
  });

  it("resolves the port to a canonical identifier and keeps the label", () => {
    const call = dataset.portCalls.find((entry) => entry.vesselName === "ZONDA")!;

    expect(call.portLocode).toBe("NGTIN");
    expect(call.portLabel).toBe("Lagos Tincan");
  });

  /*
   * Observation time is chosen by what the record is about. Taking the
   * newest timestamp instead would report a departed vessel as observed
   * at its ETD, which is routinely later than it actually left.
   */
  it("dates an observation by the state it describes", () => {
    const berthed = dataset.portCalls.find((entry) => entry.vesselName === "DESERT GRACE")!;
    const departed = dataset.portCalls.find((entry) => entry.vesselName === "KOTA OCEAN")!;

    /*
     * Asserted against the literal values, not against each other. The
     * first version of this compared `observedAt` to `berthAt` alone,
     * which passed while both were null — and both *were* null, because
     * the normaliser could not read the berth sheets' `15/08/26 09:10 AM`
     * format and silently dropped all 44 berth dates in the workbook.
     */
    expect(berthed.berthAt).toBe("2026-08-15T09:10:00.000Z");
    expect(berthed.observedAt).toBe("2026-08-15T09:10:00.000Z");

    expect(departed.departureAt).toBe("2026-08-26T04:00:00.000Z");
    expect(departed.observedAt).toBe("2026-08-26T04:00:00.000Z");
    // Not the ETD, which is later and would misdate the departure.
    expect(departed.etd).toBe("2026-08-29T06:00:00.000Z");
  });

  /*
   * Both date formats the workbook uses, on one call each. The day-first
   * reading is what the workbook's own long-form dates establish, and
   * reading these as month-first would move a berthing by up to eleven
   * months without failing anything.
   */
  it("reads both of the workbook's date formats", () => {
    const berthed = dataset.portCalls.find((entry) => entry.vesselName === "DESERT GRACE")!;
    const expected = dataset.portCalls.find((entry) => entry.vesselName === "ZONDA")!;

    // `15/08/26 09:10 AM` — day first, so August, not the 8th of March.
    expect(berthed.berthAt).toMatch(/^2026-08-15T09:10/);
    // `Fri, August 28, 2026 06:00`
    expect(expected.eta).toMatch(/^2026-08-28T06:00/);
  });

  it("carries provenance down to the row", () => {
    const call = dataset.portCalls.find((entry) => entry.vesselName === "DESERT GRACE")!;

    expect(call.source.file).toBe("NPA Database (1).xlsx");
    expect(call.source.sheet).toBe("Sheet1 (17)");
    expect(call.source.row).toBe(4);
    expect(call.ingestedAt).toBe(OPTIONS.ingestedAt);
  });
});

describe("cargo keeps its unit", () => {
  const dataset = ingestWorkbook([EXPECTED], OPTIONS);

  /*
   * Metric tons, vehicles and container loads share one column. Stripping
   * the unit would let a later total add tons to cars, and would let a
   * levy be charged against a quantity.
   */
  it("does not reduce a quantity to a bare number", () => {
    const zonda = dataset.portCalls.find((call) => call.vesselName === "ZONDA")!;
    const grande = dataset.portCalls.find((call) => call.vesselName === "GRANDE BUENOS AIRES")!;

    expect(zonda.cargo!.quantity).toEqual({ raw: "15,000 MTS", value: 15000, unit: "MTS" });
    expect(grande.cargo!.quantity).toEqual({ raw: "450 UNITS", value: 450, unit: "UNITS" });
    expect(zonda.cargo!.quantity!.unit).not.toBe(grande.cargo!.quantity!.unit);
  });

  it("marks the direction the sheet stated", () => {
    const zonda = dataset.portCalls.find((call) => call.vesselName === "ZONDA")!;

    expect(zonda.cargo!.direction).toBe("IMPORT");
  });
});

describe("re-running the same workbook", () => {
  /*
   * Idempotence is what makes a re-ingest safe. Ids hash (file, sheet,
   * row), so the second run produces the same records rather than a
   * second copy of them.
   */
  it("produces identical records", () => {
    const first = ingestWorkbook([AT_BERTH, EXPECTED, DEPARTED], OPTIONS);
    const second = ingestWorkbook([AT_BERTH, EXPECTED, DEPARTED], OPTIONS);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("gives records from different workbooks different identifiers", () => {
    const monday = ingestWorkbook([AT_BERTH], OPTIONS);
    const tuesday = ingestWorkbook([AT_BERTH], { ...OPTIONS, sourceFile: "NPA Tuesday.xlsx" });

    expect(tuesday.portCalls[0].id).not.toBe(monday.portCalls[0].id);
  });
});

describe("rows that cannot be read", () => {
  /*
   * A sheet that silently yields nothing is indistinguishable from a port
   * with no traffic, so an unreadable sheet is rejected with a reason.
   */
  it("rejects a sheet with no header rather than reading it as empty", () => {
    const dataset = ingestWorkbook(
      [{ name: "Notes", rows: [["Some prose"], ["More prose"]] }],
      OPTIONS,
    );

    expect(dataset.portCalls).toHaveLength(0);
    expect(dataset.rejections).toHaveLength(1);
    expect(dataset.rejections[0].reason).toMatch(/not read, rather than read as empty/i);
  });

  it("keeps a vessel with an unreadable IMO, at lower confidence", () => {
    const sheet: RawSheet = {
      name: "S",
      rows: [
        ["Daily Shipping Schedule - Vessels at Berth - Lagos Apapa"],
        ["Berth", "Vessel Name", "IMO Number", "Length(M)", "Berth Date"],
        ["ABTL-Berth 2", "DANIEL", "", "60", ""],
      ],
    };
    const dataset = ingestWorkbook([sheet], OPTIONS);

    expect(dataset.portCalls).toHaveLength(1);
    expect(dataset.portCalls[0].imo).toBeNull();
    expect(dataset.portCalls[0].confidence).toBe("LOW");
    // Keyed on its own name, so it can never merge with another hull.
    expect(dataset.vessels[0].key).toMatch(/^name:/);
  });
});
