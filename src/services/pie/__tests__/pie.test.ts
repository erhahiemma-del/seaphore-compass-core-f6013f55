import { describe, expect, it } from "vitest";
import { PredictiveIntelligenceEngine } from "../engine";
import type { NormalizedEvidence } from "@/services/ial/types";

const VESSEL = {
  id: "vessel:9411640",
  kind: "vessel" as const,
  label: "DONGWON NO.16",
};

function ev(partial: Partial<NormalizedEvidence>): NormalizedEvidence {
  return {
    id: partial.id ?? `ev_${Math.random().toString(36).slice(2, 9)}`,
    source: partial.source ?? "test",
    sourceName: partial.sourceName ?? "Test Feed",
    grade: partial.grade ?? "OBSERVED",
    entity: partial.entity ?? VESSEL,
    kind: partial.kind ?? "position",
    fields: partial.fields ?? {},
    observedAt: partial.observedAt ?? new Date().toISOString(),
    retrievedAt: partial.retrievedAt ?? new Date().toISOString(),
    freshnessSeconds: partial.freshnessSeconds ?? 60,
    hash: partial.hash ?? "hash",
  };
}

describe("PIE", () => {
  it("never predicts without evidence", () => {
    const pie = new PredictiveIntelligenceEngine();
    const cycle = pie.ingest({ evidence: [] });
    expect(cycle.predictions).toHaveLength(0);
    expect(cycle.alerts).toHaveLength(0);
  });

  it("detects AIS anomalies with citations and alternative hypotheses", () => {
    const pie = new PredictiveIntelligenceEngine();
    const cycle = pie.ingest({
      evidence: [
        ev({ id: "e1", kind: "position", grade: "VERIFIED", fields: { gapHours: 26 } }),
        ev({ id: "e2", kind: "position", grade: "VERIFIED", fields: { gapHours: 18 } }),
        ev({ id: "e3", kind: "position", grade: "VERIFIED", fields: { gapHours: 4 } }),
      ],
    });
    const ais = cycle.predictions.find((p) => p.category === "ais-behaviour");
    expect(ais).toBeDefined();
    expect(ais!.citations.length).toBeGreaterThan(0);
    expect(ais!.alternatives.length).toBeGreaterThan(0);
    expect(ais!.probability).toBeGreaterThan(0);
    expect(ais!.explanation.length).toBeGreaterThan(0);
  });

  it("aggregates confidence to the weakest evidence grade", () => {
    const pie = new PredictiveIntelligenceEngine();
    const cycle = pie.ingest({
      evidence: [
        ev({ kind: "sanctions", grade: "VERIFIED", fields: { status: "listed" } }),
        ev({ kind: "sanctions", grade: "UNKNOWN", fields: { status: "listed" } }),
      ],
    });
    const sanc = cycle.predictions.find((p) => p.category === "sanctions-proximity")!;
    expect(sanc.confidence).toBe("UNKNOWN");
    // UNKNOWN confidence must never emit an alert regardless of probability.
    expect(sanc.alert).toBe(false);
  });

  it("emits alerts above threshold with cooldown", () => {
    const pie = new PredictiveIntelligenceEngine({ alertCooldownMs: 1_000_000 });
    const evidence = [
      ev({ id: "s1", kind: "sanctions", grade: "VERIFIED", fields: { status: "listed" } }),
      ev({ id: "s2", kind: "sanctions", grade: "VERIFIED", fields: { status: "listed" } }),
    ];
    const first = pie.ingest({ evidence });
    expect(first.alerts.length).toBeGreaterThan(0);
    // Second cycle with same evidence should be suppressed by cooldown.
    const second = pie.ingest({ evidence });
    expect(second.alerts).toHaveLength(0);
  });

  it("learns baselines and fires on ≥ 2σ cargo deviation", () => {
    const pie = new PredictiveIntelligenceEngine();
    const base = [50, 52, 48, 51, 49].map((v, i) =>
      ev({ id: `c${i}`, kind: "cargo", grade: "CORROBORATED", fields: { tonnage: v } }),
    );
    pie.ingest({ evidence: base });
    const spike = pie.ingest({
      evidence: [ev({ id: "spike", kind: "cargo", grade: "CORROBORATED", fields: { tonnage: 500 } })],
    });
    const anomaly = spike.predictions.find((p) => p.category === "cargo-anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly!.baseline?.zScore ?? 0).toBeGreaterThan(2);
  });

  it("predictions have stable ids across cycles for the same evidence", () => {
    const pie = new PredictiveIntelligenceEngine();
    const evidence = [
      ev({ id: "o1", kind: "ownership", grade: "VERIFIED", fields: { ownerName: "Alpha Ltd", flag: "PA" } }),
      ev({ id: "o2", kind: "ownership", grade: "VERIFIED", fields: { ownerName: "Beta Ltd", flag: "LR" } }),
    ];
    const a = pie.ingest({ evidence }).predictions.find((p) => p.category === "ownership-churn");
    const b = pie.ingest({ evidence }).predictions.find((p) => p.category === "ownership-churn");
    expect(a?.id).toBe(b?.id);
  });

  it("subscribers receive every cycle", () => {
    const pie = new PredictiveIntelligenceEngine();
    const cycles: number[] = [];
    pie.subscribe((c) => cycles.push(c.predictions.length));
    pie.ingest({ evidence: [] });
    pie.ingest({
      evidence: [ev({ kind: "compliance", grade: "VERIFIED", fields: { outcome: "detention" } })],
    });
    expect(cycles).toHaveLength(2);
    expect(cycles[1]).toBeGreaterThan(0);
  });
});
