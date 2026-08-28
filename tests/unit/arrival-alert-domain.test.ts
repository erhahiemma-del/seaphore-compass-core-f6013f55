/**
 * The rules that decide when an officer is interrupted.
 *
 * Three failures these guard, in descending order of how much damage
 * they do. An alert that duplicates itself every assessment cycle
 * teaches officers to ignore the whole surface. An alert that reopens
 * after being closed makes a settled record silently live again. And an
 * alert whose stated reason was invented is worse than no alert.
 */
import { describe, expect, it } from "vitest";

import {
  SEVERITY_FOR_CONDITION,
  alertEvent,
  applyTransition,
  assignAlert,
  canTransition,
  conditionFor,
  escalateAlert,
  evidenceIsStale,
  isActive,
  isAlertable,
  isMoreUrgent,
  isTerminal,
  needsReminder,
  raiseAlert,
  reconcile,
  transitionAlert,
  type AlertEvidence,
  type AlertState,
  type ReconcilableAlert,
} from "@/services/alerts";

const evidence: AlertEvidence = {
  relation: "APPROACHING",
  thresholdHours: 24,
  hoursToBoundary: 18.2,
  distanceNm: 96,
  arrivalBasis: "ESTIMATED",
  boundaryAccuracy: "APPROXIMATE",
  rationale: "Closing on the displayed outline at current course and speed.",
  sourceId: "simulated",
  observedAt: "2026-08-28T09:00:00.000Z",
  positionAgeMs: 60_000,
  assessedAt: "2026-08-28T09:01:00.000Z",
};

const vessel = { imo: "IMO-1", mmsi: "111", name: "Opobo Pioneer" };

const alert = () =>
  raiseAlert({
    episode: { imo: "IMO-1", sequence: 1 },
    vessel,
    condition: "APPROACHING_24H",
    evidence,
    actor: "officer.a",
    at: "2026-08-28T09:01:00.000Z",
  });

describe("what an alert is allowed to claim", () => {
  it("supports only conditions the data can establish", () => {
    /*
     * No manifest, compliance or sanctions condition exists, because no
     * provider or policy engine can establish one. An invented reason is
     * worse than no alert.
     */
    const conditions = Object.keys(SEVERITY_FOR_CONDITION);
    expect(conditions).toEqual([
      "APPROACHING_72H",
      "APPROACHING_48H",
      "APPROACHING_24H",
      "ENTERING",
      "INSIDE_BOUNDARY",
    ]);
  });

  it("raises nothing when the arrival could not be derived", () => {
    // A stopped vessel is not a quiet all-clear.
    expect(conditionFor("APPROACHING", null)).toBeNull();
    expect(isAlertable(conditionFor("APPROACHING", null))).toBe(false);
  });

  it("reads the condition from the horizon actually computed", () => {
    expect(conditionFor("APPROACHING", 18)).toBe("APPROACHING_24H");
    expect(conditionFor("APPROACHING", 40)).toBe("APPROACHING_48H");
    expect(conditionFor("APPROACHING", 70)).toBe("APPROACHING_72H");
    // Beyond every supported threshold is not an alert.
    expect(conditionFor("APPROACHING", 200)).toBeNull();
  });

  it("keeps severity away from risk", () => {
    /*
     * A vessel arriving within a day is soon, not dangerous. Mapping it
     * to a risk band would put a judgement on a hull whose conduct
     * nobody has assessed.
     */
    const severities = Object.values(SEVERITY_FOR_CONDITION);
    for (const severity of severities) {
      expect(["WATCH", "ATTENTION", "URGENT"]).toContain(severity);
      expect(severity).not.toMatch(/risk|high|critical|low/i);
    }
    expect(SEVERITY_FOR_CONDITION.APPROACHING_24H).toBe("URGENT");
    expect(SEVERITY_FOR_CONDITION.APPROACHING_72H).toBe("WATCH");
  });

  it("freezes the evidence that caused it", () => {
    const raised = alert();
    expect(raised.evidence).toEqual(evidence);
    // Escalation does not rewrite why the alert was raised.
    const closer = escalateAlert(raised, "ENTERING", "officer.a");
    expect(closer.evidence).toEqual(evidence);
  });

  it("stops asserting an arrival once the position is stale", () => {
    expect(evidenceIsStale(evidence, 30 * 60_000)).toBe(false);
    expect(evidenceIsStale({ ...evidence, positionAgeMs: 3 * 3_600_000 }, 30 * 60_000)).toBe(true);
  });
});

describe("one approach, one alert", () => {
  const live = (over: Partial<ReconcilableAlert> = {}): ReconcilableAlert => ({
    id: "alert_IMO-1#1",
    episode: { imo: "IMO-1", sequence: 1 },
    vessel,
    condition: "APPROACHING_48H",
    state: "OPEN",
    ...over,
  });

  it("does not raise a second alert while one is live", () => {
    /*
     * The failure this exists to prevent: the fleet is reassessed
     * continuously, and without a stable episode identity one vessel
     * produces a new alert every cycle until the surface is unusable.
     */
    const result = reconcile(vessel, "APPROACHING_48H", [live()]);
    expect(result.kind).toBe("UNCHANGED");
  });

  it("escalates the same alert as the vessel closes in", () => {
    const result = reconcile(vessel, "APPROACHING_24H", [live()]);
    expect(result.kind).toBe("ESCALATE");
    if (result.kind !== "ESCALATE") return;
    expect(result.from).toBe("APPROACHING_48H");
    expect(result.to).toBe("APPROACHING_24H");
    // Same alert, not a second one.
    expect(result.alertId).toBe("alert_IMO-1#1");
  });

  it("does not quietly downgrade an alert that drifts back out", () => {
    /*
     * An alert an officer has been asked to look at does not lower its
     * own urgency while they are deciding.
     */
    const result = reconcile(vessel, "APPROACHING_72H", [live({ condition: "APPROACHING_24H" })]);
    expect(result.kind).toBe("UNCHANGED");
  });

  it("raises a new episode after the previous one was closed", () => {
    const result = reconcile(vessel, "APPROACHING_24H", [live({ state: "CLOSED" })]);
    expect(result.kind).toBe("RAISE");
    if (result.kind !== "RAISE") return;
    // A genuinely new operational event, dated and separate.
    expect(result.episode.sequence).toBe(2);
  });

  it("keeps episodes of different vessels apart", () => {
    const other = { imo: "IMO-2", name: "Bonny Voyager" };
    const result = reconcile(other, "APPROACHING_24H", [live()]);
    expect(result.kind).toBe("RAISE");
    if (result.kind !== "RAISE") return;
    expect(result.episode).toEqual({ imo: "IMO-2", sequence: 1 });
  });

  it("keys the episode on the hull, not the name", () => {
    // A renamed vessel is the same hull; the alert must not orphan.
    const renamed = { imo: "IMO-1", name: "Renamed Vessel" };
    expect(reconcile(renamed, "APPROACHING_48H", [live()]).kind).toBe("UNCHANGED");
  });

  it("ranks conditions so escalation is directional", () => {
    expect(isMoreUrgent("APPROACHING_24H", "APPROACHING_48H")).toBe(true);
    expect(isMoreUrgent("APPROACHING_72H", "APPROACHING_24H")).toBe(false);
    expect(isMoreUrgent("ENTERING", "APPROACHING_24H")).toBe(true);
  });
});

describe("an alert moves only by permitted routes", () => {
  it("allows the ordinary path", () => {
    const path: readonly AlertState[] = [
      "OPEN",
      "ACKNOWLEDGED",
      "UNDER_REVIEW",
      "ACTION_REQUIRED",
      "RESOLVED",
      "CLOSED",
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("never reopens a closed alert", () => {
    /*
     * A closed alert that could reopen would let a settled record become
     * live again without anyone raising it. A fresh approach creates a
     * new episode instead — visible and dated.
     */
    expect(isTerminal("CLOSED")).toBe(true);
    for (const state of ["OPEN", "ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED"] as AlertState[]) {
      expect(canTransition("CLOSED", state)).toBe(false);
    }
    const refused = transitionAlert({
      alertId: "a",
      from: "CLOSED",
      to: "OPEN",
      actor: "officer.a",
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toMatch(/cannot be reopened/i);
  });

  it("refuses a jump the table does not allow", () => {
    const refused = transitionAlert({
      alertId: "a",
      from: "OPEN",
      to: "ACTION_REQUIRED",
      actor: "officer.a",
    });
    expect(refused.ok).toBe(false);
  });

  it("refuses a transition to the state it is already in", () => {
    const refused = transitionAlert({
      alertId: "a",
      from: "OPEN",
      to: "OPEN",
      actor: "officer.a",
    });
    expect(refused.ok).toBe(false);
  });

  it("stops reminding once an officer has seen it", () => {
    expect(needsReminder("OPEN")).toBe(true);
    expect(needsReminder("ACKNOWLEDGED")).toBe(false);
    // Still visible, though — acknowledgement is not dismissal.
    expect(isActive("ACKNOWLEDGED")).toBe(true);
    expect(isActive("RESOLVED")).toBe(false);
  });
});

describe("every change leaves a record naming who made it", () => {
  it("records the raise", () => {
    const raised = alert();
    expect(raised.events).toHaveLength(1);
    expect(raised.events[0].type).toBe("RAISED");
    expect(raised.events[0].actor).toBe("officer.a");
  });

  it("appends rather than replaces", () => {
    const raised = alert();
    const move = transitionAlert({
      alertId: raised.id,
      from: "OPEN",
      to: "ACKNOWLEDGED",
      actor: "officer.b",
      at: "2026-08-28T09:05:00.000Z",
    });
    expect(move.ok).toBe(true);
    if (!move.ok) return;

    const next = applyTransition(raised, move.event);
    expect(next.state).toBe("ACKNOWLEDGED");
    expect(next.acknowledgedBy).toBe("officer.b");
    expect(next.acknowledgedAt).toBe("2026-08-28T09:05:00.000Z");
    // The original raise is still there.
    expect(next.events).toHaveLength(2);
    expect(next.events[0].type).toBe("RAISED");
  });

  it("keeps acknowledgement and assignment through an escalation", () => {
    /*
     * An officer who already looked at this vessel has not stopped
     * having looked at it because the vessel got closer.
     */
    const raised = alert();
    const move = transitionAlert({
      alertId: raised.id,
      from: "OPEN",
      to: "ACKNOWLEDGED",
      actor: "officer.b",
    });
    if (!move.ok) return;
    const acknowledged = assignAlert(applyTransition(raised, move.event), "officer.c", "officer.b");
    const escalated = escalateAlert(acknowledged, "ENTERING", "system");

    expect(escalated.state).toBe("ACKNOWLEDGED");
    expect(escalated.assignedTo).toBe("officer.c");
    expect(escalated.severity).toBe("URGENT");
    expect(escalated.events.map((e) => e.type)).toContain("ESCALATED");
  });

  it("attributes every event to an actor", () => {
    const event = alertEvent("alert_1", "NOTE_ADDED", "officer.a", { note: "Contacted agent." });
    expect(event.actor).toBe("officer.a");
    expect(event.at).toBeTruthy();
    // An unattributed action is a bug, not a valid state.
    expect(event.actor.length).toBeGreaterThan(0);
  });
});

describe("an alert is not an investigation", () => {
  it("carries no case fields and requires no case", () => {
    /*
     * An alert says something needs looking at; a case says someone is
     * looking at it. Merging them would make every glance at a vessel
     * open a record with an officer's name on it.
     */
    const raised = alert() as unknown as Record<string, unknown>;
    for (const caseField of [
      "stage",
      "findings",
      "evidenceLinks",
      "caseNumber",
      "investigationId",
    ]) {
      expect(raised[caseField], caseField).toBeUndefined();
    }
  });
});
