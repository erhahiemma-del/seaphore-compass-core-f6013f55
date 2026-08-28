/**
 * The thing that makes an alert exist, bound to a React surface.
 *
 * The alert domain was complete and tested and produced nothing, because
 * nothing ran it: approach was assessed only when an officer asked a
 * question, so the system could answer "which vessels are approaching?"
 * and could never tell anyone unprompted.
 *
 * This drives `runReconciliationCycle` on an interval and republishes
 * what the repository holds. It contains no alert logic of its own — no
 * eligibility, no severity, no episode identity, no arrival arithmetic.
 * Those live in the domain, the coordinator decides what to persist, and
 * this only decides *when* to run and what to hand a component.
 *
 * ## One store, and it is the repository
 *
 * An earlier version of this hook owned a bespoke in-memory store. That
 * made two places holding alert state, which is the failure the whole
 * persistence layer exists to prevent, so the repository is now the only
 * one. Today it is the in-memory implementation: the tables are authored
 * but not applied to the project database, and defaulting to the durable
 * adapter would tell an officer their acknowledgement had been saved when
 * it had not. Swapping implementations is a one-line change here, because
 * both satisfy the same contract.
 *
 * ## The fleet is not fetched here
 *
 * Vessels arrive as an argument, from the same canonical set the map is
 * already showing. A hook that fetched its own would add a fourth polling
 * cycle against the provider and could raise alerts about a picture
 * nobody was looking at.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  InMemoryAlertRepository,
  countBySeverity,
  presentAlerts,
  runReconciliationCycle,
  type AlertPresentation,
  type AlertRepository,
  type StoredAlert,
} from "@/services/alerts";
import type { LonLat, Vessel } from "@/services/geospatial";

/**
 * How often the fleet is reassessed.
 *
 * Slower than the position feed on purpose. An approach horizon is
 * measured in hours, so assessing every few seconds would cost work
 * without changing an answer, and reconciliation would return
 * `UNCHANGED` every time.
 */
const ASSESS_INTERVAL_MS = 30_000;

export interface ArrivalAlertsState {
  /** Active alerts, ordered for display. */
  readonly alerts: readonly AlertPresentation[];
  /** Every alert held, resolved and closed ones included. */
  readonly history: readonly StoredAlert[];
  readonly counts: Readonly<Record<"URGENT" | "ATTENTION" | "WATCH", number>>;
  readonly activeCount: number;
  /**
   * Whether the last cycle could assess anything at all.
   *
   * False means the fleet or the boundary was missing, so an empty alert
   * list is an absence of assessment rather than an all-clear.
   */
  readonly assessable: boolean;
  /**
   * Vessels the latest pass could not assess.
   *
   * Never counted as alerts. Five vessels nobody could assess is a
   * limitation of the picture, not five quiet ships.
   */
  readonly unassessableCount: number;
  /**
   * Whether alerts survive a reload.
   *
   * Reported rather than assumed, so a surface can say what is true
   * instead of implying a durable record that does not exist yet.
   */
  readonly durable: boolean;
  readonly forVessel: (imo: string) => StoredAlert | undefined;
  /** Re-read the repository after an officer action. */
  readonly refresh: () => void;
  readonly repository: AlertRepository;
}

export interface UseArrivalAlertsOptions {
  readonly vessels: readonly Vessel[];
  readonly boundaryRing: readonly LonLat[] | null;
  readonly sourceId: string;
  readonly intervalMs?: number;
  /** Supplied by a test, or by a future durable adapter. */
  readonly repository?: AlertRepository;
  readonly now?: () => number;
}

export function useArrivalAlerts(options: UseArrivalAlertsOptions): ArrivalAlertsState {
  const {
    vessels,
    boundaryRing,
    sourceId,
    intervalMs = ASSESS_INTERVAL_MS,
    repository: injected,
    now,
  } = options;

  // One repository per mounted surface. Created once; rebuilding it on a
  // render would discard the officer's acknowledgements.
  const fallback = useMemo(() => new InMemoryAlertRepository(), []);
  const repository = injected ?? fallback;

  const [alerts, setAlerts] = useState<readonly StoredAlert[]>([]);
  const [unassessableCount, setUnassessableCount] = useState(0);
  const [assessable, setAssessable] = useState(false);

  /*
   * Cycle inputs are read through a ref.
   *
   * Depending on `vessels` directly would restart the interval on every
   * position poll, so assessment would run at the feed's cadence rather
   * than its own — and on a busy feed might never complete a period.
   */
  const inputs = useRef({ vessels, boundaryRing, sourceId });
  inputs.current = { vessels, boundaryRing, sourceId };

  const republish = useCallback(async () => {
    setAlerts(await repository.listActive());
  }, [repository]);

  const cycle = useCallback(async () => {
    const { vessels: fleet, boundaryRing: ring, sourceId: source } = inputs.current;
    const outcome = await runReconciliationCycle({
      vessels: fleet,
      boundaryRing: ring,
      sourceId: source,
      repository,
      ...(now ? { now } : {}),
    });

    setAssessable(outcome.ran);
    if (outcome.ran) setUnassessableCount(outcome.report.unassessable);
    await republish();
  }, [repository, republish, now]);

  const ready = vessels.length > 0 && (boundaryRing?.length ?? 0) >= 3;

  /*
   * `ready` is in the dependencies deliberately.
   *
   * The first cycle runs at mount, when the fleet is still loading, and
   * assesses nothing. On the interval alone the officer then saw an empty
   * attention surface for a full period after the map had filled —
   * measured at thirty seconds of a map showing thirty-two vessels with
   * no alerts, which reads as an all-clear rather than as a pending
   * assessment. Waking on the transition closes that window without
   * adding a second clock.
   */
  useEffect(() => {
    void cycle();
    const timer = setInterval(() => void cycle(), intervalMs);
    return () => clearInterval(timer);
  }, [cycle, intervalMs, ready]);

  const active = alerts;

  return {
    alerts: useMemo(() => presentAlerts(active), [active]),
    history: active,
    counts: useMemo(() => countBySeverity(active), [active]),
    activeCount: active.length,
    assessable,
    unassessableCount,
    // In memory for this session. Said out loud rather than implied.
    durable: false,
    forVessel: useCallback(
      (imo: string) => active.find((alert) => alert.vessel.imo === imo),
      [active],
    ),
    refresh: useCallback(() => void republish(), [republish]),
    repository,
  };
}
