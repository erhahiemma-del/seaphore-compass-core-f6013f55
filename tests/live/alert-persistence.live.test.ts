/**
 * Live durability proof for the arrival alert domain.
 *
 * Not a unit test and deliberately not in `tests/unit`: it writes to the
 * real project database as a real signed-in officer, so it needs a session
 * and network and must never run in the offline suite. What it proves is
 * the one thing an in-memory suite cannot — that an acknowledgement, an
 * escalation, a resolution and a closure are still there when the record
 * is read back through a *different* repository instance, which is what a
 * browser reload is from the database's point of view.
 *
 * Every assertion goes through the production `SupabaseAlertRepository`.
 * A test that reached for SQL directly would prove the tables work and
 * say nothing about whether the application uses them correctly.
 *
 * @vitest-environment jsdom
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import {
  SupabaseAlertRepository,
  transitionAlert,
  type AlertEvidence,
  type StoredAlert,
} from "@/services/alerts";

const SESSION_FILE = process.env.SEAPHORE_LIVE_SESSION ?? "/root/.cache/lovable-auth/session.json";

/**
 * Whether a signed-in session is available to run against.
 *
 * The path above exists only inside the environment that provisions it,
 * so on every other machine this file used to throw inside `beforeAll` —
 * which failed the whole suite, and with it the pre-commit hook, for
 * anyone who did not have those credentials. A test that needs a live
 * database and a real officer must skip when it has neither, not fail:
 * absent credentials are not a broken build.
 *
 * Override the location with SEAPHORE_LIVE_SESSION to run it elsewhere.
 */
const HAS_SESSION = existsSync(SESSION_FILE);

/** A hull nobody else uses, so a rerun cannot collide with real data. */
const IMO = `TEST${Date.now()}`;

let officerId = "";

function evidence(hours: number, at = new Date().toISOString()): AlertEvidence {
  return {
    relation: "OUTSIDE",
    thresholdHours: 72,
    hoursToBoundary: hours,
    distanceNm: hours * 12,
    arrivalBasis: "SOG_PROJECTION",
    boundaryAccuracy: "EEZ_OUTLINE",
    rationale: `${hours}h to boundary at current speed`,
    sourceId: "simulated",
    observedAt: at,
    positionAgeMs: 30_000,
    assessedAt: at,
  } as AlertEvidence;
}

/** A brand-new repository — the reload, as the database experiences it. */
function reload(): SupabaseAlertRepository {
  return new SupabaseAlertRepository();
}

function unwrap(result: { ok: boolean } & Record<string, unknown>): StoredAlert {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result["value"] as StoredAlert;
}

beforeAll(async () => {
  if (!HAS_SESSION) return;
  const session = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as {
    access_token?: string;
    refresh_token?: string;
    session?: { access_token: string; refresh_token: string };
  };
  const tokens = session.session ?? (session as { access_token: string; refresh_token: string });
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  expect(error).toBeNull();
  officerId = data.user?.id ?? "";
  expect(officerId).not.toBe("");
});

describe.skipIf(!HAS_SESSION)("durable arrival alert persistence", () => {
  let alertId = "";
  let sequence = 0;

  it("PHASE 9 — raises an episode that exists in the database", async () => {
    const repo = reload();
    sequence = (await repo.highestSequence(IMO)) + 1;
    const raised = unwrap(
      (await repo.raise({
        episode: { imo: IMO, sequence },
        vesselName: "SIM Approach Fixture",
        condition: "APPROACHING_72H",
        severity: "WATCH",
        evidence: evidence(70),
        at: new Date().toISOString(),
        actor: { type: "SYSTEM" },
      })) as never,
    );
    alertId = raised.id;

    expect(raised.state).toBe("OPEN");
    expect(raised.severity).toBe("WATCH");
    expect(raised.episode.sequence).toBe(sequence);
    expect(raised.evidence.hoursToBoundary).toBe(70);
    expect(raised.version).toBe(1);
    // The RAISED event is a system action and must not name a person.
    expect(raised.events.map((e) => e.type)).toContain("RAISED");
    expect(raised.events[0]?.actor).toBe("SYSTEM");
  });

  it("PHASE 10 — acknowledgement survives a reload", async () => {
    const before = await reload().getAlert(alertId);
    expect(before).not.toBeNull();
    const move = transitionAlert({
      alertId,
      from: before!.state,
      to: "ACKNOWLEDGED",
      actor: officerId,
    });
    expect(move.ok).toBe(true);

    const acked = unwrap(
      (await reload().applyTransition({
        alertId,
        expectedVersion: before!.version,
        event: (move as { event: never }).event,
        officerId,
      })) as never,
    );
    expect(acked.state).toBe("ACKNOWLEDGED");

    // The reload. A different instance, a fresh read, no shared memory.
    const after = await reload().getAlert(alertId);
    expect(after!.id).toBe(alertId);
    expect(after!.state).toBe("ACKNOWLEDGED");
    expect(after!.acknowledgedBy).toBe(officerId);
    expect(after!.acknowledgedAt).toBe(acked.acknowledgedAt);
    expect(after!.episode.sequence).toBe(sequence);
    expect(after!.evidence.hoursToBoundary).toBe(70);
  });

  it("PHASES 11-13 — reassessment moves the current view, never the trigger", async () => {
    const repo = reload();
    const held = (await repo.getAlert(alertId))!;
    const mid = unwrap(
      (await repo.updateAssessment({
        alertId,
        expectedVersion: held.version,
        assessment: evidence(40),
        at: new Date().toISOString(),
      })) as never,
    );
    expect(mid.evidence.hoursToBoundary).toBe(70);
    expect(mid.currentAssessment?.hoursToBoundary).toBe(40);
    // Acknowledgement is not disturbed by a system reassessment.
    expect(mid.state).toBe("ACKNOWLEDGED");
    expect(mid.acknowledgedBy).toBe(officerId);

    const escalated = unwrap(
      (await reload().escalate({
        alertId,
        expectedVersion: mid.version,
        condition: "APPROACHING_24H",
        severity: "URGENT",
        from: "APPROACHING_72H",
        assessment: evidence(11),
        at: new Date().toISOString(),
      })) as never,
    );
    expect(escalated.severity).toBe("URGENT");

    const after = await reload().getAlert(alertId);
    expect(after!.severity).toBe("URGENT");
    expect(after!.condition).toBe("APPROACHING_24H");
    expect(after!.evidence.hoursToBoundary).toBe(70);
    expect(after!.currentAssessment?.hoursToBoundary).toBe(11);
    expect(after!.state).toBe("ACKNOWLEDGED");
    expect(after!.episode.sequence).toBe(sequence);
  });

  it("PHASE 14 — a note is appended and attributed to the officer", async () => {
    const held = (await reload().getAlert(alertId))!;
    const noted = unwrap(
      (await reload().addNote({
        alertId,
        expectedVersion: held.version,
        officerId,
        event: {
          id: "local",
          alertId,
          type: "NOTE_ADDED",
          actor: officerId,
          at: new Date().toISOString(),
          note: "Boarding team briefed.",
        },
      })) as never,
    );
    expect(noted.events.some((e) => e.note === "Boarding team briefed.")).toBe(true);

    const events = await reload().events(alertId);
    const note = events.find((e) => e.type === "NOTE_ADDED");
    expect(note?.actor).toBe(officerId);
    expect(events.filter((e) => e.type === "ESCALATED")[0]?.actor).toBe("SYSTEM");
  });

  it("PHASE 20 — a stale version is refused, not silently applied", async () => {
    const held = (await reload().getAlert(alertId))!;
    const stale = held.version - 1;
    const result = await reload().updateAssessment({
      alertId,
      expectedVersion: stale,
      assessment: evidence(9),
      at: new Date().toISOString(),
    });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBe("VERSION_CONFLICT");
    // The refused write left nothing behind.
    expect((await reload().getAlert(alertId))!.currentAssessment?.hoursToBoundary).not.toBe(9);
  });

  it("PHASE 19 — two concurrent raises cannot open two active episodes", async () => {
    const imo = `${IMO}X`;
    const at = new Date().toISOString();
    const input = {
      episode: { imo, sequence: 1 },
      condition: "APPROACHING_48H" as const,
      severity: "ATTENTION" as const,
      evidence: evidence(45),
      at,
      actor: { type: "SYSTEM" as const },
    };
    const [a, b] = await Promise.all([reload().raise(input), reload().raise(input)]);
    const wins = [a, b].filter((r) => r.ok);
    const losses = [a, b].filter((r) => !r.ok);
    expect(wins).toHaveLength(1);
    expect((losses[0] as { reason: string }).reason).toBe("DUPLICATE_EPISODE");

    const active = await reload().listByVessel(imo);
    expect(active.filter((x) => x.state === "OPEN")).toHaveLength(1);
  });

  it("PHASES 16-18 — resolution, closure and a new episode are all durable", async () => {
    const held = (await reload().getAlert(alertId))!;
    const toResolved = transitionAlert({
      alertId,
      from: held.state,
      to: "RESOLVED",
      actor: officerId,
    });
    const resolved = unwrap(
      (await reload().applyTransition({
        alertId,
        expectedVersion: held.version,
        event: (toResolved as { event: never }).event,
        officerId,
        reason: "Cleared by port state control.",
      })) as never,
    );
    expect(resolved.state).toBe("RESOLVED");
    expect((await reload().getAlert(alertId))!.state).toBe("RESOLVED");

    const toClosed = transitionAlert({ alertId, from: "RESOLVED", to: "CLOSED", actor: officerId });
    const closed = unwrap(
      (await reload().applyTransition({
        alertId,
        expectedVersion: resolved.version,
        event: (toClosed as { event: never }).event,
        officerId,
        reason: "Filed.",
      })) as never,
    );
    expect(closed.state).toBe("CLOSED");

    const afterReload = (await reload().getAlert(alertId))!;
    expect(afterReload.state).toBe("CLOSED");
    expect(afterReload.closedBy).toBe(officerId);
    // Closed is terminal, and the record is still readable.
    expect(afterReload.evidence.hoursToBoundary).toBe(70);
    // No active episode remains for the hull, so the index is free again.
    expect(await reload().findActiveEpisode(IMO)).toBeNull();

    // PHASE 18 — the next approach is a new, higher-numbered episode.
    const next = (await reload().highestSequence(IMO)) + 1;
    expect(next).toBe(sequence + 1);
    const fresh = unwrap(
      (await reload().raise({
        episode: { imo: IMO, sequence: next },
        condition: "APPROACHING_48H",
        severity: "ATTENTION",
        evidence: evidence(46),
        at: new Date().toISOString(),
        actor: { type: "SYSTEM" },
      })) as never,
    );
    expect(fresh.id).not.toBe(alertId);
    expect(fresh.episode.sequence).toBe(sequence + 1);
    expect(fresh.state).toBe("OPEN");

    const history = await reload().listByVessel(IMO);
    expect(history.map((h) => h.state)).toContain("CLOSED");
    expect(history.map((h) => h.state)).toContain("OPEN");
  });

  it("PHASE 21 — an unassessable pass is recorded, never resolved", async () => {
    const active = (await reload().findActiveEpisode(IMO))!;
    const marked = unwrap(
      (await reload().markAssessmentUnavailable({
        alertId: active.id,
        expectedVersion: active.version,
        reason: "Position older than the staleness horizon.",
        at: new Date().toISOString(),
      })) as never,
    );
    expect(marked.currentAssessmentUnavailable).toBe(true);
    const after = (await reload().getAlert(active.id))!;
    expect(after.currentAssessmentUnavailable).toBe(true);
    expect(after.state).toBe("OPEN");
    expect(after.evidence.hoursToBoundary).toBe(46);
    expect(after.events.some((e) => e.type === "EVIDENCE_STALE")).toBe(true);
  });

  it("PHASE 24 — the active list is one query, events included", async () => {
    let requests = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      requests += 1;
      return realFetch(...args);
    }) as typeof fetch;
    try {
      const list = await reload().listActive();
      expect(list.length).toBeGreaterThan(0);
      // One round trip regardless of how many alerts came back.
      expect(requests).toBe(1);
      expect(list.every((a) => a.events.length > 0)).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
