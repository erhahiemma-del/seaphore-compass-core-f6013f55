/**
 * Sprint 10 · Policy Engine — end-to-end tests.
 * Covers RBAC × 5 workflows × 4 roles, escalation + approval,
 * rate limiting, conflict blocking, immutable audit trail, and
 * integration with the Sprint 9 WorkflowEngine.
 */
import { describe, expect, it } from "vitest";
import {
  PolicyEngine,
  createMemoryConflictDetector,
  createMemoryRateLimitStore,
  HOURLY_LIMITS,
  ROLE_PERMISSIONS,
  WORKFLOW_PERMISSION,
  type ApprovalToken,
} from "@/services/policy";
import { WORKFLOW_IDS, WorkflowEngine, type OfficerContext, type WorkflowId } from "@/services/workflows";

const OFFICERS: Record<string, OfficerContext> = {
  admin: { officerId: "u_admin", officerName: "Admin", role: "administrator" },
  director: { officerId: "u_dir", officerName: "Dir", role: "director" },
  officer: { officerId: "u_off", officerName: "Off", role: "officer" },
  analyst: { officerId: "u_an", officerName: "An", role: "analyst" },
};

function inputFor(w: WorkflowId): Record<string, unknown> {
  switch (w) {
    case "open_investigation": return { title: "Test case", vesselId: "IMO0001" };
    case "notify_customs": return { subject: "S", body: "B" };
    case "request_manifest": return { vesselId: "IMO0001", ref: "MAN-1" };
    case "assign_officer": return { caseId: "CASE-1", officerId: "u_off" };
    case "freeze_clearance": return { vesselId: "IMO0001", reason: "Reasonable cause" };
  }
}

describe("Sprint 10 · RBAC matrix — every role × every workflow", () => {
  for (const w of WORKFLOW_IDS) {
    for (const role of Object.keys(OFFICERS) as Array<keyof typeof OFFICERS>) {
      it(`${role} vs ${w}`, () => {
        const engine = new PolicyEngine();
        const d = engine.evaluate({ workflow: w, officer: OFFICERS[role], input: inputFor(w) });
        const hasPerm = ROLE_PERMISSIONS[OFFICERS[role].role].has(WORKFLOW_PERMISSION[w]);
        if (!hasPerm) {
          expect(d.outcome).toBe("deny_permission");
          expect(d.allowed).toBe(false);
        } else {
          // Officers hit escalation for assign/freeze; otherwise allow.
          const needsApproval = role === "officer" && (w === "assign_officer" || w === "freeze_clearance");
          expect(d.outcome).toBe(needsApproval ? "escalate" : "allow");
        }
      });
    }
  }
});

describe("Sprint 10 · escalation & approval", () => {
  it("officer freezing clearance without approval → escalate", () => {
    const engine = new PolicyEngine();
    const d = engine.evaluate({
      workflow: "freeze_clearance",
      officer: OFFICERS.officer,
      input: inputFor("freeze_clearance"),
    });
    expect(d.outcome).toBe("escalate");
    expect(d.reason).toMatch(/approval/i);
    expect(d.meta?.approverRoles).toEqual(["director", "administrator"]);
  });

  it("officer freezing clearance with valid director approval → allow", () => {
    const engine = new PolicyEngine();
    const approval: ApprovalToken = {
      grantedBy: OFFICERS.director.officerId,
      grantedByRole: "director",
      grantedAt: new Date().toISOString(),
      workflow: "freeze_clearance",
    };
    const d = engine.evaluate({
      workflow: "freeze_clearance",
      officer: OFFICERS.officer,
      input: inputFor("freeze_clearance"),
      approval,
    });
    expect(d.outcome).toBe("allow");
  });

  it("approval token from an analyst is rejected", () => {
    const engine = new PolicyEngine();
    const approval: ApprovalToken = {
      grantedBy: "u_an",
      grantedByRole: "analyst",
      grantedAt: new Date().toISOString(),
      workflow: "freeze_clearance",
    };
    const d = engine.evaluate({
      workflow: "freeze_clearance",
      officer: OFFICERS.officer,
      input: inputFor("freeze_clearance"),
      approval,
    });
    expect(d.outcome).toBe("escalate");
  });
});

describe("Sprint 10 · rate limiting", () => {
  it("blocks the (limit+1)-th call within the hour", () => {
    const engine = new PolicyEngine({ rateLimits: createMemoryRateLimitStore() });
    const limit = HOURLY_LIMITS.freeze_clearance!;
    for (let i = 0; i < limit; i++) {
      const d = engine.evaluate({
        workflow: "freeze_clearance",
        officer: OFFICERS.director,
        input: { vesselId: `IMO000${i}`, reason: "cause" },
      });
      expect(d.outcome).toBe("allow");
    }
    const blocked = engine.evaluate({
      workflow: "freeze_clearance",
      officer: OFFICERS.director,
      input: { vesselId: "IMO9999", reason: "cause" },
    });
    expect(blocked.outcome).toBe("rate_limited");
    expect(blocked.reason).toMatch(/hourly limit/i);
  });

  it("probe() does not consume the budget", () => {
    const engine = new PolicyEngine();
    for (let i = 0; i < 100; i++) {
      engine.probe({ workflow: "freeze_clearance", officer: OFFICERS.director, input: inputFor("freeze_clearance") });
    }
    const d = engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.director, input: inputFor("freeze_clearance") });
    expect(d.outcome).toBe("allow");
  });

  it("windows roll — after WINDOW_MS the counter is empty", () => {
    let t = 0;
    const engine = new PolicyEngine({
      rateLimits: createMemoryRateLimitStore(),
      now: () => new Date(t),
    });
    const limit = HOURLY_LIMITS.freeze_clearance!;
    for (let i = 0; i < limit; i++) {
      expect(engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.director, input: inputFor("freeze_clearance") }).outcome).toBe("allow");
      t += 1000;
    }
    expect(engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.director, input: inputFor("freeze_clearance") }).outcome).toBe("rate_limited");
    t += 60 * 60 * 1000 + 1;
    expect(engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.director, input: inputFor("freeze_clearance") }).outcome).toBe("allow");
  });
});

describe("Sprint 10 · conflict detection", () => {
  it("blocks freeze_clearance when the vessel already has a hold", () => {
    const conflicts = createMemoryConflictDetector();
    conflicts.registerActiveHold("IMO0001", "CASE-42");
    const engine = new PolicyEngine({ conflicts });
    const d = engine.evaluate({
      workflow: "freeze_clearance",
      officer: OFFICERS.director,
      input: inputFor("freeze_clearance"),
    });
    expect(d.outcome).toBe("conflict");
    expect(d.reason).toMatch(/already has an active hold/);
    expect(d.meta?.conflictWith).toBe("CASE-42");
  });

  it("releases when the hold is cleared", () => {
    const conflicts = createMemoryConflictDetector();
    conflicts.registerActiveHold("IMO0001", "CASE-42");
    const engine = new PolicyEngine({ conflicts });
    conflicts.release("IMO0001");
    const d = engine.evaluate({
      workflow: "freeze_clearance",
      officer: OFFICERS.director,
      input: inputFor("freeze_clearance"),
    });
    expect(d.outcome).toBe("allow");
  });
});

describe("Sprint 10 · audit trail (immutable)", () => {
  it("records every decision, including denials and escalations", () => {
    const engine = new PolicyEngine();
    engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.analyst, input: inputFor("freeze_clearance") });
    engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.officer, input: inputFor("freeze_clearance") });
    engine.evaluate({ workflow: "freeze_clearance", officer: OFFICERS.director, input: inputFor("freeze_clearance") });

    const audit = engine.audit.all();
    expect(audit.map((d) => d.outcome)).toEqual(["deny_permission", "escalate", "allow"]);
    // Immutability
    expect(() => {
      (audit[0] as { outcome: string }).outcome = "allow";
    }).toThrow();
  });
});

describe("Sprint 10 · integration with Sprint 9 WorkflowEngine", () => {
  it("PolicyEngine drops in via the .can() adapter and blocks unauthorised runs", async () => {
    const policy = new PolicyEngine();
    const wf = new WorkflowEngine({ policy });
    const denied = await wf.trigger({
      workflow: "freeze_clearance",
      officer: OFFICERS.analyst,
      input: inputFor("freeze_clearance"),
    });
    expect(denied.status).toBe("denied");
    expect(policy.audit.all()).toHaveLength(1);
    expect(policy.audit.all()[0].outcome).toBe("deny_permission");

    const allowed = await wf.trigger({
      workflow: "freeze_clearance",
      officer: OFFICERS.director,
      input: inputFor("freeze_clearance"),
    });
    expect(allowed.status).toBe("completed");
  });
});
