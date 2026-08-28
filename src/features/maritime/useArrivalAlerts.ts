/**
 * The thing that makes an alert exist.
 *
 * The alert domain was complete and tested and produced nothing, because
 * nothing ran it. `assessFleetApproach` was reachable only from
 * `copilot-actions` — that is, only when an officer *asked* — so the
 * system could answer "which vessels are approaching?" and could never
 * tell anyone unprompted. An attention system that only speaks when
 * spoken to is not an attention system.
 *
 * This closes that loop, and does it in the smallest way that is honest:
 * one interval, the same engine, the same boundary ring the map draws,
 * feeding the same reconciliation the domain tests cover.
 *
 * ## Why polling the fleet is safe here
 *
 * Reconciliation is idempotent. Running it on an unchanged feed produces
 * `UNCHANGED` for every vessel and raises nothing, so the cadence below
 * is a freshness decision rather than a correctness one. That property is
 * load-bearing: without it this hook would raise one alert per vessel per
 * cycle and the notification count would reach the hundreds within a
 * minute.
 *
 * ## What it refuses to do
 *
 * With no fleet, or no boundary ring, it assesses nothing and says so
 * through `assessable`. It does not run against an empty fleet and report
 * a quiet sea, because "no alerts" and "nothing was assessed" are
 * different facts and only one of them is reassuring.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ArrivalAlertStore,
  countBySeverity,
  presentAlerts,
  type AlertPresentation,
  type ArrivalInterventionAlert,
} from "@/services/alerts";
import { assessFleetApproach } from "@/services/geospatial/fleet-approach";
import type { LonLat, Vessel } from "@/services/geospatial";

/**
 * How often the fleet is reassessed.
 *
 * Slower than the position feed on purpose. An approach horizon is
 * measured in hours, so assessing every few seconds would cost work
 * without changing an answer, and the reconciliation would return
 * `UNCHANGED` every time.
 */
const ASSESS_INTERVAL_MS = 30_000;

/**
 * The window alerts are raised against.
 *
 * The widest supported condition, so a vessel three days out is seen
 * once rather than appearing abruptly inside a day. Narrower questions
 * an officer asks are a separate matter and do not change this.
 */
const ALERT_HORIZON_HOURS = 72;

export interface ArrivalAlertsState {
  /** Active alerts, ordered for display. */
  readonly alerts: readonly AlertPresentation[];
  /** Every alert held, including resolved and closed ones. */
  readonly history: readonly ArrivalInterventionAlert[];
  readonly counts: Readonly<Record<"URGENT" | "ATTENTION" | "WATCH", number>>;
  readonly activeCount: number;
  /**
   * Whether an assessment could be made at all.
   *
   * False means the fleet or the boundary was missing, and the empty
   * alert list is an absence of assessment rather than an all-clear.
   */
  readonly assessable: boolean;
  /**
   * Vessels the latest pass could not assess.
   *
   * Surfaced separately and never counted as alerts. Five vessels nobody
   * could assess is a limitation of the picture, not five quiet ships.
   */
  readonly unassessableCount: number;
  /** The live alert for a hull, for the drawer and the map. */
  readonly forVessel: (imo: string) => ArrivalInterventionAlert | undefined;
  /** Apply an officer's transition. Takes an already-transitioned alert. */
  readonly replace: (alert: ArrivalInterventionAlert) => void;
  readonly store: ArrivalAlertStore;
}

export interface UseArrivalAlertsOptions {
  readonly vessels: readonly Vessel[];
  /** The maritime boundary the assessment is made against. */
  readonly boundaryRing: readonly LonLat[] | null;
  /** Which provider the positions came from. Recorded on every alert. */
  readonly sourceId: string;
  readonly intervalMs?: number;
  /** Injectable so a test can drive assessment without a timer. */
  readonly now?: () => number;
}

export function useArrivalAlerts(options: UseArrivalAlertsOptions): ArrivalAlertsState {
  const { vessels, boundaryRing, sourceId, intervalMs = ASSESS_INTERVAL_MS, now } = options;

  // One store per mounted map. Created once; never rebuilt on re-render,
  // or every render would discard the officer's acknowledgements.
  const store = useMemo(() => new ArrivalAlertStore(), []);
  const [alerts, setAlerts] = useState<readonly ArrivalInterventionAlert[]>([]);
  const [unassessableCount, setUnassessableCount] = useState(0);

  /*
   * The inputs are read through a ref inside the interval.
   *
   * Depending on `vessels` directly would restart the interval on every
   * position poll, so the assessment would run at the feed's cadence
   * rather than its own — and on a busy feed might never complete a full
   * period at all.
   */
  const inputs = useRef({ vessels, boundaryRing, sourceId });
  inputs.current = { vessels, boundaryRing, sourceId };

  const assessable = vessels.length > 0 && (boundaryRing?.length ?? 0) >= 3;

  const assess = useCallback(() => {
    const { vessels: fleet, boundaryRing: ring, sourceId: source } = inputs.current;
    if (fleet.length === 0 || !ring || ring.length < 3) return;

    const at = new Date(now?.() ?? Date.now()).toISOString();
    const result = assessFleetApproach(fleet, ring, {
      thresholdHours: ALERT_HORIZON_HOURS,
      ...(now ? { now: now() } : {}),
    });

    const change = store.apply(result, { assessedAt: at, sourceId: source }, "system");
    setUnassessableCount(change.unassessable);
    setAlerts(store.snapshot());
  }, [store, now]);

  /*
   * `assessable` is in the dependencies deliberately.
   *
   * The first pass runs at mount, when the fleet is still loading and the
   * boundary may not have parsed, so it assesses nothing and returns. On
   * the interval alone the officer then sees an empty attention centre
   * for a full period after the map has filled — measured at thirty
   * seconds of a map showing thirty-two vessels and no alerts, which
   * reads as an all-clear rather than as a pending assessment. Waking on
   * the transition to assessable closes that window without adding a
   * second clock.
   */
  useEffect(() => {
    assess();
    const timer = setInterval(assess, intervalMs);
    return () => clearInterval(timer);
  }, [assess, intervalMs, assessable]);

  // Officer transitions land in the store, not in this component's state,
  // so the map and the notification centre cannot hold different answers.
  useEffect(() => store.subscribe((next) => setAlerts(next)), [store]);

  const active = useMemo(() => alerts.filter((alert) => isActiveState(alert)), [alerts]);

  return {
    alerts: useMemo(() => presentAlerts(active), [active]),
    history: alerts,
    counts: useMemo(() => countBySeverity(active), [active]),
    activeCount: active.length,
    assessable,
    unassessableCount,
    forVessel: useCallback((imo: string) => store.forVessel(imo), [store]),
    replace: useCallback((alert: ArrivalInterventionAlert) => store.replace(alert), [store]),
    store,
  };
}

function isActiveState(alert: ArrivalInterventionAlert): boolean {
  return alert.state !== "RESOLVED" && alert.state !== "CLOSED";
}
