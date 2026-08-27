/**
 * Which vessels qualify — the predicate behind the Vessel Filters drawer.
 *
 * Layers decide what is drawn; filters decide which entities qualify to be
 * drawn. This module is the second half of that sentence, and nothing
 * else in the codebase is allowed to hold a second opinion about it.
 *
 * ## Filters narrow the picture, they do not shrink the record
 *
 * The update engine keeps every vessel a source reported. This predicate
 * is applied when the engine projects to the renderer, so an officer
 * filtering to tankers still has the honest total available behind the
 * map — "3 of 12 shown" rather than a picture that quietly claims 3 is
 * all there is. Filtering the store instead would make the national
 * counts agree with the filter, which is the wrong thing to be
 * consistent about.
 *
 * ## An unreported field never satisfies a filter
 *
 * The rule that matters most here. A vessel whose type nobody published
 * is not a tanker, and it is not "probably fine to include" either. Ask
 * for tankers and a vessel with no reported type is excluded; ask for
 * nothing and it is shown, because the absence of a filter is not a
 * claim. The alternative — letting unknowns pass every filter — produces
 * a result set an officer cannot reason about: they asked a question and
 * got back the vessels that answered it plus the ones that did not.
 *
 * ## Only dimensions the model actually carries
 *
 * Every field below exists on `Vessel`. Gross tonnage, deadweight,
 * length, draught, build year and navigational status do not, so they
 * are absent here rather than present and inert. The drawer states that
 * separately; a filter that silently matched everything would be worse
 * than one an officer can see is unavailable.
 */
import type { RiskLevel, VesselType } from "./types";
import type { Vessel } from "./vessel";

/** How recently a source last reported a position. */
export type PositionAgeWindow = "ALL" | "1H" | "6H" | "24H" | "OLDER";

/** Declared arrival horizon, from a voyage's reported ETA. */
export type ArrivalWindow = "ALL" | "TODAY" | "24H" | "48H" | "WEEK";

/** Hours covered by each position-age window. */
const POSITION_AGE_HOURS: Readonly<Record<Exclude<PositionAgeWindow, "ALL" | "OLDER">, number>> = {
  "1H": 1,
  "6H": 6,
  "24H": 24,
};

/** Hours covered by each arrival window. */
const ARRIVAL_HOURS: Readonly<Record<Exclude<ArrivalWindow, "ALL">, number>> = {
  TODAY: 24,
  "24H": 24,
  "48H": 48,
  WEEK: 168,
};

/**
 * Everything the officer can narrow by.
 *
 * Carried in `MapState`, so it is serialised, shared and restored with
 * the rest of the map rather than living in a store of its own.
 */
export interface MapFilters {
  readonly riskLevel: "ALL" | Exclude<RiskLevel, "UNKNOWN" | "CLEAN">;
  readonly vesselType: "ALL" | VesselType;
  /** Substring match against a reported destination. */
  readonly destination: "ALL" | string;
  readonly arrivalWindow: ArrivalWindow;
  /** Exact match against a reported flag state. */
  readonly flag: "ALL" | string;
  /** Free text over IMO, MMSI, call sign and name. */
  readonly identifier: string;
  readonly positionAge: PositionAgeWindow;
}

export const EMPTY_FILTERS: MapFilters = {
  riskLevel: "ALL",
  vesselType: "ALL",
  destination: "ALL",
  arrivalWindow: "ALL",
  flag: "ALL",
  identifier: "",
  positionAge: "ALL",
};

/** True when nothing is narrowed and every reported vessel qualifies. */
export function isUnfiltered(filters: MapFilters): boolean {
  return activeFilterCount(filters) === 0;
}

/**
 * How many dimensions the officer has narrowed.
 *
 * Drives the count beside the control. A filter set to `ALL`, or a search
 * box holding only whitespace, is not a filter.
 */
export function activeFilterCount(filters: MapFilters): number {
  let active = 0;
  if (filters.riskLevel !== "ALL") active += 1;
  if (filters.vesselType !== "ALL") active += 1;
  if (filters.destination !== "ALL" && filters.destination.trim() !== "") active += 1;
  if (filters.arrivalWindow !== "ALL") active += 1;
  if (filters.flag !== "ALL" && filters.flag.trim() !== "") active += 1;
  if (filters.identifier.trim() !== "") active += 1;
  if (filters.positionAge !== "ALL") active += 1;
  return active;
}

/** One narrowed dimension, for the active-filter summary. */
export interface ActiveFilterChip {
  readonly key: keyof MapFilters;
  readonly label: string;
}

/** The narrowed dimensions, in the order the drawer presents them. */
export function activeFilterChips(filters: MapFilters): readonly ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.vesselType !== "ALL") chips.push({ key: "vesselType", label: filters.vesselType });
  if (filters.flag !== "ALL" && filters.flag.trim() !== "") {
    chips.push({ key: "flag", label: filters.flag });
  }
  if (filters.identifier.trim() !== "") {
    chips.push({ key: "identifier", label: filters.identifier.trim() });
  }
  if (filters.riskLevel !== "ALL") chips.push({ key: "riskLevel", label: filters.riskLevel });
  if (filters.destination !== "ALL" && filters.destination.trim() !== "") {
    chips.push({ key: "destination", label: filters.destination.trim() });
  }
  if (filters.arrivalWindow !== "ALL") {
    chips.push({ key: "arrivalWindow", label: `ETA ${filters.arrivalWindow}` });
  }
  if (filters.positionAge !== "ALL") {
    chips.push({ key: "positionAge", label: `Seen ${filters.positionAge}` });
  }
  return chips;
}

function ageHours(timestamp: string, now: number): number | null {
  const reported = Date.parse(timestamp);
  if (!Number.isFinite(reported)) return null;
  return (now - reported) / 3_600_000;
}

/**
 * Whether one vessel qualifies under the current filters.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the
 * time-based windows are testable without freezing the clock, and so one
 * projection pass measures every vessel against the same instant.
 */
export function matchesFilters(vessel: Vessel, filters: MapFilters, now: number): boolean {
  if (filters.riskLevel !== "ALL" && vessel.riskLevel !== filters.riskLevel) return false;

  if (filters.vesselType !== "ALL") {
    // Unreported type is not a match. See the module note.
    if (vessel.identity.type !== filters.vesselType) return false;
  }

  if (filters.flag !== "ALL" && filters.flag.trim() !== "") {
    const flag = vessel.identity.flag;
    if (!flag || flag.toUpperCase() !== filters.flag.trim().toUpperCase()) return false;
  }

  const identifier = filters.identifier.trim().toUpperCase();
  if (identifier !== "") {
    const { imo, mmsi, callSign, name } = vessel.identity;
    const haystack = [imo, mmsi, callSign, name]
      .filter((value): value is string => typeof value === "string" && value !== "")
      .map((value) => value.toUpperCase());
    if (!haystack.some((value) => value.includes(identifier))) return false;
  }

  if (filters.destination !== "ALL" && filters.destination.trim() !== "") {
    const declared = vessel.position.destination;
    if (!declared) return false;
    if (!declared.toUpperCase().includes(filters.destination.trim().toUpperCase())) return false;
  }

  if (filters.arrivalWindow !== "ALL") {
    const eta = vessel.position.etaHours;
    /*
     * Null is "not declared", which is a different answer from "arriving
     * later than the window". A vessel with no declared ETA cannot be
     * shown to be arriving today, so it does not qualify.
     */
    if (eta === null || eta === undefined) return false;
    if (eta < 0 || eta > ARRIVAL_HOURS[filters.arrivalWindow]) return false;
  }

  if (filters.positionAge !== "ALL") {
    const age = ageHours(vessel.position.timestamp, now);
    // An unparseable timestamp is not evidence of recency.
    if (age === null) return false;
    if (filters.positionAge === "OLDER") {
      if (age <= POSITION_AGE_HOURS["24H"]) return false;
    } else if (age > POSITION_AGE_HOURS[filters.positionAge]) {
      return false;
    }
  }

  return true;
}

/** Apply the filters to a whole set, measuring every vessel against one instant. */
export function applyFilters(
  vessels: readonly Vessel[],
  filters: MapFilters,
  now: number = Date.now(),
): readonly Vessel[] {
  if (isUnfiltered(filters)) return vessels;
  return vessels.filter((vessel) => matchesFilters(vessel, filters, now));
}

/**
 * Filter dimensions the vessel model cannot support yet.
 *
 * Listed so the drawer can show them as pending rather than omitting
 * them silently — an officer who cannot find a draught filter should be
 * told Seaphore has no draught, not left to conclude they missed it.
 * Each reason names the missing field, not a vague "no data".
 */
export const PENDING_FILTER_DIMENSIONS: readonly {
  readonly group: string;
  readonly label: string;
  readonly reason: string;
}[] = [
  {
    group: "Capacity",
    label: "Gross tonnage, deadweight, length overall",
    reason:
      "No connected source publishes vessel dimensions. The canonical vessel record carries identity and position only.",
  },
  {
    group: "Other particulars",
    label: "Year of build, draught",
    reason:
      "Requires a vessel particulars register. IMO GISIS and Equasis both carry these and neither is credentialed.",
  },
  {
    group: "Current status",
    label: "Underway, anchored, moored, in port, drifting",
    reason:
      "Navigational status is not published by the connected source, and deriving it from speed alone would state as observed something nobody reported.",
  },
  {
    group: "Smart filters",
    label: "Bunkering, ship-to-ship transfer, waiting OPL, AIS gaps",
    reason:
      "Each is a pattern over position history. Nothing retains a track archive, so the condition cannot be evaluated at all.",
  },
  {
    group: "Voyage",
    label: "Origin port",
    reason:
      "A position report carries a declared destination but no origin. Origin lives on a voyage record, which no feed publishes.",
  },
] as const;
