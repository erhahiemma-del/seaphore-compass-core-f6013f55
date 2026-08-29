/**
 * Many small circles, one fleet.
 *
 * The provider answers a 50km circle at a time, so Nigerian coverage is
 * a set of them. This runs that set and merges the answers into the one
 * canonical fleet the map already draws — it adds no vessel model, no
 * second renderer and no parallel state.
 *
 * ## A vessel is a hull, not a row
 *
 * Adjacent zones overlap, deliberately: gaps between circles are vessels
 * nobody sees. The cost of overlap is the same hull returned twice, and
 * two markers for one ship is a worse failure than a gap, because an
 * officer counting vessels would be counting wrong. Identity therefore
 * decides membership, not arrival order.
 *
 * ## One zone's failure is not the fleet's
 *
 * A rate-limited Calabar must not discard a healthy Lagos. Every zone
 * reports its own outcome and the successful ones are merged regardless,
 * with the failures named — because "we could not read Calabar" and
 * "Calabar is empty" are different facts and only one of them is calm.
 *
 * ## Spending is bounded before it happens
 *
 * Requests cost credits whether or not anyone is looking. The budget is
 * applied by dropping whole low-priority zones rather than by thinning
 * every zone, so what remains is still a picture that can be dated and
 * described.
 */
import type { Vessel } from "../vessel";

import {
  activeZones,
  zonesWithinBudget,
  type CoverageZone,
  NIGERIA_COVERAGE_ZONES,
} from "./datalastic-coverage-zones";

/** Why a zone contributed nothing. Never collapsed into "empty". */
export type ZoneOutcome =
  | "OK"
  /** The provider answered, and the answer was no vessels. */
  | "NO_RECORD"
  | "PROVIDER_FAILURE"
  | "RATE_LIMITED"
  | "CREDIT_LIMIT"
  | "INVALID_REQUEST"
  | "NOT_CONFIGURED"
  /** Dropped before it ran, because the budget did not reach it. */
  | "SKIPPED_BUDGET";

export interface ZoneReport {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly outcome: ZoneOutcome;
  /** Vessels the provider returned for this zone, before deduplication. */
  readonly raw: number;
  /** Of those, the ones this zone contributed that no earlier zone had. */
  readonly unique: number;
  readonly latencyMs: number | null;
  /** Provider-reported cost, when the response carried it. */
  readonly requestCost: number | null;
  readonly retrievedAt: string | null;
  /** The provider's own words, when it explained itself. */
  readonly message: string | null;
}

export interface CoverageResult {
  /** The deduplicated fleet. One entry per hull. */
  readonly vessels: readonly Vessel[];
  readonly zones: readonly ZoneReport[];
  readonly totalRaw: number;
  readonly totalUnique: number;
  readonly duplicatesRemoved: number;
  readonly requestsMade: number;
  readonly totalRequestCost: number | null;
  /** True when at least one zone answered. Distinct from "found nothing". */
  readonly anyZoneSucceeded: boolean;
  readonly startedAt: string;
  readonly durationMs: number;
}

/** What one zone's fetch must return for this engine to use it. */
export interface ZoneFetchResult {
  readonly outcome: ZoneOutcome;
  readonly vessels: readonly Vessel[];
  readonly latencyMs: number | null;
  readonly requestCost: number | null;
  readonly retrievedAt: string | null;
  readonly message: string | null;
}

export interface RunCoverageOptions {
  readonly zones?: readonly CoverageZone[];
  /** Maximum requests this pass may make. Zones beyond it are skipped. */
  readonly requestBudget?: number;
  readonly fetchZone: (zone: CoverageZone) => Promise<ZoneFetchResult>;
  readonly now?: () => number;
}

/**
 * The identity a hull is deduplicated on.
 *
 * IMO first: it is issued once and stays with the hull through renames,
 * reflaggings and sales, which is exactly the set of changes that would
 * otherwise split one ship into several. MMSI second — reassigned on
 * reflagging, so it can merge two hulls that were never the same, but it
 * is the only identifier some vessels carry.
 *
 * Name is deliberately not a fallback. "PRINCE JOB 1" is not unique in
 * the simulated fleet and is certainly not unique in the Gulf of Guinea,
 * and merging on it would silently delete real vessels from the count.
 * A hull with neither IMO nor MMSI is kept separately rather than merged
 * into a guess.
 */
export function fleetIdentity(vessel: Vessel): string {
  const imo = vessel.identity.imo?.trim();
  if (imo) return `imo:${imo}`;
  const mmsi = vessel.identity.mmsi?.trim();
  if (mmsi) return `mmsi:${mmsi}`;
  /*
   * Positional identity, and only as a last resort. Two distinct hulls
   * would have to share a coordinate to a ten-thousandth of a degree —
   * about eleven metres — and a timestamp to collide, which is rarer
   * than the alternative of merging two ships because they share a name.
   */
  const { lat, lon, timestamp } = vessel.position;
  return `pos:${lat.toFixed(4)},${lon.toFixed(4)}@${timestamp}`;
}

/**
 * Run one coverage pass.
 *
 * Zones are fetched in priority order and merged as they arrive, so the
 * hull kept for a duplicate is the one from the more important zone —
 * which is also the one refreshed most often, and therefore the fresher
 * observation.
 */
export async function runCoveragePass(options: RunCoverageOptions): Promise<CoverageResult> {
  const { fetchZone, now = () => Date.now() } = options;
  const started = now();
  const ordered = activeZones(options.zones ?? NIGERIA_COVERAGE_ZONES);
  const affordable =
    options.requestBudget == null ? ordered : zonesWithinBudget(ordered, options.requestBudget);
  const skipped = ordered.slice(affordable.length);

  const byIdentity = new Map<string, Vessel>();
  const reports: ZoneReport[] = [];
  let totalRaw = 0;
  let requestsMade = 0;
  let costSeen = false;
  let totalCost = 0;

  for (const zone of affordable) {
    const result = await fetchZone(zone);
    requestsMade += 1;
    totalRaw += result.vessels.length;
    if (result.requestCost != null) {
      costSeen = true;
      totalCost += result.requestCost;
    }

    /*
     * Counted as this zone contributes, not afterwards. "Unique" here
     * means what this zone added that no higher-priority zone already
     * had — which is the number that tells an officer whether a zone is
     * earning its cost, and is not recoverable from the final total.
     */
    let unique = 0;
    for (const vessel of result.vessels) {
      const key = fleetIdentity(vessel);
      if (!byIdentity.has(key)) {
        byIdentity.set(key, vessel);
        unique += 1;
      }
    }

    reports.push({
      zoneId: zone.id,
      zoneName: zone.name,
      // A zone that answered with nothing said something; it is not a
      // failure and must not be filed as one.
      outcome:
        result.outcome === "OK" && result.vessels.length === 0 ? "NO_RECORD" : result.outcome,
      raw: result.vessels.length,
      unique,
      latencyMs: result.latencyMs,
      requestCost: result.requestCost,
      retrievedAt: result.retrievedAt,
      message: result.message,
    });
  }

  for (const zone of skipped) {
    reports.push({
      zoneId: zone.id,
      zoneName: zone.name,
      outcome: "SKIPPED_BUDGET",
      raw: 0,
      unique: 0,
      latencyMs: null,
      requestCost: null,
      retrievedAt: null,
      message: "Not queried: the coverage budget did not reach this zone.",
    });
  }

  const vessels = [...byIdentity.values()];
  return {
    vessels,
    zones: reports,
    totalRaw,
    totalUnique: vessels.length,
    duplicatesRemoved: totalRaw - vessels.length,
    requestsMade,
    totalRequestCost: costSeen ? totalCost : null,
    /*
     * "Something answered" is tracked separately from "we found
     * vessels". A pass where every zone failed returns an empty fleet
     * that must never be presented as an empty sea.
     */
    anyZoneSucceeded: reports.some(
      (report) => report.outcome === "OK" || report.outcome === "NO_RECORD",
    ),
    startedAt: new Date(started).toISOString(),
    durationMs: now() - started,
  };
}
