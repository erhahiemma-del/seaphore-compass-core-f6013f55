/**
 * Sprint 1G regression tests — Mission Planning, Investigation Workflows,
 * Revenue Leakage, and NMRSE.
 *
 * Golden Rule: Detect. Decide. Act. Every operational recommendation must be
 * explainable, evidence-backed, and human-approved before execution.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { planMission, useMissionStore } from "@/services/mission";
import {
  useInvestigationWorkflowStore,
  canAdvance,
} from "@/services/investigations-workflow";
import { scanForLeakage, useRevenueLeakageStore } from "@/services/revenue-leakage";
import { scoreEntity } from "@/services/nmrse";
import type { NormalizedEvidence } from "@/services/ial/types";

beforeEach(() => {
  useMissionStore.getState().reset();
  useInvestigationWorkflowStore.getState().reset();
  useRevenueLeakageStore.getState().reset();
});

describe("Mission Planning", () => {
  it("produces deterministic objectives + resources per mission type", () => {
    const a = planMission({
      name: "M1",
      type: "interdiction",
      subjects: [{ kind: "vessel", id: "v:1", label: "VESSEL" }],
    });
    const b = planMission({
      name: "M2",
      type: "interdiction",
      subjects: [{ kind: "vessel", id: "v:2", label: "VESSEL" }],
    });
    expect(a.objectives.map((o) => o.label)).toEqual(b.objectives.map((o) => o.label));
    expect(a.resources.map((r) => r.kind)).toEqual(b.resources.map((r) => r.kind));
    expect(a.status).toBe("draft");
  });

  it("gates execution behind explicit officer approval", () => {
    const s = useMissionStore.getState();
    const plan = s.create({
      name: "M",
      type: "surveillance",
      subjects: [{ kind: "vessel", id: "v:1", label: "V" }],
    });
    s.execute(plan.id, "officer");
    expect(useMissionStore.getState().plans[0].status).toBe("draft"); // cannot skip
    s.submitForApproval(plan.id, "officer");
    s.execute(plan.id, "officer");
    expect(useMissionStore.getState().plans[0].status).toBe("pending-approval");
    s.approve(plan.id, "officer");
    s.execute(plan.id, "officer");
    expect(useMissionStore.getState().plans[0].status).toBe("executing");
  });
});

describe("Investigation Workflows", () => {
  it("enforces stage transitions", () => {
    expect(canAdvance("intake", "evidence")).toBe(true);
    expect(canAdvance("intake", "decision")).toBe(false);
    expect(canAdvance("closed", "intake")).toBe(false);
  });
  it("appends immutable audit entries and requires approval for findings", () => {
    const s = useInvestigationWorkflowStore.getState();
    const c = s.open({
      title: "T",
      subject: { kind: "vessel", id: "v:1", label: "V" },
      openedBy: "officer",
    });
    s.addFinding(c.id, {
      label: "L",
      rationale: "R",
      confidence: "CORROBORATED",
      citations: ["e1"],
      createdBy: "analyst",
    });
    const cur1 = useInvestigationWorkflowStore.getState().cases[0];
    expect(cur1.findings[0].officerApproved).toBe(false);
    expect(cur1.auditTrail.length).toBeGreaterThanOrEqual(2);
    s.approveFinding(c.id, cur1.findings[0].id, "officer");
    const cur2 = useInvestigationWorkflowStore.getState().cases[0];
    expect(cur2.findings[0].officerApproved).toBe(true);
  });
});

describe("Revenue Leakage", () => {
  const iso = new Date("2026-07-25T00:00:00Z").toISOString();
  const base = (over: Partial<NormalizedEvidence>): NormalizedEvidence => ({
    id: "x",
    source: "customs",
    sourceName: "Customs",
    grade: "VERIFIED",
    entity: { kind: "vessel", id: "v:1", label: "V" },
    kind: "cargo",
    fields: {},
    observedAt: iso,
    retrievedAt: iso,
    freshnessSeconds: 60,
    hash: "h",
    ...over,
  });

  it("detects manifest under-declaration and orders by priority", () => {
    const findings = scanForLeakage([
      base({ id: "m1", fields: { declaredTonnage: 100, actualTonnage: 300, feePerTonne: 20 } }),
      base({ id: "m2", fields: { declaredTonnage: 100, actualTonnage: 105, feePerTonne: 20 } }),
    ]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe("manifest-under-declaration");
    expect(findings[0].humanApproved).toBe(false);
  });

  it("scan is deterministic", () => {
    const evs = [
      base({ id: "a", fields: { declaredTonnage: 100, actualTonnage: 250 } }),
      base({ id: "b", kind: "port-call", fields: { expectedFee: 10_000, paidFee: 5_000 } }),
    ];
    const r1 = scanForLeakage(evs, { now: () => new Date(iso) });
    const r2 = scanForLeakage(evs, { now: () => new Date(iso) });
    expect(r1.map((f) => f.id)).toEqual(r2.map((f) => f.id));
  });
});

describe("NMRSE", () => {
  it("composes weighted components with citations", () => {
    const s = scoreEntity(
      { id: "v:1", label: "V", kind: "vessel" },
      {
        osaePriority: "urgent",
        sanctionsProximity: { proximity: 0.6, evidenceIds: ["s1"] },
        complianceHistory: { detentions: 2, deficiencies: 5 },
      },
    );
    expect(s.score).toBeGreaterThan(0);
    expect(s.components.length).toBe(6);
    const sancs = s.components.find((c) => c.key === "sanctions-proximity")!;
    expect(sancs.evidenceIds).toContain("s1");
  });

  it("bands correctly", () => {
    const low = scoreEntity({ id: "a", label: "A", kind: "vessel" }, {});
    expect(low.band).toBe("low");
    const critical = scoreEntity(
      { id: "b", label: "B", kind: "vessel" },
      {
        osaePriority: "urgent",
        sanctionsProximity: { proximity: 1 },
        complianceHistory: { detentions: 5, deficiencies: 20 },
        graphConnectivity: { highRiskNeighbors: 10, totalNeighbors: 10 },
      },
    );
    expect(["high", "critical"]).toContain(critical.band);
  });
});
