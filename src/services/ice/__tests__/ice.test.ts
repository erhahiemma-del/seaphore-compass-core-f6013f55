/**
 * ICE acceptance tests. Every scenario mirrors a bullet from the
 * Volume I specification so we can trace tests to spec directly.
 */

import { describe, it, expect } from "vitest";
import type { NormalizedEvidence } from "@/services/ial/types";
import {
  planQuery,
  buildMatrix,
  detectConflicts,
  detectCorroborations,
  applyFreshnessDecay,
  scoreEvidence,
  fuseIntelligence,
  explainAll,
  generateRecommendations,
  freshnessScore,
  valuesEqual,
} from "@/services/ice";
import { resolveEntities } from "@/services/ice/resolver";

const NOW = new Date("2026-07-23T12:00:00Z");
function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3_600_000).toISOString();
}

function ev(
  source: NormalizedEvidence["source"],
  fields: Record<string, unknown>,
  hoursOld = 1,
  entityId = "vessel:imo:9303065",
): NormalizedEvidence {
  return {
    id: crypto.randomUUID(),
    source,
    sourceName: source,
    grade: "OBSERVED",
    entity: { kind: "vessel", id: entityId, label: "MV Ocean Melody" },
    kind: "identity",
    fields: fields as NormalizedEvidence["fields"],
    observedAt: hoursAgo(hoursOld),
    retrievedAt: hoursAgo(hoursOld),
    freshnessSeconds: hoursOld * 3600,
    hash: crypto.randomUUID(),
  };
}

describe("ICE-1 · Source Planner", () => {
  const available = ["imo-gisis","equasis","marinetraffic","ais","opensanctions","lloyds-list"] as const;

  it("investigation intent selects more connectors than fact lookup", () => {
    const invest = planQuery({ text: "Investigate MV Ocean Melody" }, available);
    const fact   = planQuery({ text: "What is the ETA?" }, available);
    expect(invest.selected.length).toBeGreaterThan(fact.selected.length);
  });

  it("Lloyd's List skipped below risk tier T3", () => {
    const p = planQuery({ text: "Trace ownership", riskTier: "T2" }, available);
    const skip = p.skipped.find((s) => s.source === "lloyds-list");
    expect(skip?.reason).toMatch(/Risk score below T3/);
  });

  it("skipped connectors always carry a reason", () => {
    const p = planQuery({ text: "What is the ETA?" }, available);
    expect(p.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });
});

describe("ICE-5 · Correlation & Freshness", () => {
  it("freshness_score for 14hr record ≈ 98 (30-day baseline)", () => {
    expect(freshnessScore(14, 720)).toBeCloseTo(98.06, 1);
  });

  it("matrix has one row per (query × entity × field × source)", () => {
    const evs = [
      ev("imo-gisis",     { vessel_name: "MSC OSCAR", flag_state: "PA" }),
      ev("equasis",       { vessel_name: "MSC OSCAR", vessel_owner: "OceanLine" }),
    ];
    const cells = buildMatrix(resolveEntities(evs), NOW);
    // 2 fields from imo-gisis + 2 fields from equasis
    expect(cells.length).toBe(4);
  });
});

describe("ICE-6 · Conflict Detection", () => {
  it("cargo weight 0.04 % apart is NOT a conflict", () => {
    expect(valuesEqual(7661.61, 7664.6)).toBe(true);
  });
  it("cargo weight 17 % apart IS a conflict, severity HIGH", () => {
    const evs = [
      ev("customs",     { cargo_weight: 7661 }),
      ev("trade-atlas", { cargo_weight: 9000 }),
    ];
    const cells = buildMatrix(resolveEntities(evs), NOW);
    const c = detectConflicts(cells);
    expect(c).toHaveLength(1);
    expect(c[0].severity).toBe("HIGH");
    expect(c[0].isCriticalField).toBe(false);
  });
  it("IMO conflict is CRITICAL", () => {
    const evs = [
      ev("imo-gisis", { imo_number: "9303065" }),
      ev("equasis",   { imo_number: "9303066" }),
    ];
    const c = detectConflicts(buildMatrix(resolveEntities(evs), NOW));
    expect(c[0].severity).toBe("CRITICAL");
    expect(c[0].isCriticalField).toBe(true);
  });
  it("owner majority/minority split detected", () => {
    const evs = [
      ev("imo-gisis",     { vessel_owner: "OceanLine" }),
      ev("equasis",       { vessel_owner: "OceanLine" }),
      ev("opensanctions", { vessel_owner: "OceanLine" }),
      ev("trade-atlas",   { vessel_owner: "Blue Horizon" }),
    ];
    const c = detectConflicts(buildMatrix(resolveEntities(evs), NOW));
    expect(c[0].majoritySources).toHaveLength(3);
    expect(c[0].minoritySources).toEqual(["trade-atlas"]);
  });
});

describe("ICE-7 · Corroboration", () => {
  it("4-source agreement is VERIFIED with 100 corroboration score", () => {
    const evs = [
      ev("imo-gisis",     { flag_state: "PA" }),
      ev("equasis",       { flag_state: "PA" }),
      ev("marinetraffic", { flag_state: "PA" }),
      ev("ais",           { flag_state: "PA" }),
    ];
    const cells = buildMatrix(resolveEntities(evs), NOW);
    const corr = detectCorroborations(cells);
    expect(corr[0].level).toBe("VERIFIED");
    expect(corr[0].agreementCount).toBe(4);
    expect(cells.every((c) => c.corroborationScore === 100)).toBe(true);
  });
});

describe("ICE-9 · Freshness decay per field", () => {
  it("ETA record 7hr old → freshness 0 (max 6h)", () => {
    const cells = buildMatrix(resolveEntities([ev("ais", { eta: "2026-07-24T00:00:00Z" }, 7)]), NOW);
    applyFreshnessDecay(cells);
    expect(cells[0].freshnessScore).toBe(0);
    expect(cells[0].tags).toContain("STALE");
  });
  it("Owner 42 days old → freshness 0 STALE", () => {
    const cells = buildMatrix(resolveEntities([ev("trade-atlas", { vessel_owner: "X" }, 42 * 24)]), NOW);
    applyFreshnessDecay(cells);
    expect(cells[0].freshnessScore).toBe(0);
    expect(cells[0].tags).toContain("STALE");
  });
});

describe("ICE-11 & 12 · Scoring and Fusion end-to-end", () => {
  it("selects VERIFIED value and produces explanation", () => {
    const evs = [
      ev("imo-gisis", { vessel_owner: "OceanLine" }, 2),
      ev("equasis",   { vessel_owner: "OceanLine" }, 2),
      ev("opensanctions", { vessel_owner: "OceanLine" }, 2),
      ev("trade-atlas",   { vessel_owner: "Blue Horizon" }, 42 * 24),
    ];
    const cells = buildMatrix(resolveEntities(evs), NOW);
    applyFreshnessDecay(cells);
    const conflicts = detectConflicts(cells);
    const corr = detectCorroborations(cells);
    scoreEvidence(cells);
    let fused = fuseIntelligence(cells, corr);
    fused = explainAll(fused, { cells, conflicts, corroborations: corr });

    const owner = fused[0];
    expect(owner.fusedValue).toBe("OceanLine");
    expect(owner.winningSource).toMatch(/imo-gisis|equasis|opensanctions/);
    expect(owner.hasConflict).toBe(true);
    expect(owner.requiresOfficerReview).toBe(true);
    expect(owner.explanationText).toContain("Majority view");
    expect(owner.explanationText).toContain("Officer review recommended");

    const recs = generateRecommendations(fused, conflicts);
    expect(recs.some((r) => r.priority === "P2")).toBe(true);
  });

  it("SINGLE_SOURCE fields carry OBSERVED confidence and INFO recommendation", () => {
    const evs = [ev("gfw", { speed: 12.4 })];
    const cells = buildMatrix(resolveEntities(evs), NOW);
    applyFreshnessDecay(cells);
    scoreEvidence(cells);
    const fused = fuseIntelligence(cells, []);
    expect(fused[0].confidenceLevel).toBe("OBSERVED");
    expect(fused[0].confidence).toBeLessThan(0.8);
    const recs = generateRecommendations(fused, []);
    expect(recs.some((r) => r.priority === "INFO")).toBe(true);
  });
});
