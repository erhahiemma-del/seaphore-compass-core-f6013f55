import { describe, expect, it } from "vitest";

import {
  WORKSPACE_CONTRACTS,
  ambientEntityOf,
  buildExecutiveBrief,
  classifyIntent,
  describeMission,
  openMission,
  planWorkspace,
  understand,
  type MissionContext,
  type OfficerQuery,
} from "@/services/orchestration";
import {
  RiskModuleRegistry,
  aggregateFindings,
  aisIntegrityModule,
  PENDING_RISK_MODULES,
} from "@/services/intelligence";
import { AISBehaviourAnalyzer } from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

function query(text: string, over: Partial<OfficerQuery> = {}): OfficerQuery {
  return { query: text, officer_id: "officer-1", ...over };
}

/* ─────────────────── one authoritative intent ─────────────────── */

describe("unified intent classification", () => {
  it("derives mode, capabilities and workspace from one understanding", () => {
    const intent = classifyIntent(query("Investigate Ocean Pearl"), { now: NOW });

    expect(intent.understanding.intent).toBe("vessel-investigation");
    expect(intent.mode).toBe("investigation");
    expect(intent.workspace).toBe("investigation");
    expect(intent.capabilities[0]).toBe("PATTERN_DETECTION");
  });

  it("cannot drift, because every legacy field is a projection", () => {
    // The same text classified twice yields identical readings, and the
    // legacy fields agree with the authoritative one by construction.
    const intent = classifyIntent(query("Revenue leakage this quarter"), { now: NOW });
    const direct = understand("Revenue leakage this quarter", { now: NOW });

    expect(intent.understanding).toEqual(direct);
    expect(intent.workspace).toBe(direct.workspaceMode);
  });

  it("keeps the legacy Intent shape intact", () => {
    const intent = classifyIntent(query("Who owns MV Ocean Pearl?"), { now: NOW });

    expect(intent).toHaveProperty("mode");
    expect(intent).toHaveProperty("capabilities");
    expect(intent).toHaveProperty("entities");
    expect(intent).toHaveProperty("workspace");
    expect(intent).toHaveProperty("raw");
    expect(intent).toHaveProperty("reasoning");
    expect(intent.raw).toBe("Who owns MV Ocean Pearl?");
  });

  it("projects entities into the legacy tag vocabulary", () => {
    const intent = classifyIntent(query("Investigate IMO 9438291"), { now: NOW });
    expect(intent.entities).toContainEqual({ type: "vessel_imo", value: "9438291" });
  });

  it("still honours a module hint from a specialist surface", () => {
    const intent = classifyIntent(query("what changed?", { moduleHint: "revenue" }), { now: NOW });
    expect(intent.capabilities[0]).toBe("REVENUE_LEAKAGE_DETECTION");
  });

  it("lets an explicit workspace choice outrank the planner", () => {
    const intent = classifyIntent(
      query("what vessels are live?", { context: { workspace: "evidence" } }),
      { now: NOW },
    );
    expect(intent.workspace).toBe("evidence");
  });

  it("explains itself in the reasoning string", () => {
    const intent = classifyIntent(query("What vessels are live today?"), { now: NOW });
    expect(intent.reasoning).toMatch(/intent=fleet-intelligence/);
    expect(intent.reasoning).toMatch(/context=passive/);
  });
});

/* ──────────────────── MissionContext lifecycle ─────────────────── */

describe("MissionContext lifecycle", () => {
  it("starts as null — no investigation is the normal state", () => {
    const mission: MissionContext | null = null;
    expect(ambientEntityOf(mission)).toBeNull();
    expect(describeMission(mission)).toBe("No active investigation");
  });

  it("opening a vessel creates a context", () => {
    const mission = openMission(
      { kind: "vessel", label: "Ocean Pearl", identifier: "9438291" },
      NOW,
    );

    expect(mission.investigationId).toBe("inv-9438291");
    expect(mission.subject.text).toBe("Ocean Pearl");
    // Explicitly opened, so there is nothing uncertain about the subject.
    expect(mission.subject.confidence).toBe(1);
    expect(mission.subject.identifierKind).toBe("imo");
  });

  it("opening another vessel replaces rather than stacks", () => {
    let mission = openMission({ kind: "vessel", label: "Ocean Pearl", identifier: "9438291" }, NOW);
    mission = openMission({ kind: "vessel", label: "Niger Runner", identifier: "9411765" }, NOW);

    expect(mission.subject.text).toBe("Niger Runner");
    expect(mission.investigationId).toBe("inv-9411765");
  });

  it("closing returns to null", () => {
    let mission: MissionContext | null = openMission(
      { kind: "vessel", label: "Ocean Pearl", identifier: "9438291" },
      NOW,
    );
    mission = null;
    expect(ambientEntityOf(mission)).toBeNull();
  });

  it("builds an id from the name when no identifier is known", () => {
    const mission = openMission({ kind: "company", label: "Maersk Line Ltd" }, NOW);
    expect(mission.investigationId).toBe("inv-maersk-line-ltd");
    expect(mission.subject.identifier).toBeNull();
  });
});

/* ───────────────── context contamination, end to end ───────────── */

describe("context contamination is impossible through the classifier", () => {
  const mission = openMission({ kind: "vessel", label: "Ocean Pearl", identifier: "9438291" }, NOW);

  it("a live-fleet question ignores an open investigation", () => {
    const intent = classifyIntent(query("What vessels are live today?"), {
      now: NOW,
      ambientEntity: ambientEntityOf(mission),
    });

    expect(intent.workspace).toBe("fleet-overview");
    expect(intent.entities).toEqual([]);
    expect(intent.understanding.contextPolicy).toBe("passive");
    expect(intent.reasoning).not.toMatch(/Ocean Pearl/);
  });

  it("a company question ignores it too", () => {
    const intent = classifyIntent(query("Show vessels owned by Maersk Line Ltd"), {
      now: NOW,
      ambientEntity: ambientEntityOf(mission),
    });

    expect(intent.workspace).toBe("company-intelligence");
    expect(intent.understanding.primaryEntity?.text).toMatch(/Maersk/);
  });

  it("a genuine follow-up still inherits", () => {
    const intent = classifyIntent(query("and her compliance history?"), {
      now: NOW,
      ambientEntity: ambientEntityOf(mission),
    });

    expect(intent.understanding.contextPolicy).toBe("inherit");
    expect(intent.understanding.primaryEntity?.text).toBe("Ocean Pearl");
  });

  it("switching investigations switches the answer", () => {
    const second = openMission(
      { kind: "vessel", label: "Niger Runner", identifier: "9411765" },
      NOW,
    );
    const intent = classifyIntent(query("and her compliance history?"), {
      now: NOW,
      ambientEntity: ambientEntityOf(second),
    });

    expect(intent.understanding.primaryEntity?.text).toBe("Niger Runner");
  });
});

/* ────────────────── adaptive workspace selection ───────────────── */

describe("workspace planning", () => {
  it("gives every workspace a contract", () => {
    const modes = [
      "fleet-overview",
      "executive-briefing",
      "investigation",
      "company-intelligence",
      "manifest-intelligence",
      "cargo-intelligence",
      "port-operations",
      "compliance",
      "ownership",
      "revenue",
      "voyage",
      "pattern-analysis",
      "timeline",
      "evidence-review",
      "decision-support",
    ] as const;

    for (const mode of modes) {
      expect(WORKSPACE_CONTRACTS[mode], `${mode} needs a contract`).toBeTruthy();
    }
  });

  it("keeps the original six contracts intact", () => {
    // Persisted briefings and the intel_briefings.workspace column still
    // resolve against these ids.
    for (const legacy of ["ownership", "revenue", "compliance", "evidence", "vessel", "port"]) {
      expect(WORKSPACE_CONTRACTS[legacy as "ownership"].id).toBe(legacy);
    }
  });

  it("collapses the vessel panels on a fleet question", () => {
    // The layout half of the contamination fix.
    const plan = planWorkspace(understand("What vessels are live today?", { now: NOW }));

    expect(plan.panels).toContain("fleet-table");
    expect(plan.collapsed).toContain("vessel-snapshot");
    expect(plan.collapsed).toContain("ownership-graph");
    expect(plan.collapsed).toContain("risk-card");
  });

  it("expands timeline, evidence and reasoning in an investigation", () => {
    const plan = planWorkspace(understand("Investigate Ocean Pearl", { now: NOW }));

    expect(plan.panels).toContain("timeline");
    expect(plan.panels).toContain("evidence");
    expect(plan.panels).toContain("reasoning");
    expect(plan.subjectLabel).toBe("Ocean Pearl");
  });

  it("expands the corporate graph in company mode", () => {
    const plan = planWorkspace(understand("Show vessels owned by Maersk Line Ltd", { now: NOW }));
    expect(plan.panels).toContain("ownership-graph");
    expect(plan.panels).toContain("company-fleet");
  });

  it("keeps a layout to five panels or fewer", () => {
    // An officer weighing more than five things is not deciding in a minute.
    for (const contract of Object.values(WORKSPACE_CONTRACTS)) {
      if (!contract.panels) continue;
      expect(contract.panels.length, `${contract.id} has too many panels`).toBeLessThanOrEqual(5);
    }
  });

  it("tells the officer what it searched, over what, and for when", () => {
    const plan = planWorkspace(understand("What vessels are live today?", { now: NOW }));

    expect(plan.transparency.searching).toContain("AIS");
    expect(plan.transparency.scope).toBe("Global Fleet");
    expect(plan.transparency.time).toBe("today");
    expect(plan.transparency.sourceCount).toBeGreaterThan(0);
  });

  it("flags a period the officer did not choose", () => {
    const plan = planWorkspace(understand("What vessels are out?", { now: NOW }));
    expect(plan.transparency.timeInferred).toBe(true);
  });

  it("names coverage gaps with their reasons", () => {
    const plan = planWorkspace(understand("Investigate Ocean Pearl", { now: NOW }));
    expect(plan.transparency.gaps.length).toBeGreaterThan(0);
    for (const gap of plan.transparency.gaps) {
      expect(gap.reason.length).toBeGreaterThan(10);
    }
  });
});

/* ──────────────────── Executive Brief generation ───────────────── */

describe("Executive Brief", () => {
  const VESSEL = "9411765";

  function publishInterruptions() {
    const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
    const base = { weather: "clear", trafficDensity: "dense", nearestPort: "Lagos" } as const;
    const report = AISBehaviourAnalyzer.analyse({
      vesselId: VESSEL,
      events: [
        {
          timestamp: hoursAgo(120),
          latitude: 6.4,
          longitude: 3.4,
          distanceFromPortNm: 10,
          ...base,
        },
        { timestamp: hoursAgo(60), latitude: 6.6, longitude: 3.6, distanceFromPortNm: 14, ...base },
        { timestamp: hoursAgo(10), latitude: 6.7, longitude: 3.7, distanceFromPortNm: 16, ...base },
      ],
    });
    OSAE.publishAisContinuity(report);
  }

  it("summarises in countable lines, never paragraphs", async () => {
    OSAE.__reset();
    publishInterruptions();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const findings = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.summary.length).toBeGreaterThan(0);
    for (const line of brief.summary) {
      // A summary line an officer must parse as prose has failed its job.
      expect(line.text.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(2);
    }
    OSAE.__reset();
  });

  it("is built from findings, so every action cites one", async () => {
    OSAE.__reset();
    publishInterruptions();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const findings = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.recommendedActions.length).toBeGreaterThan(0);
    for (const action of brief.recommendedActions) {
      expect(findings.findings.some((f) => f.id === action.findingId)).toBe(true);
    }
    OSAE.__reset();
  });

  it("copies priority from OSAE rather than deriving one", async () => {
    OSAE.__reset();
    publishInterruptions();
    const osae = OSAE.getAssessment(VESSEL)!;
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const findings = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.keyFindings[0].priority).toBe(osae.priority);
    OSAE.__reset();
  });

  it("reports unknowns at the same weight as findings", async () => {
    const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);
    const findings = await aggregateFindings("9411765", "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.unknowns.length).toBeGreaterThan(0);
    expect(brief.summary.some((l) => /could not be checked/.test(l.text))).toBe(true);
  });

  it("says plainly when nothing met the evidence threshold", async () => {
    const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);
    const findings = await aggregateFindings("9411765", "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.keyFindings).toEqual([]);
    expect(brief.nextBestAction).toBeNull();
    expect(brief.summary.some((l) => /No finding reached/.test(l.text))).toBe(true);
  });

  it("offers exactly one next best action, or none", async () => {
    OSAE.__reset();
    publishInterruptions();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const findings = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.nextBestAction).toEqual(brief.recommendedActions[0]);
    OSAE.__reset();
  });

  it("carries counter-hypotheses through from reasoning", async () => {
    OSAE.__reset();
    publishInterruptions();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const findings = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );
    const banded = findings.findings.filter(
      (f) => f.assessment?.band === "high" || f.assessment?.band === "medium",
    );

    expect(brief.counterHypotheses.length).toBe(banded.length);
    OSAE.__reset();
  });

  it("summarises evidence by provider and grade", async () => {
    OSAE.__reset();
    publishInterruptions();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const findings = await aggregateFindings(VESSEL, "MV Test", { registry, now: NOW });

    const brief = buildExecutiveBrief(
      understand("Investigate MV Test", { now: NOW }),
      findings,
      NOW,
    );

    expect(brief.evidence.totalRefs).toBeGreaterThan(0);
    expect(brief.evidence.providers.length).toBeGreaterThan(0);
    expect(brief.evidence.byGrade.length).toBeGreaterThan(0);
    OSAE.__reset();
  });
});
