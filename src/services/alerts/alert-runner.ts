/**
 * The production reconciliation runner.
 *
 * One cycle: take the canonical fleet as it already stands, assess it
 * against the maritime boundary, reconcile, persist. That is the whole
 * service.
 *
 * ## It consumes a snapshot; it does not fetch
 *
 * The fleet arrives as an argument rather than being pulled from a
 * provider here, and that is the single most important thing about this
 * module. The map already polls the source, and search, the Copilot and
 * voice all read the same canonical vessel state. A runner that fetched
 * for itself would make a fourth independent request cycle against a
 * provider that may be rate-limited or billed per call, and — worse —
 * could assess a fleet nobody was looking at, so an alert could describe
 * a picture that never appeared on screen.
 *
 * It follows that the runner is provider-agnostic without a single
 * branch: simulated, Global Fishing Watch and any future commercial AIS
 * feed all reach it as the same canonical vessels.
 *
 * ## It owns no clock
 *
 * `runOnce` is driven by the host, the way `ReplayPlayer.tick` is. A
 * timer inside a service is a timer that cannot be tested without
 * waiting, and a cadence chosen here would be a second opinion about how
 * often the fleet changes.
 *
 * ## No side effects beyond storage
 *
 * No map call, no navigation, no audio, no React state, no rendering. It
 * reads vessels and writes alerts.
 */
import { assessFleetApproach } from "@/services/geospatial/fleet-approach";
import type { LonLat, Vessel } from "@/services/geospatial";

import { persistFleetReconciliation, type PersistenceReport } from "./alert-persistence";
import type { AlertRepository } from "./alert-repository";

/**
 * The widest supported approach condition.
 *
 * Alerts are raised against the full horizon so a vessel three days out
 * is seen once, rather than appearing abruptly inside a day. A narrower
 * question an officer asks is a query and does not change this.
 */
export const ALERT_HORIZON_HOURS = 72;

/** Why a cycle did nothing, when it did nothing. */
export type CycleSkipReason =
  /** No vessels in the canonical set. Nothing was assessed. */
  | "NO_FLEET"
  /** The maritime boundary outline has not loaded. */
  | "NO_BOUNDARY";

export type CycleResult =
  | { readonly ran: true; readonly report: PersistenceReport; readonly assessedAt: string }
  /**
   * Skipped, and named.
   *
   * Distinct from a cycle that ran and raised nothing, because "nothing
   * is approaching" and "nothing was assessed" are different facts and
   * only one of them is reassuring. A caller must be able to tell them
   * apart to avoid reporting an all-clear nobody established.
   */
  | { readonly ran: false; readonly reason: CycleSkipReason };

export interface RunCycleInput {
  /** The canonical fleet, already loaded by whatever is showing it. */
  readonly vessels: readonly Vessel[];
  readonly boundaryRing: readonly LonLat[] | null;
  /** Which provider supplied the positions. Recorded on every alert. */
  readonly sourceId: string;
  readonly repository: AlertRepository;
  /** Injectable so a cycle is deterministic under test. */
  readonly now?: () => number;
}

/**
 * Run one reconciliation cycle.
 *
 * Safe to call repeatedly on an unchanged fleet: reconciliation returns
 * `UNCHANGED` for everything already recorded, so a repeat performs no
 * second raise and writes no second event. That is what makes both the
 * polling cadence and a retry after a lost response harmless.
 */
export async function runReconciliationCycle(input: RunCycleInput): Promise<CycleResult> {
  const { vessels, boundaryRing, sourceId, repository, now } = input;

  if (vessels.length === 0) return { ran: false, reason: "NO_FLEET" };
  // Three points is the minimum that encloses anything; below that there
  // is no boundary to be inside or outside of.
  if (!boundaryRing || boundaryRing.length < 3) return { ran: false, reason: "NO_BOUNDARY" };

  const nowMs = now?.() ?? Date.now();
  const assessedAt = new Date(nowMs).toISOString();

  const result = assessFleetApproach(vessels, boundaryRing, {
    thresholdHours: ALERT_HORIZON_HOURS,
    now: nowMs,
  });

  const report = await persistFleetReconciliation(result, repository, { assessedAt, sourceId });
  return { ran: true, report, assessedAt };
}
