/**
 * Voyage domain model.
 *
 * A voyage is a *relationship*: this vessel, from that port, to this
 * other port, on this schedule. It is not a path, and this module exists
 * largely to make that impossible to forget.
 *
 * ## The truth contract: a voyage is not a track
 *
 * The `voyages` table records origin, destination, and four timestamps.
 * It records nothing whatsoever about where the vessel actually went.
 * Two ports and a departure time do not describe a route: a vessel may
 * have called elsewhere, waited at anchor, diverted, or doubled back,
 * and none of that is in the data.
 *
 * So `pathKnown` is a required field on {@link Voyage}, not an optional
 * one, and {@link toVoyage} — the only constructor — hard-codes it to
 * `false`. There is no argument that sets it. An observed track can only
 * arrive through {@link withObservedTrack}, which demands actual
 * positions and is the single place `pathKnown: true` is produced.
 *
 * This is the same shape as `headingReported` on `VesselPosition`, and
 * for the same reason. A heading defaulted to zero draws as due north; a
 * voyage rendered as a line draws as a course made good. Both are
 * fabrications produced by a default rather than by intent, and both are
 * prevented by making the absence structural rather than a convention
 * the UI is asked to honour.
 *
 * ## What this module does not do
 *
 * It does not fetch. `voyages.functions.ts` and `voyage.repository.ts`
 * already own the read path; this maps their rows into the map's
 * vocabulary and resolves endpoints through the {@link PortGazetteer}.
 * No second store, no second repository, no orchestration.
 */
import { Constants, type Database } from "@/integrations/supabase/types";

import { looksLikeDatabaseId, toPortLink, type JoinedPortRow, type PortLink } from "./port-link";
import { isLocated, type PortGazetteer, type PortResolution } from "./port-gazetteer";
import type { LonLat } from "./types";

/**
 * Lifecycle state of a voyage.
 *
 * Derived from the generated Supabase types, not transcribed. An
 * earlier hand-written list here omitted `discharged` and `completed`,
 * so two perfectly ordinary states silently displayed as "Status not
 * recorded" — a hand-maintained copy of a database enum is a copy that
 * will drift, and this one already had.
 *
 * `Constants.public.Enums.voyage_status` is a `const` array in the
 * generated file, so it gives both the runtime values and the type. A
 * migration that adds a member and regenerates types updates this
 * automatically.
 *
 * `unknown` is appended for a row carrying no status, and for a value
 * the current types do not contain — see {@link toVoyageStatus}. Never
 * inferred from timestamps: a voyage with an ATD but no status is a
 * voyage whose status nobody recorded.
 */
export type DatabaseVoyageStatus = Database["public"]["Enums"]["voyage_status"];

export type VoyageStatus = DatabaseVoyageStatus | "unknown";

/** Every status the database can currently hold, from the generated types. */
export const KNOWN_VOYAGE_STATUSES: readonly DatabaseVoyageStatus[] =
  Constants.public.Enums.voyage_status;

/**
 * One end of a voyage.
 *
 * Two stages of resolution, kept apart because they fail differently.
 *
 * `link` is the database side: did the voyage name a port, did that
 * port row come back, and did it carry a UN/LOCODE. `resolution` is the
 * gazetteer side: is that identifier known, and does it have a
 * position. The second only runs when the first succeeded — which is
 * what guarantees a UUID never reaches the gazetteer.
 */
export interface VoyageEndpoint {
  /**
   * The port's UN/LOCODE. Null whenever `link.state` is not
   * `identified`.
   *
   * Never a database UUID. `origin_port_id` is a primary key and means
   * nothing to a gazetteer; the repository translates it before a
   * voyage is built.
   */
  readonly code: string | null;
  /** How far the database got. Always present. */
  readonly link: PortLink;
  /** Resolution against the gazetteer. Null when there was no code. */
  readonly resolution: PortResolution | null;
  /** Position, only when genuinely resolved. Never a fallback. */
  readonly position: LonLat | null;
}

/**
 * The schedule, as four independent facts.
 *
 * Estimated and actual are kept apart on purpose. An ETA is a claim
 * about the future; an ATA is an observation of the past. Collapsing
 * them into one "arrival" field would let a prediction be read as a
 * record of what happened.
 */
export interface VoyageSchedule {
  /** Estimated time of departure, ISO. */
  readonly etd: string | null;
  /** Estimated time of arrival, ISO. */
  readonly eta: string | null;
  /** Actual time of departure, ISO. Observed. */
  readonly atd: string | null;
  /** Actual time of arrival, ISO. Observed. */
  readonly ata: string | null;
}

/**
 * How much is known about where the vessel physically went.
 *
 * Two values, and the gap between them is the entire point of M2.
 */
export type JourneyIntelligence =
  /**
   * Origin and destination are recorded. Nothing is known about the
   * path between them. This is what the `voyages` table supports.
   */
  | "VOYAGE_RELATIONSHIP"
  /**
   * Real observed positions exist for this voyage, from an AIS history
   * provider. Nothing in this repository currently produces this.
   */
  | "OBSERVED_TRACK";

/** Officer-facing labels. Deliberately not interchangeable wording. */
export const JOURNEY_INTELLIGENCE_LABELS: Readonly<Record<JourneyIntelligence, string>> = {
  VOYAGE_RELATIONSHIP: "Voyage relationship",
  OBSERVED_TRACK: "Observed track",
};

/** One-line explanation shown beside the label. */
export const JOURNEY_INTELLIGENCE_NOTES: Readonly<Record<JourneyIntelligence, string>> = {
  VOYAGE_RELATIONSHIP:
    "Derived from a recorded origin and destination. The path between them is not known and is not shown.",
  OBSERVED_TRACK: "Reconstructed from observed vessel positions.",
};

/** Linked records already available through `getVoyage`. */
export interface VoyageLinks {
  readonly manifestIds: readonly string[];
  readonly documentIds: readonly string[];
  /** Cargo line count across the voyage's manifests. Null when not loaded. */
  readonly cargoItemCount: number | null;
}

/** A voyage as the map knows it. */
export interface Voyage {
  readonly id: string;
  readonly voyageNumber: string | null;
  /** Canonical vessel entity id from the row. Null when unlinked. */
  readonly vesselId: string | null;
  /** IMO, when a caller has resolved the vessel. Never derived here. */
  readonly imo: string | null;
  readonly origin: VoyageEndpoint;
  readonly destination: VoyageEndpoint;
  readonly schedule: VoyageSchedule;
  readonly status: VoyageStatus;
  readonly links: VoyageLinks;
  /**
   * Whether an observed path exists for this voyage.
   *
   * Required, and `false` for anything {@link toVoyage} produces. Only
   * {@link withObservedTrack} can set it true, and only when handed real
   * positions.
   */
  readonly pathKnown: boolean;
  /**
   * Observed positions, oldest first. Empty unless `pathKnown`.
   *
   * Not interpolated, not resampled, not smoothed — exactly the
   * positions a provider reported.
   */
  readonly observedTrack: readonly LonLat[];
}

/** The shape `voyage.repository.ts` yields. Structural, so it stays decoupled. */
export interface VoyageRowLike {
  readonly id: string;
  readonly voyage_number?: string | null;
  readonly vessel_id?: string | null;
  /** UUID foreign keys. Read only to detect presence, never as codes. */
  readonly origin_port_id?: string | null;
  readonly destination_port_id?: string | null;
  /** Ports embedded by `VOYAGE_SELECT`, carrying the UN/LOCODEs. */
  readonly origin_port?: JoinedPortRow | JoinedPortRow[] | null;
  readonly destination_port?: JoinedPortRow | JoinedPortRow[] | null;
  readonly status?: string | null;
  readonly etd?: string | null;
  readonly eta?: string | null;
  readonly atd?: string | null;
  readonly ata?: string | null;
  readonly manifests?: ReadonlyArray<{ id?: string | null }> | null;
  readonly documents?: ReadonlyArray<{ id?: string | null }> | null;
  readonly cargo?: ReadonlyArray<unknown> | null;
}

/**
 * Report a status value the generated types do not contain.
 *
 * Overridable so tests can assert the observation happens, and so a
 * host can route it somewhere other than the console.
 *
 * An unrecognised status still resolves to `unknown` — the map must
 * keep working — but it must not do so *silently*. A future migration
 * that adds an enum member without regenerating types would otherwise
 * make every voyage in that state read as "Status not recorded", which
 * is indistinguishable from a genuinely unrecorded one.
 */
let onUnknownStatus: (raw: string) => void = (raw) => {
  if (import.meta.env?.DEV) {
    console.warn(
      `[voyage] Unrecognised voyage_status "${raw}". ` +
        `Known: ${KNOWN_VOYAGE_STATUSES.join(", ")}. ` +
        "Regenerate src/integrations/supabase/types.ts if the enum has changed.",
    );
  }
};

/** Replace the unknown-status reporter. Returns the previous one. */
export function setUnknownVoyageStatusReporter(
  reporter: (raw: string) => void,
): (raw: string) => void {
  const previous = onUnknownStatus;
  onUnknownStatus = reporter;
  return previous;
}

/**
 * Narrow a raw status string, without guessing.
 *
 * A null or blank status is `unknown` and is not reported — the column
 * is `NOT NULL` in the schema, but a row arriving without it through a
 * partial select is an absence, not a surprise. A *present* value that
 * is not in the enum is reported, because that is drift.
 */
export function toVoyageStatus(raw: string | null | undefined): VoyageStatus {
  if (raw == null || raw.trim() === "") return "unknown";
  const value = raw.trim().toLowerCase();
  if ((KNOWN_VOYAGE_STATUSES as readonly string[]).includes(value)) {
    return value as DatabaseVoyageStatus;
  }
  onUnknownStatus(raw);
  return "unknown";
}

/**
 * Build one endpoint from an already-translated port link.
 *
 * The gazetteer is only consulted for an `identified` link, so an
 * unresolvable database relationship never becomes a failed *location*
 * lookup — those are different facts and the drawer reports them
 * differently.
 */
function toEndpoint(link: PortLink, gazetteer: PortGazetteer): VoyageEndpoint {
  if (link.state !== "identified" || link.unlocode == null) {
    return { code: null, link, resolution: null, position: null };
  }

  const code = link.unlocode.trim();
  /*
   * The guard this corrective pass exists for.
   *
   * `voyages.origin_port_id` is a UUID foreign key to `ports.id`. An
   * earlier build handed it straight to the gazetteer, which of course
   * knew no such code — so every endpoint in the system would have
   * resolved to `unknown`, and the map would have reported, confidently
   * and wrongly, that it could not place any port at all.
   *
   * Throwing rather than returning a state: this is a wiring error, not
   * a data condition. A UUID here means the repository translation was
   * bypassed, and that must fail loudly in development and in tests
   * instead of degrading into a plausible-looking "unknown port".
   */
  if (looksLikeDatabaseId(code)) {
    throw new Error(
      `Voyage endpoint received a database identifier ("${code}") where a UN/LOCODE was expected. ` +
        "Port foreign keys must be translated by the repository before a voyage reaches the geospatial domain.",
    );
  }

  const resolution = gazetteer.resolve(code);
  return {
    code,
    link,
    resolution,
    // The only path to a position. `isLocated` is the gate.
    position: isLocated(resolution) ? resolution.position : null,
  };
}

function isoOrNull(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Date.parse(value);
  // An unparseable timestamp is not a timestamp. Better absent than wrong.
  return Number.isNaN(parsed) ? null : value;
}

/**
 * Map a voyage row into the domain model.
 *
 * The only constructor, and it cannot produce `pathKnown: true`. That is
 * deliberate: every voyage entering the map starts as a relationship,
 * and gaining a path requires observed positions to be supplied
 * explicitly through {@link withObservedTrack}.
 */
export function toVoyage(
  row: VoyageRowLike,
  gazetteer: PortGazetteer,
  options: { readonly imo?: string | null } = {},
): Voyage {
  const manifestIds = (row.manifests ?? [])
    .map((manifest) => manifest?.id)
    .filter((id): id is string => typeof id === "string");
  const documentIds = (row.documents ?? [])
    .map((document) => document?.id)
    .filter((id): id is string => typeof id === "string");

  return {
    id: row.id,
    voyageNumber: row.voyage_number?.trim() || null,
    vesselId: row.vessel_id ?? null,
    imo: options.imo ?? null,
    // Translated at the repository boundary — see `toPortLink`. The
    // UUID columns are deliberately not read here.
    origin: toEndpoint(toPortLink(row.origin_port_id, row.origin_port), gazetteer),
    destination: toEndpoint(toPortLink(row.destination_port_id, row.destination_port), gazetteer),
    schedule: {
      etd: isoOrNull(row.etd),
      eta: isoOrNull(row.eta),
      atd: isoOrNull(row.atd),
      ata: isoOrNull(row.ata),
    },
    status: toVoyageStatus(row.status),
    links: {
      manifestIds,
      documentIds,
      cargoItemCount: row.cargo ? row.cargo.length : null,
    },
    // Structural, not descriptive. No argument can change this.
    pathKnown: false,
    observedTrack: [],
  };
}

/**
 * Attach a genuinely observed track.
 *
 * The single production site of `pathKnown: true`, and it demands at
 * least two real positions — one point is a fix, not a path. Nothing in
 * this repository calls it yet, because no AIS history provider is
 * wired; it exists so that when one is, the capability arrives through a
 * checked door rather than by relaxing a flag somewhere.
 */
export function withObservedTrack(voyage: Voyage, track: readonly LonLat[]): Voyage {
  if (track.length < 2) return voyage;
  return { ...voyage, pathKnown: true, observedTrack: [...track] };
}

/** What is known about this voyage's geography. Derived, never stored. */
export function journeyIntelligence(voyage: Voyage): JourneyIntelligence {
  return voyage.pathKnown && voyage.observedTrack.length >= 2
    ? "OBSERVED_TRACK"
    : "VOYAGE_RELATIONSHIP";
}

/** True when both endpoints resolved and an arc could be drawn. */
export function hasDrawableRelationship(voyage: Voyage): boolean {
  return voyage.origin.position != null && voyage.destination.position != null;
}

/**
 * How far through its *schedule* a voyage is, 0–1, or null.
 *
 * Time only. This deliberately returns a fraction of elapsed schedule
 * and never a position: the timeline may say a voyage is 60% through its
 * window, and must not thereby place the vessel 60% of the way along a
 * line. Actual times win over estimates where present, because an
 * observation outranks a prediction.
 */
export function scheduleProgress(voyage: Voyage, at: number): number | null {
  const start = Date.parse(voyage.schedule.atd ?? voyage.schedule.etd ?? "");
  const end = Date.parse(voyage.schedule.ata ?? voyage.schedule.eta ?? "");
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.min(1, Math.max(0, (at - start) / (end - start)));
}

/**
 * Departure and arrival state, each derived from its own evidence.
 *
 * `actual` means a timestamp was recorded. `estimated` means only a
 * prediction exists. `unknown` means neither — and is not the same as
 * "has not departed", which the data does not tell us.
 */
export type MilestoneState = "actual" | "estimated" | "unknown";

export function departureState(voyage: Voyage): MilestoneState {
  if (voyage.schedule.atd) return "actual";
  return voyage.schedule.etd ? "estimated" : "unknown";
}

export function arrivalState(voyage: Voyage): MilestoneState {
  if (voyage.schedule.ata) return "actual";
  return voyage.schedule.eta ? "estimated" : "unknown";
}
