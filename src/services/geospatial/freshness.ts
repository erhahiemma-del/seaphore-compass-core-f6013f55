/**
 * GIP — Observation freshness.
 *
 * One vocabulary for "how old is this?", used by both vessel markers and
 * provider health so the map and the Sources panel can never disagree
 * about what "stale" means.
 *
 * Freshness is mechanical: it describes the *age of a report*, never the
 * behaviour of a vessel. An ageing marker means "this position may have
 * moved", not "this vessel is evading". That distinction is the whole
 * reason freshness is separate from risk.
 *
 * Thresholds are configurable because the right cadence differs by
 * provider: a satellite AIS feed refreshing hourly is healthy at an age
 * that would be alarming for a terrestrial feed.
 */

/** Freshness bands, ordered from newest to oldest. */
export type FreshnessBand = "fresh" | "recent" | "ageing" | "stale" | "unknown";

/** Upper age bound of each band, in milliseconds. */
export interface FreshnessThresholds {
  /** Below this age → `fresh`. Default 5 minutes. */
  readonly freshMs: number;
  /** Below this age → `recent`. Default 30 minutes. */
  readonly recentMs: number;
  /** Below this age → `ageing`; at or above → `stale`. Default 60 minutes. */
  readonly ageingMs: number;
}

/** Defaults, per the G5.5.3 specification. */
export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  freshMs: 5 * 60_000,
  recentMs: 30 * 60_000,
  ageingMs: 60 * 60_000,
};

/** Display colour per band. Never the sole signal — always paired with a label. */
export const FRESHNESS_COLORS: Readonly<Record<FreshnessBand, string>> = {
  fresh: "#1A6B3A",
  recent: "#B8860B",
  ageing: "#D4890A",
  stale: "#C0392B",
  unknown: "#4A5568",
};

/** Officer-facing label per band. */
export const FRESHNESS_LABELS: Readonly<Record<FreshnessBand, string>> = {
  fresh: "Fresh",
  recent: "Recent",
  ageing: "Ageing",
  stale: "Stale",
  unknown: "Unknown",
};

/**
 * Classify an age in milliseconds.
 *
 * A null or non-finite age is `unknown`, never `fresh` — an unmeasurable
 * age must not be presented as a good one.
 */
export function freshnessBandForAge(
  ageMs: number | null | undefined,
  thresholds: Partial<FreshnessThresholds> = {},
): FreshnessBand {
  if (ageMs === null || ageMs === undefined || !Number.isFinite(ageMs)) return "unknown";
  const limits = { ...DEFAULT_FRESHNESS_THRESHOLDS, ...thresholds };
  // A future timestamp is a clock problem, not freshness. Treat as unknown.
  if (ageMs < 0) return "unknown";
  if (ageMs < limits.freshMs) return "fresh";
  if (ageMs < limits.recentMs) return "recent";
  if (ageMs < limits.ageingMs) return "ageing";
  return "stale";
}

/** Classify an ISO timestamp against a clock. */
export function freshnessBandForTimestamp(
  timestamp: string | null | undefined,
  now: number = Date.now(),
  thresholds: Partial<FreshnessThresholds> = {},
): FreshnessBand {
  if (!timestamp) return "unknown";
  const observedAt = Date.parse(timestamp);
  if (Number.isNaN(observedAt)) return "unknown";
  return freshnessBandForAge(now - observedAt, thresholds);
}

/** Colour for an age, ready for a marker or a badge. */
export function freshnessColor(band: FreshnessBand): string {
  return FRESHNESS_COLORS[band];
}

/** Human label for an age. */
export function freshnessLabel(band: FreshnessBand): string {
  return FRESHNESS_LABELS[band];
}

/**
 * Compact age string: `42s`, `7m`, `3h`, `2d`, or an explicit dash.
 *
 * Returns "—" rather than "0s" for an unknown age, so the reader can tell
 * "not measured" from "measured as brand new".
 */
export function formatAge(ageMs: number | null | undefined): string {
  if (ageMs === null || ageMs === undefined || !Number.isFinite(ageMs) || ageMs < 0) return "—";
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Distribution of a set of ages across the bands, for the dashboard. */
export function freshnessDistribution(
  ages: readonly (number | null)[],
  thresholds: Partial<FreshnessThresholds> = {},
): Readonly<Record<FreshnessBand, number>> {
  const counts: Record<FreshnessBand, number> = {
    fresh: 0,
    recent: 0,
    ageing: 0,
    stale: 0,
    unknown: 0,
  };
  for (const age of ages) counts[freshnessBandForAge(age, thresholds)] += 1;
  return counts;
}
