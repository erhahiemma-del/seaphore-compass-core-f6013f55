/**
 * The alert presentation layer says only what the domain established.
 *
 * These are truthfulness tests before they are rendering tests. An
 * approach alert is the surface most able to cause an officer to act on
 * something that is not true — it names a vessel, gives an hour, and asks
 * for attention — so the assertions here are mostly about what the copy
 * must *not* claim.
 */
import { describe, expect, it } from "vitest";

import {
  ArrivalAlertStore,
  actionsFor,
  arrivalLineFor,
  countBySeverity,
  displayPriorityFor,
  positionAgeLabel,
  presentAlert,
  presentAlerts,
  raiseAlert,
  transitionAlert,
  applyTransition,
  visualStateFor,
  type AlertEvidence,
  type AlertState,
  type ArrivalInterventionAlert,
} from "@/services/alerts";
import type { FleetApproachResult } from "@/services/geospatial/fleet-approach";
import type { Vessel } from "@/services/geospatial";

const AT = "2026-08-28T12:00:00.000Z";

function evidence(over: Partial<AlertEvidence> = {}): AlertEvidence {
  return {
    relation: "APPROACHING",
    thresholdHours: 24,
    hoursToBoundary: 18,
    distanceNm: 160,
    arrivalBasis: "ESTIMATED",
    boundaryAccuracy: "APPROXIMATE",
    rationale: "Closing on the boundary at reported speed and course.",
    sourceId: "simulated",
    observedAt: AT,
    positionAgeMs: 60_000,
    assessedAt: AT,
    ...over,
  };
}

function alertWith(over: Partial<AlertEvidence> = {}, name = "Opobo Pioneer") {
  return raiseAlert({
    episode: { imo: "SIM-0015", sequence: 1 },
    vessel: { imo: "SIM-0015", name },
    condition: "APPROACHING_24H",
    evidence: evidence(over),
    actor: "system",
    at: AT,
  });
}

describe("arrival is stated exactly as well as it is known", () => {
  it("marks an estimate as an estimate, and as approximate", () => {
    expect(arrivalLineFor(evidence({ arrivalBasis: "ESTIMATED" }))).toBe(
      "Approximately 18 hours · Estimated",
    );
  });

  it("states a reported arrival without hedging it", () => {
    expect(arrivalLineFor(evidence({ arrivalBasis: "REPORTED" }))).toBe("18 hours · Reported");
  });

  it("refuses to state an arrival it does not have", () => {
    const line = arrivalLineFor(
      evidence({ arrivalBasis: "UNAVAILABLE", hoursToBoundary: undefined }),
    );

    expect(line).toBe("Arrival estimate unavailable");
    // The absence must not read as a small number, or as zero.
    expect(line).not.toMatch(/\d/);
  });

  it("never prints a bare hour count for an estimate", () => {
    const line = arrivalLineFor(evidence({ arrivalBasis: "ESTIMATED" }));

    expect(line).toMatch(/Estimated/);
    expect(line).not.toBe("18 hours");
  });
});

describe("alert copy claims nothing the domain did not establish", () => {
  const presented = presentAlert(alertWith());

  it("gives the reason as the threshold, not as a judgement", () => {
    expect(presented.reason).toBe(
      "Vessel meets the current 24-hour operational approach threshold.",
    );
  });

  it("never implies risk, manifest, compliance or official status", () => {
    const copy = [
      presented.headline,
      presented.arrivalLine,
      presented.reason,
      presented.provenance.boundaryAccuracy,
    ].join(" ");

    expect(copy).not.toMatch(/risk|manifest|sanction|complian|illegal|suspicious/i);
    // The boundary is a derived ring, and calling it official would claim
    // an authority nobody granted.
    expect(copy).not.toMatch(/official/i);
  });

  it("keeps the boundary approximate when the assessment said so", () => {
    expect(presented.provenance.boundaryAccuracy).toBe("Approximate");
  });

  it("names the source it actually came from", () => {
    expect(presented.provenance.source).toBe("simulated");
  });

  it("bands position age rather than inviting arithmetic", () => {
    expect(positionAgeLabel(60_000)).toBe("Fresh");
    expect(positionAgeLabel(10 * 60_000)).toBe("10 minutes old");
    expect(positionAgeLabel(undefined)).toBe("Position age not established");
    expect(positionAgeLabel(Number.POSITIVE_INFINITY)).toBe("Position age not established");
  });

  it("says the latest assessment is unavailable rather than repeating a stale one", () => {
    const stale: ArrivalInterventionAlert = {
      ...alertWith(),
      currentAssessmentUnavailable: true,
    };

    expect(presentAlert(stale).arrivalLine).toBe("Latest assessment unavailable");
    expect(presentAlert(stale).assessmentUnavailable).toBe(true);
  });
});

describe("visual state and offered actions", () => {
  it("pulses only while nobody has looked", () => {
    expect(visualStateFor("OPEN")).toBe("ACTIVE");
    expect(visualStateFor("ACKNOWLEDGED")).toBe("QUIET");
    expect(visualStateFor("UNDER_REVIEW")).toBe("QUIET");
    expect(visualStateFor("RESOLVED")).toBe("CLEARED");
    expect(visualStateFor("CLOSED")).toBe("CLEARED");
  });

  it("offers no action that the domain cannot perform", () => {
    // Assignment and manual escalation are deliberately absent: there is
    // no roster of authenticated officers, and severity is decided by the
    // approach engine rather than by a button.
    for (const state of ["OPEN", "ACKNOWLEDGED", "RESOLVED", "CLOSED"] as const) {
      for (const action of actionsFor(state)) {
        expect(["ACKNOWLEDGE", "ADD_UPDATE", "RESOLVE", "CLOSE"]).toContain(action);
      }
    }
    expect(actionsFor("CLOSED")).toHaveLength(0);
    expect(actionsFor("OPEN")).toContain("ACKNOWLEDGE");
    expect(actionsFor("ACKNOWLEDGED")).not.toContain("ACKNOWLEDGE");
  });
});

describe("ordering is deterministic and invents no arrival", () => {
  it("ranks by severity before arrival", () => {
    const urgent = alertWith({ hoursToBoundary: 20 });
    const watch: ArrivalInterventionAlert = {
      ...alertWith({ hoursToBoundary: 2 }),
      id: "alert_SIM-0016#1",
      severity: "WATCH",
      condition: "APPROACHING_72H",
    };

    expect(displayPriorityFor(urgent)).toBeLessThan(displayPriorityFor(watch));
  });

  it("sorts an underivable arrival last within its band, without a number", () => {
    const known = alertWith({ hoursToBoundary: 23 });
    const unknown = alertWith({ hoursToBoundary: undefined, arrivalBasis: "UNAVAILABLE" });

    expect(displayPriorityFor(known)).toBeLessThan(displayPriorityFor(unknown));
    expect(presentAlert(unknown).arrivalLine).toBe("Arrival estimate unavailable");
  });

  it("orders a list stably", () => {
    const a = alertWith({ hoursToBoundary: 5 });
    const b: ArrivalInterventionAlert = { ...alertWith({ hoursToBoundary: 5 }), id: "alert_B#1" };

    expect(presentAlerts([b, a]).map((p) => p.alertId)).toEqual(
      presentAlerts([a, b]).map((p) => p.alertId),
    );
  });
});

/* ── The store ─────────────────────────────────────────────────────── */

function vessel(imo: string, lon: number): Vessel {
  return {
    identity: { imo, name: `Vessel ${imo}` },
    position: { lon, lat: 5.2, heading: 90, speed: 12, timestamp: AT },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  };
}

function fleetResult(hours: number | undefined, imo = "SIM-0015"): FleetApproachResult {
  const entry = {
    vessel: vessel(imo, 3.4),
    assessment: {
      relation: "APPROACHING" as const,
      hoursToBoundary: hours,
      distanceNm: 160,
      basis: (hours == null ? "UNAVAILABLE" : "ESTIMATED") as "UNAVAILABLE" | "ESTIMATED",
      accuracy: "APPROXIMATE" as const,
      rationale: "Closing on the boundary.",
    },
    positionAgeMs: 60_000,
  };
  return {
    approaching: hours == null ? [] : [entry as never],
    inside: [],
    unassessable: hours == null ? [entry as never] : [],
    thresholdHours: 24,
  } as unknown as FleetApproachResult;
}

const CONTEXT = { assessedAt: AT, sourceId: "simulated" };

/**
 * Move an alert through the real lifecycle table.
 *
 * Deliberately goes through `transitionAlert` and asserts it succeeded,
 * rather than constructing an event: a test that hand-built the event
 * would pass even if the transition were forbidden.
 */
function move(alert: ArrivalInterventionAlert, to: AlertState): ArrivalInterventionAlert {
  const outcome = transitionAlert({
    alertId: alert.id,
    from: alert.state,
    to,
    actor: "officer",
    at: AT,
  });
  if (!outcome.ok) throw new Error(outcome.reason);
  return applyTransition(alert, outcome.event);
}

describe("the alert store holds, and does not decide", () => {
  it("raises one alert for an approaching vessel", () => {
    const store = new ArrivalAlertStore();

    const change = store.apply(fleetResult(18), CONTEXT, "system");

    expect(change.raised).toHaveLength(1);
    expect(store.active()).toHaveLength(1);
    expect(store.forVessel("SIM-0015")?.condition).toBe("APPROACHING_24H");
  });

  /*
   * The property the whole design exists for. The fleet is reassessed on
   * every polling cycle, and without this an officer's list would climb
   * into the hundreds and be ignored.
   */
  it("raises nothing further when the same assessment arrives again", () => {
    const store = new ArrivalAlertStore();
    store.apply(fleetResult(18), CONTEXT, "system");

    for (let i = 0; i < 4; i++) store.apply(fleetResult(18), CONTEXT, "system");

    expect(store.active()).toHaveLength(1);
  });

  it("keeps one episode as the vessel closes in, escalating rather than duplicating", () => {
    const store = new ArrivalAlertStore();
    store.apply(fleetResult(70), CONTEXT, "system");
    const first = store.active()[0];
    expect(first.condition).toBe("APPROACHING_72H");

    store.apply(fleetResult(40), CONTEXT, "system");
    store.apply(fleetResult(18), CONTEXT, "system");

    const alerts = store.active();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe(first.id);
    expect(alerts[0].episode).toEqual(first.episode);
    expect(alerts[0].condition).toBe("APPROACHING_24H");
    expect(alerts[0].severity).toBe("URGENT");
  });

  it("preserves the trigger evidence through escalation", () => {
    const store = new ArrivalAlertStore();
    store.apply(fleetResult(70), CONTEXT, "system");
    const raisedEvidence = store.active()[0].evidence;

    store.apply(fleetResult(18), CONTEXT, "system");

    // Why it was raised must survive; where the vessel is now is a
    // different question with a different answer.
    expect(store.active()[0].evidence).toEqual(raisedEvidence);
    expect(store.active()[0].currentAssessment?.hoursToBoundary).toBe(18);
  });

  it("does not resolve an alert because the vessel stopped being assessable", () => {
    const store = new ArrivalAlertStore();
    store.apply(fleetResult(18), CONTEXT, "system");

    const change = store.apply(fleetResult(undefined), CONTEXT, "system");

    expect(change.unassessable).toBe(1);
    expect(store.active()).toHaveLength(1);
    expect(store.active()[0].state).toBe("OPEN");
    expect(store.active()[0].currentAssessmentUnavailable).toBe(true);
  });

  it("counts acknowledged alerts as still active, and resolved ones as not", () => {
    const store = new ArrivalAlertStore();
    store.apply(fleetResult(18), CONTEXT, "system");
    const alert = store.active()[0];

    const acked = move(alert, "ACKNOWLEDGED");
    store.replace(acked);
    expect(store.active()).toHaveLength(1);

    const resolved = move(acked, "RESOLVED");
    store.replace(resolved);

    expect(store.active()).toHaveLength(0);
    // Resolved is not deleted: the record stays readable.
    expect(store.snapshot()).toHaveLength(1);
  });

  it("counts by severity for the attention badge", () => {
    const store = new ArrivalAlertStore();
    store.apply(fleetResult(18), CONTEXT, "system");

    expect(countBySeverity(store.active())).toEqual({ URGENT: 1, ATTENTION: 0, WATCH: 0 });
  });

  it("notifies subscribers only when something actually happened", () => {
    const store = new ArrivalAlertStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });

    store.apply(fleetResult(18), CONTEXT, "system");
    const afterRaise = calls;
    store.apply(fleetResult(18), CONTEXT, "system");

    expect(afterRaise).toBe(1);
    expect(calls).toBe(afterRaise);
  });
});
