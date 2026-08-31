/**
 * What the vessel feed can honestly claim about a geographic scope.
 *
 * ## Why this is not `resolveMapDataState`
 *
 * That module answers "may this surface say LIVE?" and deliberately folds
 * every non-claim into `DATA_UNAVAILABLE`. That is the right answer for a
 * badge and the wrong answer for coverage, because it collapses the one
 * distinction an officer most needs:
 *
 *   EMPTY        the provider was asked about this area and reported no
 *                vessels. A real, dateable answer about the sea.
 *   UNAVAILABLE  nobody asked, or nobody could. Says nothing about the sea.
 *
 * Both render as an empty map. Only one of them is evidence. The observed
 * failure: the global scope drew "0 vessels" over an empty world, and the
 * truth was that the connected provider is only ever asked about a set of
 * Nigerian circles — the Atlantic was never queried at all. An officer
 * reading that display would conclude the world's shipping had stopped.
 *
 * ## Geographic support is declared by the provider, never inferred here
 *
 * A provider states which scopes it answers for. This module reads that
 * statement; it holds no list of provider ids and no assumption about what
 * any provider can do. Connecting a genuinely global AIS source later means
 * that source declares `global` and this file does not change.
 *
 * An undeclared extent is not treated as coverage. `EMPTY` asserts that
 * the area *was* queried, so it is only reachable when the provider has
 * said it covers the scope; otherwise the honest answer is UNAVAILABLE with
 * the undeclared extent named. Silence from a provider is never upgraded
 * into a claim about the ocean.
 */
import type { MapScopeId } from "./constants";
import type { VesselSource } from "./vessel-source";

/**
 * The five states. Not a severity scale — LOADING and EMPTY are ordinary
 * outcomes, and EMPTY is the only one that is a statement about the sea.
 */
export type VesselCoverageState = "LOADING" | "AVAILABLE" | "EMPTY" | "UNAVAILABLE" | "ERROR";

/**
 * Which instant the displayed vessels belong to.
 *
 * Separate from the state because "we have vessels" and "the vessels are
 * from twenty minutes ago" are independent facts, and a historical picture
 * under a live-looking count is the failure this distinction prevents.
 */
export type VesselCoverageMode = "LIVE" | "HISTORICAL" | "NONE";

/** How a provider answers for a scope. */
export type ScopeSupport = "SUPPORTED" | "UNSUPPORTED" | "UNDECLARED";

/**
 * A provider's own statement of where it looks.
 *
 * Optional and structural, exactly like `DescribableVesselSource`: adding
 * it breaks no existing source and requires no change to `VesselSource`.
 */
export interface GeographicCoverage {
  readonly sourceId: string;
  /** Scopes this provider is actually queried across. */
  readonly scopes: readonly MapScopeId[];
  /** Officer-readable extent, e.g. "Nigerian coastal and offshore zones". */
  readonly extentLabel: string;
  /** Why the extent is what it is — plan, tiling, or upstream limit. */
  readonly note: string;
}

export interface GeographicallyScopedSource extends VesselSource {
  geographicCoverage(): GeographicCoverage;
}

/** True when a source states where it looks. */
export function declaresGeographicCoverage(
  source: VesselSource,
): source is GeographicallyScopedSource {
  return typeof (source as Partial<GeographicallyScopedSource>).geographicCoverage === "function";
}

/**
 * Ask the provider whether it covers a scope.
 *
 * `UNDECLARED` is a distinct answer from `UNSUPPORTED`: the first means we
 * do not know, the second means the provider told us no. Presenting the
 * first as the second would put words in a provider's mouth.
 */
export function scopeSupport(source: VesselSource | null, scope: MapScopeId): ScopeSupport {
  if (!source || !declaresGeographicCoverage(source)) return "UNDECLARED";
  return source.geographicCoverage().scopes.includes(scope) ? "SUPPORTED" : "UNSUPPORTED";
}

export interface VesselCoverageInput {
  /** True before the first response has arrived. */
  readonly loading: boolean;
  /** Set when the last attempt failed, from the provider's own report. */
  readonly error: string | null;
  /** Source id the feed is reading, or null when none is enabled. */
  readonly sourceId: string | null;
  /** When the last successful response was applied. */
  readonly lastAppliedAt: string | null;
  /** Vessels actually held for the current scope. */
  readonly recordCount: number;
  /** The scope the officer is looking at. */
  readonly scope: MapScopeId;
  /** The provider's answer for that scope. */
  readonly support: ScopeSupport;
  /** Extent the provider declared, when it declared one. */
  readonly extentLabel?: string | null;
  /** Provider's reason for its extent, when it gave one. */
  readonly extentNote?: string | null;
  /** True while a recording, not the live feed, owns the displayed set. */
  readonly historical?: boolean;
}

export interface VesselCoverageResult {
  readonly state: VesselCoverageState;
  readonly mode: VesselCoverageMode;
  /** Short badge text. */
  readonly label: string;
  /** Why this state, in an officer's terms. Always populated. */
  readonly reason: string;
  /**
   * True only when the count on screen is a complete answer for the scope.
   * A surface must not render a vessel total when this is false.
   */
  readonly countIsMeaningful: boolean;
  /** True when the provider stated it does not answer for this scope. */
  readonly scopeUnsupported: boolean;
}

export const COVERAGE_STATE_LABELS: Readonly<Record<VesselCoverageState, string>> = {
  LOADING: "LOADING",
  AVAILABLE: "AVAILABLE",
  EMPTY: "NO VESSELS REPORTED",
  UNAVAILABLE: "UNAVAILABLE",
  ERROR: "FEED ERROR",
};

/**
 * The sentence the specification asks for, kept in one place so the map,
 * the KPI ribbon and the Copilot cannot word it differently.
 */
export const GLOBAL_COVERAGE_UNAVAILABLE = "Global vessel data unavailable from current source";

/**
 * Decide what the feed may claim for this scope.
 *
 * Order is the whole design. Errors outrank everything because a failed
 * read tells us nothing about anything below it; scope support is checked
 * before emptiness because an unqueried area cannot be empty.
 */
export function resolveVesselCoverage(input: VesselCoverageInput): VesselCoverageResult {
  const {
    loading,
    error,
    sourceId,
    lastAppliedAt,
    recordCount,
    scope,
    support,
    extentLabel = null,
    extentNote = null,
    historical = false,
  } = input;

  const unsupported = support === "UNSUPPORTED";

  if (error) {
    return {
      state: "ERROR",
      mode: "NONE",
      label: COVERAGE_STATE_LABELS.ERROR,
      reason: `${error} This is a gap in collection, not an absence of vessels.`,
      countIsMeaningful: false,
      scopeUnsupported: unsupported,
    };
  }

  if (!sourceId) {
    return {
      state: "UNAVAILABLE",
      mode: "NONE",
      label: COVERAGE_STATE_LABELS.UNAVAILABLE,
      reason:
        "No vessel source is connected, so this view is not evidence of vessel presence or absence.",
      countIsMeaningful: false,
      scopeUnsupported: unsupported,
    };
  }

  if (loading && lastAppliedAt === null) {
    return {
      state: "LOADING",
      mode: "NONE",
      label: COVERAGE_STATE_LABELS.LOADING,
      reason: `Waiting for the first response from ${sourceId}.`,
      countIsMeaningful: false,
      scopeUnsupported: unsupported,
    };
  }

  /*
   * Vessels are on screen, so something was genuinely returned. Reported
   * as available even where the scope is wider than the provider's extent
   * — but the count is not a total for that scope, and saying so is what
   * stops "1,374 vessels" reading as the world's fleet.
   */
  if (recordCount > 0) {
    const partial = unsupported || support === "UNDECLARED";
    return {
      state: "AVAILABLE",
      mode: historical ? "HISTORICAL" : "LIVE",
      label: historical ? "HISTORICAL" : COVERAGE_STATE_LABELS.AVAILABLE,
      reason: historical
        ? `Showing recorded observations, not the current picture. ${recordCount} vessel${recordCount === 1 ? "" : "s"} in the replayed frame.`
        : partial
          ? `${sourceId} returned ${recordCount} vessel${recordCount === 1 ? "" : "s"} from ${extentLabel ?? "its own extent"}. This is not a total for the ${scope} view.`
          : `${sourceId} returned ${recordCount} vessel${recordCount === 1 ? "" : "s"} for this view.`,
      countIsMeaningful: !partial && !historical,
      scopeUnsupported: unsupported,
    };
  }

  /*
   * Nothing on screen, and the provider told us it does not answer here.
   * The distinction this whole module exists for.
   */
  if (unsupported) {
    return {
      state: "UNAVAILABLE",
      mode: "NONE",
      label: COVERAGE_STATE_LABELS.UNAVAILABLE,
      reason:
        scope === "global"
          ? `${GLOBAL_COVERAGE_UNAVAILABLE}. ${sourceId} covers ${extentLabel ?? "a narrower extent"} only${extentNote ? ` — ${extentNote}` : ""}. This view is not a statement that no vessels are at sea.`
          : `${sourceId} does not cover the ${scope} view; it covers ${extentLabel ?? "a narrower extent"} only. Nothing here should be read as an absence of vessels.`,
      countIsMeaningful: false,
      scopeUnsupported: true,
    };
  }

  if (support === "UNDECLARED") {
    return {
      state: "UNAVAILABLE",
      mode: "NONE",
      label: COVERAGE_STATE_LABELS.UNAVAILABLE,
      reason: `${sourceId} has not declared which areas it covers, so an empty result cannot be read as an empty sea for the ${scope} view.`,
      countIsMeaningful: false,
      scopeUnsupported: false,
    };
  }

  /*
   * Queried, covered, and the answer was none. The only branch entitled
   * to call an empty map an observation.
   */
  return {
    state: "EMPTY",
    mode: historical ? "HISTORICAL" : "LIVE",
    label: COVERAGE_STATE_LABELS.EMPTY,
    reason: `${sourceId} covers this view and reported no vessels${lastAppliedAt ? ` as of ${lastAppliedAt}` : ""}. This is an observation, not a collection gap.`,
    countIsMeaningful: true,
    scopeUnsupported: false,
  };
}
