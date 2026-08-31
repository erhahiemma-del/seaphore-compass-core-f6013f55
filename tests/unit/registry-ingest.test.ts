/**
 * Reading the facility registry without inventing anything.
 *
 * The registry is scrupulous in a way that makes it dangerous to read
 * carelessly: rather than leaving a cell blank when nothing is known, it
 * writes the literal string `NOT VERIFIED` — coordinates included. Forty-
 * four jetties carry it in their latitude and longitude.
 *
 * A reader doing `if (row.Latitude)` finds every one of them truthy.
 * `parseFloat` hands back `NaN`, which draws at the equator or gets
 * coerced to zero on the way to a map. So the tests below are mostly
 * about absence: what must *not* become a number, a coordinate, or a
 * confident claim.
 *
 * The second theme is precision. Nineteen of twenty-nine terminals are
 * located only to their parent port's centroid, and the registry says
 * explicitly that this must not be treated as the facility's position.
 * Drawing a terminal marker there would state a location the source
 * refuses to state.
 */
import { describe, expect, it } from "vitest";

import {
  geometryFor,
  ingestRegistry,
  readCell,
  readDataState,
  readNumber,
  readPoint,
  readPrecision,
  type RegistrySheet,
} from "@/services/registry/registry-ingest";

const OPTIONS = {
  sourceFile: "Seaphore_Registry_v2_Intelligence_Edition (1).xlsx",
  sourceFileHash: "bcb981ac7fd26b374a67b480b62f68e9b4a29ab8b0380c08131cb1d7d35a3d5c",
  ingestedAt: "2026-08-31T10:56:00.000Z",
};

/** Transcribed from the workbook, including its honest-gap markers. */
const TERMINALS: RegistrySheet = {
  name: "TERMINALS",
  rows: [
    {
      "Terminal ID": "NG-TIN-T02",
      "Port ID": "NG-PORT-TIN",
      "Terminal / Facility": "Terminal B (TICT)",
      "Facility Class": "Container terminal",
      "Company ID": "CO-TIC",
      Operator: "Tin Can Island Container Terminal Ltd",
      Berths: "3, 4, 4A, 5",
      "Max Draft (m)": "NOT VERIFIED",
      "Concession ID": "CN-006",
      Latitude: "6.4325",
      Longitude: "3.3525",
      "Location Precision": "EXACT / NEAR-EXACT",
      "Data State": "VERIFIED",
    },
    {
      "Terminal ID": "NG-LAG-T03",
      "Port ID": "NG-PORT-LAG",
      "Terminal / Facility": "APM Terminals Apapa",
      Operator: "APM Terminals Apapa Ltd",
      Berths: "NOT VERIFIED",
      Latitude: "6.433",
      Longitude: "3.392",
      "Location Precision": "PORT_CENTROID",
      "Data State": "VERIFIED",
    },
    // The prose footnote the workbook ends several sheets with.
    { "Terminal ID": null, "Terminal / Facility": "Company ID → COMPANIES; …" },
  ],
};

const JETTIES: RegistrySheet = {
  name: "JETTIES & FACILITIES",
  rows: [
    {
      "Facility ID": "NG-ONN-J01",
      "Port ID": "NG-PORT-ONN",
      Facility: "STARTZ Jetty",
      Latitude: "NOT VERIFIED",
      Longitude: "NOT VERIFIED",
      "Location Precision": "UNVERIFIED",
      "Data State": "VERIFIED",
    },
  ],
};

describe("`NOT VERIFIED` is absence, not a value", () => {
  /*
   * The trap the whole file guards. These are strings in the source, and
   * every one of them is truthy.
   */
  it("reads the registry's honest-gap markers as nothing", () => {
    expect(readCell("NOT VERIFIED")).toBeNull();
    expect(readCell("not verified")).toBeNull();
    expect(readCell("N/A")).toBeNull();
    expect(readCell("None recorded")).toBeNull();
    expect(readCell("to verify")).toBeNull();
    expect(readCell("—")).toBeNull();
    expect(readCell("  ")).toBeNull();
  });

  it("keeps a real value untouched", () => {
    expect(readCell("Terminal B (TICT)")).toBe("Terminal B (TICT)");
    expect(readCell(" 6.4325 ")).toBe("6.4325");
  });

  /*
   * `NaN` is the dangerous outcome: it survives arithmetic, fails silently
   * in comparisons, and JSON-serialises to null only sometimes.
   */
  it("never returns NaN from a number field", () => {
    expect(readNumber("NOT VERIFIED")).toBeNull();
    expect(readNumber("Inland")).toBeNull();
    expect(readNumber("")).toBeNull();
    expect(readNumber("6.4325")).toBe(6.4325);
    expect(readNumber("1,200")).toBe(1200);
  });

  /*
   * Zero is a real draft and a real coordinate. Absence must never
   * collapse into it.
   */
  it("does not turn absence into zero", () => {
    expect(readNumber("NOT VERIFIED")).not.toBe(0);
    expect(readNumber("0")).toBe(0);
  });
});

describe("coordinates", () => {
  it("refuses a coordinate the registry marked NOT VERIFIED", () => {
    const point = readPoint(JETTIES.rows[0]);

    expect(point.lat).toBeNull();
    expect(point.lon).toBeNull();
    expect(point.geometry).toBe("GEOMETRY_PENDING");
  });

  /*
   * A row with one axis is not half-located, it is unlocated. Carrying a
   * lone latitude forward invites something downstream to pair it with a
   * default longitude — which is the Gulf of Guinea, ten kilometres from
   * where these ports actually are.
   */
  it("takes both axes or neither", () => {
    const half = readPoint({
      Latitude: "6.43",
      Longitude: "NOT VERIFIED",
      "Location Precision": "APPROXIMATE",
    });

    expect(half.lat).toBeNull();
    expect(half.lon).toBeNull();
    expect(half.geometry).toBe("GEOMETRY_PENDING");
  });

  it("reads a real coordinate and its precision", () => {
    const point = readPoint(TERMINALS.rows[0]);

    expect(point.lat).toBe(6.4325);
    expect(point.lon).toBe(3.3525);
    expect(point.precision).toBe("EXACT_NEAR_EXACT");
    expect(point.geometry).toBe("VERIFIED_GEOMETRY");
  });
});

describe("precision decides what the map may draw", () => {
  /*
   * The single most important rule in this source. The coordinate exists
   * and is correct — it is simply the *port's*. Drawing a terminal marker
   * there states a location the registry explicitly declines to state.
   */
  it("never lets a port centroid become a facility position", () => {
    const point = readPoint(TERMINALS.rows[1]);

    expect(point.lat).toBe(6.433);
    expect(point.geometry).toBe("PORT_ANCHORED");
    expect(point.geometry).not.toBe("VERIFIED_GEOMETRY");
    expect(point.note).toMatch(/parent port's coordinate, not the facility's/i);
  });

  it("draws facility-level and offshore-estimated positions", () => {
    expect(geometryFor("EXACT_NEAR_EXACT", true)).toBe("VERIFIED_GEOMETRY");
    expect(geometryFor("APPROXIMATE", true)).toBe("VERIFIED_GEOMETRY");
    expect(geometryFor("OFFSHORE_ESTIMATED", true)).toBe("VERIFIED_GEOMETRY");
  });

  it("draws nothing without a point, whatever the precision claims", () => {
    expect(geometryFor("EXACT_NEAR_EXACT", false)).toBe("GEOMETRY_PENDING");
    expect(geometryFor("PORT_CENTROID", false)).toBe("GEOMETRY_PENDING");
  });

  it("reads every precision the dictionary defines", () => {
    expect(readPrecision("EXACT / NEAR-EXACT")).toBe("EXACT_NEAR_EXACT");
    expect(readPrecision("APPROXIMATE")).toBe("APPROXIMATE");
    expect(readPrecision("PORT_CENTROID")).toBe("PORT_CENTROID");
    expect(readPrecision("OFFSHORE_ESTIMATED")).toBe("OFFSHORE_ESTIMATED");
    expect(readPrecision("UNVERIFIED")).toBe("UNVERIFIED");
  });

  /*
   * An unrecognised precision must not inherit the confidence of whatever
   * this table happened to list last. Unknown means unverified.
   */
  it("treats an unrecognised precision as unverified", () => {
    expect(readPrecision("SOMETHING NEW")).toBe("UNVERIFIED");
    expect(readPrecision(null)).toBe("UNVERIFIED");
  });
});

describe("data states", () => {
  it("reads the six states the dictionary defines", () => {
    expect(readDataState("VERIFIED")).toBe("VERIFIED");
    expect(readDataState("CORROBORATED")).toBe("CORROBORATED");
    expect(readDataState("PROVISIONAL")).toBe("PROVISIONAL");
    expect(readDataState("HISTORICAL")).toBe("HISTORICAL");
    expect(readDataState("DISPUTED")).toBe("DISPUTED");
    expect(readDataState("NOT VERIFIED")).toBe("NOT_VERIFIED");
  });

  /*
   * The safe default is distrust. A state this table does not know must
   * not be promoted to the confidence of one it does.
   */
  it("treats an unknown state as not verified", () => {
    expect(readDataState("SOMEWHAT SURE")).toBe("NOT_VERIFIED");
    expect(readDataState(undefined)).toBe("NOT_VERIFIED");
  });
});

describe("ingesting the sheets", () => {
  const registry = ingestRegistry([TERMINALS, JETTIES], OPTIONS);

  it("keeps the registry's own identifiers as the join keys", () => {
    const terminal = registry.terminals.find((entry) => entry.id === "NG-TIN-T02")!;

    expect(terminal.portId).toBe("NG-PORT-TIN");
    expect(terminal.companyId).toBe("CO-TIC");
    expect(terminal.concessionId).toBe("CN-006");
  });

  /*
   * `Berths` reads as a number on rows where a terminal happens to have
   * one, and as a list — `3, 4, 4A, 5` — everywhere else. Summing it
   * would produce a berth total that is sometimes a tally and sometimes a
   * designation, so it is never parsed as a count.
   */
  it("keeps berth designations as written, never as a count", () => {
    const terminal = registry.terminals.find((entry) => entry.id === "NG-TIN-T02")!;

    expect(terminal.berthDesignations).toBe("3, 4, 4A, 5");
    expect(terminal).not.toHaveProperty("berthCount");
  });

  it("records an unverified draft as absent rather than zero", () => {
    const terminal = registry.terminals.find((entry) => entry.id === "NG-TIN-T02")!;

    expect(terminal.maxDraftM).toBeNull();
  });

  /*
   * The workbook ends several sheets with a prose footnote in the first
   * column. Ingesting it produces a terminal named after a sentence.
   */
  it("skips the trailing footnote row", () => {
    expect(registry.terminals).toHaveLength(2);
    expect(registry.terminals.map((entry) => entry.name)).not.toContain(
      "Company ID → COMPANIES; …",
    );
  });

  it("carries provenance down to the spreadsheet row", () => {
    const terminal = registry.terminals[0];

    expect(terminal.source.sheet).toBe("TERMINALS");
    expect(terminal.source.row).toBe(2);
    expect(terminal.source.fileHash).toBe(OPTIONS.sourceFileHash);
    expect(terminal.source.importRunId).toBe("reg-bcb981ac7fd2");
  });
});

describe("the sheet audit", () => {
  /*
   * A documentation sheet is recognised rather than ignored. "Skipped
   * because it is prose" and "skipped because nobody noticed it" look
   * identical in a count, and only one of them is fine.
   */
  it("names metadata sheets instead of silently dropping them", () => {
    const registry = ingestRegistry(
      [{ name: "DATA DICTIONARY", rows: [{ "DATA STATES (field-level confidence)": "VERIFIED" }] }],
      OPTIONS,
    );
    const entry = registry.audit[0];

    expect(entry.kind).toBe("METADATA");
    expect(entry.accepted).toBe(0);
    expect(entry.note).toMatch(/not ingested as records/i);
  });

  it("flags a sheet it does not recognise for review", () => {
    const registry = ingestRegistry([{ name: "VESSELS", rows: [{ IMO: "9849502" }] }], OPTIONS);

    expect(registry.audit[0].kind).toBe("UNKNOWN");
    expect(registry.audit[0].note).toMatch(/REQUIRES REVIEW/);
  });

  it("counts geometry states per sheet", () => {
    const registry = ingestRegistry([TERMINALS, JETTIES], OPTIONS);
    const terminals = registry.audit.find((entry) => entry.sheet === "TERMINALS")!;

    expect(terminals.accepted).toBe(2);
    expect(terminals.skipped).toBe(1);
    expect(terminals.withFacilityGeometry).toBe(1);
    expect(terminals.portAnchored).toBe(1);
    expect(registry.audit.find((entry) => entry.sheet === "JETTIES & FACILITIES")!.noGeometry).toBe(
      1,
    );
  });
});

describe("re-running the same workbook", () => {
  it("produces an identical registry", () => {
    const first = ingestRegistry([TERMINALS, JETTIES], OPTIONS);
    const second = ingestRegistry([TERMINALS, JETTIES], OPTIONS);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("derives the run id from the file hash", () => {
    const registry = ingestRegistry([TERMINALS], OPTIONS);

    expect(registry.importRunId).toBe("reg-bcb981ac7fd2");
  });

  it("still ingests when no hash was supplied", () => {
    const registry = ingestRegistry([TERMINALS], {
      sourceFile: OPTIONS.sourceFile,
      ingestedAt: OPTIONS.ingestedAt,
    });

    expect(registry.importRunId).toBeNull();
    expect(registry.terminals).toHaveLength(2);
  });
});

describe("companies and concessions", () => {
  const registry = ingestRegistry(
    [
      {
        name: "COMPANIES",
        rows: [
          {
            "Company ID": "CO-APM",
            Company: "APM Terminals Apapa Ltd",
            "Parent / Ultimate Parent": "APM Terminals / A.P. Moller–Maersk",
            Founded: "NOT VERIFIED",
            "Facilities (IDs)": "NG-LAG-T03; NG-LAG-T05",
            "Data State": "VERIFIED",
          },
        ],
      },
    ],
    OPTIONS,
  );

  it("splits the facility id list into join keys", () => {
    expect(registry.companies[0].facilityIds).toEqual(["NG-LAG-T03", "NG-LAG-T05"]);
  });

  /*
   * The registry is explicit that a founding year must not be inferred
   * from a concession date. Absence here is what keeps that rule.
   */
  it("leaves an unverified founding year absent", () => {
    expect(registry.companies[0].founded).toBeNull();
    expect(registry.companies[0].parent).toBe("APM Terminals / A.P. Moller–Maersk");
  });
});
