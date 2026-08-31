/**
 * Classifying a workbook before anything is stored, and keeping what it
 * actually said.
 *
 * Two guarantees live here.
 *
 * The first is that no sheet is silently ignored. A workbook that quietly
 * drops a sheet produces an operational picture missing a whole port, and
 * nothing about the result looks wrong — the map is simply emptier than
 * the sea. So every sheet is classified or reported as needing review,
 * and the audit runs the ingest's own classifiers rather than a second
 * set that could disagree with what gets stored.
 *
 * The second is that normalisation never destroys the source. A reading
 * of a spreadsheet cell is an interpretation, and an interpretation that
 * cannot be checked against the original is an assertion. Every record
 * keeps the row it came from, including columns this ingest does not map.
 */
import { describe, expect, it } from "vitest";

import {
  auditWorkbook,
  ingestWorkbook,
  rawRow,
  type RawSheet,
} from "@/services/government/npa/workbook-ingest";

const OPTIONS = {
  sourceFile: "NPA Database - Seaphore.xlsx",
  sourceFileHash: "99a284c2d19465756c77b58bd53a8bd20b073720387573a381c256ea660cf4c7",
  ingestedAt: "2026-08-31T10:14:00.000Z",
};

/** A berth sheet, including the column this ingest does not map. */
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
      "Ship to Follow",
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
      "MSC ANTONIA",
    ],
    ["ENL-Berth 7A", "VACANT", "", "", "", "", "", "", "", ""],
  ],
};

/** The one sheet in the real workbook with no title row at all. */
const UNTITLED: RawSheet = {
  name: "Sheet1 (8)",
  rows: [
    ["Ship", "IMO Number", "Location", "Expected Time (ETA)", "Date of Arrival", "Agent", "Cargo"],
    [
      "STAR ENERGY",
      "9773935",
      "Road",
      "Wed, May 01, 2024 15:00",
      "Wed, May 01, 2024 08:50",
      "WEST ATLANTIC PORT SERVICES",
      "JET 1A",
    ],
  ],
};

describe("every sheet is accounted for", () => {
  it("classifies a titled sheet from its title", () => {
    const audit = auditWorkbook([AT_BERTH]);

    expect(audit.sheets[0].status).toBe("AT_BERTH");
    expect(audit.sheets[0].classifiedBy).toBe("TITLE");
    expect(audit.sheets[0].requiresReview).toBe(false);
  });

  /*
   * The sheet that makes the column fallback necessary. Classifying by
   * title alone would leave it UNKNOWN, and an unknown sheet is one whose
   * six vessels never reach the picture.
   */
  it("falls back to the columns when a sheet has no title", () => {
    const audit = auditWorkbook([UNTITLED]);

    expect(audit.sheets[0].title).toBeNull();
    expect(audit.sheets[0].status).toBe("AWAITING_BERTH");
    expect(audit.sheets[0].classifiedBy).toBe("COLUMNS");
  });

  /*
   * Reported, never guessed and never skipped. A sheet that cannot be
   * read must appear in the report saying so.
   */
  it("reports an unreadable sheet as requiring review", () => {
    const audit = auditWorkbook([{ name: "Notes", rows: [["Some prose"], ["More prose"]] }]);

    expect(audit.sheets[0].requiresReview).toBe(true);
    expect(audit.sheets[0].status).toBe("UNKNOWN");
    expect(audit.sheets[0].note).toMatch(/REQUIRES REVIEW/);
    expect(audit.classified).toBe(0);
  });

  it("returns one entry per sheet, so none can go missing", () => {
    const audit = auditWorkbook([AT_BERTH, UNTITLED, { name: "Notes", rows: [["x"]] }]);

    expect(audit.sheets).toHaveLength(3);
    expect(audit.totalSheets).toBe(3);
    expect(audit.classified + audit.requiresReview).toBe(3);
  });

  it("counts data rows and vacant rows per sheet", () => {
    const audit = auditWorkbook([AT_BERTH]);

    expect(audit.sheets[0].dataRows).toBe(2);
    expect(audit.sheets[0].vacantRows).toBe(1);
    expect(audit.totalDataRows).toBe(2);
  });

  /*
   * An unmapped column is not a problem, but a *silent* unmapped column
   * is: `Ship to Follow` carries a vessel name this ingest does not read,
   * and the audit is where anyone would find that out.
   */
  it("names the columns it does not map", () => {
    const audit = auditWorkbook([AT_BERTH]);

    expect(audit.sheets[0].unmappedColumns).toContain("Ship to Follow");
    expect(audit.sheets[0].mappedColumns).toContain("Vessel Name");
    expect(audit.sheets[0].mappedColumns).toContain("IMO Number");
  });

  it("resolves the port from the title, and says when it cannot", () => {
    const audit = auditWorkbook([AT_BERTH, UNTITLED]);

    expect(audit.sheets[0].portLocode).toBe("NGAPP");
    // The untitled sheet names no port, and none is invented for it.
    expect(audit.sheets[1].portLocode).toBeNull();
  });

  /*
   * The audit must describe what the ingest will actually do. A separate
   * classifier written for reporting would drift, and the report is the
   * thing that is supposed to be trustworthy.
   */
  it("agrees with what the ingest stores", () => {
    const audit = auditWorkbook([AT_BERTH, UNTITLED]);
    const dataset = ingestWorkbook([AT_BERTH, UNTITLED], OPTIONS);

    for (const sheet of audit.sheets) {
      const stored = dataset.portCalls.filter((call) => call.source.sheet === sheet.sheet);
      for (const call of stored) expect(call.status).toBe(sheet.status);
    }
    expect(audit.totalDataRows).toBe(dataset.summary.dataRows);
  });
});

describe("the source row is kept", () => {
  const dataset = ingestWorkbook([AT_BERTH], OPTIONS);

  it("keeps every cell under NPA's own header text", () => {
    const call = dataset.portCalls[0];

    expect(call.raw["Vessel Name"]).toBe("DESERT GRACE");
    expect(call.raw["Berth Date"]).toBe("15/08/26 09:10 AM");
    expect(call.raw.Agent).toBe("ABTL SHIPPING");
  });

  /*
   * The column the ingest does not read is exactly the one a later reader
   * will need. Dropping it would make the raw payload a copy of the
   * normalised record rather than a record of the source.
   */
  it("keeps a column the ingest does not map", () => {
    expect(dataset.portCalls[0].raw["Ship to Follow"]).toBe("MSC ANTONIA");
  });

  it("keeps the raw row on a vacant berth too", () => {
    const vacant = dataset.berths.find((berth) => berth.status === "VACANT")!;

    expect(vacant.rawRow["Vessel Name"]).toBe("VACANT");
    // And the berth's own verbatim cell stays a separate field.
    expect(vacant.raw).toBe("ENL-Berth 7A");
  });

  it("preserves the original alongside the normalised reading", () => {
    const call = dataset.portCalls[0];

    // Seaphore's reading…
    expect(call.berthAt).toBe("2026-08-15T09:10:00.000Z");
    // …and what NPA actually wrote, still checkable against it.
    expect(call.raw["Berth Date"]).toBe("15/08/26 09:10 AM");
  });

  it("keeps a value sitting under a blank header", () => {
    const row = rawRow(["Ship", ""], ["ZONDA", "orphan"]);

    expect(row.Ship).toBe("ZONDA");
    expect(row.column_2).toBe("orphan");
  });

  it("omits empty cells rather than storing blanks", () => {
    const row = rawRow(["Ship", "Agent"], ["ZONDA", "   "]);

    expect(row.Ship).toBe("ZONDA");
    expect(row).not.toHaveProperty("Agent");
  });
});

describe("run identity", () => {
  /*
   * The name identifies the publication; the hash identifies the bytes.
   * Two workbooks can share a name and differ, which is the case that
   * would otherwise make an ingestion report irreproducible.
   */
  it("records the file hash on every record", () => {
    const dataset = ingestWorkbook([AT_BERTH], OPTIONS);

    expect(dataset.sourceFileHash).toBe(OPTIONS.sourceFileHash);
    expect(dataset.portCalls[0].source.fileHash).toBe(OPTIONS.sourceFileHash);
    expect(dataset.berths[0].source.fileHash).toBe(OPTIONS.sourceFileHash);
  });

  /*
   * Derived, not generated. A random run id would change every record on
   * every run, turning a no-op re-ingest into a diff that reads as new
   * evidence.
   */
  it("derives a stable run id from the hash", () => {
    const first = ingestWorkbook([AT_BERTH], OPTIONS);
    const second = ingestWorkbook([AT_BERTH], OPTIONS);

    expect(first.importRunId).toBe("run-99a284c2d194");
    expect(second.importRunId).toBe(first.importRunId);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("gives different bytes a different run id", () => {
    const other = ingestWorkbook([AT_BERTH], { ...OPTIONS, sourceFileHash: "ffffffffffffffff" });

    expect(other.importRunId).not.toBe("run-99a284c2d194");
  });

  it("still ingests when no hash was supplied", () => {
    const dataset = ingestWorkbook([AT_BERTH], {
      sourceFile: OPTIONS.sourceFile,
      ingestedAt: OPTIONS.ingestedAt,
    });

    expect(dataset.sourceFileHash).toBeNull();
    expect(dataset.importRunId).toBeNull();
    expect(dataset.portCalls).toHaveLength(1);
  });
});
