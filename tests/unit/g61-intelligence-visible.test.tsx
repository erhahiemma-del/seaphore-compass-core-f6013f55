// @vitest-environment jsdom
/** TEST_FIXTURE — synthetic briefs and plans only. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MARITIME_PANELS, resolvePanels } from "@/features/maritime/adaptive-panels";
import {
  PENDING_RISK_MODULES,
  RiskModuleRegistry,
  aggregateFindings,
} from "@/services/intelligence";
import {
  DECISION_LABEL,
  OFFICER_DECISIONS,
  buildExecutiveBrief,
  buildOperationalRecord,
  recordOfficerDecision,
  understand,
  type DecisionSink,
  type ExecutiveBriefV2,
  type WorkspacePlan,
} from "@/services/orchestration";

afterEach(() => cleanup());

const NOW = Date.parse("2026-08-22T09:00:00.000Z");

async function briefFixture(): Promise<ExecutiveBriefV2> {
  const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);
  const set = await aggregateFindings("9074729", "TEST_FIXTURE MV ABC", { registry, now: NOW });
  return buildExecutiveBrief(understand("Investigate TEST_FIXTURE MV ABC", { now: NOW }), set, NOW);
}

/* ═══════ 6. Decision integrity ═══════ */

describe("6. an officer decision does not mutate the intelligence", () => {
  it("leaves the brief byte-identical after a decision is recorded", async () => {
    const brief = await briefFixture();
    const before = JSON.stringify(brief);

    await recordOfficerDecision(brief, "dismiss", async () => undefined, { now: NOW });

    // Dismissing a finding is a judgement about what to do, not a claim
    // that the finding changed. If this ever fails, an officer's
    // disagreement is silently rewriting an assessment.
    expect(JSON.stringify(brief)).toBe(before);
  });

  it("copies OSAE priority rather than deriving one", async () => {
    const brief = await briefFixture();
    const record = buildOperationalRecord(brief, "escalate", { now: NOW });

    // Whatever the brief said, the record says — including null.
    expect(record.priorityAtDecision).toBe(brief.keyFindings[0]?.priority ?? null);
  });

  it("copies the confidence bands verbatim, never averaging them", async () => {
    const brief = await briefFixture();
    const record = buildOperationalRecord(brief, "acknowledge", { now: NOW });

    expect(record.confidenceAtDecision).toEqual(brief.confidence.bands);
    expect(record.confidenceAtDecision).not.toContainEqual(expect.any(Number));
  });

  it("snapshots the brief's production time separately from the decision time", async () => {
    const brief = await briefFixture();
    const record = buildOperationalRecord(brief, "investigate", { now: NOW + 60_000 });

    // An audit that collapses these cannot show how long the officer
    // deliberated, nor which version of the brief they saw.
    expect(record.briefProducedAt).toBe(brief.producedAt);
    expect(record.decidedAt).toBe(new Date(NOW + 60_000).toISOString());
  });

  it("writes one append-only audit entry naming the decision", async () => {
    const brief = await briefFixture();
    const sink = vi.fn<DecisionSink>(async () => undefined);

    const result = await recordOfficerDecision(brief, "escalate", sink, { now: NOW });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({
      action: "intelligence.decision.escalate",
      entity: "ExecutiveBrief",
    });
    expect(result.persisted).toBe(true);
  });

  it("keeps the decision when the audit write fails, and says it failed", async () => {
    const brief = await briefFixture();
    const sink: DecisionSink = async () => {
      throw new Error("network down");
    };

    const result = await recordOfficerDecision(brief, "dismiss", sink, { now: NOW });

    // An officer who has decided has decided. Losing the write is a
    // problem to surface, not a reason to discard the decision or to
    // claim it was saved.
    expect(result.record.decision).toBe("dismiss");
    expect(result.persisted).toBe(false);
    expect(result.error).toContain("network down");
  });

  it("normalises an empty note to null rather than storing whitespace", async () => {
    const brief = await briefFixture();
    expect(buildOperationalRecord(brief, "acknowledge", { note: "   ", now: NOW }).note).toBeNull();
    expect(buildOperationalRecord(brief, "acknowledge", { note: " ok ", now: NOW }).note).toBe(
      "ok",
    );
  });
});

/* ═══════ Decision vocabulary ═══════ */

describe("officer decision vocabulary", () => {
  it("offers exactly the four operational verbs", () => {
    expect([...OFFICER_DECISIONS]).toEqual(["acknowledge", "investigate", "escalate", "dismiss"]);
  });

  it("does not offer `approve` — a finding is not a request", () => {
    expect(OFFICER_DECISIONS).not.toContain("approve");
  });

  it("labels every decision", () => {
    for (const decision of OFFICER_DECISIONS) {
      expect(DECISION_LABEL[decision]).toBeTruthy();
    }
  });
});

/* ═══════ 5. Adaptive panels ═══════ */

describe("5. WorkspacePlan panels resolve against Maritime Command", () => {
  function plan(panels: WorkspacePlan["panels"]): WorkspacePlan {
    return {
      workspace: "vessel",
      label: "TEST_FIXTURE",
      panels,
      collapsed: [],
      actions: [],
      transparency: {
        searching: [],
        scope: "fleet",
        time: "today",
        timeInferred: false,
        sourceCount: 0,
        gaps: [],
      },
      subjectLabel: null,
    } as WorkspacePlan;
  }

  it("renders the panels this surface genuinely serves", () => {
    const { rendered } = resolvePanels(plan(["executive-summary", "timeline", "evidence"]));
    expect(rendered).toEqual(["executive-summary", "timeline", "evidence"]);
  });

  it("preserves the planner's ordering rather than re-sorting", () => {
    // planWorkspace decided what the officer should weigh first.
    const { rendered } = resolvePanels(plan(["evidence", "fleet-map", "executive-summary"]));
    expect(rendered).toEqual(["evidence", "fleet-map", "executive-summary"]);
  });

  it("routes another surface's panel to that surface instead of rebuilding it", () => {
    const { rendered, elsewhere } = resolvePanels(plan(["ownership-graph", "revenue-chart"]));

    expect(rendered).toEqual([]);
    expect(elsewhere).toEqual([
      { panel: "ownership-graph", label: "Ownership Intelligence", url: "/ownership" },
      { panel: "revenue-chart", label: "Revenue Intelligence", url: "/revenue" },
    ]);
  });

  it("names a panel nothing renders yet, rather than dropping it silently", () => {
    // `collapsed` exists so a panel missing by design is distinguishable
    // from one missing by bug. Silent omission defeats that.
    const { elsewhere } = resolvePanels(plan(["pattern-chart"]));
    expect(elsewhere).toEqual([{ panel: "pattern-chart", label: "pattern-chart", url: null }]);
  });

  it("splits a mixed plan without losing any panel", () => {
    const panels = ["executive-summary", "ownership-graph", "timeline", "pattern-chart"] as const;
    const { rendered, elsewhere } = resolvePanels(plan([...panels]));

    expect(rendered.length + elsewhere.length).toBe(panels.length);
  });

  it("claims only panels Maritime Command actually mounts", () => {
    // Guards against this list drifting into promising surfaces the map
    // does not have.
    expect(Object.keys(MARITIME_PANELS).sort()).toEqual([
      "evidence",
      "executive-summary",
      "fleet-kpis",
      "fleet-map",
      "timeline",
      "vessel-snapshot",
    ]);
  });
});
