/**
 * Joining NPA terminal codes to the facility registry.
 *
 * Measured against the real datasets on 31 Aug 2026: 13 of 39 NPA codes
 * match, by three stated rules, and 26 do not. That ratio is the point.
 * A fuzzy matcher would join most of the remaining 26 — `ABTL` is nearly
 * `Apapa Bulk Terminals`, `APMT` is nearly `APM Terminals Apapa` — and
 * every one of those joins would be a guess wearing the same clothes as
 * a fact. An officer reading a terminal's operator and concession needs
 * to know it came from a register.
 *
 * So the rules here are exact, each match records which rule produced it,
 * and everything else is reported unmatched.
 */
import { describe, expect, it } from "vitest";

import {
  crosswalkTerminals,
  normaliseTerminalName,
  parentheticals,
  stripParenthetical,
} from "@/services/registry/terminal-crosswalk";
import type { FacilityRegistry, RegistryTerminal } from "@/services/registry/registry-ingest";

const SOURCE = {
  file: "registry.xlsx",
  fileHash: "bcb981ac",
  importRunId: "reg-bcb981ac",
  sheet: "TERMINALS",
  row: 2,
};

const POINT = {
  lat: 6.4325,
  lon: 3.3525,
  precision: "EXACT_NEAR_EXACT" as const,
  geometry: "VERIFIED_GEOMETRY" as const,
  note: "Facility-level coordinate.",
};

function terminal(overrides: Partial<RegistryTerminal> = {}): RegistryTerminal {
  return {
    id: "NG-TIN-T02",
    portId: "NG-PORT-TIN",
    name: "Terminal B (TICT)",
    facilityClass: "Container terminal",
    primaryCargo: "Containers",
    companyId: "CO-TIC",
    operator: "Tin Can Island Container Terminal Ltd",
    berthDesignations: "3, 4, 4A, 5",
    quayLengthM: null,
    maxDraftM: null,
    annualCapacity: null,
    concessionId: "CN-006",
    point: POINT,
    dataState: "VERIFIED",
    brief: null,
    notes: null,
    source: SOURCE,
    ...overrides,
  };
}

function registry(terminals: readonly RegistryTerminal[]): FacilityRegistry {
  return {
    sourceFile: "registry.xlsx",
    sourceFileHash: "bcb981ac",
    importRunId: "reg-bcb981ac",
    ingestedAt: "2026-08-31T10:56:00.000Z",
    ports: [
      {
        id: "NG-PORT-TIN",
        name: "Tin Can Island Port Complex",
        parentType: "Port Complex",
        state: "Lagos",
        locality: "Tin Can",
        principalFunction: null,
        // The registry's own spelling; Seaphore's register calls it NGTIN.
        unlocode: "NGTIN",
        point: POINT,
        dataState: "VERIFIED",
        brief: null,
        notes: null,
        source: { ...SOURCE, sheet: "PORTS" },
      },
      {
        id: "NG-PORT-LAG",
        name: "Lagos Port Complex (Apapa)",
        parentType: "Port Complex",
        state: "Lagos",
        locality: "Apapa",
        principalFunction: null,
        /* The registry writes NGLOS where Seaphore's register says NGAPAPA. */
        unlocode: "NGLOS",
        point: POINT,
        dataState: "VERIFIED",
        brief: null,
        notes: null,
        source: { ...SOURCE, sheet: "PORTS" },
      },
    ],
    terminals,
    facilities: [],
    offshore: [],
    lngGas: [],
    companies: [],
    concessions: [],
    audit: [],
  };
}

describe("name normalisation", () => {
  it("ignores case, punctuation and spacing only", () => {
    expect(normaliseTerminalName("Terminal  B")).toBe(normaliseTerminalName("terminal b"));
    expect(normaliseTerminalName("D.Q.L A")).toBe("D Q L A");
  });

  /*
   * The difference that must survive normalisation. `Terminal A` and
   * `Terminal A1` are two facilities, and at Tin Can and Rivers both
   * registers carry a `Terminal A`.
   */
  it("keeps a designation suffix meaningful", () => {
    expect(normaliseTerminalName("Terminal A")).not.toBe(normaliseTerminalName("Terminal A1"));
  });

  it("splits a registry name from its parenthetical", () => {
    expect(stripParenthetical("Terminal B (TICT)")).toBe("Terminal B");
    expect(stripParenthetical("New Terminal A")).toBe("New Terminal A");
    expect(parentheticals("Federal Ocean Terminal B (WACT)")).toEqual(["WACT"]);
  });
});

describe("the three matching rules", () => {
  it("matches identical names within one port", () => {
    const result = crosswalkTerminals(
      [{ code: "New Terminal A", portLocode: "NGTIN" }],
      registry([terminal({ id: "T1", name: "New Terminal A" })]),
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].method).toBe("EXACT_NAME");
  });

  /*
   * The registry's own convention: it appends the operator in brackets to
   * disambiguate. Stripping it recovers the code NPA's schedule uses.
   */
  it("matches a code against the registry's parenthetical form", () => {
    const result = crosswalkTerminals(
      [{ code: "Terminal B", portLocode: "NGTIN" }],
      registry([terminal()]),
    );

    expect(result.matches[0].method).toBe("PARENTHETICAL");
    expect(result.matches[0].registry.operator).toBe("Tin Can Island Container Terminal Ltd");
    expect(result.matches[0].note).toMatch(/with its operator appended/i);
  });

  /*
   * NPA writes `WACT FOT`; the registry names WACT as the operator in
   * brackets. Matched on the abbreviation the registry itself states —
   * never on a similarity score.
   */
  it("matches an operator abbreviation the registry states", () => {
    const result = crosswalkTerminals(
      [{ code: "WACT FOT", portLocode: "NGTIN" }],
      registry([terminal({ id: "T2", name: "Federal Ocean Terminal B (WACT)" })]),
    );

    expect(result.matches[0].method).toBe("OPERATOR_ABBREVIATION");
    expect(result.matches[0].note).toMatch(/abbreviation the registry itself states/i);
  });

  it("prefers an exact name over a weaker rule", () => {
    const result = crosswalkTerminals(
      [{ code: "Terminal B", portLocode: "NGTIN" }],
      registry([
        terminal({ id: "weak", name: "Something Else (Terminal B)" }),
        terminal({ id: "strong", name: "Terminal B" }),
      ]),
    );

    expect(result.matches[0].registry.id).toBe("strong");
    expect(result.matches[0].method).toBe("EXACT_NAME");
  });
});

describe("what it refuses to match", () => {
  /*
   * The defect this file exists to prevent. Every one of these is
   * recognisable to a person and none is stated by the registry, so none
   * is joined.
   */
  it("does not guess an abbreviation the registry never states", () => {
    const result = crosswalkTerminals(
      [
        { code: "ABTL", portLocode: "NGTIN" },
        { code: "APMT", portLocode: "NGTIN" },
      ],
      registry([
        terminal({ id: "a", name: "Terminal A & B (Apapa Bulk)" }),
        terminal({ id: "b", name: "APM Terminals Apapa" }),
      ]),
    );

    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedNpaCodes).toEqual(["ABTL", "APMT"]);
  });

  /*
   * A code is only unique inside a port. `Terminal A` exists at Tin Can
   * and at Rivers, and joining across ports would attach one port's
   * operator and concession to the other's quay.
   */
  it("never matches across ports", () => {
    const result = crosswalkTerminals(
      [{ code: "Terminal B", portLocode: "NGCBQ" }],
      registry([terminal()]),
    );

    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedNpaCodes).toContain("Terminal B");
  });

  it("reports an unmatched code rather than dropping it", () => {
    const result = crosswalkTerminals(
      [{ code: "Snake Island", portLocode: "NGTIN" }],
      registry([terminal()]),
    );

    expect(result.unmatchedNpaCodes).toEqual(["Snake Island"]);
    expect(result.unmatchedRegistryIds).toContain("NG-TIN-T02");
  });

  it("matches nothing when a code carries no port", () => {
    const result = crosswalkTerminals(
      [{ code: "Terminal B", portLocode: null }],
      registry([terminal()]),
    );

    expect(result.matches).toHaveLength(0);
  });
});

describe("port identity crosses the two registers", () => {
  /*
   * The registry writes `NGLOS` for Apapa where Seaphore's canonical
   * register says `NGAPAPA` and NPA resolves to `NGAPP`. All three are
   * one port, and the alias table is what keeps them so — comparing raw
   * strings would leave every Apapa terminal unjoined.
   */
  it("joins through the port alias table", () => {
    const result = crosswalkTerminals(
      [{ code: "Lilypond", portLocode: "NGAPP" }],
      registry([terminal({ id: "L", portId: "NG-PORT-LAG", name: "Lilypond" })]),
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].portLocode).toBe("NGAPAPA");
  });
});

describe("with no registry loaded", () => {
  it("reports every code unmatched rather than failing", () => {
    const result = crosswalkTerminals([{ code: "Terminal B", portLocode: "NGTIN" }], null);

    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedNpaCodes).toEqual(["Terminal B"]);
  });
});
