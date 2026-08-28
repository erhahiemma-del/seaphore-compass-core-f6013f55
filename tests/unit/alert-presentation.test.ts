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
  actionsFor,
  arrivalLineFor,
  countBySeverity,
  displayPriorityFor,
  positionAgeLabel,
  presentAlert,
  presentAlerts,
  raiseAlert,
  visualStateFor,
  type AlertEvidence,
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

/* ── Severity counting ─────────────────────────────────────────────── */

/*
 * The rest of what this file used to cover — raising once, escalating in
 * place, preserving the trigger, refusing to resolve on lost signal,
 * counting acknowledged alerts as active — moved to
 * alert-persistence.test.ts when the bespoke store was removed. They are
 * asserted there against the real repository contract and the real
 * reconciliation engine rather than against a second store, which is
 * stricter than what stood here.
 */
describe("severity counting for the attention badge", () => {
  it("counts active alerts by severity", () => {
    const urgent = alertWith();
    const watch: ArrivalInterventionAlert = {
      ...alertWith(),
      id: "alert_SIM-0016#1",
      severity: "WATCH",
      condition: "APPROACHING_72H",
    };

    expect(countBySeverity([urgent, watch, urgent])).toEqual({
      URGENT: 2,
      ATTENTION: 0,
      WATCH: 1,
    });
  });

  it("counts nothing as nothing, rather than as absent", () => {
    expect(countBySeverity([])).toEqual({ URGENT: 0, ATTENTION: 0, WATCH: 0 });
  });
});
