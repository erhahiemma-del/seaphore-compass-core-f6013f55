/**
 * Reading the NPA daily shipping schedule workbook.
 *
 * Pure functions over cell values. The workbook is parsed elsewhere; what
 * lives here is every judgement about what a cell *means*, so each one can
 * be tested against the real values rather than inferred from a sample.
 *
 * ## What the workbook actually looks like
 *
 * Audited against the supplied file, 30 Aug 2026: sixteen sheets, all named
 * `Sheet1 (n)` — the names carry nothing, so classification comes from the
 * title row. One sheet has no title row at all. Header rows sit at row 2,
 * except one at row 3. Four different column schemas.
 *
 * ## The traps
 *
 * Of 570 rows in the at-berth sheets, 268 are `VACANT` — the sheets are
 * berth registries, listing every berth whether occupied or not. Importing
 * them naively creates 268 vessels named VACANT. They are not noise
 * either: they are the NPA berth inventory, which is worth keeping as
 * exactly that.
 *
 * Tonnage is not a number. `15,000 MTS`, `450 UNITS` and `199 FCL` are
 * metric tons, vehicles and container loads — three incommensurable units
 * in one column. Parsing them to a bare number would let something later
 * add tons to cars.
 *
 * Four of 301 vessel rows carry an IMO that fails its check digit,
 * including one of five digits. They are kept and marked, never discarded.
 */

/** The operational state a sheet reports. */
export type NpaOperationalStatus =
  | "AT_BERTH"
  | "EXPECTED"
  | "AWAITING_BERTH"
  | "DEPARTED"
  /** The sheet could not be classified with confidence. */
  | "UNKNOWN";

/**
 * Classify a sheet from its title row.
 *
 * Sheet names are `Sheet1 (12)` and similar, so they are useless here. The
 * title row is the only thing that states the operational state, and one
 * sheet has none — which is why {@link classifyByColumns} exists as the
 * fallback rather than a guess.
 */
export function classifyByTitle(title: string | null): NpaOperationalStatus {
  if (!title) return "UNKNOWN";
  const t = title.toLowerCase();
  if (t.includes("at berth")) return "AT_BERTH";
  if (t.includes("awaiting berth")) return "AWAITING_BERTH";
  if (t.includes("expected")) return "EXPECTED";
  if (t.includes("departed")) return "DEPARTED";
  return "UNKNOWN";
}

/**
 * Classify a titleless sheet by its columns.
 *
 * The four schemas are distinguishable: only the departed sheets carry a
 * departure date, only at-berth leads with a berth column, and awaiting
 * berth is the one that records an actual arrival against an expected
 * time. Ordered most specific first, because several share a column.
 */
export function classifyByColumns(headers: readonly string[]): NpaOperationalStatus {
  const has = (needle: string) => headers.some((h) => h.toLowerCase().includes(needle));

  if (has("departure date")) return "DEPARTED";
  if (has("berth") && has("vessel name")) return "AT_BERTH";
  if (has("date of arrival") && has("expected time")) return "AWAITING_BERTH";
  if (has("terminal") && has("expected time")) return "EXPECTED";
  return "UNKNOWN";
}

/** NPA's own port wording, mapped to the canonical register. */
export interface PortResolution {
  /** Exactly as the workbook wrote it. Never discarded. */
  readonly npaLabel: string;
  /** UN/LOCODE of the canonical port, or null when unresolved. */
  readonly unlocode: string | null;
  readonly canonicalName: string | null;
  /** Why it resolved, or why it did not. */
  readonly note: string | null;
}

/**
 * NPA port wording is inconsistent within one workbook.
 *
 * "Lekki Deep Sea" and "Lekki Dep sea" are the same port spelled two ways
 * in adjacent sheets, and "Lagos Tincan" is Tin Can Island. Matching is on
 * a normalised form of the label rather than a literal, and anything
 * unmatched resolves to nothing rather than to the nearest guess — the
 * whole point of a canonical register is that membership is decided, not
 * approximated.
 */
const PORT_BY_NORMALISED: Readonly<Record<string, { unlocode: string; name: string }>> = {
  lagosapapa: { unlocode: "NGAPP", name: "Lagos Port Complex (Apapa)" },
  lagostincan: { unlocode: "NGTIN", name: "Tin Can Island Port Complex" },
  lekkideepsea: { unlocode: "NGLKK", name: "Lekki Deep Sea Port" },
  lekkidepsea: { unlocode: "NGLKK", name: "Lekki Deep Sea Port" },
  calabarports: { unlocode: "NGCBQ", name: "Calabar Port Complex" },
  warriports: { unlocode: "NGWAR", name: "Delta Port Complex (Warri)" },
  onneports: { unlocode: "NGONN", name: "Onne Port Complex" },
  riversports: { unlocode: "NGPHC", name: "Rivers Port Complex" },
};

function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z]/g, "");
}

export function resolvePort(npaLabel: string | null): PortResolution {
  const label = (npaLabel ?? "").trim();
  if (!label) {
    return {
      npaLabel: "",
      unlocode: null,
      canonicalName: null,
      note: "The sheet carries no port in its title, so no port can be attributed to these rows.",
    };
  }

  const hit = PORT_BY_NORMALISED[normaliseLabel(label)];
  if (!hit) {
    return {
      npaLabel: label,
      unlocode: null,
      canonicalName: null,
      note: `"${label}" is not in Seaphore's port register. Recorded as written rather than matched to the nearest name.`,
    };
  }

  return { npaLabel: label, unlocode: hit.unlocode, canonicalName: hit.name, note: null };
}

/** How far an IMO number can be trusted. */
export type ImoStatus =
  /** Seven digits and the check digit agrees. */
  | "VALID"
  /** Present, and does not satisfy the IMO check digit. */
  | "INVALID"
  /** No IMO in the row at all. */
  | "ABSENT";

export interface ImoReading {
  /** Exactly as the cell held it, including any `.0` Excel added. */
  readonly raw: string | null;
  /** Digits only, when there were seven of them. Null otherwise. */
  readonly imo: string | null;
  readonly status: ImoStatus;
}

/**
 * Read and check an IMO number.
 *
 * The check digit is the last of seven, and equals the sum of the first six
 * each multiplied by its position weight from 7 down to 2, modulo 10. A
 * failure is recorded rather than dropped: four of 301 rows fail, including
 * a five-digit value, and losing those rows would lose real port calls to
 * protect an identifier field.
 */
export function readImo(cell: unknown): ImoReading {
  if (cell === null || cell === undefined) return { raw: null, imo: null, status: "ABSENT" };

  const raw = String(cell).trim();
  if (!raw) return { raw: null, imo: null, status: "ABSENT" };

  // Excel stores these as floats, so `9285732` arrives as `9285732.0`.
  const digits = raw.replace(/\.0+$/, "").replace(/\D/g, "");
  if (digits.length !== 7) return { raw, imo: null, status: "INVALID" };

  const d = [...digits].map(Number);
  const checksum = d.slice(0, 6).reduce((sum, n, i) => sum + n * (7 - i), 0) % 10;
  return checksum === d[6]
    ? { raw, imo: digits, status: "VALID" }
    : { raw, imo: null, status: "INVALID" };
}

/**
 * Whether a berth row names a vessel or an empty berth.
 *
 * 268 of the at-berth rows read `VACANT`. They are not junk — they are the
 * berth inventory — but they are emphatically not vessels.
 */
export function isVacantBerth(vesselName: unknown): boolean {
  return (
    String(vesselName ?? "")
      .trim()
      .toUpperCase() === "VACANT"
  );
}

export interface BerthReading {
  /** The cell as written, e.g. `ENL-Berth 7A`. */
  readonly raw: string;
  /** Operator or terminal code preceding the berth, when there is one. */
  readonly terminalCode: string | null;
  /** The berth designation itself. */
  readonly berth: string | null;
}

/**
 * Split a berth cell into terminal and berth.
 *
 * NPA writes these as `TERMINAL-Berth N` — `ABTL-Berth 1`, `ENL-Berth 7A`,
 * `Brawal FLT-Berth 1B`. The prefix is the terminal operator, which is the
 * only terminal attribution in the workbook that is stated rather than
 * inferred. Cells without the separator keep the whole string as the berth
 * and claim no terminal, because a guess here would attribute a vessel to
 * an operator on the strength of punctuation.
 */
export function readBerth(cell: unknown): BerthReading {
  const raw = String(cell ?? "").trim();
  if (!raw) return { raw: "", terminalCode: null, berth: null };

  /*
   * The first hyphen, not the last. NPA writes `TERMINAL-Berth`, and some
   * berths repeat the terminal after the designation — `D/SPM-C1-D/SPM`.
   * Splitting on the last hyphen made the terminal "D/SPM-C1" and the
   * berth "D/SPM", inventing terminals that do not exist. Caught by
   * running this over the whole workbook rather than a sample.
   */
  const separator = raw.indexOf("-");
  if (separator <= 0 || separator === raw.length - 1) {
    return { raw, terminalCode: null, berth: raw };
  }

  const terminalCode = raw.slice(0, separator).trim();
  const berth = raw.slice(separator + 1).trim();
  return {
    raw,
    terminalCode: terminalCode || null,
    berth: berth || null,
  };
}

/** A tonnage figure and the unit it was measured in. */
export interface TonnageReading {
  readonly raw: string | null;
  readonly amount: number | null;
  /**
   * The unit as NPA wrote it — `MTS`, `UNITS`, `FCL`, and others.
   *
   * Kept because the column mixes them: metric tons, vehicles and
   * container loads all appear. A total across units would be meaningless,
   * so nothing may aggregate without reading this first.
   */
  readonly unit: string | null;
  readonly note: string | null;
}

/**
 * Read a tonnage cell without pretending it is a weight.
 *
 * `15,000 MTS`, `450 UNITS` and `199 FCL` share one column. Parsing to a
 * bare number would let a later total add tons to cars, so the unit travels
 * with the figure and a cell with no unit keeps its number and says so.
 */
export function readTonnage(cell: unknown): TonnageReading {
  const raw = cell === null || cell === undefined ? null : String(cell).trim();
  if (!raw) return { raw: null, amount: null, unit: null, note: "No tonnage was recorded." };

  const match = /^([\d,.]+)\s*(.*)$/.exec(raw);
  if (!match) {
    return {
      raw,
      amount: null,
      unit: null,
      note: "Recorded as written; no figure could be read from it.",
    };
  }

  const amount = Number(match[1].replace(/,/g, ""));
  const unit = match[2].trim().toUpperCase() || null;

  if (!Number.isFinite(amount)) {
    return { raw, amount: null, unit, note: "Recorded as written; the figure could not be read." };
  }

  return {
    raw,
    amount,
    unit,
    note: unit
      ? null
      : "No unit was recorded, so this figure cannot be compared with tonnages that carry one.",
  };
}

/** Cargo as NPA wrote it, and what Seaphore takes it to mean. */
export interface CargoReading {
  readonly raw: string;
  readonly category: CargoCategory;
  /** Expanded description where the abbreviation is unambiguous. */
  readonly description: string | null;
}

export type CargoCategory =
  | "WET_BULK"
  | "DRY_BULK"
  | "CONTAINERISED"
  | "RORO"
  | "GENERAL"
  | "UNKNOWN";

/**
 * Nigerian port abbreviations, expanded only where they are unambiguous.
 *
 * `AGO` and `PMS` are standard here — automotive gas oil and premium motor
 * spirit — and an officer reading the raw string would know them. Anything
 * not on this list keeps its raw wording and is categorised `UNKNOWN`
 * rather than guessed into a bucket that drives revenue.
 */
const CARGO_TERMS: ReadonlyArray<{
  readonly match: RegExp;
  readonly category: CargoCategory;
  readonly description: string | null;
}> = [
  { match: /\bAGO\b/i, category: "WET_BULK", description: "Automotive gas oil" },
  { match: /\bPMS\b/i, category: "WET_BULK", description: "Premium motor spirit" },
  { match: /\bDPK\b/i, category: "WET_BULK", description: "Dual purpose kerosene" },
  { match: /\bLPG\b/i, category: "WET_BULK", description: "Liquefied petroleum gas" },
  { match: /\bCRUDE\b/i, category: "WET_BULK", description: "Crude oil" },
  { match: /\bBASE\s*OIL\b/i, category: "WET_BULK", description: "Base oil" },
  { match: /\bUSED\s*VEHS?\b|\bVEHICLES?\b/i, category: "RORO", description: "Used vehicles" },
  { match: /\bCONT(?:AINER)?S?\b|\bFCL\b/i, category: "CONTAINERISED", description: "Containers" },
  {
    match: /\bBULK\b|\bWHEAT\b|\bGRAIN\b|\bCLINKER\b|\bGYPSUM\b/i,
    category: "DRY_BULK",
    description: null,
  },
  { match: /\bGENERAL\s*CARGO\b/i, category: "GENERAL", description: "General cargo" },
];

/**
 * Categorise a cargo description.
 *
 * A cell naming more than one kind of cargo — "CONTS & USED VEHS" — is not
 * forced into one bucket: it keeps its raw wording and reports UNKNOWN,
 * because choosing between them would put a number under a heading nobody
 * declared.
 */
export function readCargo(cell: unknown): CargoReading {
  const raw = String(cell ?? "").trim();
  if (!raw) return { raw: "", category: "UNKNOWN", description: null };

  const matched = CARGO_TERMS.filter((term) => term.match.test(raw));
  if (matched.length !== 1) {
    return { raw, category: "UNKNOWN", description: null };
  }

  return { raw, category: matched[0].category, description: matched[0].description };
}

/**
 * Read one of NPA's timestamps.
 *
 * They arrive as `Fri, August 28, 2026 00:00 AM` — a weekday, a long date,
 * and a twelve-hour clock that sometimes reads `00:00 AM`, which no clock
 * shows. The date is what carries the operational meaning here; a time that
 * cannot be read does not invalidate the day it belongs to.
 */
export function readNpaTimestamp(cell: unknown): { raw: string | null; iso: string | null } {
  const raw = cell === null || cell === undefined ? null : String(cell).trim();
  if (!raw) return { raw: null, iso: null };

  /*
   * The workbook writes dates two ways, and only one of them was read
   * until now.
   *
   * The expected, awaiting and departed sheets use `Fri, August 28, 2026
   * 06:00`. The berth sheets use `15/08/26 09:10 AM`, which this function
   * silently returned `null` for — so every berth date in the workbook
   * was dropped, and a berthed vessel showed "no berthing time was
   * recorded" when the record plainly held one.
   *
   * Day-first, not month-first. NPA is a Nigerian authority writing in
   * British convention, which the long-form dates in the same workbook
   * confirm, and rows like `15/08/26` settle it outright. Reading these
   * as month-first would move a berthing by up to eleven months without
   * failing anything.
   */
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/.exec(
    raw,
  );
  if (numeric) {
    const [, dayText, monthText, yearText, hourText, minuteText, meridiem] = numeric;
    const day = Number(dayText);
    const month = Number(monthText) - 1;
    // Two-digit years are this century: the workbook is a daily schedule,
    // and there is no 1926 shipping to confuse it with.
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    if (month < 0 || month > 11 || day < 1 || day > 31) return { raw, iso: null };

    let hour = hourText ? Number(hourText) : 0;
    const minute = minuteText ? Number(minuteText) : 0;
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return { raw, iso: null };

    const at = Date.UTC(year, month, day, hour, minute);
    // Rejects a date the calendar does not have — 31/02 rolls forward in
    // `Date.UTC`, and a rolled date is a fabricated one.
    const rolled = new Date(at);
    if (rolled.getUTCMonth() !== month || rolled.getUTCDate() !== day) {
      return { raw, iso: null };
    }
    return { raw, iso: rolled.toISOString() };
  }

  const match = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/.exec(raw);
  if (!match) return { raw, iso: null };

  const [, monthName, day, year, hourText, minuteText, meridiem] = match;
  const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
  if (month < 0) return { raw, iso: null };

  let hour = hourText ? Number(hourText) : 0;
  const minute = minuteText ? Number(minuteText) : 0;
  // `00:00 AM` and `12:00 PM` both appear; midnight and noon are the two
  // the twelve-hour clock handles worst.
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { raw, iso: null };

  const at = Date.UTC(Number(year), month, Number(day), hour, minute);
  return Number.isFinite(at) ? { raw, iso: new Date(at).toISOString() } : { raw, iso: null };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
