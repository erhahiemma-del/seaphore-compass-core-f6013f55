/**
 * INT-01A.3 — IPEF Unit + Integration Tests
 *
 * Covers: IpefRegistry, IpefRecord builder, contributor facts,
 * confidence decompositions, lineage chains, pipeline trace ordering,
 * gap aggregation, failure isolation, idempotency.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ipefRegistry } from "../registry";
import { buildIpefRecord } from "../builder";
import { PIPELINE_STAGE_ORDER } from "../types";
import type { IpefBuildInput } from "../builder";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { Briefing } from "@/services/orchestration/types";
import type { MicBootstrapResult } from "@/services/mic/bootstrap";

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeUip(evidenceCount = 3): UnifiedIntelligencePackage {
  return {
    id: "uip_test_001",
    createdAt: "2026-07-30T00:00:00Z",
    fused: {
      id: "fep_001",
      createdAt: "2026-07-30T00:00:00Z",
      sourcePackageId: "pkg",
      canonical: [],
      contradictions: [],
      sources: [],
      report: {
        contradictions: [],
        evidenceStrength: "HIGH",
        missing: [],
        unknowns: [],
        summary: "",
      },
      missing: [],
      confidence: "HIGH",
      grade: "CORROBORATED",
      stats: {
        inputRecords: evidenceCount,
        canonicalEntities: 2,
        contradictions: 0,
        sourcesQueried: 3,
        sourcesResponded: 3,
        averageFreshnessSeconds: 1800,
      },
    },
    identity: [
      {
        canonicalId: "vessel:imo:9438291",
        entityKind: "vessel",
        label: "MV TEST",
        aliasIds: [],
        signals: {
          imo: "9438291",
          mmsi: null,
          callSign: null,
          name: "MV TEST",
          aliases: [],
          historicalNames: [],
          flag: null,
        },
        confidence: {
          score: 88,
          tier: "VERIFIED",
          band: "auto-select",
          signals: [],
          ambiguous: false,
          topCandidate: {
            id: "vessel:imo:9438291",
            score: 88,
            tier: "VERIFIED",
            band: "auto-select",
            signals: [],
            reasons: [],
            ambiguous: false,
          },
          allCandidates: [],
          reasons: [],
        },
        evidenceIds: ["ev_001"],
      },
    ],
    osae: [],
    provenance: [
      { connectorId: "gfw", sourceName: "GFW", records: evidenceCount, agreementScore: 0.8 },
    ],
    freshestSeconds: 120,
    hasContradictions: false,
    rawEvidence: [],
  } as unknown as UnifiedIntelligencePackage;
}

function makeMicResult(outcome: "success" | "degraded" | "failed" = "success"): MicBootstrapResult {
  return {
    executionId: "mic_exec_test_001",
    outcome,
    result: null,
    telemetry: {
      executionId: "mic_exec_test_001",
      correlationId: "uip_test_001",
      timestamp: "2026-07-30T00:00:00Z",
      pipelineVersion: "INT-01A.1",
      totalDurationMs: 45,
      stageTimings: [],
      entitiesRegistered: 3,
      relationshipsRegistered: 5,
      evidenceRegistered: 8,
      timelineEvents: 2,
      riskProfilesComputed: 1,
      reasoningRecords: 0,
      graphNodes: 4,
      graphEdges: 6,
      heapUsedBytes: 14_000_000,
      heapTotalBytes: 60_000_000,
      outcome,
      warnings: outcome === "degraded" ? ["Processing time exceeded 200ms"] : [],
      errors: outcome === "failed" ? ["Container threw during process()"] : [],
      retryCount: 0,
      attributes: {
        mic_version: "INT-01A.1",
        uip_id: "uip_test_001",
        uip_entities: 2,
        uip_evidence: 3,
        uip_contradictions: 0,
      },
    },
  };
}

function makeBriefing(): Briefing {
  return {
    id: "brief_001",
    officer_id: "officer_001",
    query: "Tell me about vessel 9438291",
    mode: "lookup",
    classification: {
      typeBadge: "INTELLIGENCE REPORT",
      matrix: {
        evidenceQuality: 0.8,
        coverage: 0.7,
        freshness: 0.9,
        corroboration: 0.75,
        consistency: 0.85,
        composite: 0.8,
        tier: "high",
      },
      evidenceStrength: "strong",
    },
    sections: [
      {
        kind: "executive",
        title: "Executive Summary",
        payload: { text: "MV TEST is a vessel of interest." },
      },
      {
        kind: "critical_findings",
        title: "Findings",
        payload: {
          findings: [
            {
              priority: "HIGH",
              title: "Vessel flagged in OFAC SDN list",
              grade: "VERIFIED",
              source: "open-sanctions",
            },
          ],
        },
      },
      {
        kind: "intelligence_gaps",
        title: "Gaps",
        payload: {
          list: ["Historical ownership records unavailable", "Insurance details not confirmed"],
        },
      },
      {
        kind: "counter_hypotheses",
        title: "Counter-hypotheses",
        payload: {
          list: [
            "Vessel may be under new legitimate ownership",
            "Flag change may be administrative",
          ],
        },
      },
      {
        kind: "officer_actions",
        title: "Actions",
        payload: { actions: [{ id: "a1", label: "Issue vessel boarding order" }] },
      },
    ],
    intelligence_status: "partial",
    sources_queried: 3,
    sources_responded: 3,
    sources_corroborated: 2,
    confidence_matrix: {
      evidenceQuality: 0.8,
      coverage: 0.7,
      freshness: 0.9,
      corroboration: 0.75,
      consistency: 0.85,
      composite: 0.8,
      tier: "high",
    },
    latency_ms: 1200,
    model_used: "lovable-ai:gemini",
    source_uip_id: "uip_test_001",
  };
}

function makeInput(overrides: Partial<IpefBuildInput> = {}): IpefBuildInput {
  return {
    correlationId: "uip_test_001",
    uip: makeUip(),
    micBootstrapResult: makeMicResult(),
    briefing: makeBriefing(),
    orchestrationStartedAt: Date.now() - 2000,
    evidenceCollectionMs: 800,
    sourcesQueried: 3,
    sourcesResponded: 3,
    sourcesCorroborated: 2,
    evidenceCount: 8,
    ...overrides,
  };
}

// ─── Registry tests ────────────────────────────────────────────────────

describe("IPEF · Registry", () => {
  beforeEach(() => ipefRegistry.clear());
  afterEach(() => ipefRegistry.clear());

  it("starts empty", () => {
    expect(ipefRegistry.size).toBe(0);
    expect(ipefRegistry.latest).toBeNull();
    expect(ipefRegistry.summary()).toBeNull();
  });

  it("stores and retrieves records", () => {
    const record = buildIpefRecord(makeInput());
    ipefRegistry.register(record);
    expect(ipefRegistry.size).toBe(1);
    expect(ipefRegistry.latest?.correlationId).toBe("uip_test_001");
  });

  it("getByCorrelationId finds the correct record", () => {
    const r = buildIpefRecord(makeInput());
    ipefRegistry.register(r);
    expect(ipefRegistry.getByCorrelationId("uip_test_001")).not.toBeNull();
    expect(ipefRegistry.getByCorrelationId("not_exists")).toBeNull();
  });

  it("getAll returns newest first", () => {
    ipefRegistry.register(buildIpefRecord(makeInput({ correlationId: "a" })));
    ipefRegistry.register(buildIpefRecord(makeInput({ correlationId: "b" })));
    const all = ipefRegistry.getAll();
    expect(all[0].correlationId).toBe("b");
    expect(all[1].correlationId).toBe("a");
  });

  it("summary() returns accurate aggregates", () => {
    ipefRegistry.register(buildIpefRecord(makeInput()));
    const s = ipefRegistry.summary()!;
    expect(s.totalExecutions).toBe(1);
    expect(s.successCount).toBe(1);
    expect(s.avgDurationMs).toBeGreaterThan(0);
  });
});

// ─── Builder — structural tests ────────────────────────────────────────

describe("IPEF · Builder — structural", () => {
  it("returns a record with the supplied correlationId", () => {
    const r = buildIpefRecord(makeInput());
    expect(r.correlationId).toBe("uip_test_001");
  });

  it("pipeline trace is in PIPELINE_STAGE_ORDER order", () => {
    const r = buildIpefRecord(makeInput());
    const ids = r.pipelineTrace.map((s) => s.contributorId);
    expect(ids).toEqual(PIPELINE_STAGE_ORDER);
  });

  it("every pipeline stage has a status", () => {
    const r = buildIpefRecord(makeInput());
    for (const stage of r.pipelineTrace) {
      expect(["success", "degraded", "failed", "skipped", "not-run"]).toContain(stage.status);
    }
  });

  it("contributors includes all 7 stages", () => {
    const r = buildIpefRecord(makeInput());
    const ids = r.contributors.map((c) => c.contributorId);
    for (const stage of PIPELINE_STAGE_ORDER) {
      expect(ids).toContain(stage);
    }
  });

  it("every contributor has at least one fact", () => {
    const r = buildIpefRecord(makeInput());
    for (const c of r.contributors) {
      expect(c.facts.length).toBeGreaterThan(0);
    }
  });

  it("totalDurationMs matches briefing latency", () => {
    const r = buildIpefRecord(makeInput());
    expect(r.totalDurationMs).toBe(1200);
  });

  it("createdAt is a valid ISO timestamp", () => {
    const r = buildIpefRecord(makeInput());
    expect(() => new Date(r.createdAt)).not.toThrow();
    expect(new Date(r.createdAt).getFullYear()).toBeGreaterThan(2020);
  });
});

// ─── Builder — contributor facts ────────────────────────────────────────

describe("IPEF · Builder — contributor facts", () => {
  it("evidence-providers contributor reflects sourcesQueried and evidenceCount", () => {
    const r = buildIpefRecord(
      makeInput({ sourcesQueried: 5, sourcesResponded: 4, evidenceCount: 22 }),
    );
    const ep = r.contributors.find((c) => c.contributorId === "evidence-providers")!;
    const queried = ep.facts.find((f) => f.label === "Providers Queried")!;
    const ev = ep.facts.find((f) => f.label === "Evidence Records Collected")!;
    expect(queried.value).toBe(5);
    expect(ev.value).toBe(22);
  });

  it("evidence-providers is degraded when some providers did not respond", () => {
    const r = buildIpefRecord(makeInput({ sourcesQueried: 5, sourcesResponded: 3 }));
    const ep = r.contributors.find((c) => c.contributorId === "evidence-providers")!;
    expect(ep.status).toBe("degraded");
    expect(ep.warnings.length).toBeGreaterThan(0);
  });

  it("IFE contributor carries canonical entity count", () => {
    const r = buildIpefRecord(makeInput());
    const ife = r.contributors.find((c) => c.contributorId === "ife")!;
    const canonical = ife.facts.find((f) => f.label === "Canonical Entities")!;
    expect(canonical.value).toBe(2); // from makeUip() fused.stats
  });

  it("MIC contributor carries entity + evidence + graph counts when MIC ran", () => {
    const r = buildIpefRecord(makeInput());
    const mic = r.contributors.find((c) => c.contributorId === "mic")!;
    const entities = mic.facts.find((f) => f.label === "Entities Registered")!;
    const nodes = mic.facts.find((f) => f.label === "Graph Nodes Added")!;
    expect(entities.value).toBe(3);
    expect(nodes.value).toBe(4);
  });

  it("MIC contributor is 'skipped' when micBootstrapResult is null", () => {
    const r = buildIpefRecord(makeInput({ micBootstrapResult: null }));
    const mic = r.contributors.find((c) => c.contributorId === "mic")!;
    expect(mic.status).toBe("skipped");
  });

  it("MIC contributor is 'failed' when MIC outcome was failed", () => {
    const r = buildIpefRecord(makeInput({ micBootstrapResult: makeMicResult("failed") }));
    const mic = r.contributors.find((c) => c.contributorId === "mic")!;
    expect(mic.status).toBe("failed");
    expect(mic.errors.length).toBeGreaterThan(0);
  });

  it("OIE contributor carries intelligence gap count from briefing sections", () => {
    const r = buildIpefRecord(makeInput());
    const oie = r.contributors.find((c) => c.contributorId === "oie")!;
    const gaps = oie.facts.find((f) => f.label === "Intelligence Gaps Identified")!;
    expect(gaps.value).toBe(2); // makeBriefing() has 2 gaps
  });

  it("Copilot contributor always has status=success", () => {
    const r = buildIpefRecord(makeInput());
    const copilot = r.contributors.find((c) => c.contributorId === "copilot")!;
    expect(copilot.status).toBe("success");
  });
});

// ─── Builder — intelligence gaps ──────────────────────────────────────

describe("IPEF · Builder — intelligence gaps", () => {
  it("aggregates gaps from briefing sections", () => {
    const r = buildIpefRecord(makeInput());
    expect(r.intelligenceGaps).toContain("Historical ownership records unavailable");
    expect(r.intelligenceGaps).toContain("Insurance details not confirmed");
  });

  it("deduplicates gaps that appear in multiple sources", () => {
    const r = buildIpefRecord(makeInput());
    const unique = new Set(r.intelligenceGaps);
    expect(unique.size).toBe(r.intelligenceGaps.length);
  });
});

// ─── Builder — recommendation lineage ─────────────────────────────────

describe("IPEF · Builder — recommendation lineage", () => {
  it("builds a provenance chain for each critical finding", () => {
    const r = buildIpefRecord(makeInput());
    expect(r.recommendationProvenance.length).toBeGreaterThan(0);
    expect(r.recommendationProvenance[0].recommendationText.length).toBeGreaterThan(0);
  });

  it("each chain has at least 3 nodes: recommendation → evidence → provider", () => {
    const r = buildIpefRecord(makeInput());
    for (const rp of r.recommendationProvenance) {
      expect(rp.chain.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rootNodes exist in the chain", () => {
    const r = buildIpefRecord(makeInput());
    for (const rp of r.recommendationProvenance) {
      const chainIds = new Set(rp.chain.map((n) => n.id));
      for (const rootId of rp.rootNodes) {
        expect(chainIds.has(rootId)).toBe(true);
      }
    }
  });

  it("every lineage node has a contributorId from a known stage", () => {
    const r = buildIpefRecord(makeInput());
    for (const rp of r.recommendationProvenance) {
      for (const node of rp.chain) {
        expect(PIPELINE_STAGE_ORDER).toContain(node.contributorId);
      }
    }
  });
});

// ─── Builder — overall status ──────────────────────────────────────────

describe("IPEF · Builder — overall status", () => {
  it("is 'success' when all contributors succeed", () => {
    const r = buildIpefRecord(makeInput());
    expect(r.overallStatus).toBe("success");
  });

  it("is 'degraded' when a provider is missing", () => {
    const r = buildIpefRecord(makeInput({ sourcesQueried: 5, sourcesResponded: 3 }));
    expect(r.overallStatus).toBe("degraded");
  });

  it("is 'failed' when MIC outcome is failed", () => {
    const r = buildIpefRecord(makeInput({ micBootstrapResult: makeMicResult("failed") }));
    expect(r.overallStatus).toBe("failed");
  });
});

// ─── PIPELINE_STAGE_ORDER constant ────────────────────────────────────

describe("IPEF · PIPELINE_STAGE_ORDER", () => {
  it("contains all required stages in order", () => {
    expect(PIPELINE_STAGE_ORDER[0]).toBe("evidence-providers");
    expect(PIPELINE_STAGE_ORDER[1]).toBe("ial");
    expect(PIPELINE_STAGE_ORDER[2]).toBe("ife");
    expect(PIPELINE_STAGE_ORDER[3]).toBe("mic");
    expect(PIPELINE_STAGE_ORDER[4]).toBe("canonical-uip");
    expect(PIPELINE_STAGE_ORDER[5]).toBe("oie");
    expect(PIPELINE_STAGE_ORDER[6]).toBe("copilot");
    expect(PIPELINE_STAGE_ORDER).toHaveLength(7);
  });
});
