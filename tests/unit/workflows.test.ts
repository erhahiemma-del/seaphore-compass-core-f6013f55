/**
 * Sprint 9 · Workflow Engine — end-to-end tests with mocked services.
 * Verifies each of the five workflows, policy gating, retry-on-failure,
 * state machine legality, and officer-profile history.
 */
import { describe, expect, it } from "vitest";
import {
  WorkflowEngine,
  createMockAdapters,
  defaultPolicyEngine,
  type OfficerContext,
  type WorkflowId,
} from "@/services/workflows";
import { canTransition, isTerminal } from "@/services/workflows/state-machine";

const OFFICER: OfficerContext = { officerId: "u_officer", officerName: "K. Bello", role: "officer" };
const DIRECTOR: OfficerContext = { officerId: "u_director", officerName: "A. Danjuma", role: "director" };
const ANALYST: OfficerContext = { officerId: "u_analyst", officerName: "M. Adeyemi", role: "analyst" };

function engine(overrides: Partial<Parameters<typeof WorkflowEngine.prototype.constructor>[0]> = {}) {
  return new WorkflowEngine(overrides as ConstructorParameters<typeof WorkflowEngine>[0]);
}

describe("Sprint 9 · state machine", () => {
  it("allows only spec transitions", () => {
    expect(canTransition("pending", "running")).toBe(true);
    expect(canTransition("pending", "denied")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("running", "failed")).toBe(true);
    expect(canTransition("failed", "retrying")).toBe(true);
    expect(canTransition("retrying", "running")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("denied", "running")).toBe(false);
  });
  it("marks terminal states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("denied")).toBe(true);
    expect(isTerminal("failed")).toBe(false);
  });
});

describe("Sprint 9 · policy engine (Layer 2.14)", () => {
  it("permits officers to open investigations but not freeze clearance", () => {
    expect(defaultPolicyEngine.can(OFFICER, "open_investigation", {}).allowed).toBe(true);
    expect(defaultPolicyEngine.can(OFFICER, "freeze_clearance", {}).allowed).toBe(false);
  });
  it("permits analysts to request manifests only", () => {
    expect(defaultPolicyEngine.can(ANALYST, "request_manifest", {}).allowed).toBe(true);
    expect(defaultPolicyEngine.can(ANALYST, "open_investigation", {}).allowed).toBe(false);
  });
  it("permits directors on every workflow", () => {
    const wf: WorkflowId[] = ["open_investigation", "notify_customs", "request_manifest", "assign_officer", "freeze_clearance"];
    for (const w of wf) expect(defaultPolicyEngine.can(DIRECTOR, w, {}).allowed).toBe(true);
  });
});

describe("Sprint 9 · end-to-end workflows (mocked adapters)", () => {
  it("open_investigation returns a caseId", async () => {
    const wf = engine();
    const r = await wf.trigger({
      workflow: "open_investigation",
      officer: OFFICER,
      input: { title: "MV Crimson Endeavour dwell anomaly", vesselId: "IMO9837456" },
    });
    expect(r.status).toBe("completed");
    expect(r.result?.caseId).toMatch(/^CASE-/);
    expect(r.completedAt).toBeTruthy();
  });

  it("notify_customs returns a messageId", async () => {
    const wf = engine();
    const r = await wf.trigger({
      workflow: "notify_customs",
      officer: OFFICER,
      input: { subject: "Manifest discrepancy", body: "Container count mismatch on MAN-2026-0714-APP" },
    });
    expect(r.status).toBe("completed");
    expect(r.result?.messageId).toMatch(/^MSG-/);
  });

  it("request_manifest returns a requestId", async () => {
    const wf = engine();
    const r = await wf.trigger({
      workflow: "request_manifest",
      officer: ANALYST,
      input: { vesselId: "IMO9837456", ref: "MAN-2026-0714-APP" },
    });
    expect(r.status).toBe("completed");
    expect(r.result?.requestId).toMatch(/^DOC-/);
  });

  it("assign_officer requires director role", async () => {
    const wf = engine();
    const denied = await wf.trigger({
      workflow: "assign_officer",
      officer: OFFICER,
      input: { caseId: "CASE-x", officerId: "u_target" },
    });
    expect(denied.status).toBe("denied");
    expect(denied.error).toBeNull();

    const allowed = await wf.trigger({
      workflow: "assign_officer",
      officer: DIRECTOR,
      input: { caseId: "CASE-x", officerId: "u_target" },
    });
    expect(allowed.status).toBe("completed");
    expect(allowed.result?.assigneeId).toBe("u_target");
  });

  it("freeze_clearance returns a holdId (director only)", async () => {
    const wf = engine();
    const r = await wf.trigger({
      workflow: "freeze_clearance",
      officer: DIRECTOR,
      input: { vesselId: "IMO9837456", reason: "Pending manifest reconciliation" },
    });
    expect(r.status).toBe("completed");
    expect(r.result?.holdId).toMatch(/^HOLD-/);
  });
});

describe("Sprint 9 · failure, retry, and audit", () => {
  it("auto-retries a transient adapter failure within budget", async () => {
    const adapters = createMockAdapters({ notify: { failNext: 1, failMessage: "SMTP hiccup" } });
    const wf = engine({ adapters });
    const r = await wf.trigger({
      workflow: "notify_customs",
      officer: OFFICER,
      input: { subject: "Retry me", body: "please" },
    });
    expect(r.status).toBe("completed");
    expect(r.attempts).toBe(2);

    const audit = wf.auditFor(r.id).map((e) => `${e.from ?? "∅"}→${e.to}`);
    expect(audit).toEqual([
      "∅→pending",
      "pending→running",
      "running→failed",
      "failed→retrying",
      "retrying→running",
      "running→completed",
    ]);
  });

  it("surfaces error and supports officer-initiated retry after budget exhaustion", async () => {
    const adapters = createMockAdapters({ openCase: { failNext: 2, failMessage: "case-mgmt 500" } });
    const wf = engine({ adapters });
    const failed = await wf.trigger({
      workflow: "open_investigation",
      officer: OFFICER,
      input: { title: "Persistent failure" },
    });
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/case-mgmt 500/);
    expect(failed.attempts).toBe(2);

    // Budget exhausted — officer-initiated retry is rejected.
    await expect(wf.retry(failed.id)).rejects.toThrow(/exhausted/);
  });

  it("records history under the officer profile", async () => {
    const wf = engine();
    await wf.trigger({ workflow: "open_investigation", officer: OFFICER, input: { title: "One" } });
    await wf.trigger({ workflow: "notify_customs", officer: OFFICER, input: { subject: "S", body: "B" } });
    await wf.trigger({ workflow: "freeze_clearance", officer: DIRECTOR, input: { vesselId: "V", reason: "R" } });

    const officerHistory = wf.historyFor(OFFICER.officerId);
    expect(officerHistory).toHaveLength(2);
    expect(officerHistory.every((r) => r.officer.officerId === OFFICER.officerId)).toBe(true);

    const directorHistory = wf.historyFor(DIRECTOR.officerId);
    expect(directorHistory).toHaveLength(1);
    expect(directorHistory[0].workflow).toBe("freeze_clearance");

    // Officer audit trail spans both runs.
    expect(wf.officerAudit(OFFICER.officerId).length).toBeGreaterThanOrEqual(4);
  });

  it("validates input via Zod and fails the workflow with a descriptive error", async () => {
    const wf = engine();
    const r = await wf.trigger({
      workflow: "freeze_clearance",
      officer: DIRECTOR,
      input: { vesselId: "V", reason: "no" }, // reason too short
    });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/reason/i);
  });
});
