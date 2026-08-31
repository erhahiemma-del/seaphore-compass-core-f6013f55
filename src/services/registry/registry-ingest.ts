/**
 * The Nigeria maritime facility registry, read on its own terms.
 *
 * This workbook is a different kind of source from the NPA shipping
 * schedule. NPA says what happened at a berth yesterday; this says what
 * the berth *is* — who operates it, under what concession, how deep, and
 * where. One is operational evidence, the other is a register of
 * infrastructure, and conflating them would let a research note about a
 * terminal's owner carry the same weight as a port authority's record of
 * a vessel alongside.
 *
 * ## Its vocabulary is adopted, not translated
 *
 * The registry defines its own confidence and precision states, and they
 * are better than anything worth inventing here: six data states from
 * `VERIFIED` to `NOT VERIFIED`, and five coordinate precisions that
 * distinguish a facility-level fix from its parent port's centroid.
 * Those are kept verbatim. A parallel vocabulary would need a mapping
 * table, and the mapping table is where "PORT_CENTROID" quietly becomes
 * "the terminal is here".
 *
 * ## `NOT VERIFIED` is a value, and it means nothing is known
 *
 * The workbook never guesses to make a row look complete — it writes the
 * literal string `NOT VERIFIED` into the cell instead, coordinates
 * included. Forty-four jetties carry it in their latitude and longitude.
 * A reader doing `if (row.Latitude)` would find every one of them
 * truthy, and `parseFloat` would hand back `NaN` to be drawn at the
 * equator or silently coerced to zero. So absence is decided once, here,
 * for every field.
 */

/** Field-level confidence, exactly as the registry defines it. */
export type DataState =
  /** Established by a primary authoritative source (NPA, ICRC, operator). */
  | "VERIFIED"
  /** Two or more credible independent sources agree. */
  | "CORROBORATED"
  /** Credible but not independently verified. */
  | "PROVISIONAL"
  /** Was true once; requires current validation before use as current. */
  | "HISTORICAL"
  /** Sources disagree; both attributions are recorded. */
  | "DISPUTED"
  /** No source establishes the value. Never filled with a guess. */
  | "NOT_VERIFIED";

/** What a coordinate actually locates. */
export type CoordinatePrecision =
  /** Facility-level coordinate, verified or near-verified. */
  | "EXACT_NEAR_EXACT"
  /** Reliable facility location; the coordinate needs confirmation. */
  | "APPROXIMATE"
  /**
   * The parent port's coordinate, not the facility's.
   *
   * The registry is explicit that this must not be treated as exact, and
   * it is the single most important distinction in the file: nineteen of
   * twenty-nine terminals are located only this well.
   */
  | "PORT_CENTROID"
  /** Offshore position from directories; confirm before operational use. */
  | "OFFSHORE_ESTIMATED"
  /** No coordinate of adequate source quality was captured. */
  | "UNVERIFIED";

/**
 * How the map may draw a facility.
 *
 * Derived from {@link CoordinatePrecision} rather than stored, so the
 * source's own judgement stays the single input. The three states match
 * the ones the port panel already speaks.
 */
export type GeometryState = "VERIFIED_GEOMETRY" | "PORT_ANCHORED" | "GEOMETRY_PENDING";

/**
 * A coordinate, or an honest account of why there isn't one.
 *
 * `value` is null whenever the registry did not establish a facility-level
 * position — including when it wrote `NOT VERIFIED` into the cell.
 */
export interface RegistryPoint {
  readonly lat: number | null;
  readonly lon: number | null;
  readonly precision: CoordinatePrecision;
  readonly geometry: GeometryState;
  /** Officer-facing sentence. Always set. */
  readonly note: string;
}

/*
 * Every way the workbook writes "we do not know".
 *
 * Matched case-insensitively after trimming. `N/A` is included because
 * the draft and berth columns use it for facilities where the field does
 * not apply, which is still not a value.
 */
const ABSENT = new Set([
  "not verified",
  "n/a",
  "na",
  "none recorded",
  "to verify",
  "unknown",
  "-",
  "—",
  "",
]);

/**
 * Read a cell, treating the registry's honest-gap markers as absent.
 *
 * The one place absence is decided. Doing this per-field is how
 * `NOT VERIFIED` ends up rendered as a terminal's name.
 */
export function readCell(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return ABSENT.has(text.toLowerCase()) ? null : text || null;
}

/** Read a numeric cell. Null when absent or unparseable — never NaN, never 0. */
export function readNumber(value: unknown): number | null {
  const text = readCell(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const DATA_STATES: Readonly<Record<string, DataState>> = {
  verified: "VERIFIED",
  corroborated: "CORROBORATED",
  provisional: "PROVISIONAL",
  historical: "HISTORICAL",
  disputed: "DISPUTED",
  "not verified": "NOT_VERIFIED",
};

export function readDataState(value: unknown): DataState {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  // Unrecognised wording is treated as unverified rather than trusted.
  // A new state the registry invents must not silently inherit the
  // confidence of the last one this table happened to list.
  return DATA_STATES[text] ?? "NOT_VERIFIED";
}

const PRECISIONS: Readonly<Record<string, CoordinatePrecision>> = {
  "exact / near-exact": "EXACT_NEAR_EXACT",
  "exact/near-exact": "EXACT_NEAR_EXACT",
  exact: "EXACT_NEAR_EXACT",
  approximate: "APPROXIMATE",
  port_centroid: "PORT_CENTROID",
  "port centroid": "PORT_CENTROID",
  offshore_estimated: "OFFSHORE_ESTIMATED",
  "offshore estimated": "OFFSHORE_ESTIMATED",
  unverified: "UNVERIFIED",
};

export function readPrecision(value: unknown): CoordinatePrecision {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return PRECISIONS[text] ?? "UNVERIFIED";
}

/**
 * What the map may do with a coordinate of each precision.
 *
 * `PORT_CENTROID` is deliberately not drawable as a facility. The point
 * exists and is correct — it is simply the port's, and drawing a terminal
 * marker there would state a location the registry explicitly refuses to.
 */
export function geometryFor(precision: CoordinatePrecision, hasPoint: boolean): GeometryState {
  if (!hasPoint) return "GEOMETRY_PENDING";
  switch (precision) {
    case "EXACT_NEAR_EXACT":
    case "APPROXIMATE":
    case "OFFSHORE_ESTIMATED":
      return "VERIFIED_GEOMETRY";
    case "PORT_CENTROID":
      return "PORT_ANCHORED";
    case "UNVERIFIED":
      return "GEOMETRY_PENDING";
  }
}

const PRECISION_NOTES: Readonly<Record<CoordinatePrecision, string>> = {
  EXACT_NEAR_EXACT: "Facility-level coordinate, verified or near-verified.",
  APPROXIMATE: "Reliable facility location; the exact coordinate still needs confirmation.",
  PORT_CENTROID:
    "This is the parent port's coordinate, not the facility's. The facility is known to be within the port complex, and nothing finer is established.",
  OFFSHORE_ESTIMATED:
    "Offshore position taken from maritime directories. Requires confirmation before operational use.",
  UNVERIFIED: "No coordinate of adequate source quality was captured for this facility.",
};

/** Read a facility's position and say plainly what it locates. */
export function readPoint(row: Record<string, unknown>): RegistryPoint {
  const precision = readPrecision(row["Location Precision"]);
  const lat = readNumber(row.Latitude);
  const lon = readNumber(row.Longitude);
  /*
   * Both or neither. A row with one axis is not half-located, it is
   * unlocated, and carrying a lone latitude forward invites something
   * downstream to pair it with a default longitude.
   */
  const hasPoint = lat !== null && lon !== null;

  return {
    lat: hasPoint ? lat : null,
    lon: hasPoint ? lon : null,
    precision,
    geometry: geometryFor(precision, hasPoint),
    note: hasPoint ? PRECISION_NOTES[precision] : PRECISION_NOTES.UNVERIFIED,
  };
}

/** Provenance carried by every registry record. */
export interface RegistrySource {
  readonly file: string;
  readonly fileHash: string | null;
  readonly importRunId: string | null;
  readonly sheet: string;
  /** 1-based row number as it appears in the spreadsheet. */
  readonly row: number;
}

export interface RegistryPort {
  readonly id: string;
  readonly name: string;
  readonly parentType: string | null;
  readonly state: string | null;
  readonly locality: string | null;
  readonly principalFunction: string | null;
  /** The registry's UN/LOCODE, which may be an alias of Seaphore's. */
  readonly unlocode: string | null;
  readonly point: RegistryPoint;
  readonly dataState: DataState;
  /** The registry's researched description. Long-form, shown on demand. */
  readonly brief: string | null;
  readonly notes: string | null;
  readonly source: RegistrySource;
}

export interface RegistryTerminal {
  readonly id: string;
  readonly portId: string | null;
  readonly name: string;
  readonly facilityClass: string | null;
  readonly primaryCargo: string | null;
  readonly companyId: string | null;
  readonly operator: string | null;
  /**
   * Berth designations as the registry lists them — `1, 1A, 2`.
   *
   * Deliberately not a count. The column reads as a number on the rows
   * where a terminal happens to have one berth, and summing it would
   * produce a berth total that is sometimes a tally and sometimes a
   * designation.
   */
  readonly berthDesignations: string | null;
  readonly quayLengthM: number | null;
  readonly maxDraftM: number | null;
  readonly annualCapacity: string | null;
  readonly concessionId: string | null;
  readonly point: RegistryPoint;
  readonly dataState: DataState;
  readonly brief: string | null;
  readonly notes: string | null;
  readonly source: RegistrySource;
}

export interface RegistryFacility {
  readonly id: string;
  readonly portId: string | null;
  readonly name: string;
  readonly facilityClass: string | null;
  readonly locality: string | null;
  readonly cargoFunction: string | null;
  readonly operator: string | null;
  readonly maxDraftM: number | null;
  readonly status: string | null;
  readonly point: RegistryPoint;
  readonly dataState: DataState;
  readonly brief: string | null;
  readonly source: RegistrySource;
}

export interface RegistryOffshore {
  readonly id: string;
  readonly name: string;
  readonly facilityClass: string | null;
  readonly zone: string | null;
  readonly operator: string | null;
  readonly product: string | null;
  /** Storage figure the registry marks HISTORICAL. Never current. */
  readonly historicalStorageBbl: string | null;
  readonly loadingSystem: string | null;
  readonly coordinateSource: string | null;
  readonly point: RegistryPoint;
  readonly dataState: DataState;
  readonly brief: string | null;
  readonly notes: string | null;
  readonly source: RegistrySource;
}

export interface RegistryCompany {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  readonly founded: string | null;
  readonly nigerianEntry: string | null;
  readonly role: string | null;
  /** Facility ids this company is recorded against. */
  readonly facilityIds: readonly string[];
  readonly dataState: DataState;
  readonly notes: string | null;
  readonly source: RegistrySource;
}

export interface RegistryConcession {
  readonly id: string;
  readonly port: string | null;
  readonly terminalId: string | null;
  readonly concessionaire: string | null;
  readonly commencement: string | null;
  readonly originalTerm: string | null;
  readonly originalExpiry: string | null;
  readonly extension: string | null;
  readonly currentStatus: string | null;
  readonly sourceAuthority: string | null;
  readonly dataState: DataState;
  readonly source: RegistrySource;
}

export interface RegistrySheetAudit {
  readonly sheet: string;
  readonly kind: RegistrySheetKind;
  readonly rows: number;
  readonly accepted: number;
  readonly skipped: number;
  readonly withFacilityGeometry: number;
  readonly portAnchored: number;
  readonly noGeometry: number;
  readonly note: string | null;
}

/** Which master a sheet is. Metadata sheets are named, never ingested. */
export type RegistrySheetKind =
  | "PORTS"
  | "TERMINALS"
  | "FACILITIES"
  | "OFFSHORE"
  | "LNG_GAS"
  | "COMPANIES"
  | "CONCESSIONS"
  /** Documentation, not data. Recognised so it cannot be silently dropped. */
  | "METADATA"
  | "UNKNOWN";

export const REGISTRY_SHEET_KINDS: Readonly<Record<string, RegistrySheetKind>> = {
  PORTS: "PORTS",
  TERMINALS: "TERMINALS",
  "JETTIES & FACILITIES": "FACILITIES",
  OFFSHORE: "OFFSHORE",
  "LNG & GAS": "LNG_GAS",
  COMPANIES: "COMPANIES",
  CONCESSIONS: "CONCESSIONS",
  "READ ME": "METADATA",
  "MAP CONFIG": "METADATA",
  "DATA DICTIONARY": "METADATA",
};

export interface FacilityRegistry {
  readonly sourceFile: string;
  readonly sourceFileHash: string | null;
  readonly importRunId: string | null;
  readonly ingestedAt: string;
  readonly ports: readonly RegistryPort[];
  readonly terminals: readonly RegistryTerminal[];
  readonly facilities: readonly RegistryFacility[];
  readonly offshore: readonly RegistryOffshore[];
  readonly lngGas: readonly RegistryOffshore[];
  readonly companies: readonly RegistryCompany[];
  readonly concessions: readonly RegistryConcession[];
  readonly audit: readonly RegistrySheetAudit[];
}

/** One sheet as a spreadsheet reader hands it over, keyed by header. */
export interface RegistrySheet {
  readonly name: string;
  readonly rows: readonly Record<string, unknown>[];
}

export interface RegistryIngestOptions {
  readonly sourceFile: string;
  readonly sourceFileHash?: string;
  readonly importRunId?: string;
  readonly ingestedAt: string;
}

/**
 * A trailing note row rather than a record.
 *
 * The workbook ends several sheets with a prose footnote in the first
 * column — "Company ID → COMPANIES; …". It has no identifier, and
 * ingesting it would produce a terminal named after a sentence.
 */
function isFootnote(id: string | null): boolean {
  return id === null;
}

export function ingestRegistry(
  sheets: readonly RegistrySheet[],
  options: RegistryIngestOptions,
): FacilityRegistry {
  const fileHash = options.sourceFileHash ?? null;
  const runId = options.importRunId ?? (fileHash ? `reg-${fileHash.slice(0, 12)}` : null);

  const ports: RegistryPort[] = [];
  const terminals: RegistryTerminal[] = [];
  const facilities: RegistryFacility[] = [];
  const offshore: RegistryOffshore[] = [];
  const lngGas: RegistryOffshore[] = [];
  const companies: RegistryCompany[] = [];
  const concessions: RegistryConcession[] = [];
  const audit: RegistrySheetAudit[] = [];

  for (const sheet of sheets) {
    const kind = REGISTRY_SHEET_KINDS[sheet.name.trim().toUpperCase()] ?? "UNKNOWN";
    let accepted = 0;
    let skipped = 0;
    const points: RegistryPoint[] = [];

    const src = (index: number): RegistrySource => ({
      file: options.sourceFile,
      fileHash,
      importRunId: runId,
      sheet: sheet.name,
      // +2: one for the header row, one to make it 1-based like the app.
      row: index + 2,
    });

    sheet.rows.forEach((row, index) => {
      switch (kind) {
        case "PORTS": {
          const id = readCell(row["Port ID"]);
          if (isFootnote(id)) return void skipped++;
          const point = readPoint(row);
          points.push(point);
          ports.push({
            id: id!,
            name: readCell(row["Port / Complex"]) ?? id!,
            parentType: readCell(row["Parent Type"]),
            state: readCell(row.State),
            locality: readCell(row.Locality),
            principalFunction: readCell(row["Principal Function"]),
            unlocode: readCell(row["UN/LOCODE"]),
            point,
            dataState: readDataState(row["Data State"]),
            brief: readCell(row["INDUSTRY BRIEF"]),
            notes: readCell(row.Notes),
            source: src(index),
          });
          accepted++;
          return;
        }
        case "TERMINALS": {
          const id = readCell(row["Terminal ID"]);
          if (isFootnote(id)) return void skipped++;
          const point = readPoint(row);
          points.push(point);
          terminals.push({
            id: id!,
            portId: readCell(row["Port ID"]),
            name: readCell(row["Terminal / Facility"]) ?? id!,
            facilityClass: readCell(row["Facility Class"]),
            primaryCargo: readCell(row["Primary Cargo"]),
            companyId: readCell(row["Company ID"]),
            operator: readCell(row.Operator),
            berthDesignations: readCell(row.Berths),
            quayLengthM: readNumber(row["Quay Length (m)"]),
            maxDraftM: readNumber(row["Max Draft (m)"]),
            annualCapacity: readCell(row["Annual Capacity"]),
            concessionId: readCell(row["Concession ID"]),
            point,
            dataState: readDataState(row["Data State"]),
            brief: readCell(row["INDUSTRY BRIEF"]),
            notes: readCell(row.Notes),
            source: src(index),
          });
          accepted++;
          return;
        }
        case "FACILITIES": {
          const id = readCell(row["Facility ID"]);
          if (isFootnote(id)) return void skipped++;
          const point = readPoint(row);
          points.push(point);
          facilities.push({
            id: id!,
            portId: readCell(row["Port ID"]),
            name: readCell(row.Facility) ?? id!,
            facilityClass: readCell(row["Facility Class"]),
            locality: readCell(row.Locality),
            cargoFunction: readCell(row["Cargo / Function"]),
            operator: readCell(row["Operator / Association"]),
            maxDraftM: readNumber(row["Max Draft (m)"]),
            status: readCell(row.Status),
            point,
            dataState: readDataState(row["Data State"]),
            brief: readCell(row["INDUSTRY BRIEF"]),
            source: src(index),
          });
          accepted++;
          return;
        }
        case "OFFSHORE":
        case "LNG_GAS": {
          const id = readCell(row["Facility ID"]);
          if (isFootnote(id)) return void skipped++;
          const point = readPoint(row);
          points.push(point);
          const record: RegistryOffshore = {
            id: id!,
            name: readCell(row.Facility) ?? id!,
            facilityClass: readCell(row.Class),
            zone: readCell(row["Zone / State"]) ?? readCell(row.Location),
            operator: readCell(row.Operator),
            product: readCell(row.Product) ?? readCell(row.Function),
            /*
             * The registry marks these HISTORICAL in the column heading
             * itself. Kept as written, never parsed to a number, so
             * nothing downstream can total or compare them as current
             * capacity.
             */
            historicalStorageBbl: readCell(row["Storage (bbl) — HISTORICAL"]),
            loadingSystem: readCell(row["Loading System"]),
            coordinateSource: readCell(row["Coordinate Source"]),
            point,
            dataState: readDataState(row["Data State"]),
            brief: readCell(row["INDUSTRY BRIEF"]),
            notes: readCell(row.Notes),
            source: src(index),
          };
          (kind === "OFFSHORE" ? offshore : lngGas).push(record);
          accepted++;
          return;
        }
        case "COMPANIES": {
          const id = readCell(row["Company ID"]);
          if (isFootnote(id)) return void skipped++;
          companies.push({
            id: id!,
            name: readCell(row.Company) ?? id!,
            parent: readCell(row["Parent / Ultimate Parent"]),
            founded: readCell(row.Founded),
            nigerianEntry: readCell(row["Nigerian Entry / Commencement"]),
            role: readCell(row.Role),
            facilityIds: (readCell(row["Facilities (IDs)"]) ?? "")
              .split(";")
              .map((value) => value.trim())
              .filter(Boolean),
            dataState: readDataState(row["Data State"]),
            notes: readCell(row.Notes),
            source: src(index),
          });
          accepted++;
          return;
        }
        case "CONCESSIONS": {
          const id = readCell(row["Concession ID"]);
          if (isFootnote(id)) return void skipped++;
          concessions.push({
            id: id!,
            port: readCell(row.Port),
            terminalId: readCell(row["Terminal ID"]),
            concessionaire: readCell(row.Concessionaire),
            commencement: readCell(row.Commencement),
            originalTerm: readCell(row["Original Term"]),
            originalExpiry: readCell(row["Original Expiry"]),
            extension: readCell(row["Extension / Revised"]),
            currentStatus: readCell(row["Current Status"]),
            sourceAuthority: readCell(row.Source),
            dataState: readDataState(row["Data State"]),
            source: src(index),
          });
          accepted++;
          return;
        }
        default:
          skipped++;
      }
    });

    audit.push({
      sheet: sheet.name,
      kind,
      rows: sheet.rows.length,
      accepted,
      skipped,
      withFacilityGeometry: points.filter((p) => p.geometry === "VERIFIED_GEOMETRY").length,
      portAnchored: points.filter((p) => p.geometry === "PORT_ANCHORED").length,
      noGeometry: points.filter((p) => p.geometry === "GEOMETRY_PENDING").length,
      note:
        kind === "METADATA"
          ? "Documentation sheet — read for its definitions, not ingested as records."
          : kind === "UNKNOWN"
            ? "UNKNOWN — REQUIRES REVIEW. This sheet matched no known registry master."
            : null,
    });
  }

  return {
    sourceFile: options.sourceFile,
    sourceFileHash: fileHash,
    importRunId: runId,
    ingestedAt: options.ingestedAt,
    ports,
    terminals,
    facilities,
    offshore,
    lngGas,
    companies,
    concessions,
    audit,
  };
}
