/**
 * Persistence acceptance for the arrival alert domain.
 *
 * These run the real reconciliation engine against a real implementation
 * of the repository contract, so what they prove is the behaviour of the
 * coordinator and the contract rather than of a mock. The deterministic
 * scenario is the one the sprint specifies: SIM-0015 closing from 72
 * hours to 18, losing signal, ending its approach, being closed, and
 * approaching again.
 */
import { describe, expect, it } from "vitest";

import {
  InMemoryAlertRepository,
  persistFleetReconciliation,
  transitionAlert,
  alertEvent,
  type AlertEvidence,
  type AlertState,
  type StoredAlert,
} from "@/services/alerts";
import type { FleetApproachResult } from "@/services/geospatial/fleet-approach";
import type { Vessel } from "@/services/geospatial";

const IMO = "SIM-0015";
const NAME = "Opobo Pioneer";

function at(minute: number): string {
  return new Date(Date.parse("2026-08-28T09:00:00.000Z") + minute * 60_000).toISOString();
}

function vessel(imo = IMO): Vessel {
  return {
    identity: { imo, name: NAME },
    position: { lon: 3.4, lat: 5.2, heading: 90, speed: 12, timestamp: at(0) },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
  };
}

/**
 * A fleet result for one vessel at a given horizon.
 *
 * `hours: null` produces a genuinely unassessable entry — no basis, no
 * arrival — rather than a small number, which is the distinction most of
 * these tests turn on.
 */
function fleet(hours: number | null, options: { imo?: string; away?: boolean } = {}) {
  const imo = options.imo ?? IMO;
  const entry = {
    vessel: vessel(imo),
    assessment: {
      relation: options.away ? "DEPARTING" : "APPROACHING",
      hoursToBoundary: hours ?? undefined,
      distanceNm: hours == null ? 400 : hours * 10,
      basis: hours == null ? "UNAVAILABLE" : "ESTIMATED",
      accuracy: "APPROXIMATE",
      rationale: "Closing on the boundary at reported speed and course.",
    },
    positionAgeMs: 60_000,
  };
  return {
    approaching: hours == null || options.away ? [] : [entry],
    inside: [],
    unassessable: hours == null ? [entry] : options.away ? [entry] : [],
    thresholdHours: 72,
  } as unknown as FleetApproachResult;
}

const context = (minute: number) => ({ assessedAt: at(minute), sourceId: "simulated" });

async function repoWith(hours: number | null, minute = 0) {
  const repository = new InMemoryAlertRepository();
  await persistFleetReconciliation(fleet(hours), repository, context(minute));
  return repository;
}

async function activeAlert(repository: InMemoryAlertRepository): Promise<StoredAlert> {
  const active = await repository.listActive();
  expect(active).toHaveLength(1);
  return active[0];
}

/** Move an alert through the real lifecycle table and persist the result. */
async function officerMove(
  repository: InMemoryAlertRepository,
  alert: StoredAlert,
  to: AlertState,
  officerId = "officer-1",
  reason?: string,
) {
  const outcome = transitionAlert({
    alertId: alert.id,
    from: alert.state,
    to,
    actor: officerId,
    at: at(99),
  });
  if (!outcome.ok) throw new Error(outcome.reason);
  return repository.applyTransition({
    alertId: alert.id,
    expectedVersion: alert.version,
    event: outcome.event,
    officerId,
    reason,
  });
}

describe("the deterministic approach episode", () => {
  it("keeps one episode from 72 hours down to 18, escalating in place", async () => {
    const repository = new InMemoryAlertRepository();

    const t0 = await persistFleetReconciliation(fleet(70), repository, context(0));
    expect(t0.raised).toBe(1);
    const raised = await activeAlert(repository);
    expect(raised.condition).toBe("APPROACHING_72H");
    expect(raised.severity).toBe("WATCH");

    await persistFleetReconciliation(fleet(40), repository, context(15));
    await persistFleetReconciliation(fleet(20), repository, context(30));
    const t3 = await persistFleetReconciliation(fleet(18), repository, context(45));

    const alert = await activeAlert(repository);
    expect(alert.id).toBe(raised.id);
    expect(alert.episode).toEqual(raised.episode);
    expect(alert.condition).toBe("APPROACHING_24H");
    expect(alert.severity).toBe("URGENT");
    // Closing in escalates; it never raises a second alert.
    expect(t3.raised).toBe(0);
  });

  it("never rewrites the trigger evidence as the vessel closes", async () => {
    const repository = await repoWith(70);
    const trigger = (await activeAlert(repository)).evidence;

    await persistFleetReconciliation(fleet(40), repository, context(15));
    await persistFleetReconciliation(fleet(11), repository, context(30));

    const alert = await activeAlert(repository);
    expect(alert.evidence).toEqual(trigger);
    expect(alert.evidence.hoursToBoundary).toBe(70);
    // Where the vessel is now is a different question with a different
    // answer, and both must remain answerable.
    expect(alert.currentAssessment?.hoursToBoundary).toBe(11);
  });

  /*
   * Separate from the escalation case above, and the separation matters.
   * 70 → 40 → 11 crosses a threshold at every step, so it exercises only
   * the escalation path; a mutation that rewrote the trigger during a
   * plain assessment update passed that test untouched. Two horizons
   * inside one condition force the UPDATE path specifically.
   */
  it("never rewrites the trigger evidence on a plain assessment update", async () => {
    const repository = await repoWith(70);
    const trigger = (await activeAlert(repository)).evidence;

    const report = await persistFleetReconciliation(fleet(60), repository, context(15));

    expect(report.updated).toBe(1);
    expect(report.escalated).toBe(0);
    const alert = await activeAlert(repository);
    expect(alert.condition).toBe("APPROACHING_72H");
    expect(alert.evidence).toEqual(trigger);
    expect(alert.evidence.hoursToBoundary).toBe(70);
    expect(alert.currentAssessment?.hoursToBoundary).toBe(60);
  });

  it("records lost signal without resolving anything", async () => {
    const repository = await repoWith(18);
    const before = await activeAlert(repository);

    const report = await persistFleetReconciliation(fleet(null), repository, context(60));

    expect(report.unassessable).toBe(1);
    const alert = await activeAlert(repository);
    expect(alert.state).toBe("OPEN");
    expect(alert.currentAssessmentUnavailable).toBe(true);
    // Losing sight is not an all-clear, and the trigger stands.
    expect(alert.evidence).toEqual(before.evidence);
  });

  it("records lost signal once rather than on every cycle", async () => {
    const repository = await repoWith(18);
    await persistFleetReconciliation(fleet(null), repository, context(60));
    const afterFirst = (await activeAlert(repository)).events.length;

    await persistFleetReconciliation(fleet(null), repository, context(75));
    await persistFleetReconciliation(fleet(null), repository, context(90));

    // The moment sight was lost must stay findable, not be buried under
    // identical entries.
    expect((await activeAlert(repository)).events).toHaveLength(afterFirst);
  });

  it("reports an ended condition without resolving or closing", async () => {
    const repository = await repoWith(18);

    const report = await persistFleetReconciliation(
      fleet(90, { away: true }),
      repository,
      context(60),
    );

    expect([...report.outcomes.values()]).toContain("CONDITION_ENDED");
    const alert = await activeAlert(repository);
    // Only a person finishes an alert. The weather changing does not.
    expect(alert.state).toBe("OPEN");
  });

  it("gives a genuinely new approach the next sequence after closure", async () => {
    const repository = await repoWith(18);
    const first = await activeAlert(repository);

    const resolved = await officerMove(repository, first, "RESOLVED");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const closed = await officerMove(repository, resolved.value, "CLOSED");
    expect(closed.ok).toBe(true);

    await persistFleetReconciliation(fleet(60), repository, context(200));

    const next = await activeAlert(repository);
    expect(next.id).not.toBe(first.id);
    expect(next.episode.sequence).toBe(first.episode.sequence + 1);
    // The closed episode is untouched and still readable.
    const history = await repository.listByVessel(IMO);
    expect(history).toHaveLength(2);
    expect(history[0].state).toBe("CLOSED");
  });

  it("continues the sequence from the highest ever used, not from a count", async () => {
    const repository = new InMemoryAlertRepository();
    // Episodes 1 and 2 closed; 3 archived away entirely.
    for (const sequence of [1, 2, 4]) {
      await repository.raise({
        episode: { imo: IMO, sequence },
        condition: "APPROACHING_24H",
        severity: "URGENT",
        evidence: evidenceAt(18),
        at: at(0),
        actor: { type: "SYSTEM" },
      });
      const live = await repository.findActiveEpisode(IMO);
      if (live) {
        const resolved = await officerMove(repository, live, "RESOLVED");
        if (resolved.ok) await officerMove(repository, resolved.value, "CLOSED");
      }
    }

    expect(await repository.highestSequence(IMO)).toBe(4);
    await persistFleetReconciliation(fleet(18), repository, context(300));
    expect((await activeAlert(repository)).episode.sequence).toBe(5);
  });
});

function evidenceAt(hours: number): AlertEvidence {
  return {
    relation: "APPROACHING",
    thresholdHours: 72,
    hoursToBoundary: hours,
    distanceNm: hours * 10,
    arrivalBasis: "ESTIMATED",
    boundaryAccuracy: "APPROXIMATE",
    rationale: "Closing on the boundary.",
    sourceId: "simulated",
    observedAt: at(0),
    positionAgeMs: 60_000,
    assessedAt: at(0),
  };
}

describe("idempotency and recovery", () => {
  it("raises once however many times the same assessment is processed", async () => {
    const repository = new InMemoryAlertRepository();

    for (let i = 0; i < 5; i++) {
      await persistFleetReconciliation(fleet(18), repository, context(i * 15));
    }

    expect(await repository.listActive()).toHaveLength(1);
    const alert = await activeAlert(repository);
    // One RAISED and nothing else: an unchanged feed writes no events.
    expect(alert.events.filter((event) => event.type === "RAISED")).toHaveLength(1);
    expect(alert.events).toHaveLength(1);
  });

  it("converges rather than duplicating when another worker raised first", async () => {
    const repository = new InMemoryAlertRepository();
    // The lost race, exactly: the episode already exists when this pass
    // tries to create it.
    await repository.raise({
      episode: { imo: IMO, sequence: 1 },
      condition: "APPROACHING_24H",
      severity: "URGENT",
      evidence: evidenceAt(18),
      at: at(0),
      actor: { type: "SYSTEM" },
    });

    const write = await repository.raise({
      episode: { imo: IMO, sequence: 1 },
      condition: "APPROACHING_24H",
      severity: "URGENT",
      evidence: evidenceAt(18),
      at: at(1),
      actor: { type: "SYSTEM" },
    });

    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.reason).toBe("DUPLICATE_EPISODE");
    expect(await repository.listActive()).toHaveLength(1);
  });

  it("survives a retry after a response was lost", async () => {
    const repository = new InMemoryAlertRepository();
    // The write landed; the caller never heard, and runs the pass again.
    await persistFleetReconciliation(fleet(18), repository, context(0));
    const report = await persistFleetReconciliation(fleet(18), repository, context(0));

    expect(report.raised).toBe(0);
    expect(await repository.listActive()).toHaveLength(1);
  });
});

describe("optimistic concurrency", () => {
  it("refuses a write against a version that has moved", async () => {
    const repository = await repoWith(18);
    const asOfficerA = await activeAlert(repository);

    // Officer B acts first.
    const b = await officerMove(repository, asOfficerA, "ACKNOWLEDGED", "officer-b");
    expect(b.ok).toBe(true);

    // Officer A acts on the version they read.
    const a = await officerMove(repository, asOfficerA, "UNDER_REVIEW", "officer-a");

    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("VERSION_CONFLICT");
    // B's decision survives intact rather than being silently overwritten.
    const alert = await activeAlert(repository);
    expect(alert.state).toBe("ACKNOWLEDGED");
    expect(alert.acknowledgedBy).toBe("officer-b");
  });

  it("increments the version on every write", async () => {
    const repository = await repoWith(70);
    const first = await activeAlert(repository);
    expect(first.version).toBe(1);

    await persistFleetReconciliation(fleet(40), repository, context(15));

    expect((await activeAlert(repository)).version).toBe(2);
  });
});

describe("officer state survives reconciliation", () => {
  it("keeps an acknowledgement through later reassessments", async () => {
    const repository = await repoWith(70);
    const acked = await officerMove(repository, await activeAlert(repository), "ACKNOWLEDGED");
    expect(acked.ok).toBe(true);

    await persistFleetReconciliation(fleet(40), repository, context(15));
    await persistFleetReconciliation(fleet(18), repository, context(30));

    const alert = await activeAlert(repository);
    expect(alert.state).toBe("ACKNOWLEDGED");
    expect(alert.acknowledgedBy).toBe("officer-1");
    // Escalation raised the urgency and left the acknowledgement alone.
    expect(alert.severity).toBe("URGENT");
  });

  it("keeps an assignment through later reassessments", async () => {
    const repository = await repoWith(70);
    const alert = await activeAlert(repository);
    const assigned = await repository.assign({
      alertId: alert.id,
      expectedVersion: alert.version,
      event: alertEvent(alert.id, "ASSIGNED", "officer-1", { at: at(5) }),
      officerId: "officer-1",
      assignee: "officer-2",
    });
    expect(assigned.ok).toBe(true);

    await persistFleetReconciliation(fleet(18), repository, context(30));

    expect((await activeAlert(repository)).assignedTo).toBe("officer-2");
  });

  it("appends notes rather than replacing them", async () => {
    const repository = await repoWith(18);
    let alert = await activeAlert(repository);

    for (const text of ["Contacted agent.", "Awaiting corrected paperwork."]) {
      const write = await repository.addNote({
        alertId: alert.id,
        expectedVersion: alert.version,
        event: alertEvent(alert.id, "NOTE_ADDED", "officer-1", { at: at(5), note: text }),
        officerId: "officer-1",
      });
      expect(write.ok).toBe(true);
      if (write.ok) alert = write.value;
    }

    const notes = alert.events.filter((event) => event.type === "NOTE_ADDED");
    expect(notes.map((note) => note.note)).toEqual([
      "Contacted agent.",
      "Awaiting corrected paperwork.",
    ]);
  });

  it("records who resolved and why, and keeps the alert readable", async () => {
    const repository = await repoWith(18);
    const resolved = await officerMove(
      repository,
      await activeAlert(repository),
      "RESOLVED",
      "officer-7",
      "Boarded and cleared at anchorage.",
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.resolvedBy).toBe("officer-7");
    expect(resolved.value.resolutionReason).toBe("Boarded and cleared at anchorage.");
    expect(await repository.listActive()).toHaveLength(0);
    // Resolved is not deleted.
    expect(await repository.listByVessel(IMO)).toHaveLength(1);
  });

  it("keeps a closed alert terminal against reconciliation", async () => {
    const repository = await repoWith(18);
    const resolved = await officerMove(repository, await activeAlert(repository), "RESOLVED");
    if (!resolved.ok) throw new Error("resolve failed");
    const closed = await officerMove(repository, resolved.value, "CLOSED");
    if (!closed.ok) throw new Error("close failed");

    // A new approach raises a new episode and must not touch this record.
    await persistFleetReconciliation(fleet(18), repository, context(200));

    const stored = await repository.getAlert(closed.value.id);
    expect(stored?.state).toBe("CLOSED");
    expect(stored?.events).toEqual(closed.value.events);
  });
});

describe("events and attribution", () => {
  it("attributes reconciliation to the system, never to a person", async () => {
    const repository = await repoWith(70);
    await persistFleetReconciliation(fleet(18), repository, context(30));

    const alert = await activeAlert(repository);
    const automated = alert.events.filter(
      (event) => event.type === "RAISED" || event.type === "ESCALATED",
    );
    expect(automated.length).toBeGreaterThan(0);
    for (const event of automated) expect(event.actor).toBe("SYSTEM");
  });

  it("keeps the whole event history retrievable", async () => {
    const repository = await repoWith(70);
    await persistFleetReconciliation(fleet(18), repository, context(30));
    const alert = await activeAlert(repository);
    await officerMove(repository, alert, "ACKNOWLEDGED");

    const events = await repository.events(alert.id);
    expect(events.map((event) => event.type)).toEqual(["RAISED", "ESCALATED", "TRANSITIONED"]);
  });
});

describe("provenance is preserved across a source change", () => {
  it("keeps the episode and the trigger when the provider changes", async () => {
    const repository = await repoWith(70);
    const trigger = (await activeAlert(repository)).evidence;
    expect(trigger.sourceId).toBe("simulated");

    await persistFleetReconciliation(fleet(18), repository, {
      assessedAt: at(30),
      sourceId: "live-provider",
    });

    const alert = await activeAlert(repository);
    // Identity is the hull, not the feed.
    expect(alert.episode.sequence).toBe(1);
    expect(alert.evidence.sourceId).toBe("simulated");
    expect(alert.currentAssessment?.sourceId).toBe("live-provider");
  });

  it("never upgrades an unavailable arrival into an estimate", async () => {
    const repository = await repoWith(null);

    // Nothing was assessable, so nothing may be alerted on.
    expect(await repository.listActive()).toHaveLength(0);
  });

  it("keeps the boundary approximate", async () => {
    const repository = await repoWith(18);

    expect((await activeAlert(repository)).evidence.boundaryAccuracy).toBe("APPROXIMATE");
  });
});
