/**
 * Playbook Engine — automated SOP scenarios.
 *
 * Each test drives one Playbook end-to-end with a synthesized briefing,
 * and asserts the deterministic overlay: recommendations, confidence
 * band, escalations, evidence limitations, and applied rule IDs.
 */
import { describe, expect, it } from "vitest";
import type {
  Briefing,
  BriefingSection,
  ConfidenceMatrix,
} from "@/services/orchestration";
import {
  evaluatePlaybook,
  findPlaybook,
  listPlaybooks,
} from "../index";
import type { Playbook } from "../types";

const HIGH_MATRIX: ConfidenceMatrix = {
  evidenceQuality: 0.9,
  coverage: 0.9,
  freshness: 0.9,
  corroboration: 0.9,
  consistency: 0.9,
  composite: 0.9,
  tier: "high",
};

const LOW_MATRIX: ConfidenceMatrix = {
  evidenceQuality: 0.1,
  coverage: 0.1,
  freshness: 0.1,
  corroboration: 0.1,
  consistency: 0.1,
  composite: 0.1,
  tier: "low",
};

interface BriefingSeed {
  findings?: Array<{ priority: string; title: string; source?: string; grade?: string }>;
  verified?: string[];
  gaps?: string[];
  matrix?: ConfidenceMatrix;
  sources?: { queried: number; responded: number; corroborated: number };
  impact?: { revenue: number; security: number; operational: number; cargo: number };
  status?: "complete" | "partial" | "insufficient";
}

function makeBriefing(seed: BriefingSeed): Briefing {
  const matrix = seed.matrix ?? HIGH_MATRIX;
  const sections: BriefingSection[] = [
    {
      kind: "critical_findings",
      title: "Key Findings",
      payload: {
        findings: (seed.findings ?? []).map((f) => ({
          priority: f.priority,
          title: f.title,
          grade: (f.grade ?? "OBSERVED") as never,
          source: f.source ?? "internal",
        })),
      },
    } as BriefingSection,
    {
      kind: "verified_evidence",
      title: "Verified Evidence",
      payload: { items: seed.verified ?? [] },
    } as BriefingSection,
    {
      kind: "intelligence_gaps",
      title: "Intelligence Gaps",
      payload: { list: seed.gaps ?? [] },
    } as BriefingSection,
    {
      kind: "evidence_sources",
      title: "Evidence Sources",
      payload: seed.sources ?? { queried: 3, responded: 3, corroborated: 3 },
    } as BriefingSection,
    {
      kind: "decision_impact",
      title: "Decision Impact",
      payload: seed.impact ?? { revenue: 0, security: 0, operational: 0, cargo: 0 },
    } as BriefingSection,
  ];
  return {
    id: "brf-test",
    officer_id: "test-officer",
    query: "test",
    mode: "investigation",
    classification: { typeBadge: "investigation", matrix, evidenceStrength: "strong" },
    sections,
    intelligence_status: seed.status ?? "complete",
    sources_queried: seed.sources?.queried ?? 3,
    sources_responded: seed.sources?.responded ?? 3,
    sources_corroborated: seed.sources?.corroborated ?? 3,
    confidence_matrix: matrix,
    latency_ms: 0,
    model_used: "test",
  };
}

function pb(id: string): Playbook {
  const p = findPlaybook(id);
  if (!p) throw new Error(`Playbook not found: ${id}`);
  return p;
}

describe("Playbook Registry", () => {
  it("registers all nine SOP playbooks", () => {
    const ids = listPlaybooks().map((p) => p.skillId).sort();
    expect(ids).toEqual(
      [
        "cargo_investigation",
        "compliance_review",
        "executive_briefing",
        "manifest_investigation",
        "ownership_investigation",
        "port_intelligence",
        "revenue_leakage",
        "vessel_investigation",
        "voyage_comparison",
      ].sort(),
    );
  });

  it("each playbook declares mandatory evidence and at least one recommendation rule", () => {
    for (const p of listPlaybooks()) {
      expect(p.requiredEvidence.mandatory.length).toBeGreaterThan(0);
      expect(p.recommendations.length).toBeGreaterThan(0);
      expect(p.confidenceBands.length).toBeGreaterThan(0);
    }
  });
});

describe("Manifest Investigation Playbook", () => {
  it("flags weight discrepancy, revenue exposure, and recommends revised manifest", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "Weight mismatch vs prior voyage", source: "manifest" },
        { priority: "high", title: "Bill of Lading disagreement on line 4", source: "bol" },
      ],
      verified: ["Declared cargo manifest received", "Prior manifest retrieved for same route"],
      impact: { revenue: 8_500_000, security: 0, operational: 3, cargo: 4 },
    });
    const evalRes = evaluatePlaybook(pb("manifest_investigation"), briefing);

    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain("Request a revised manifest before clearance");
    expect(actions).toContain(
      "Physically verify the Bill of Lading against the declared manifest",
    );
    expect(actions).toContain(
      "Escalate to Revenue Intelligence for shortfall assessment",
    );
    expect(evalRes.confidence.badge).toBe("High Confidence");
    expect(evalRes.reasoningNotes.some((n) => n.toLowerCase().includes("weight"))).toBe(true);
    expect(evalRes.insufficientEvidence).toBe(false);
  });

  it("returns Insufficient Evidence when mandatory items are missing", () => {
    const briefing = makeBriefing({
      findings: [],
      verified: [],
      sources: { queried: 3, responded: 0, corroborated: 0 },
      matrix: LOW_MATRIX,
    });
    const evalRes = evaluatePlaybook(pb("manifest_investigation"), briefing);
    expect(evalRes.insufficientEvidence).toBe(true);
    expect(evalRes.confidence.badge).toBe("Insufficient Evidence");
    expect(evalRes.evidenceLimitations.length).toBeGreaterThan(0);
  });
});

describe("Cargo Verification Playbook", () => {
  it("requires physical verification when a discrepancy is present", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "Container count discrepancy detected", source: "customs" },
        { priority: "high", title: "Hazmat annex missing UN class", source: "manifest" },
      ],
      verified: [
        "Declared cargo items list retrieved",
        "Container classification retrieved",
      ],
    });
    const evalRes = evaluatePlaybook(pb("cargo_investigation"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain("Verify cargo physically before clearance");
    expect(actions).toContain(
      "Trigger hazmat inspection and confirm stowage compliance",
    );
    expect(evalRes.escalations.some((e) => e.toLowerCase().includes("hazmat"))).toBe(true);
  });
});

describe("Vessel Risk Assessment Playbook", () => {
  it("holds vessel on sanctions proximity and escalates to Compliance", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "OFAC sanctions match on beneficial owner", source: "sanctions" },
        { priority: "high", title: "Prior PSC detention on record", source: "psc" },
      ],
      verified: ["Vessel registry record", "AIS movement history", "Owner and operator record"],
    });
    const evalRes = evaluatePlaybook(pb("vessel_investigation"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain("Place vessel on hold pending sanctions clearance");
    expect(evalRes.escalations.some((e) => e.toLowerCase().includes("compliance"))).toBe(true);
  });
});

describe("Revenue Leakage Playbook", () => {
  it("quantifies exposure and escalates when above threshold", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "high", title: "Undervaluation vs peer benchmark", source: "revenue" },
        { priority: "high", title: "Recurring shortfall over 12 months", source: "audit" },
      ],
      verified: ["Declared tariff basis retrieved", "Assessed vs paid amount retrieved"],
      impact: { revenue: 25_000_000, security: 0, operational: 2, cargo: 1 },
    });
    const evalRes = evaluatePlaybook(pb("revenue_leakage"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions.some((a) => a.toLowerCase().includes("shortfall recovery"))).toBe(true);
    expect(actions.some((a) => a.toLowerCase().includes("audit"))).toBe(true);
    expect(evalRes.escalations.some((e) => e.toLowerCase().includes("revenue"))).toBe(true);
  });
});

describe("Ownership Investigation Playbook", () => {
  it("requests beneficial-ownership verification when the chain is opaque", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "Opaque nominee at second hop", source: "registry" },
      ],
      verified: ["Registered owner retrieved", "Sanctions screening returned clean"],
    });
    const evalRes = evaluatePlaybook(pb("ownership_investigation"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain("Request beneficial-ownership verification from the operator");
  });
});

describe("Compliance Review Playbook", () => {
  it("holds clearance when a mandatory certificate has expired", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "SOLAS certificate expired 3 months ago", source: "compliance" },
      ],
      verified: ["Certification status retrieved", "NIMASA obligations record retrieved"],
    });
    const evalRes = evaluatePlaybook(pb("compliance_review"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain(
      "Hold clearance until the expired certificate is reissued",
    );
    expect(evalRes.escalations.some((e) => e.toLowerCase().includes("compliance"))).toBe(true);
  });
});

describe("Voyage Comparison Playbook", () => {
  it("investigates route change and reconciles cargo diff", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "high", title: "Port sequence change vs baseline voyage", source: "voyage" },
        { priority: "high", title: "Cargo diff on commodity family", source: "manifest" },
      ],
      verified: [
        "Current voyage record retrieved",
        "Prior voyage record retrieved",
        "Manifest for both voyages retrieved",
      ],
    });
    const evalRes = evaluatePlaybook(pb("voyage_comparison"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain(
      "Investigate the route change and screen all new port calls",
    );
    expect(actions).toContain("Reconcile the cargo diff with the operator");
  });
});

describe("Port Intelligence Playbook", () => {
  it("applies enhanced monitoring when high-risk vessels are in port", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "High risk vessel expected at berth 4", source: "port" },
        { priority: "high", title: "Congestion above baseline", source: "port" },
      ],
      verified: [
        "Current port vessel roster retrieved",
        "Congestion metrics retrieved",
        "Open incident record retrieved",
      ],
    });
    const evalRes = evaluatePlaybook(pb("port_intelligence"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain(
      "Apply enhanced monitoring on high-risk vessels in the roster",
    );
    expect(actions).toContain(
      "Coordinate with berth planning to smooth congestion",
    );
  });
});

describe("Executive Briefing Playbook", () => {
  it("routes to Director when a critical finding is present", () => {
    const briefing = makeBriefing({
      findings: [
        { priority: "critical", title: "Material ownership exposure surfaced", source: "briefing" },
      ],
      verified: [
        "Risk indicator summary retrieved",
        "Operational impact summary retrieved",
        "Corroborating source retrieved",
      ],
    });
    const evalRes = evaluatePlaybook(pb("executive_briefing"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain("Present to Director for immediate decision");
    expect(evalRes.escalations.some((e) => e.toLowerCase().includes("director"))).toBe(true);
  });

  it("logs routinely when no critical finding is present", () => {
    const briefing = makeBriefing({
      findings: [],
      verified: [
        "Risk indicator summary retrieved",
        "Operational impact summary retrieved",
        "Corroborating source retrieved",
      ],
    });
    const evalRes = evaluatePlaybook(pb("executive_briefing"), briefing);
    const actions = evalRes.recommendedActions.map((r) => r.action);
    expect(actions).toContain("Log as a routine intelligence brief");
  });
});
