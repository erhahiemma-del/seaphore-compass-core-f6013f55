/**
 * Reading the NPA daily shipping schedule.
 *
 * Every value here was taken from the supplied workbook, audited 30 Aug
 * 2026 — sixteen sheets, 301 vessel rows, 268 vacant berths. Invented
 * fixtures would agree with whatever the parser was written to expect,
 * which is exactly how an importer ends up confidently wrong about a
 * government dataset.
 *
 * The tests that matter most are the refusals. This data feeds port calls,
 * cargo and eventually revenue, so a value guessed here becomes a figure
 * an officer acts on.
 */
import { describe, expect, it } from "vitest";

import {
  classifyByColumns,
  classifyByTitle,
  isVacantBerth,
  readBerth,
  readCargo,
  readImo,
  readNpaTimestamp,
  readTonnage,
  resolvePort,
} from "@/services/government/npa/workbook-normalisation";

describe("classifying a sheet", () => {
  /*
   * Every sheet is called `Sheet1 (n)`, so the names carry nothing. The
   * title row is the only place the operational state is stated.
   */
  it("reads the state from the title row", () => {
    expect(classifyByTitle("Daily Shipping Schedule - Vessels at Berth - Lagos Apapa")).toBe(
      "AT_BERTH",
    );
    expect(classifyByTitle("Daily Shipping Schedule - Vessels Awaiting Berth - Lagos Tincan")).toBe(
      "AWAITING_BERTH",
    );
    expect(classifyByTitle("Daily Shipping Schedule - Vessels Expected - Lekki Deep Sea")).toBe(
      "EXPECTED",
    );
    expect(classifyByTitle("Daily Shipping Schedule - Departed Vessels - Calabar Ports")).toBe(
      "DEPARTED",
    );
  });

  /*
   * "Awaiting Berth" contains "berth", and "at berth" would match it too
   * if the order were wrong. This is the pair most likely to be confused.
   */
  it("does not mistake awaiting berth for at berth", () => {
    expect(classifyByTitle("Daily Shipping Schedule - Vessels Awaiting Berth - Warri Ports")).toBe(
      "AWAITING_BERTH",
    );
  });

  it("refuses to classify without a title", () => {
    expect(classifyByTitle(null)).toBe("UNKNOWN");
    expect(classifyByTitle("Some other spreadsheet")).toBe("UNKNOWN");
  });

  /*
   * One sheet in the workbook has no title row at all. Its columns match
   * the awaiting-berth schema, which is a statement about the data rather
   * than a guess about the sheet.
   */
  it("falls back to the column schema for the titleless sheet", () => {
    const awaiting = [
      "Ship",
      "IMO Number",
      "Location",
      "Expected Time (ETA)",
      "Date of Arrival",
      "Length(M)",
      "Agent",
      "Cargo",
      "Tonnage(Import)",
    ];
    expect(classifyByColumns(awaiting)).toBe("AWAITING_BERTH");
  });

  it("tells the four schemas apart by column", () => {
    expect(
      classifyByColumns(["Ship", "IMO Number", "ETD", "Departure Date", "Berth", "Length(M)"]),
    ).toBe("DEPARTED");
    expect(
      classifyByColumns(["Berth", "Vessel Name", "IMO Number", "Length(M)", "Berth Date", "ETD"]),
    ).toBe("AT_BERTH");
    expect(
      classifyByColumns(["Ship", "IMO NUMBER", "Terminal", "Expected Time (ETA)", "Agent"]),
    ).toBe("EXPECTED");
  });
});

describe("ports", () => {
  it("resolves NPA wording to the canonical register", () => {
    expect(resolvePort("Lagos Apapa").unlocode).toBe("NGAPP");
    expect(resolvePort("Lagos Tincan").canonicalName).toBe("Tin Can Island Port Complex");
    expect(resolvePort("Calabar Ports").unlocode).toBe("NGCBQ");
  });

  /*
   * The same port is spelled two ways in adjacent sheets of one workbook.
   * Both must land on one port, or Lekki appears twice in every total.
   */
  it("treats the two Lekki spellings as one port", () => {
    expect(resolvePort("Lekki Deep Sea").unlocode).toBe("NGLKK");
    expect(resolvePort("Lekki Dep sea").unlocode).toBe("NGLKK");
  });

  /*
   * The register decides membership. Matching an unknown label to the
   * nearest name would put a port call in a port nobody named.
   */
  it("refuses to guess at a port it does not hold", () => {
    const unknown = resolvePort("Some Other Port");
    expect(unknown.unlocode).toBeNull();
    expect(unknown.npaLabel).toBe("Some Other Port");
    expect(unknown.note).toMatch(/not in Seaphore's port register/i);
  });

  it("says so when the sheet named no port", () => {
    const none = resolvePort(null);
    expect(none.unlocode).toBeNull();
    expect(none.note).toMatch(/no port in its title/i);
  });
});

describe("IMO numbers", () => {
  it("accepts a valid IMO, including Excel's float form", () => {
    expect(readImo("9285732.0")).toMatchObject({ imo: "9285732", status: "VALID" });
    expect(readImo(9977854)).toMatchObject({ imo: "9977854", status: "VALID" });
  });

  /*
   * Four of 301 rows fail the check digit, including VULPECULA at five
   * digits. The row is a real port call and is kept; only the identifier
   * is marked.
   */
  it("marks a failing check digit without discarding the row", () => {
    const bad = readImo("9658997.0");
    expect(bad.status).toBe("INVALID");
    expect(bad.imo).toBeNull();
    // The original value survives, so an officer can see what was written.
    expect(bad.raw).toBe("9658997.0");
  });

  it("rejects a value that is not seven digits", () => {
    expect(readImo("41225.0").status).toBe("INVALID");
  });

  it("separates an absent IMO from an invalid one", () => {
    expect(readImo(null).status).toBe("ABSENT");
    expect(readImo("  ").status).toBe("ABSENT");
  });
});

describe("vacant berths", () => {
  /*
   * 268 of the at-berth rows read VACANT. Importing them as vessels would
   * create 268 ships named VACANT — nearly half the berth rows.
   */
  it("recognises an empty berth", () => {
    expect(isVacantBerth("VACANT")).toBe(true);
    expect(isVacantBerth(" vacant ")).toBe(true);
  });

  it("does not mistake a vessel for an empty berth", () => {
    expect(isVacantBerth("DESERT GRACE")).toBe(false);
    expect(isVacantBerth("VACANT SEAS")).toBe(false);
  });
});

describe("berths and terminals", () => {
  /*
   * The berth cell is the only terminal attribution the workbook states
   * rather than implies: NPA writes `OPERATOR-Berth N`.
   */
  it("splits the terminal operator from the berth", () => {
    expect(readBerth("ABTL-Berth 1")).toMatchObject({ terminalCode: "ABTL", berth: "Berth 1" });
    expect(readBerth("ENL-Berth 7A")).toMatchObject({ terminalCode: "ENL", berth: "Berth 7A" });
    expect(readBerth("Brawal FLT-Berth 1B")).toMatchObject({
      terminalCode: "Brawal FLT",
      berth: "Berth 1B",
    });
  });

  /*
   * No separator means no stated terminal. Splitting on something else
   * would attribute a vessel to an operator on the strength of
   * punctuation.
   */
  it("claims no terminal when the cell states none", () => {
    const plain = readBerth("Berth 18");
    expect(plain.terminalCode).toBeNull();
    expect(plain.berth).toBe("Berth 18");
  });

  it("keeps the raw cell either way", () => {
    expect(readBerth("ABTL-Berth 1").raw).toBe("ABTL-Berth 1");
  });
});

describe("tonnage", () => {
  /*
   * The single most dangerous column. Three incommensurable units share
   * it, so the unit has to travel with the figure or something later adds
   * tons to cars.
   */
  it("keeps the unit with the figure", () => {
    expect(readTonnage("15,000 MTS")).toMatchObject({ amount: 15000, unit: "MTS" });
    expect(readTonnage("450 UNITS")).toMatchObject({ amount: 450, unit: "UNITS" });
    expect(readTonnage("199 FCL")).toMatchObject({ amount: 199, unit: "FCL" });
  });

  it("flags a figure with no unit rather than assuming tons", () => {
    const bare = readTonnage("15000");
    expect(bare.amount).toBe(15000);
    expect(bare.unit).toBeNull();
    expect(bare.note).toMatch(/cannot be compared/i);
  });

  it("says nothing was recorded rather than reporting zero", () => {
    const absent = readTonnage(null);
    expect(absent.amount).toBeNull();
    expect(absent.note).toMatch(/no tonnage was recorded/i);
  });
});

describe("cargo", () => {
  it("expands the Nigerian fuel abbreviations", () => {
    expect(readCargo("AGO")).toMatchObject({
      category: "WET_BULK",
      description: "Automotive gas oil",
    });
    expect(readCargo("PMS")).toMatchObject({
      category: "WET_BULK",
      description: "Premium motor spirit",
    });
  });

  it("categorises containers and vehicles", () => {
    expect(readCargo("CONTAINERS").category).toBe("CONTAINERISED");
  });

  /*
   * "CONTS & USED VEHS" is containers *and* vehicles. Choosing one would
   * put a tonnage under a heading nobody declared — and this column feeds
   * the revenue basis.
   */
  it("refuses to pick one category when the cell names two", () => {
    const mixed = readCargo("CONTS & USED VEHS");
    expect(mixed.category).toBe("UNKNOWN");
    // The wording survives, so an officer can read what NPA actually said.
    expect(mixed.raw).toBe("CONTS & USED VEHS");
  });

  it("leaves an unrecognised cargo unclassified rather than general", () => {
    expect(readCargo("SOMETHING UNFAMILIAR").category).toBe("UNKNOWN");
  });
});

describe("timestamps", () => {
  it("reads NPA's long date format", () => {
    expect(readNpaTimestamp("Thu, August 27, 2026 16:20 PM").iso).toBe("2026-08-27T16:20:00.000Z");
  });

  /*
   * `00:00 AM` appears throughout and is not a time any clock shows. It
   * means midnight, and the day is what carries the meaning.
   */
  it("reads the malformed midnight NPA writes", () => {
    expect(readNpaTimestamp("Fri, August 28, 2026 00:00 AM").iso).toBe("2026-08-28T00:00:00.000Z");
  });

  it("handles noon without pushing it to midnight", () => {
    expect(readNpaTimestamp("Thu, August 27, 2026 12:00 PM").iso).toBe("2026-08-27T12:00:00.000Z");
  });

  it("keeps the raw value when it cannot be read", () => {
    const bad = readNpaTimestamp("sometime next week");
    expect(bad.iso).toBeNull();
    expect(bad.raw).toBe("sometime next week");
  });

  it("reports an absent date as absent, never as now", () => {
    expect(readNpaTimestamp(null)).toMatchObject({ raw: null, iso: null });
  });
});
