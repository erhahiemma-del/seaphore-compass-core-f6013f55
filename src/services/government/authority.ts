/**
 * Source authority.
 *
 * Not all sources are equally authoritative, and authority is **per
 * claim**, not per source. NPA is authoritative about what is happening
 * inside a Nigerian port and knows nothing about a vessel's position at
 * sea; an AIS provider is the reverse. A single "trust score" per provider
 * would get both wrong.
 *
 * ## This is not confidence
 *
 * Authority answers "how well-placed is this source to know?". Confidence
 * answers "how sure are we of this conclusion?", and belongs to
 * `reasoning`. A highly authoritative source can report something we hold
 * with low confidence — an NPA berth assignment six hours stale is
 * authoritative and out of date at once.
 */

/** Kinds of claim a source can make. */
export type ClaimKind =
  | "port-schedule"
  | "port-operational-state"
  | "vessel-position"
  | "vessel-identity"
  | "customs-declaration"
  | "oil-spill-incident"
  | "upstream-petroleum"
  | "trade-statistics"
  | "physical-observation";

/**
 * Authority by source and claim, 0–1.
 *
 * Read as: how well-placed is this source to know this kind of fact?
 * A government regulator is authoritative for its own register; a
 * commercial aggregator is authoritative for what it observes.
 */
const AUTHORITY: Readonly<Record<string, Partial<Record<ClaimKind, number>>>> = {
  // NPA runs the ports. Nothing outranks it on what happens inside one.
  "npa-shippos": {
    "port-schedule": 0.95,
    "port-operational-state": 0.98,
    "vessel-identity": 0.7,
    // NPA publishes no positions. Absent, not low.
  },

  // NOSDRA is the statutory oil-spill register.
  "nosdra-oil-spill-monitor": {
    "oil-spill-incident": 0.95,
  },

  // AIS providers observe; they do not adjudicate.
  seavantage: {
    "vessel-position": 0.9,
    "vessel-identity": 0.8,
    "port-schedule": 0.5,
  },
  datalastic: {
    "vessel-position": 0.85,
    "vessel-identity": 0.8,
    "port-schedule": 0.45,
  },
  spire: {
    "vessel-position": 0.9,
    "vessel-identity": 0.8,
  },
  "global-fishing-watch": {
    "vessel-position": 0.7,
    "vessel-identity": 0.6,
  },

  // Satellite is independent physical observation — it cannot be spoofed
  // by a transponder, which is exactly why it is valuable as a check.
  "sentinel-1": {
    "physical-observation": 0.9,
    "vessel-position": 0.75,
    "vessel-identity": 0.0,
  },
};

/** Authority of a source for a kind of claim. Unknown pairings score low. */
export function sourceAuthority(sourceId: string, claim: ClaimKind): number {
  return AUTHORITY[sourceId]?.[claim] ?? 0.3;
}

/** Whether a source is the authoritative one for a claim. */
export function isAuthoritativeFor(sourceId: string, claim: ClaimKind): boolean {
  return sourceAuthority(sourceId, claim) >= 0.9;
}

/**
 * Rank sources for a claim, most authoritative first.
 *
 * Ranking, not selection. The caller still sees every source — the point
 * is ordering the evidence, not discarding it.
 */
export function rankByAuthority(
  sourceIds: readonly string[],
  claim: ClaimKind,
): readonly { sourceId: string; authority: number }[] {
  return sourceIds
    .map((sourceId) => ({ sourceId, authority: sourceAuthority(sourceId, claim) }))
    .sort((a, b) => b.authority - a.authority);
}
