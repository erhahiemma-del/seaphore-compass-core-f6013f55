/**
 * Turning a fleet assessment into alerts, repeatedly, without harm.
 *
 * The fleet is reassessed continuously, so the property that matters
 * most here is not correctness on one pass — it is that a hundred
 * identical passes produce the same single alert and no new events. Get
 * that wrong and the notification surface fills with duplicates until
 * officers stop reading it, which is worse than having no alerts.
 *
 * The second property is about silence. An assessment that could not be
 * made, or a vessel that has drifted out of view, must never read as an
 * all-clear. Data loss is not resolution.
 */
import { describe, expect, it } from "vitest";

import {
  evaluateAlertEligibility,
  evidenceFrom,
  reconcileFleetApproach,
  reconcileVessel,
  type ReconcilableAlert,
  type ReconcileContext,
  raiseAlert,
  escalateAlert,
  assignAlert,
  applyTransition,
  transitionAlert,
  updateCurrentAssessment,
  markAssessmentUnavailable,
} from "@/services/alerts";
import type { FleetApproachEntry, FleetApproachResult } from "@/services/geospatial/fleet-approach";
import type { BoundaryRelation, ArrivalBasis } from "@/services/geospatial/maritime-boundary";
import type { Vessel } from "@/services/geospatial";

const context: ReconcileContext = {
  assessedAt: "2026-08-28T09:00:00.000Z",
  sourceId: "simulated",
};

const vessel = (imo: string): Vessel =>
  ({
    identity: { imo, name: `Vessel ${imo}`, mmsi: "111" },
    position: {
      lon: 2,
      lat: 5,
      heading: 90,
      speed: 12,
      timestamp: "2026-08-28T08:59:00.000Z",
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  }) as Vessel;

const entry = (
  imo: string,
  over: {
    hours?: number | null;
    basis?: ArrivalBasis;
    relation?: BoundaryRelation;
    ageMs?: number;
    distanceNm?: number | null;
  } = {},
): FleetApproachEntry => ({
  vessel: vessel(imo),
  assessment: {
    relation: over.relation ?? "APPROACHING",
    hoursToBoundary: over.hours === undefined ? 18 : over.hours,
    basis: over.basis ?? "ESTIMATED",
    distanceNm: over.distanceNm === undefined ? 96 : over.distanceNm,
    accuracy: "APPROXIMATE",
    rationale: "Closing on the displayed outline at current course and speed.",
  },
  positionAgeMs: over.ageMs ?? 60_000,
});

const result = (
  entries: readonly FleetApproachEntry[],
  thresholdHours = 24,
): FleetApproachResult => ({
  approaching: entries,
  inside: [],
  unassessable: [],
  assessedCount: entries.length,
  thresholdHours,
  boundaryAccuracy: "APPROXIMATE",
  boundaryCaveat: "Simplified outline for operational display.",
});

const held = (over: Partial<ReconcilableAlert> = {}): ReconcilableAlert => ({
  id: "alert_IMO-1#1",
  episode: { imo: "IMO-1", sequence: 1 },
  vessel: { imo: "IMO-1", name: "Vessel IMO-1" },
  condition: "APPROACHING_24H",
  state: "OPEN",
  ...over,
});

const decide = (e: FleetApproachEntry, existing: readonly ReconcilableAlert[] = []) =>
  reconcileVessel(e, result([e]), existing, context);

/* ── Eligibility ─────────────────────────────────────────────────────── */

describe("eligibility decides attention, never navigation", () => {
  it("is eligible when the engine derived an arrival inside a threshold", () => {
    const decision = evaluateAlertEligibility(entry("IMO-1", { hours: 18 }));
    expect(decision.kind).toBe("ELIGIBLE");
    if (decision.kind !== "ELIGIBLE") return;
    expect(decision.condition).toBe("APPROACHING_24H");
  });

  it("separates 'could not assess' from 'not approaching'", () => {
    /*
     * The distinction this whole layer rests on. A stopped vessel is not
     * a vessel that was checked and found safe — it is one nobody could
     * check, and reporting it as a negative would launder the engine's
     * refusal into a conclusion.
     */
    const noBasis = evaluateAlertEligibility(entry("IMO-1", { basis: "UNAVAILABLE", hours: null }));
    expect(noBasis.kind).toBe("UNASSESSABLE");

    const tooFar = evaluateAlertEligibility(entry("IMO-1", { hours: 200 }));
    expect(tooFar.kind).toBe("NOT_ELIGIBLE");
  });

  it("refuses to raise on a position too old to act on", () => {
    const stale = evaluateAlertEligibility(entry("IMO-1", { ageMs: 3 * 3_600_000 }));
    expect(stale.kind).toBe("UNASSESSABLE");
  });

  it("reads the condition from the engine's hours, never from distance", () => {
    // Very close, but the engine says three days out. Hours win.
    const decision = evaluateAlertEligibility(entry("IMO-1", { hours: 70, distanceNm: 2 }));
    expect(decision.kind === "ELIGIBLE" && decision.condition).toBe("APPROACHING_72H");
  });
});

/* ── Reconciliation ──────────────────────────────────────────────────── */

describe("raising, once", () => {
  it("raises when nothing is held", () => {
    const outcome = decide(entry("IMO-1"));
    expect(outcome.kind).toBe("RAISE");
    if (outcome.kind !== "RAISE") return;
    expect(outcome.episode).toEqual({ imo: "IMO-1", sequence: 1 });
    expect(outcome.condition).toBe("APPROACHING_24H");
  });

  it("is idempotent — repeated identical passes never raise twice", () => {
    /*
     * The failure this exists to prevent. Once the first pass has been
     * applied, every subsequent identical pass must be a no-op.
     */
    const e = entry("IMO-1");
    const first = decide(e);
    expect(first.kind).toBe("RAISE");

    const applied = held({ currentAssessment: evidenceFrom(e, result([e]), context) });
    for (let pass = 0; pass < 50; pass += 1) {
      expect(decide(e, [applied]).kind).toBe("UNCHANGED");
    }
  });

  it("never uses the assessment time as identity", () => {
    // A later run of the same picture is still the same picture.
    const e = entry("IMO-1");
    const applied = held({ currentAssessment: evidenceFrom(e, result([e]), context) });
    const later = reconcileVessel(e, result([e]), [applied], {
      ...context,
      assessedAt: "2026-08-28T23:59:00.000Z",
    });
    expect(later.kind).toBe("UNCHANGED");
  });
});

describe("one approach, one episode", () => {
  it("keeps 72 → 48 → 24 as a single alert", () => {
    let alert = held({ condition: "APPROACHING_72H" });
    const steps: readonly [number, string][] = [
      [40, "APPROACHING_48H"],
      [18, "APPROACHING_24H"],
    ];
    for (const [hours, expected] of steps) {
      const outcome = decide(entry("IMO-1", { hours }), [alert]);
      expect(outcome.kind).toBe("ESCALATE");
      if (outcome.kind !== "ESCALATE") return;
      expect(outcome.to).toBe(expected);
      expect(outcome.alertId).toBe("alert_IMO-1#1");
      alert = { ...alert, condition: outcome.to };
    }
    // Still episode 1 throughout.
    expect(alert.episode.sequence).toBe(1);
  });

  it("does not escalate on distance alone", () => {
    /*
     * A vessel can be geographically nearer while the assessment
     * supports a weaker condition. Escalating on distance would be this
     * layer inventing a navigation rule the engine did not make.
     */
    const closerButLater = entry("IMO-1", { hours: 70, distanceNm: 5 });
    const outcome = decide(closerButLater, [held({ condition: "APPROACHING_24H" })]);
    expect(outcome.kind).not.toBe("ESCALATE");
  });

  it("does not silently downgrade an alert an officer is working", () => {
    const outcome = decide(entry("IMO-1", { hours: 70 }), [
      held({ condition: "APPROACHING_24H", state: "UNDER_REVIEW" }),
    ]);
    expect(["UNCHANGED", "UPDATE"]).toContain(outcome.kind);
  });

  it("updates the current assessment when the position genuinely moved", () => {
    const before = entry("IMO-1", { hours: 18, distanceNm: 96 });
    const alert = held({ currentAssessment: evidenceFrom(before, result([before]), context) });
    const outcome = decide(entry("IMO-1", { hours: 11, distanceNm: 61 }), [alert]);
    expect(outcome.kind).toBe("UPDATE");
    if (outcome.kind !== "UPDATE") return;
    expect(outcome.assessment.hoursToBoundary).toBe(11);
  });
});

describe("silence is never safety", () => {
  it("keeps the alert when the assessment cannot be made", () => {
    /*
     * Losing sight of a vessel is not the vessel ceasing to matter. An
     * alert that cleared itself when the data went missing would be the
     * most dangerous behaviour available here.
     */
    const outcome = decide(entry("IMO-1", { basis: "UNAVAILABLE", hours: null }), [held()]);
    expect(outcome.kind).toBe("UNASSESSABLE");
    if (outcome.kind !== "UNASSESSABLE") return;
    expect(outcome.alertId).toBe("alert_IMO-1#1");
  });

  it("raises nothing from an assessment that could not be made", () => {
    const outcome = decide(entry("IMO-1", { basis: "UNAVAILABLE", hours: null }));
    expect(outcome.kind).toBe("UNASSESSABLE");
  });

  it("reports a genuine exit without resolving the officer's work", () => {
    /*
     * "No longer approaching" and "an officer resolved this" are
     * different facts. Only the first is ours to state.
     */
    const outcome = decide(entry("IMO-1", { hours: 200 }), [held()]);
    expect(outcome.kind).toBe("CONDITION_ENDED");
    expect(outcome.kind === "CONDITION_ENDED" && outcome.alertId).toBe("alert_IMO-1#1");
    // Nothing in the outcome resolves, closes or downgrades.
    expect(JSON.stringify(outcome)).not.toMatch(/RESOLVED|CLOSED/);
  });

  it("says nothing rather than something when nothing is held", () => {
    expect(decide(entry("IMO-1", { hours: 200 })).kind).toBe("NO_ALERT");
  });
});

describe("episodes and sequences", () => {
  it("starts a new episode only after the previous one ended", () => {
    const outcome = decide(entry("IMO-1"), [held({ state: "CLOSED" })]);
    expect(outcome.kind).toBe("RAISE");
    if (outcome.kind !== "RAISE") return;
    expect(outcome.episode.sequence).toBe(2);
  });

  it("continues from the highest sequence seen, not the count", () => {
    /*
     * Episodes 1, 2 and 4 held — 3 archived. The next must be 5. Using
     * the count would reuse 4 and collide with a real record.
     */
    const outcome = decide(entry("IMO-1"), [
      held({ id: "a1", episode: { imo: "IMO-1", sequence: 1 }, state: "CLOSED" }),
      held({ id: "a2", episode: { imo: "IMO-1", sequence: 2 }, state: "CLOSED" }),
      held({ id: "a4", episode: { imo: "IMO-1", sequence: 4 }, state: "CLOSED" }),
    ]);
    expect(outcome.kind === "RAISE" && outcome.episode.sequence).toBe(5);
  });

  it("keeps the episode when the provider changes", () => {
    /*
     * Identity is the hull, not the feed. A vessel moving from the
     * simulation to a live provider is the same approach.
     */
    const live = { ...entry("IMO-1") };
    const outcome = reconcileVessel(live, result([live]), [held()], {
      ...context,
      sourceId: "global-fishing-watch",
    });
    expect(outcome.kind).not.toBe("RAISE");
  });

  it("keeps different vessels in different episodes", () => {
    const outcome = decide(entry("IMO-2"), [held()]);
    expect(outcome.kind === "RAISE" && outcome.episode.imo).toBe("IMO-2");
  });
});

describe("evidence", () => {
  it("translates the engine's result without computing anything", () => {
    const e = entry("IMO-1", { hours: 18, distanceNm: 96 });
    const evidence = evidenceFrom(e, result([e], 24), context);
    expect(evidence).toEqual({
      relation: "APPROACHING",
      thresholdHours: 24,
      hoursToBoundary: 18,
      distanceNm: 96,
      arrivalBasis: "ESTIMATED",
      boundaryAccuracy: "APPROXIMATE",
      rationale: e.assessment.rationale,
      sourceId: "simulated",
      observedAt: "2026-08-28T08:59:00.000Z",
      positionAgeMs: 60_000,
      assessedAt: context.assessedAt,
    });
  });

  it("never invents an arrival the engine withheld", () => {
    const e = entry("IMO-1", { basis: "UNAVAILABLE", hours: null, distanceNm: null });
    const evidence = evidenceFrom(e, result([e]), context);
    expect(evidence.hoursToBoundary).toBeNull();
    expect(evidence.distanceNm).toBeNull();
    expect(evidence.arrivalBasis).toBe("UNAVAILABLE");
  });
});

describe("a whole fleet at once", () => {
  it("returns exactly one outcome per vessel, including the quiet ones", () => {
    /*
     * A caller must never receive silence about a vessel and read it as
     * safety, so every vessel assessed produces a stated outcome.
     */
    const approaching = entry("IMO-1", { hours: 18 });
    const far = entry("IMO-2", { hours: 200 });
    const unknown = entry("IMO-3", { basis: "UNAVAILABLE", hours: null });
    const fleet: FleetApproachResult = {
      ...result([approaching]),
      unassessable: [unknown],
      inside: [far],
      assessedCount: 3,
    };

    const outcomes = reconcileFleetApproach(fleet, [], context);
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map((o) => o.imo).sort()).toEqual(["IMO-1", "IMO-2", "IMO-3"]);
  });

  it("is order-independent, so a batch is deterministic", () => {
    const a = entry("IMO-1", { hours: 18 });
    const b = entry("IMO-2", { hours: 40 });
    const forward = reconcileFleetApproach(result([a, b]), [], context);
    const reversed = reconcileFleetApproach(result([b, a]), [], context);
    const byImo = (list: typeof forward) =>
      [...list].sort((x, y) => x.imo.localeCompare(y.imo)).map((o) => o.outcome.kind);
    expect(byImo(forward)).toEqual(byImo(reversed));
  });

  it("does not touch vessel risk", () => {
    // Severity is operational urgency. Risk is a separate axis and this
    // layer has no business writing to it.
    const source = readSource("src/services/alerts/alert-reconciliation.ts");
    expect(source).not.toContain("riskLevel");
    expect(source).not.toContain("attentionScore");
  });

  it("performs no side effects at all", () => {
    const source = readSource("src/services/alerts/alert-reconciliation.ts");
    for (const forbidden of [
      "useState",
      "setInterval",
      "Audio",
      "navigateTo",
      "sgs.",
      "document.",
    ]) {
      expect(source, `reconciliation reaches for ${forbidden}`).not.toContain(forbidden);
    }
  });
});

function readSource(relative: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return fs
    .readFileSync(path.resolve(process.cwd(), relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/* ── The whole progression, one episode ──────────────────────────────── */

describe("SIM-0015 from 72 hours out to out of sight", () => {
  /*
   * The scenario the design exists for, run end to end. Everything that
   * must survive a five-step progression is asserted on the same alert
   * object rather than in isolation, because the failure this guards
   * against is cumulative: each step looks harmless and the officer's
   * acknowledgement is gone by T3.
   */
  const imo = "SIM-0015";
  const opobo = (over: Parameters<typeof entry>[1]) => entry(imo, over);

  it("keeps one alert, one episode, and the original reason throughout", () => {
    const t0 = opobo({ hours: 70, distanceNm: 400 });
    const first = reconcileVessel(t0, result([t0], 72), [], context);
    expect(first.kind).toBe("RAISE");
    if (first.kind !== "RAISE") return;

    // Apply T0 the way a caller would.
    let alert = raiseAlert({
      episode: first.episode,
      vessel: { imo, name: "Opobo Pioneer" },
      condition: first.condition,
      evidence: first.evidence,
      actor: "system",
      at: context.assessedAt,
    });
    const triggerAtRaise = alert.evidence;
    expect(alert.severity).toBe("WATCH");

    // The officer sees it and takes it on.
    const seen = transitionAlert({
      alertId: alert.id,
      from: "OPEN",
      to: "ACKNOWLEDGED",
      actor: "officer.a",
    });
    if (!seen.ok) return;
    alert = assignAlert(applyTransition(alert, seen.event), "officer.b", "officer.a");

    // T1 and T2 close in; T3 is closer again at the same urgency.
    const progression: readonly [number, string][] = [
      [40, "ATTENTION"],
      [18, "URGENT"],
    ];
    for (const [hours, severity] of progression) {
      const step = opobo({ hours });
      const outcome = reconcileVessel(step, result([step], 72), [asHeld(alert)], context);
      expect(outcome.kind).toBe("ESCALATE");
      if (outcome.kind !== "ESCALATE") return;
      alert = updateCurrentAssessment(
        escalateAlert(alert, outcome.to, "system"),
        outcome.assessment,
      );
      expect(alert.severity).toBe(severity);
    }

    const t3 = opobo({ hours: 11, distanceNm: 61 });
    const closer = reconcileVessel(t3, result([t3], 72), [asHeld(alert)], context);
    expect(closer.kind).toBe("UPDATE");
    if (closer.kind === "UPDATE") alert = updateCurrentAssessment(alert, closer.assessment);

    // T4: the feed can no longer support an assessment.
    const t4 = opobo({ basis: "UNAVAILABLE", hours: null, distanceNm: null });
    const lost = reconcileVessel(t4, result([t4], 72), [asHeld(alert)], context);
    expect(lost.kind).toBe("UNASSESSABLE");
    alert = markAssessmentUnavailable(alert, "system", "No usable arrival basis.");

    // T5: genuinely outside every threshold.
    const t5 = opobo({ hours: 300 });
    const ended = reconcileVessel(t5, result([t5], 72), [asHeld(alert)], context);
    expect(ended.kind).toBe("CONDITION_ENDED");

    /* Everything that had to survive, did. */
    expect(alert.id).toBe(first.kind === "RAISE" ? `alert_${imo}#1` : "");
    expect(alert.episode.sequence).toBe(1);
    // The reason it was raised is still 70 hours, not 11.
    expect(alert.evidence).toEqual(triggerAtRaise);
    expect(alert.evidence.hoursToBoundary).toBe(70);
    expect(alert.currentAssessment?.hoursToBoundary).toBe(11);
    // The officer's work survived five reassessments.
    expect(alert.state).toBe("ACKNOWLEDGED");
    expect(alert.acknowledgedBy).toBe("officer.a");
    expect(alert.assignedTo).toBe("officer.b");
    // Nothing resolved or closed it on the system's own authority.
    expect(alert.resolvedAt).toBeUndefined();
    expect(alert.closedAt).toBeUndefined();
    expect(alert.currentAssessmentUnavailable).toBe(true);
  });
});

/** The alert as the reconciler reads it. */
function asHeld(alert: ReturnType<typeof raiseAlert>): ReconcilableAlert {
  return {
    id: alert.id,
    episode: alert.episode,
    vessel: alert.vessel,
    condition: alert.condition,
    state: alert.state,
    currentAssessment: alert.currentAssessment,
  };
}
