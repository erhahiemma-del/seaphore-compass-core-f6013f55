/**
 * Checking a submitted manifest against what Datalastic observed.
 *
 * ## What this does and does not decide
 *
 * It compares fields and reports how each one stands. It does not approve,
 * reject, or score a manifest — those are officer decisions, and a
 * comparison engine that quietly produced a verdict would turn a set of
 * observations into a judgement nobody made.
 *
 * ## Why six statuses and not two
 *
 * A binary match/mismatch forces every uncertainty into one of two
 * confident answers, and most of the interesting cases are neither. A
 * tonnage differing by one tonne is not the same finding as a tonnage
 * differing by nine hundred; a port Seaphore cannot resolve is not a
 * mismatch; and a manifest whose own port name and UNLOCODE disagree is a
 * problem with the manifest rather than a disagreement with the provider.
 * Collapsing those would either raise false discrepancies against honest
 * paperwork or hide real ones.
 *
 * ## Tolerances are declared, never silent
 *
 * Where a comparison allows slack, the amount is named in
 * {@link TOLERANCES} and the result says a tolerance was applied. An
 * officer disputing a CLOSE_MATCH is entitled to know exactly how close
 * "close" was.
 */
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";

export type ComparisonStatus =
  /** Identical, or identical once normalised for formatting alone. */
  | "MATCH"
  /** Differs only within a declared tolerance. The tolerance is reported. */
  | "CLOSE_MATCH"
  /** Both values present and materially different. */
  | "MISMATCH"
  /** The manifest declared a value; the provider holds none to check it against. */
  | "NO_SOURCE_DATA"
  /** The manifest disagrees with itself — its own paired fields point apart. */
  | "CONFLICT"
  /**
   * Nothing to compare, or nothing that could settle it.
   *
   * A port declared as free text with no UNLOCODE lands here rather than in
   * MISMATCH: names are not unique, so Seaphore cannot say it is wrong.
   */
  | "NOT_VERIFIABLE";

export interface FieldComparison {
  readonly field: string;
  readonly submitted: string | null;
  readonly source: string | null;
  readonly status: ComparisonStatus;
  /** Provider and endpoint the source value came from. */
  readonly sourceRef: string | null;
  /** The provider's own timestamp for the source value, when it gave one. */
  readonly timestamp: string | null;
  /**
   * How far this can be relied on, given how it was compared.
   *
   * `HIGH` for an exact identifier, `MEDIUM` where a tolerance or a
   * normalisation was applied, `LOW` where the comparison could not settle
   * the question. Never a number: a percentage here would imply a
   * calibration nothing has performed.
   */
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Why the status is what it is, in words an officer can act on. */
  readonly reason: string;
}

/**
 * Declared slack, per comparison.
 *
 * Every number here is a judgement about provider precision, not about
 * acceptable error in the manifest. They are exported so a disputed result
 * can be traced to the exact figure that produced it.
 */
export const TOLERANCES = {
  /** Metres. Providers round vessel dimensions inconsistently. */
  lengthM: 0.5,
  breadthM: 0.5,
  /** Fraction. Tonnage figures vary by rounding and measurement basis. */
  tonnageRatio: 0.01,
  /** Minutes. Declared times are recorded to the minute at best. */
  timeMinutes: 60,
} as const;

/** Strip formatting so "M/V River Thames" and "RIVER THAMES" can meet. */
function normaliseName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(M\/?V|M\/?T|MS|SS)\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function compare(
  field: string,
  submitted: string | null,
  source: string | null,
  sourceRef: string | null,
  timestamp: string | null,
  settle: (a: string, b: string) => Pick<FieldComparison, "status" | "confidence" | "reason">,
): FieldComparison {
  const base = { field, submitted, source, sourceRef, timestamp };

  if (!submitted) {
    return {
      ...base,
      status: "NOT_VERIFIABLE",
      confidence: "LOW",
      reason: "The manifest declared no value, so there is nothing to check.",
    };
  }
  if (!source) {
    /*
     * Deliberately not a mismatch. The manifest may be perfectly correct;
     * Seaphore simply has nothing to weigh it against, and recording that
     * as a discrepancy would manufacture one.
     */
    return {
      ...base,
      status: "NO_SOURCE_DATA",
      confidence: "LOW",
      reason: "Datalastic holds no value for this field, so the declaration cannot be checked.",
    };
  }
  return { ...base, ...settle(submitted, source) };
}

/** Identifiers — IMO, MMSI, call sign, UNLOCODE. No tolerance applies. */
function exact(a: string, b: string) {
  const same = a.trim().toUpperCase() === b.trim().toUpperCase();
  return same
    ? {
        status: "MATCH" as const,
        confidence: "HIGH" as const,
        reason: "Identifiers are identical.",
      }
    : {
        status: "MISMATCH" as const,
        confidence: "HIGH" as const,
        reason:
          "Identifiers differ. These are exact values, so this is not a formatting difference.",
      };
}

function name(a: string, b: string) {
  if (a.trim().toUpperCase() === b.trim().toUpperCase()) {
    return {
      status: "MATCH" as const,
      confidence: "HIGH" as const,
      reason: "Names are identical.",
    };
  }
  if (normaliseName(a) === normaliseName(b)) {
    return {
      status: "CLOSE_MATCH" as const,
      confidence: "MEDIUM" as const,
      reason: "Names agree once vessel prefixes and punctuation are normalised.",
    };
  }
  return {
    status: "MISMATCH" as const,
    confidence: "MEDIUM" as const,
    reason: "Names differ beyond formatting. A vessel may legitimately have been renamed.",
  };
}

function withinRatio(label: string, ratio: number) {
  return (a: string, b: string) => {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        status: "NOT_VERIFIABLE" as const,
        confidence: "LOW" as const,
        reason: `${label} could not be read as a number on both sides.`,
      };
    }
    if (x === y) {
      return {
        status: "MATCH" as const,
        confidence: "HIGH" as const,
        reason: `${label} is identical.`,
      };
    }
    const denominator = Math.max(Math.abs(x), Math.abs(y));
    // Two zeroes are equal and handled above; a lone zero cannot be within
    // a proportional tolerance of a non-zero figure.
    const within = denominator > 0 && Math.abs(x - y) / denominator <= ratio;
    return within
      ? {
          status: "CLOSE_MATCH" as const,
          confidence: "MEDIUM" as const,
          reason: `${label} differs by less than ${(ratio * 100).toFixed(0)}%, the declared rounding tolerance.`,
        }
      : {
          status: "MISMATCH" as const,
          confidence: "HIGH" as const,
          reason: `${label} differs by more than the declared ${(ratio * 100).toFixed(0)}% tolerance.`,
        };
  };
}

function withinAbsolute(label: string, slack: number, unit: string) {
  return (a: string, b: string) => {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        status: "NOT_VERIFIABLE" as const,
        confidence: "LOW" as const,
        reason: `${label} could not be read as a number on both sides.`,
      };
    }
    if (x === y) {
      return {
        status: "MATCH" as const,
        confidence: "HIGH" as const,
        reason: `${label} is identical.`,
      };
    }
    return Math.abs(x - y) <= slack
      ? {
          status: "CLOSE_MATCH" as const,
          confidence: "MEDIUM" as const,
          reason: `${label} differs by no more than ${slack} ${unit}, the declared tolerance.`,
        }
      : {
          status: "MISMATCH" as const,
          confidence: "HIGH" as const,
          reason: `${label} differs by more than ${slack} ${unit}.`,
        };
  };
}

function withinMinutes(label: string, minutes: number) {
  return (a: string, b: string) => {
    const x = Date.parse(a);
    const y = Date.parse(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        status: "NOT_VERIFIABLE" as const,
        confidence: "LOW" as const,
        reason: `${label} could not be read as a time on both sides.`,
      };
    }
    const deltaMinutes = Math.abs(x - y) / 60_000;
    if (deltaMinutes === 0) {
      return {
        status: "MATCH" as const,
        confidence: "HIGH" as const,
        reason: `${label} is identical.`,
      };
    }
    return deltaMinutes <= minutes
      ? {
          status: "CLOSE_MATCH" as const,
          confidence: "MEDIUM" as const,
          reason: `${label} differs by ${Math.round(deltaMinutes)} minutes, within the declared ${minutes}-minute tolerance.`,
        }
      : {
          status: "MISMATCH" as const,
          confidence: "HIGH" as const,
          reason: `${label} differs by ${Math.round(deltaMinutes / 60)} hours, beyond the declared tolerance.`,
        };
  };
}

/** The vessel particulars and voyage a manifest declares. */
export interface SubmittedVessel {
  readonly name?: string | null;
  readonly imo?: string | null;
  readonly mmsi?: string | null;
  readonly callSign?: string | null;
  readonly flag?: string | null;
  readonly length?: number | null;
  readonly breadth?: number | null;
  readonly grossTonnage?: number | null;
  readonly deadweight?: number | null;
  readonly departurePort?: string | null;
  readonly departureUnlocode?: string | null;
  readonly destinationPort?: string | null;
  readonly destinationUnlocode?: string | null;
  readonly departureTime?: string | null;
  readonly eta?: string | null;
}

const str = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

/**
 * Compare a manifest's vessel and voyage against Datalastic.
 *
 * Returns one row per field, always — a field with nothing to compare is
 * reported as unverifiable rather than omitted, because a shorter table
 * silently narrows what the officer thinks was checked.
 */
export function corroborateAgainstDatalastic(
  submitted: SubmittedVessel,
  enrichment: VesselEnrichment,
  /**
   * The vessel's name as the canonical entity knows it.
   *
   * Passed in rather than read from the enrichment: `VesselParticulars`
   * carries `aisNameDiffers`, which is null whenever the AIS and registered
   * names agree — i.e. for most vessels. Using it as the source would have
   * reported "Datalastic holds no value" for every correctly-named ship,
   * which is the opposite of the truth.
   */
  sourceVesselName: string | null = null,
): ReadonlyArray<FieldComparison> {
  const p = enrichment.particulars;
  const v = enrichment.voyage;
  const infoRef = enrichment.particularsProvenance
    ? `Datalastic /${enrichment.particularsProvenance.endpoint}`
    : null;
  const proRef = enrichment.voyageProvenance
    ? `Datalastic /${enrichment.voyageProvenance.endpoint}`
    : null;
  const infoAt = enrichment.particularsProvenance?.retrievedAt ?? null;
  const proAt = enrichment.voyageProvenance?.observedAt ?? null;

  const rows: FieldComparison[] = [
    compare("Call sign", str(submitted.callSign), p?.callSign ?? null, infoRef, infoAt, exact),
    compare("Flag state", str(submitted.flag), p?.flagName ?? null, infoRef, infoAt, name),
    compare(
      "Length",
      str(submitted.length),
      str(p?.length ?? null),
      infoRef,
      infoAt,
      withinAbsolute("Length", TOLERANCES.lengthM, "m"),
    ),
    compare(
      "Breadth",
      str(submitted.breadth),
      str(p?.breadth ?? null),
      infoRef,
      infoAt,
      withinAbsolute("Breadth", TOLERANCES.breadthM, "m"),
    ),
    compare(
      "Gross tonnage",
      str(submitted.grossTonnage),
      str(p?.grossTonnage ?? null),
      infoRef,
      infoAt,
      withinRatio("Gross tonnage", TOLERANCES.tonnageRatio),
    ),
    compare(
      "Deadweight",
      str(submitted.deadweight),
      str(p?.deadweight ?? null),
      infoRef,
      infoAt,
      withinRatio("Deadweight", TOLERANCES.tonnageRatio),
    ),
    compare(
      "Departure UNLOCODE",
      str(submitted.departureUnlocode),
      v?.departureUnlocode ?? null,
      proRef,
      proAt,
      exact,
    ),
    compare(
      "Destination UNLOCODE",
      str(submitted.destinationUnlocode),
      v?.destinationLink.unlocode ?? null,
      proRef,
      proAt,
      exact,
    ),
    compare(
      "Departure time",
      str(submitted.departureTime),
      v?.departedAt ?? null,
      proRef,
      proAt,
      withinMinutes("Departure time", TOLERANCES.timeMinutes),
    ),
    compare(
      "ETA",
      str(submitted.eta),
      v?.eta ?? null,
      proRef,
      proAt,
      withinMinutes("ETA", TOLERANCES.timeMinutes),
    ),
  ];

  rows.unshift(
    compare("Vessel name", str(submitted.name), sourceVesselName, infoRef, infoAt, name),
  );

  /*
   * A divergent AIS name is its own row.
   *
   * When a vessel broadcasts a name other than its registered one, a
   * manifest matching either is matching something the ship is genuinely
   * called — but the divergence itself is worth an officer's attention, so
   * it is shown rather than folded into the name comparison above.
   */
  if (p?.aisNameDiffers) {
    rows.splice(1, 0, {
      field: "AIS name",
      submitted: str(submitted.name),
      source: p.aisNameDiffers,
      sourceRef: infoRef,
      timestamp: infoAt,
      status: "NOT_VERIFIABLE",
      confidence: "LOW",
      reason: `This vessel broadcasts "${p.aisNameDiffers}", which differs from its registered name. Neither confirms nor contradicts the manifest on its own.`,
    });
  }

  /*
   * Ports declared by name only.
   *
   * NOT_VERIFIABLE rather than a name comparison: port names are not
   * unique, so agreeing on the string "LAGOS" would not establish that the
   * two mean the same port, and disagreeing would not establish that they
   * do not.
   */
  for (const [field, submittedName, submittedCode, sourceName] of [
    ["Departure port", submitted.departurePort, submitted.departureUnlocode, v?.departurePort],
    [
      "Destination port",
      submitted.destinationPort,
      submitted.destinationUnlocode,
      v?.destinationLink.name,
    ],
  ] as const) {
    rows.push(
      portRow(field, str(submittedName), str(submittedCode), sourceName ?? null, proRef, proAt),
    );
  }

  return rows;
}

/**
 * A port declared as a name.
 *
 * Only the UNLOCODE rows above can settle a port. This one exists to show
 * the officer what was declared and to flag the case where the manifest
 * contradicts itself.
 */
function portRow(
  field: string,
  submittedName: string | null,
  submittedCode: string | null,
  sourceName: string | null,
  sourceRef: string | null,
  timestamp: string | null,
): FieldComparison {
  const base = { field, submitted: submittedName, source: sourceName, sourceRef, timestamp };

  if (!submittedName) {
    return {
      ...base,
      status: "NOT_VERIFIABLE",
      confidence: "LOW",
      reason: "The manifest declared no port name.",
    };
  }

  /*
   * The manifest disagreeing with itself is a different finding from the
   * manifest disagreeing with the provider, and it is the officer's to
   * resolve with the declarant rather than with Datalastic.
   */
  if (submittedCode && sourceName && normaliseName(submittedName) !== normaliseName(sourceName)) {
    return {
      ...base,
      status: "CONFLICT",
      confidence: "MEDIUM",
      reason: `The manifest names ${submittedName} but its UNLOCODE ${submittedCode} resolves to ${sourceName}. The declaration is internally inconsistent.`,
    };
  }

  return {
    ...base,
    status: "NOT_VERIFIABLE",
    confidence: "LOW",
    reason:
      "Port names are not unique, so a name alone cannot confirm or contradict the declaration. The UNLOCODE row above is what settles this.",
  };
}
