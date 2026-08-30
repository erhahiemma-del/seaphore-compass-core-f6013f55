/**
 * Turning an NPA workbook into operational records.
 *
 * The normaliser next door already knows how to read a berth cell, a
 * tonnage figure and an IMO check digit. What did not exist was anything
 * that called it: `workbook-normalisation.ts` and `vessel-resolution.ts`
 * were imported by tests and by nothing else, so the workbook's 569 rows
 * had never become records the application could show. This is that
 * missing half, and it is deliberately the only one — every field below
 * is read through the existing normaliser rather than re-parsed here.
 *
 * ## Pure, so the pipeline can be tested without a file
 *
 * This takes rows and returns records. Reading the spreadsheet is the
 * script's job. That split is what lets the whole ingestion be exercised
 * against hand-written rows, including the malformed ones a real
 * workbook only occasionally contains.
 *
 * ## Idempotence comes from the identifier, not from a de-duplication pass
 *
 * Every record's id is a hash of where it came from — file, sheet, row.
 * Running the same workbook twice produces byte-identical ids, so a
 * re-ingest overwrites rather than accumulates. Nothing downstream has to
 * remember whether it has seen a row before, which is the failure mode
 * that de-duplication passes are built to paper over.
 *
 * ## A port call is the record, not a voyage
 *
 * NPA publishes what is happening at a berth today. That is a port call.
 * Promoting each row to a voyage would invent a journey — an origin, a
 * destination, a continuity between calls — that the workbook never
 * states. Where a real voyage exists, a port call can be attached to it;
 * where one does not, the port call stands alone and says so.
 */
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
  type CargoCategory,
  type ImoStatus,
  type NpaOperationalStatus,
} from "./workbook-normalisation";

/** One sheet, exactly as a spreadsheet reader hands it over. */
export interface RawSheet {
  readonly name: string;
  /** Row-major cells, including the title and header rows. */
  readonly rows: readonly (readonly unknown[])[];
}

export interface IngestOptions {
  /** Recorded on every record so two workbooks cannot collide. */
  readonly sourceFile: string;
  /** When Seaphore read the file — never confused with when NPA observed it. */
  readonly ingestedAt: string;
}

/**
 * How far a single row can be trusted.
 *
 * Carried per record rather than per dataset because trust is not
 * uniform: a row naming a valid IMO at a resolved port is stronger
 * evidence than one whose port never matched the register, and an
 * interface that averaged the two would hide both.
 */
export type RecordConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface SourceRef {
  readonly file: string;
  readonly sheet: string;
  /** The sheet's title row, which is where the port and status are stated. */
  readonly sheetTitle: string | null;
  /** 1-based row number as it appears in the spreadsheet. */
  readonly row: number;
}

/** A quantity NPA reported, with the unit still attached. */
export interface NpaQuantity {
  readonly raw: string;
  readonly value: number | null;
  readonly unit: string | null;
}

/**
 * What NPA says is aboard.
 *
 * Named evidence rather than manifest throughout. A shipping schedule's
 * cargo column is what the port authority was told; a manifest is a
 * declaration with legal weight. Collapsing the two would let a
 * spreadsheet cell present as a customs document.
 */
export interface NpaCargoEvidence {
  readonly raw: string;
  readonly category: CargoCategory;
  /** Which way the cargo was moving, where the column stated it. */
  readonly direction: "IMPORT" | "EXPORT" | "UNSPECIFIED";
  readonly quantity: NpaQuantity | null;
}

/** A vessel as NPA identifies it — never merged on name alone. */
export interface NpaVesselRecord {
  /** Stable key: the IMO when valid, otherwise a hash of the name. */
  readonly key: string;
  readonly name: string;
  readonly imo: string | null;
  readonly imoStatus: ImoStatus;
  readonly lengthM: number | null;
  /** Every port call this vessel appears in, newest source order. */
  readonly portCallIds: readonly string[];
}

export interface NpaPortCall {
  readonly id: string;
  readonly vesselKey: string;
  readonly vesselName: string;
  readonly imo: string | null;
  readonly imoStatus: ImoStatus;

  /** Canonical UN/LOCODE, or null when the sheet's port never resolved. */
  readonly portLocode: string | null;
  /** The port exactly as NPA wrote it. Kept even when it resolved. */
  readonly portLabel: string | null;
  readonly terminalCode: string | null;
  readonly berth: string | null;
  /** The berth cell verbatim, so a split can always be re-checked. */
  readonly berthRaw: string | null;

  readonly status: NpaOperationalStatus;

  readonly eta: string | null;
  readonly arrivalAt: string | null;
  readonly berthAt: string | null;
  readonly departureAt: string | null;
  readonly etd: string | null;

  readonly agent: string | null;
  readonly rotation: string | null;
  readonly lengthM: number | null;
  readonly cargo: NpaCargoEvidence | null;

  readonly source: SourceRef;
  /**
   * The most specific time NPA stated for this call.
   *
   * Chosen by status — a departed vessel is observed at its departure, an
   * expected one at its ETA — so freshness is measured against what the
   * record is about. Null when the row carried no usable time, which is
   * different from the row being new.
   */
  readonly observedAt: string | null;
  readonly ingestedAt: string;
  readonly confidence: RecordConfidence;
}

/** A berth, which is infrastructure and stays infrastructure. */
export interface NpaBerthRecord {
  readonly id: string;
  readonly name: string;
  readonly raw: string;
  readonly terminalCode: string | null;
  readonly portLocode: string | null;
  readonly portLabel: string | null;
  /**
   * Occupied or vacant, as the workbook stated.
   *
   * `VACANT` is a berth state, never a vessel. The workbook writes the
   * word in the vessel-name column, and a reader that took that column at
   * face value would put 118 ships called VACANT on the map.
   */
  readonly status: "OCCUPIED" | "VACANT";
  /** The port call occupying it, when occupied. */
  readonly portCallId: string | null;
  readonly source: SourceRef;
}

/** A terminal, known only by the code NPA prefixed to a berth. */
export interface NpaTerminalRecord {
  readonly id: string;
  /** The operator/terminal code, e.g. `ABTL`, `ENL`, `Brawal FLT`. */
  readonly code: string;
  readonly portLocode: string | null;
  readonly portLabel: string | null;
  readonly berthIds: readonly string[];
  /**
   * Nothing but the code is claimed.
   *
   * NPA states the prefix and no more. Operator, concession, capacity and
   * position are absent from the workbook and absent here, rather than
   * filled from a plausible-looking source.
   */
  readonly attributes: "CODE_ONLY";
}

export interface NpaPortRecord {
  readonly locode: string | null;
  readonly label: string;
  readonly resolved: boolean;
  readonly note: string | null;
  readonly portCallIds: readonly string[];
  readonly berthIds: readonly string[];
}

/** A row the ingest could not turn into a record, and why. */
export interface IngestRejection {
  readonly source: SourceRef;
  readonly reason: string;
}

export interface NpaIngestSummary {
  readonly sheets: number;
  readonly dataRows: number;
  readonly portCalls: number;
  readonly vessels: number;
  readonly berths: number;
  readonly vacantBerths: number;
  readonly terminals: number;
  readonly ports: number;
  readonly rejected: number;
  readonly byStatus: Readonly<Record<NpaOperationalStatus, number>>;
}

export interface NpaOperationalDataset {
  readonly sourceFile: string;
  readonly ingestedAt: string;
  readonly vessels: readonly NpaVesselRecord[];
  readonly portCalls: readonly NpaPortCall[];
  readonly berths: readonly NpaBerthRecord[];
  readonly terminals: readonly NpaTerminalRecord[];
  readonly ports: readonly NpaPortRecord[];
  readonly rejections: readonly IngestRejection[];
  readonly summary: NpaIngestSummary;
}

/*
 * FNV-1a, for identifiers only.
 *
 * Not a security boundary — it exists so the same source row produces the
 * same id on every run, which is what makes a re-ingest idempotent. Short
 * enough to read in a URL, and collisions are made irrelevant by the
 * input already being unique (file, sheet, row).
 */
/*
 * Joined on a byte that cannot occur in any of the parts.
 *
 * The parts are a file name, a sheet name, a row number and a literal, so
 * a separator drawn from ordinary text could appear inside one of them and
 * let ("a", "bc") hash the same as ("ab", "c") — two different rows
 * sharing an id, which would silently merge two records on re-ingest.
 *
 * Built by char code rather than written literally because a raw control
 * byte in a source file trips the repository's text-integrity guard.
 */
const SEPARATOR = String.fromCharCode(0);

function stableId(...parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  const input = parts.join(SEPARATOR);
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function text(cell: unknown): string | null {
  const value = String(cell ?? "").trim();
  return value === "" ? null : value;
}

function decimal(cell: unknown): number | null {
  const value = text(cell);
  if (value === null) return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Column keys this ingest knows how to read. */
type Column =
  | "vessel"
  | "imo"
  | "length"
  | "berth"
  | "berthDate"
  | "etd"
  | "rotation"
  | "agent"
  | "cargo"
  | "terminal"
  | "location"
  | "eta"
  | "arrival"
  | "departure"
  | "tonnage";

/*
 * Header text as the four sheet shapes write it.
 *
 * Matched on a squashed form so `Tonnage (Import)`, `Tonnage(Import)` and
 * `TONNAGE (IMPORT)` are one key. Reading by header rather than by column
 * index matters because the shapes genuinely differ: the vessel name is
 * column B on a berth sheet and column A on every other, and a positional
 * reader would silently attribute a berth to a ship's name.
 */
const HEADER_ALIASES: Readonly<Record<string, Column>> = {
  vesselname: "vessel",
  ship: "vessel",
  imonumber: "imo",
  lengthm: "length",
  berth: "berth",
  berthdate: "berthDate",
  etd: "etd",
  rotation: "rotation",
  agent: "agent",
  comm: "cargo",
  cargo: "cargo",
  cargoexport: "cargo",
  terminal: "terminal",
  location: "location",
  expectedtimeeta: "eta",
  dateofarrival: "arrival",
  departuredate: "departure",
  tonnageimport: "tonnage",
  tonnageexport: "tonnage",
};

function squash(header: unknown): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Locate the header row and map its columns. Null when there is none. */
export function readHeader(
  rows: readonly (readonly unknown[])[],
): { readonly index: number; readonly columns: ReadonlyMap<Column, number> } | null {
  const limit = Math.min(rows.length, 5);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index] ?? [];
    const columns = new Map<Column, number>();
    for (let column = 0; column < row.length; column += 1) {
      const key = HEADER_ALIASES[squash(row[column])];
      // First wins: a sheet repeating a header keeps the leftmost, which
      // is the one carrying data in every shape seen in this workbook.
      if (key && !columns.has(key)) columns.set(key, column);
    }
    // A header row names the vessel and its identifier. Anything less is
    // a title or a stray label that happens to contain one keyword.
    if (columns.has("vessel") && columns.has("imo")) return { index, columns };
  }
  return null;
}

/** The sheet's title row, which states the port and the operational state. */
export function readSheetTitle(rows: readonly (readonly unknown[])[]): string | null {
  for (let index = 0; index < Math.min(rows.length, 3); index += 1) {
    for (const cell of rows[index] ?? []) {
      const value = text(cell);
      if (value && /schedule/i.test(value)) return value.replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

/**
 * The port, from the sheet title.
 *
 * NPA states it once per sheet rather than per row — `Daily Shipping
 * Schedule - Vessels at Berth - Lagos Apapa`. The trailing segment is the
 * port; the middle segment is the operational status, which
 * `classifyByTitle` already reads.
 */
export function portLabelFromTitle(title: string | null): string | null {
  if (!title) return null;
  const parts = title.split("-").map((part) => part.trim());
  return parts.length >= 3 ? parts[parts.length - 1] || null : null;
}

/**
 * Which timestamp best describes a call in this state.
 *
 * Deliberately not "the newest one present". A departed vessel's ETD is
 * often later than its actual departure, and taking the maximum would
 * report a ship as observed at a time it had already left.
 */
function observationFor(
  status: NpaOperationalStatus,
  times: {
    eta: string | null;
    arrivalAt: string | null;
    berthAt: string | null;
    departureAt: string | null;
  },
): string | null {
  switch (status) {
    case "AT_BERTH":
      return times.berthAt ?? times.arrivalAt;
    case "DEPARTED":
      return times.departureAt;
    case "AWAITING_BERTH":
      return times.arrivalAt ?? times.eta;
    case "EXPECTED":
      return times.eta;
    default:
      return times.berthAt ?? times.arrivalAt ?? times.departureAt ?? times.eta;
  }
}

function confidenceFor(
  imoStatus: ImoStatus,
  portResolved: boolean,
  status: NpaOperationalStatus,
): RecordConfidence {
  if (status === "UNKNOWN") return "LOW";
  if (imoStatus !== "VALID") return "LOW";
  return portResolved ? "HIGH" : "MEDIUM";
}

interface MutableTerminal {
  code: string;
  portLocode: string | null;
  portLabel: string | null;
  berthIds: string[];
}

/**
 * Ingest a whole workbook.
 *
 * Sheets that carry no readable header are rejected with a reason rather
 * than skipped, because a sheet silently producing nothing is
 * indistinguishable from a port with no traffic.
 */
export function ingestWorkbook(
  sheets: readonly RawSheet[],
  options: IngestOptions,
): NpaOperationalDataset {
  const portCalls: NpaPortCall[] = [];
  const berths: NpaBerthRecord[] = [];
  const rejections: IngestRejection[] = [];
  const vessels = new Map<string, { record: NpaVesselRecord; calls: string[] }>();
  const terminals = new Map<string, MutableTerminal>();
  const ports = new Map<
    string,
    { locode: string | null; label: string; note: string | null; calls: string[]; berths: string[] }
  >();

  let dataRows = 0;

  for (const sheet of sheets) {
    const title = readSheetTitle(sheet.rows);
    const header = readHeader(sheet.rows);

    if (!header) {
      rejections.push({
        source: { file: options.sourceFile, sheet: sheet.name, sheetTitle: title, row: 0 },
        reason:
          "No header row naming both a vessel and an IMO column. The sheet was not read, rather than read as empty.",
      });
      continue;
    }

    const { columns } = header;
    const cell = (row: readonly unknown[], column: Column): unknown =>
      columns.has(column) ? row[columns.get(column)!] : null;

    /*
     * Status from the title where there is one, from the columns where
     * there is not. One sheet in this workbook has no title at all, which
     * is precisely why `classifyByColumns` exists.
     */
    const headerRow = sheet.rows[header.index] ?? [];
    const byTitle = classifyByTitle(title);
    const status =
      byTitle === "UNKNOWN"
        ? classifyByColumns(headerRow.map((heading) => String(heading ?? "")))
        : byTitle;

    /* Stated once per sheet in the heading, so read once per sheet. */
    const direction = cargoDirection(headerRow);

    const portLabel = portLabelFromTitle(title);
    const port = resolvePort(portLabel);
    const portKey = port.unlocode ?? `unresolved:${port.npaLabel || sheet.name}`;
    if (!ports.has(portKey)) {
      ports.set(portKey, {
        locode: port.unlocode,
        label: port.npaLabel || sheet.name,
        note: port.note,
        calls: [],
        berths: [],
      });
    }
    const portEntry = ports.get(portKey)!;

    for (let index = header.index + 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index] ?? [];
      const hasContent = row.some((value) => text(value) !== null);
      if (!hasContent) continue;
      dataRows += 1;

      const rowNumber = index + 1;
      const source: SourceRef = {
        file: options.sourceFile,
        sheet: sheet.name,
        sheetTitle: title,
        row: rowNumber,
      };

      const vesselName = text(cell(row, "vessel"));
      const berthCell = text(cell(row, "berth"));
      const berthReading = berthCell ? readBerth(berthCell) : null;

      /*
       * A vacant berth, which is the single most important thing in this
       * file not to get wrong. NPA writes VACANT in the vessel-name
       * column; taking that literally would put 118 ships called VACANT
       * on the map, each with a berth and a port and no IMO.
       */
      if (isVacantBerth(vesselName)) {
        if (!berthReading) {
          rejections.push({
            source,
            reason: "Marked VACANT but names no berth, so there is no infrastructure to record.",
          });
          continue;
        }
        const berthId = stableId(options.sourceFile, sheet.name, String(rowNumber), "berth");
        berths.push({
          id: berthId,
          name: berthReading.berth ?? berthReading.raw,
          raw: berthReading.raw,
          terminalCode: berthReading.terminalCode,
          portLocode: port.unlocode,
          portLabel: port.npaLabel || null,
          status: "VACANT",
          portCallId: null,
          source,
        });
        portEntry.berths.push(berthId);
        if (berthReading.terminalCode) {
          registerTerminal(terminals, berthReading.terminalCode, port, berthId);
        }
        continue;
      }

      if (!vesselName) {
        rejections.push({ source, reason: "Row carries no vessel name." });
        continue;
      }

      const imoReading = readImo(cell(row, "imo"));
      const cargoRaw = text(cell(row, "cargo"));
      const cargoReading = cargoRaw ? readCargo(cargoRaw) : null;
      const tonnageRaw = text(cell(row, "tonnage"));
      const tonnageReading = tonnageRaw ? readTonnage(tonnageRaw) : null;

      const eta = readNpaTimestamp(cell(row, "eta")).iso;
      const arrivalAt = readNpaTimestamp(cell(row, "arrival")).iso;
      const berthAt = readNpaTimestamp(cell(row, "berthDate")).iso;
      const departureAt = readNpaTimestamp(cell(row, "departure")).iso;
      const etd = readNpaTimestamp(cell(row, "etd")).iso;

      const callId = stableId(options.sourceFile, sheet.name, String(rowNumber), "call");

      /*
       * The vessel key. A valid IMO identifies a hull worldwide; a name
       * does not, so an unidentified vessel is keyed on its own name and
       * never merged with another. Two ships called OCEAN FLOWING stay
       * two ships until something with an identifier says otherwise.
       */
      const vesselKey = imoReading.imo ? `imo:${imoReading.imo}` : `name:${stableId(vesselName)}`;

      /*
       * The terminal column on an EXPECTED sheet is a free-text terminal
       * name; on a berth sheet it is the prefix of the berth cell. Both
       * are recorded as stated, and neither is turned into the other.
       */
      const terminalCode = berthReading?.terminalCode ?? text(cell(row, "terminal"));

      const cargo: NpaCargoEvidence | null = cargoReading
        ? {
            raw: cargoReading.raw,
            category: cargoReading.category,
            direction,
            quantity: tonnageReading
              ? {
                  raw: tonnageReading.raw ?? tonnageRaw!,
                  value: tonnageReading.amount,
                  unit: tonnageReading.unit,
                }
              : null,
          }
        : null;

      const call: NpaPortCall = {
        id: callId,
        vesselKey,
        vesselName,
        imo: imoReading.imo,
        imoStatus: imoReading.status,
        portLocode: port.unlocode,
        portLabel: port.npaLabel || null,
        terminalCode,
        berth: berthReading?.berth ?? null,
        berthRaw: berthReading?.raw ?? null,
        status,
        eta,
        arrivalAt,
        berthAt,
        departureAt,
        etd,
        agent: text(cell(row, "agent")),
        rotation: text(cell(row, "rotation")),
        lengthM: decimal(cell(row, "length")),
        cargo,
        source,
        observedAt: observationFor(status, { eta, arrivalAt, berthAt, departureAt }),
        ingestedAt: options.ingestedAt,
        confidence: confidenceFor(imoReading.status, port.unlocode !== null, status),
      };

      portCalls.push(call);
      portEntry.calls.push(callId);

      const existing = vessels.get(vesselKey);
      if (existing) {
        existing.calls.push(callId);
        // Length is recorded once. Later rows do not overwrite an earlier
        // reading, so a blank cell cannot erase a known dimension.
        if (existing.record.lengthM === null && call.lengthM !== null) {
          vessels.set(vesselKey, {
            record: { ...existing.record, lengthM: call.lengthM },
            calls: existing.calls,
          });
        }
      } else {
        vessels.set(vesselKey, {
          record: {
            key: vesselKey,
            name: vesselName,
            imo: imoReading.imo,
            imoStatus: imoReading.status,
            lengthM: call.lengthM,
            portCallIds: [],
          },
          calls: [callId],
        });
      }

      // An occupied berth is infrastructure too, and carries the call.
      if (berthReading?.raw) {
        const berthId = stableId(options.sourceFile, sheet.name, String(rowNumber), "berth");
        berths.push({
          id: berthId,
          name: berthReading.berth ?? berthReading.raw,
          raw: berthReading.raw,
          terminalCode: berthReading.terminalCode,
          portLocode: port.unlocode,
          portLabel: port.npaLabel || null,
          status: "OCCUPIED",
          portCallId: callId,
          source,
        });
        portEntry.berths.push(berthId);
        if (berthReading.terminalCode) {
          registerTerminal(terminals, berthReading.terminalCode, port, berthId);
        }
      }
    }
  }

  const vesselRecords: NpaVesselRecord[] = [...vessels.values()].map(({ record, calls }) => ({
    ...record,
    portCallIds: calls,
  }));

  const byStatus: Record<NpaOperationalStatus, number> = {
    AT_BERTH: 0,
    EXPECTED: 0,
    AWAITING_BERTH: 0,
    DEPARTED: 0,
    UNKNOWN: 0,
  };
  for (const call of portCalls) byStatus[call.status] += 1;

  const portRecords: NpaPortRecord[] = [...ports.values()].map((entry) => ({
    locode: entry.locode,
    label: entry.label,
    resolved: entry.locode !== null,
    note: entry.note,
    portCallIds: entry.calls,
    berthIds: entry.berths,
  }));

  const terminalRecords: NpaTerminalRecord[] = [...terminals.values()].map((entry) => ({
    id: stableId("terminal", entry.code, entry.portLocode ?? ""),
    code: entry.code,
    portLocode: entry.portLocode,
    portLabel: entry.portLabel,
    berthIds: entry.berthIds,
    attributes: "CODE_ONLY",
  }));

  return {
    sourceFile: options.sourceFile,
    ingestedAt: options.ingestedAt,
    vessels: vesselRecords,
    portCalls,
    berths,
    terminals: terminalRecords,
    ports: portRecords,
    rejections,
    summary: {
      sheets: sheets.length,
      dataRows,
      portCalls: portCalls.length,
      vessels: vesselRecords.length,
      berths: berths.length,
      vacantBerths: berths.filter((berth) => berth.status === "VACANT").length,
      terminals: terminalRecords.length,
      ports: portRecords.length,
      rejected: rejections.length,
      byStatus,
    },
  };
}

/**
 * Which way the cargo was moving, from the column heading.
 *
 * Read from the heading rather than inferred from the operational status:
 * a departed vessel usually loaded for export, but "usually" is not a
 * fact about this row. The sheets that know say so in the header —
 * `Cargo(Export)` and `Tonnage(Import)` — and the sheets that write a
 * bare `Cargo` or `Comm` are left unspecified rather than assigned a
 * direction on the strength of what is typical.
 */
export function cargoDirection(headerRow: readonly unknown[]): "IMPORT" | "EXPORT" | "UNSPECIFIED" {
  let sawImport = false;
  let sawExport = false;
  for (const heading of headerRow) {
    const squashed = squash(heading);
    if (!squashed.startsWith("cargo") && !squashed.startsWith("tonnage")) continue;
    if (squashed.endsWith("import")) sawImport = true;
    if (squashed.endsWith("export")) sawExport = true;
  }
  // A sheet claiming both directions has not stated one.
  if (sawImport === sawExport) return "UNSPECIFIED";
  return sawImport ? "IMPORT" : "EXPORT";
}

function registerTerminal(
  terminals: Map<string, MutableTerminal>,
  code: string,
  port: { unlocode: string | null; npaLabel: string },
  berthId: string,
): void {
  const key = `${port.unlocode ?? port.npaLabel}::${code.toUpperCase()}`;
  const existing = terminals.get(key);
  if (existing) {
    existing.berthIds.push(berthId);
    return;
  }
  terminals.set(key, {
    code,
    portLocode: port.unlocode,
    portLabel: port.npaLabel || null,
    berthIds: [berthId],
  });
}
