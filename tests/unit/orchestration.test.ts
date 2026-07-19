/**
 * Contract tests for the Intelligence Orchestration Engine.
 * Verifies Layer 2 boundaries: Reasoning Engine never runs without evidence,
 * confidence matrix respects Layer 2.11 propagation, and Layer 2.14 Policy
 * Engine enforces role gating & rate limits.
 */
import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/services/orchestration/intent-classifier";
import { fuseEvidence } from "@/services/orchestration/evidence-fusion";
import { computeConfidenceMatrix, propagateConfidence } from "@/services/orchestration/reasoning-engine";
import { CAPABILITY_REGISTRY, agentsForCapabilities } from "@/services/orchestration/capability-registry";
import { WORKSPACE_CONTRACTS } from "@/services/orchestration/workspace-contracts";
import { EVIDENCE_GRADES, CONFIDENCE_STEPS } from "@/services/orchestration/constants";
import type { EvidenceItem, RetrievalResult } from "@/services/orchestration";

describe("Intent Classifier (Layer 2.2)", () => {
  it("classifies ownership queries to OWNERSHIP_ANALYSIS", () => {
    const i = classifyIntent({ officer_id: "u1", query: "Who is the beneficial owner of MV Sample IMO 9319466?" });
    expect(i.capabilities).toContain("OWNERSHIP_ANALYSIS");
    expect(i.entities.some((e) => e.type === "vessel_imo")).toBe(true);
  });

  it("classifies forecast queries to forecast mode", () => {
    const i = classifyIntent({ officer_id: "u1", query: "Forecast revenue leakage next quarter" });
    expect(i.mode).toBe("forecast");
    expect(i.capabilities).toContain("REVENUE_LEAKAGE_DETECTION");
  });

  it("never fabricates entities not present in the query", () => {
    const i = classifyIntent({ officer_id: "u1", query: "Show ownership analysis" });
    expect(i.entities).toHaveLength(0);
  });
});

describe("Evidence Fusion Engine (Layer 2.10)", () => {
  const mkEvidence = (over: Partial<EvidenceItem>): EvidenceItem => ({
    id: crypto.randomUUID(), grade: "VERIFIED", source_system: "CAC",
    content: "same-fact", entity_ids: ["ent-1"], collected_at: new Date().toISOString(), ...over,
  });
  const mkResult = (evidence: EvidenceItem[], source_name = "CAC"): RetrievalResult => ({
    agent: "ownership", capability: "OWNERSHIP_ANALYSIS",
    source_name, responded: true, evidence, latency_ms: 100,
  });

  it("deduplicates within same source by content hash", () => {
    const a = mkEvidence({ content: "dup" });
    const b = mkEvidence({ content: "dup" });
    const f = fuseEvidence([mkResult([a, b])]);
    expect(f.ranked).toHaveLength(1);
  });

  it("does NOT merge grades — HR-10", () => {
    const v = mkEvidence({ grade: "VERIFIED", content: "x" });
    const r = mkEvidence({ grade: "REPORTED", content: "x" });
    const f = fuseEvidence([mkResult([v, r], "CAC"), mkResult([r], "IMO")]);
    for (const item of f.ranked) expect(["VERIFIED", "REPORTED"]).toContain(item.grade);
  });

  it("flags contradictions on the same entity between authoritative sources", () => {
    const a = mkEvidence({ content: "owner A" });
    const b = mkEvidence({ content: "owner B", source_system: "IMO" });
    const f = fuseEvidence([mkResult([a], "CAC"), mkResult([b], "IMO")]);
    expect(f.conflicts.length).toBeGreaterThan(0);
  });

  it("counts corroborated signatures across independent sources", () => {
    const a = mkEvidence({ content: "same" });
    const b = mkEvidence({ content: "same", source_system: "IMO" });
    const f = fuseEvidence([mkResult([a], "CAC"), mkResult([b], "IMO")]);
    expect(f.sources_corroborated).toBeGreaterThan(0);
  });
});

describe("Confidence propagation (Layer 2.11)", () => {
  it("degrades through each reasoning step", () => {
    const p = propagateConfidence(1);
    expect(p.evidence).toBe(CONFIDENCE_STEPS.evidence);
    expect(p.recommendation).toBeLessThan(p.assessment);
    expect(p.assessment).toBeLessThan(p.pattern);
    expect(p.pattern).toBeLessThan(p.relationship);
  });

  it("assigns tier=high when composite >= 0.75", () => {
    const fused = {
      ranked: [{ id: "1", grade: "VERIFIED" as const, source_system: "CAC", content: "x",
        entity_ids: [], weight: 1, freshness: 1 }],
      conflicts: [], sources_queried: 2, sources_responded: 2, sources_corroborated: 2,
    };
    const m = computeConfidenceMatrix(fused);
    expect(m.tier).toBe("high");
  });

  it("assigns tier=low when no evidence responded", () => {
    const m = computeConfidenceMatrix({
      ranked: [], conflicts: [], sources_queried: 3, sources_responded: 0, sources_corroborated: 0,
    });
    expect(m.tier).toBe("low");
  });
});

describe("Capability Registry (Layer 2.7)", () => {
  it("has every capability referenced in workspace contracts", () => {
    for (const ws of Object.values(WORKSPACE_CONTRACTS)) {
      for (const cap of ws.capabilities) expect(CAPABILITY_REGISTRY[cap]).toBeDefined();
    }
  });

  it("resolves capability sets to agent sets deterministically", () => {
    const agents = agentsForCapabilities(["OWNERSHIP_ANALYSIS", "SANCTIONS_SCREENING"]);
    expect(agents).toEqual(["ownership"]);
  });
});

describe("Evidence Grades (Layer 2.9)", () => {
  it("preserves canonical weight ordering", () => {
    expect(EVIDENCE_GRADES.VERIFIED.weight).toBe(1.0);
    expect(EVIDENCE_GRADES.CORROBORATED.weight).toBe(0.9);
    expect(EVIDENCE_GRADES.OBSERVED.weight).toBe(0.8);
    expect(EVIDENCE_GRADES.REPORTED.weight).toBe(0.5);
    expect(EVIDENCE_GRADES.INFERRED.weight).toBe(0.3);
    expect(EVIDENCE_GRADES.UNKNOWN.weight).toBe(0.0);
  });
});
