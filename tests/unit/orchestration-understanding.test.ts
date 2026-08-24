import { describe, expect, it } from "vitest";

import {
  classifyOfficerIntent,
  planRetrieval,
  resolveContextPolicy,
  resolveEntities,
  resolveTimeWindow,
  understand,
  type ResolvedEntity,
} from "@/services/orchestration/understanding";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

const OCEAN_PEARL: ResolvedEntity = {
  kind: "vessel",
  text: "Ocean Pearl",
  identifier: "9438291",
  identifierKind: "imo",
  confidence: 0.9,
};

describe("intent classification", () => {
  it.each([
    ["What vessels are live today?", "fleet-intelligence"],
    ["Investigate Ocean Pearl", "vessel-investigation"],
    ["Show vessels owned by Maersk Line", "company-intelligence"],
    ["Revenue leakage this quarter", "revenue-intelligence"],
    ["Who owns MV Ocean Pearl?", "ownership-intelligence"],
    ["Pull the manifest for MSCU1234567", "manifest-intelligence"],
    ["Congestion at Apapa", "port-intelligence"],
    ["Brief me on last night", "executive-brief"],
    ["Replay the voyage", "historical-replay"],
    ["Compare Ocean Pearl and Niger Runner", "comparison"],
    ["Any recurring AIS anomalies?", "pattern-detection"],
    ["What should I do next?", "operational-recommendation"],
    ["Detention history for IMO 9438291", "compliance-intelligence"],
  ])("routes %j to %s", (query, expected) => {
    expect(classifyOfficerIntent(query).intent).toBe(expected);
  });

  it("reports unknown rather than guessing", () => {
    const result = classifyOfficerIntent("asdfgh");
    expect(result.intent).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("lowers its own confidence when readings compete", () => {
    // Names a company, a risk and a port — genuinely ambiguous.
    const contested = classifyOfficerIntent("compliance risk for Maersk Line at Apapa");
    const clean = classifyOfficerIntent("Investigate Ocean Pearl");

    expect(contested.alternatives.length).toBeGreaterThan(0);
    expect(contested.confidence).toBeLessThan(clean.confidence);
  });
});

describe("entity resolution", () => {
  it("extracts an IMO with its identifier", () => {
    const [entity] = resolveEntities("Investigate IMO 9438291");
    expect(entity.kind).toBe("vessel");
    expect(entity.identifier).toBe("9438291");
    expect(entity.identifierKind).toBe("imo");
  });

  it("extracts a container number", () => {
    const [entity] = resolveEntities("Trace MSCU1234567");
    expect(entity.kind).toBe("container");
    expect(entity.identifier).toBe("MSCU1234567");
  });

  it("extracts a company by its corporate suffix", () => {
    const entities = resolveEntities("Show vessels owned by Maersk Line Ltd");
    expect(entities.some((e) => e.kind === "company" && /Maersk/.test(e.text))).toBe(true);
  });

  it("extracts a named vessel without inventing an identifier", () => {
    // Resolving a name to an IMO is an intelligence operation with its own
    // confidence. A regex must not do it.
    const [entity] = resolveEntities("Investigate MV Ocean Pearl");
    expect(entity.text).toBe("Ocean Pearl");
    expect(entity.identifier).toBeNull();
  });

  it("scores a bare capitalised phrase well below an identifier", () => {
    const [bare] = resolveEntities("Investigate Ocean Pearl");
    const [numbered] = resolveEntities("Investigate IMO 9438291");
    expect(bare.confidence).toBeLessThan(numbered.confidence);
  });

  it("finds no entity in a fleet-wide question", () => {
    expect(resolveEntities("What vessels are live today?")).toEqual([]);
  });
});

describe("time resolution", () => {
  it("reads an explicit window and marks it stated", () => {
    const window = resolveTimeWindow("activity in the last 6 hours", "fleet-intelligence", NOW);
    expect(window.label).toBe("last 6 hours");
    expect(window.inferred).toBe(false);
    expect(NOW - window.fromMs).toBe(6 * 3_600_000);
  });

  it("treats 'live' as the last 15 minutes", () => {
    expect(resolveTimeWindow("what is live now", "fleet-intelligence", NOW).label).toBe(
      "last 15 minutes",
    );
  });

  it("falls back per intent and says the window was inferred", () => {
    const fleet = resolveTimeWindow("what vessels are out", "fleet-intelligence", NOW);
    const investigation = resolveTimeWindow("investigate her", "vessel-investigation", NOW);

    expect(fleet.inferred).toBe(true);
    // An investigation must reach back far enough to see repeated behaviour.
    expect(investigation.toMs - investigation.fromMs).toBeGreaterThan(fleet.toMs - fleet.fromMs);
  });
});

describe("context contamination", () => {
  it("goes passive when the question names its own subject", () => {
    expect(resolveContextPolicy("entity", [OCEAN_PEARL])).toBe("passive");
  });

  it("goes passive for a fleet-wide question", () => {
    expect(resolveContextPolicy("fleet", [])).toBe("passive");
  });

  it("inherits only for a subject-less follow-up", () => {
    expect(resolveContextPolicy("entity", [])).toBe("inherit");
  });

  it("does not let an open investigation narrow a live-fleet question", () => {
    // The defect this whole module exists to prevent.
    const result = understand("What vessels are live today?", {
      now: NOW,
      ambientEntity: OCEAN_PEARL,
    });

    expect(result.scope).toBe("fleet");
    expect(result.contextPolicy).toBe("passive");
    expect(result.entities).toEqual([]);
    expect(result.primaryEntity).toBeNull();
    expect(result.workspaceMode).toBe("fleet-overview");
  });

  it("does not let it narrow a company question either", () => {
    const result = understand("Show vessels owned by Maersk Line Ltd", {
      now: NOW,
      ambientEntity: OCEAN_PEARL,
    });

    expect(result.workspaceMode).toBe("company-intelligence");
    expect(result.primaryEntity?.kind).toBe("company");
    expect(result.entities).not.toContain(OCEAN_PEARL);
  });

  it("carries context into a genuine follow-up", () => {
    const result = understand("and her compliance history?", {
      now: NOW,
      ambientEntity: OCEAN_PEARL,
    });

    expect(result.contextPolicy).toBe("inherit");
    expect(result.primaryEntity).toEqual(OCEAN_PEARL);
  });

  it("ignores ambient context when none is offered", () => {
    const result = understand("and her compliance history?", { now: NOW });
    expect(result.primaryEntity).toBeNull();
  });
});

describe("workspace mode selection", () => {
  it.each([
    ["What vessels are live today?", "fleet-overview"],
    ["Investigate Ocean Pearl", "investigation"],
    ["Show vessels owned by Maersk Line Ltd", "company-intelligence"],
    ["Revenue leakage", "revenue"],
    ["Congestion at Apapa", "port-operations"],
    ["Brief me", "executive-briefing"],
    ["Replay the voyage", "timeline"],
    ["What should we do next?", "decision-support"],
    ["Recurring anomalies across the fleet", "pattern-analysis"],
  ])("puts %j into the %s workspace", (query, mode) => {
    expect(understand(query, { now: NOW }).workspaceMode).toBe(mode);
  });

  it("never leaves the officer on a blank workspace", () => {
    expect(understand("asdfgh", { now: NOW }).workspaceMode).toBe("fleet-overview");
  });
});

describe("retrieval planning", () => {
  it("names what it cannot serve, with the reason", () => {
    const plan = planRetrieval("vessel-investigation");

    expect(plan.datasets).toContain("ais-events");
    const blocked = plan.unavailable.map((u) => u.dataset);
    expect(blocked).toContain("sanctions-lists");
    for (const item of plan.unavailable) {
      expect(item.reason.length).toBeGreaterThan(10);
    }
  });

  it("keeps pending modules in the plan so their absence is visible", () => {
    // Dropping them would hide that the question had a dimension nobody
    // could answer.
    const plan = planRetrieval("vessel-investigation");
    expect(plan.modules).toContain("ais-integrity");
    expect(plan.modules).toContain("sanctions");
  });

  it("asks for nothing on an officer note", () => {
    const plan = planRetrieval("officer-notes");
    expect(plan.datasets).toEqual([]);
  });
});

describe("understand", () => {
  it("produces a complete, deterministic understanding", () => {
    const a = understand("Investigate Ocean Pearl over the last 30 days", { now: NOW });
    const b = understand("Investigate Ocean Pearl over the last 30 days", { now: NOW });

    expect(a).toEqual(b);
    expect(a.intent).toBe("vessel-investigation");
    expect(a.timeWindow.label).toBe("last 30 days");
    expect(a.timeWindow.inferred).toBe(false);
    expect(a.producedAt).toBe(new Date(NOW).toISOString());
  });

  it("classifies without performing any retrieval", () => {
    // Synchronous by design: the workspace reconfigures on submit, not
    // after the slowest connector returns.
    const result = understand("What vessels are live?", { now: NOW });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.plan.datasets.length).toBeGreaterThan(0);
  });
});
