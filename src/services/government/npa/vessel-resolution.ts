/**
 * Matching an NPA schedule row to a vessel Seaphore already tracks.
 *
 * ## What this is for
 *
 * NPA says what the port authority believes about a vessel's operation;
 * Datalastic says where the vessel is. Neither is much use to an officer
 * until they are known to be about the same ship, and that is the whole job
 * here.
 *
 * Measured against the supplied workbook and the live Nigerian coverage on
 * 30 Aug 2026: 237 distinct NPA identifiers, 470 live vessels carrying one,
 * 52 in common. So roughly one NPA vessel in five is currently visible on
 * the map, and the other four are not errors — a vessel that departed
 * Calabar last week is simply not in Nigerian waters now.
 *
 * ## Why the name is never the key
 *
 * Names collide and are rewritten. Two ships called OCEAN FLOWING are two
 * ships, and merging them would attribute one vessel's cargo declaration to
 * another's hull. The identifier decides; the name is only ever used to
 * check that a match is plausible, never to make one.
 */
import type { Vessel } from "@/services/geospatial";

/** How an NPA row relates to the tracked fleet. */
export type ResolutionState =
  /** Identifier matched a tracked vessel, and the names agree. */
  | "RESOLVED"
  /**
   * Identifier matched, but the names do not look like the same ship.
   *
   * Reported rather than accepted or rejected: it may be a rename, a
   * transcription error, or a reused identifier, and those need different
   * responses from an officer.
   */
  | "IDENTIFIER_MATCH_NAME_CONFLICT"
  /**
   * No tracked vessel carries this identifier.
   *
   * The ordinary case for most of the workbook, and not a defect: NPA
   * records port calls that happened, and the coverage engine only sees
   * vessels currently in Nigerian waters.
   */
  | "NOT_IN_COVERAGE"
  /** The row carried no usable identifier to match on. */
  | "NO_IDENTIFIER";

export interface NpaVesselRow {
  /** Validated identifier, or null when the row had none usable. */
  readonly imo: string | null;
  /** Vessel name exactly as NPA wrote it. */
  readonly npaName: string;
}

export interface Resolution {
  readonly state: ResolutionState;
  /** The tracked vessel, when one was matched. Null otherwise. */
  readonly vessel: Vessel | null;
  readonly imo: string | null;
  readonly npaName: string;
  /** The tracked vessel's name, when matched. Lets a conflict be read. */
  readonly trackedName: string | null;
  /** Officer-facing sentence. Always set. */
  readonly note: string;
}

/**
 * Strip the differences that are not differences.
 *
 * NPA and AIS disagree about punctuation, spacing and the `M/V` prefix
 * constantly. Normalising those is not the same as matching on a name —
 * this only ever runs *after* an identifier has already matched, to judge
 * whether the match looks right.
 */
export function normaliseVesselName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(M\/?V|M\/?T|MSV|MT|MV)\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve one NPA row against the tracked fleet.
 *
 * The fleet is passed in rather than fetched: resolution is a pure decision
 * about two records, and a function that reached for a provider could not
 * be run over 301 rows without buying 301 requests.
 */
export function resolveNpaVessel(row: NpaVesselRow, fleet: readonly Vessel[]): Resolution {
  const base = { imo: row.imo, npaName: row.npaName, vessel: null, trackedName: null };

  if (!row.imo) {
    return {
      ...base,
      state: "NO_IDENTIFIER",
      note: "This NPA row carries no usable IMO, so it cannot be matched to a tracked vessel by identifier. Matching on the name alone would risk attributing this port call to a different ship.",
    };
  }

  const tracked = fleet.find((v) => v.identity.imo === row.imo);
  if (!tracked) {
    return {
      ...base,
      state: "NOT_IN_COVERAGE",
      note: "No vessel with this identifier is in the current coverage picture. NPA records port calls that have happened; the map shows vessels in Nigerian waters now, so this is expected for most historical rows.",
    };
  }

  const trackedName = tracked.identity.name;
  const agrees = normaliseVesselName(trackedName) === normaliseVesselName(row.npaName);

  if (!agrees) {
    return {
      ...base,
      state: "IDENTIFIER_MATCH_NAME_CONFLICT",
      vessel: tracked,
      trackedName,
      note: `NPA records this identifier as "${row.npaName}"; the tracked vessel is "${trackedName}". A vessel may have been renamed, or one of the records may be wrong — the identifier match is reported rather than acted on.`,
    };
  }

  return {
    ...base,
    state: "RESOLVED",
    vessel: tracked,
    trackedName,
    note: `Matched to the tracked vessel by IMO ${row.imo}, with both sources naming it "${trackedName}".`,
  };
}

/** What a batch of NPA rows resolved to. */
export interface ResolutionSummary {
  readonly total: number;
  readonly resolved: number;
  readonly nameConflicts: number;
  readonly notInCoverage: number;
  readonly noIdentifier: number;
}

/**
 * Summarise a batch.
 *
 * Reported so an officer reading a port picture knows how much of it is
 * corroborated by live tracking. A low match rate is information about
 * coverage, not a fault — and presenting it as a fault would push someone
 * toward loosening the matching rules to make the number look better.
 */
export function summariseResolutions(resolutions: readonly Resolution[]): ResolutionSummary {
  const count = (state: ResolutionState) => resolutions.filter((r) => r.state === state).length;

  return {
    total: resolutions.length,
    resolved: count("RESOLVED"),
    nameConflicts: count("IDENTIFIER_MATCH_NAME_CONFLICT"),
    notInCoverage: count("NOT_IN_COVERAGE"),
    noIdentifier: count("NO_IDENTIFIER"),
  };
}
