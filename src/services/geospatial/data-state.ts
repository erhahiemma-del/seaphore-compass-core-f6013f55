/**
 * Honest data state for any map surface.
 *
 * ## Why this exists
 *
 * Mission Control shipped a pulsing "LIVE" badge above a hardcoded array
 * of vessels — fabricated positions presented to an officer as current
 * maritime intelligence. The badge was not lying about a bug; it was
 * lying by construction, because `live` was a prop with a default of
 * `true` and nothing connected it to whether data existed.
 *
 * The fix is to make the claim derivable rather than assertable. A
 * surface cannot say `LIVE` here; it can only pass what it knows about
 * its feed and be told what it is entitled to claim.
 *
 * ## The four states are not a severity scale
 *
 * They answer different questions and must not be collapsed:
 *
 *   LIVE              a real source is connected and current
 *   DELAYED           a real source is connected but its data has aged
 *   DATA_UNAVAILABLE  no usable data — no source, an error, or nothing returned
 *   DEMO              fixtures, shown only where explicitly configured
 *
 * `DEMO` in particular is not "a bit worse than LIVE". It means nothing
 * on screen is evidence of anything, and it is the only state that may
 * ever accompany fixture data.
 *
 * ## Staleness is not redefined here
 *
 * The `DELAYED` boundary is `freshnessBandForAge`, which every other
 * surface already uses. Introducing a second staleness rule would mean a
 * position could read "fresh" in the drawer and "delayed" on the map.
 */
import { freshnessBandForAge, type FreshnessThresholds } from "./freshness";

export type MapDataState = "LIVE" | "DELAYED" | "DATA_UNAVAILABLE" | "DEMO";

/** What a surface knows about its own feed. */
export interface MapDataStateInput {
  /** True before the first response has arrived. */
  readonly loading: boolean;
  /** Set when the last attempt failed. */
  readonly error: string | null;
  /** Source id the feed is reading, or null when none is enabled. */
  readonly sourceId: string | null;
  /** When the last successful response was applied. */
  readonly lastAppliedAt: string | null;
  /** How many records are actually on screen. */
  readonly recordCount: number;
  /**
   * Explicit demo configuration. Never inferred — a surface is in demo
   * mode because someone configured it, not because its feed was empty.
   */
  readonly demoMode?: boolean;
  readonly now?: number;
  readonly thresholds?: Partial<FreshnessThresholds>;
}

export interface MapDataStateResult {
  readonly state: MapDataState;
  /** Short badge text. */
  readonly label: string;
  /**
   * Why this state, in an officer's terms. Always populated — a state
   * without a reason cannot be acted on or challenged.
   */
  readonly reason: string;
  /** Age of the data in ms, or null when never applied. */
  readonly ageMs: number | null;
  /** True only for `LIVE`. Convenience for badge animation. */
  readonly isLive: boolean;
}

export const DATA_STATE_LABELS: Readonly<Record<MapDataState, string>> = {
  LIVE: "LIVE",
  DELAYED: "DELAYED",
  DATA_UNAVAILABLE: "NO DATA",
  DEMO: "DEMO DATA",
};

/**
 * Decide what a surface may claim about its data.
 *
 * Order matters. Demo is checked first because fixture data must never
 * reach the freshness path — a recently-generated fixture is *recent*,
 * and would otherwise resolve to `LIVE`, which is precisely the bug this
 * module exists to prevent.
 */
export function resolveMapDataState(input: MapDataStateInput): MapDataStateResult {
  const { loading, error, sourceId, lastAppliedAt, recordCount, demoMode = false } = input;
  const now = input.now ?? Date.now();

  if (demoMode) {
    return {
      state: "DEMO",
      label: DATA_STATE_LABELS.DEMO,
      reason:
        "Demonstration fixtures. Nothing shown here is an observation and none of it should be acted on.",
      ageMs: null,
      isLive: false,
    };
  }

  if (error) {
    return {
      state: "DATA_UNAVAILABLE",
      label: DATA_STATE_LABELS.DATA_UNAVAILABLE,
      // An error is not an empty sea. Saying so plainly stops an officer
      // reading a failed request as "no vessels present".
      reason: `The vessel feed could not be read: ${error}. This is a gap in collection, not an absence of vessels.`,
      ageMs: null,
      isLive: false,
    };
  }

  if (!sourceId) {
    return {
      state: "DATA_UNAVAILABLE",
      label: DATA_STATE_LABELS.DATA_UNAVAILABLE,
      reason:
        "No vessel source is connected. No conclusion should be drawn about vessel movements from this view.",
      ageMs: null,
      isLive: false,
    };
  }

  if (loading && lastAppliedAt === null) {
    return {
      state: "DATA_UNAVAILABLE",
      label: DATA_STATE_LABELS.DATA_UNAVAILABLE,
      reason: "Waiting for the first response from the vessel feed.",
      ageMs: null,
      isLive: false,
    };
  }

  if (lastAppliedAt === null) {
    return {
      state: "DATA_UNAVAILABLE",
      label: DATA_STATE_LABELS.DATA_UNAVAILABLE,
      reason: "The vessel feed is connected but has not yet returned a usable response.",
      ageMs: null,
      isLive: false,
    };
  }

  const parsed = Date.parse(lastAppliedAt);
  const ageMs = Number.isNaN(parsed) ? null : now - parsed;
  const band = freshnessBandForAge(ageMs, input.thresholds);

  // An unmeasurable age is never presented as current.
  if (band === "unknown") {
    return {
      state: "DELAYED",
      label: DATA_STATE_LABELS.DELAYED,
      reason: "The age of this data could not be determined, so it is not presented as current.",
      ageMs,
      isLive: false,
    };
  }

  if (band === "ageing" || band === "stale") {
    return {
      state: "DELAYED",
      label: DATA_STATE_LABELS.DELAYED,
      reason: `Connected to ${sourceId}, but the most recent update is ${describeAge(ageMs)} old.`,
      ageMs,
      isLive: false,
    };
  }

  // Connected, current — and yet nothing came back. That is a real
  // answer about the area, not a failure, but it is not "live vessel
  // intelligence" either.
  if (recordCount === 0) {
    return {
      state: "DATA_UNAVAILABLE",
      label: DATA_STATE_LABELS.DATA_UNAVAILABLE,
      reason: `Connected to ${sourceId}, which returned no vessels for this area.`,
      ageMs,
      isLive: false,
    };
  }

  return {
    state: "LIVE",
    label: DATA_STATE_LABELS.LIVE,
    reason: `Connected to ${sourceId}, updated ${describeAge(ageMs)} ago.`,
    ageMs,
    isLive: true,
  };
}

function describeAge(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "an unknown time";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
