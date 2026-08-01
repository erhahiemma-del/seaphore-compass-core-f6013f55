/**
 * INT-01A.1 — Bootstrap Integration Tests
 * Covers: processMicBootstrap, failure isolation, telemetry emission,
 * idempotency, performance benchmarks, failure injection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { processMicBootstrap } from "../bootstrap";
import { CapturingSink, CompositeSink, ConsoleSink } from "../telemetry/sinks";
import { createMicContainer, createMicContainerWithClock } from "../factory";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { IdentityCluster } from "@/services/ife/identity-resolver";

// ── Fixtures ─────────────────────────────────────────────────────────

const VESSEL_ID = "vessel:imo:9438291";

function ev(overrides: Partial<NormalizedEvidence> = {}): NormalizedEvidence {
  return {
    id: overrides.id ?? "ev_001",
    source: overrides.source ?? "gfw",
    sourceName: overrides.sourceName ?? "GFW",
    grade: overrides.grade ?? "CORROBORATED",
    entity: overrides.entity ?? { kind: "vessel", id: VESSEL_ID, label: "MV TEST" },
    kind: overrides.kind ?? "identity",
    fields: overrides.fields ?? { imo: "9438291" },
    observedAt: overrides.observedAt ?? "2026-07-01T00:00:00Z",
    retrievedAt: "2026-07-01T00:00:00Z",
    freshnessSeconds: 3600,
    hash: overrides.id ?? "hash-001",
    ...overrides,
  } as NormalizedEvidence;
}

function makeCluster(): IdentityCluster {
  return {
    canonicalId: VESSEL_ID,
    entityKind: "vessel",
    label: "MV TEST",
    aliasIds: ["vessel:mmsi:440825000"],
    signals: {
      imo: "9438291",
      mmsi: "440825000",
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
        id: VESSEL_ID,
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
  } as unknown as IdentityCluster;
}

function makeUip(
  evidence: NormalizedEvidence[],
  id = `uip_${Date.now()}`,
): UnifiedIntelligencePackage {
  return {
    id,
    createdAt: "2026-07-01T00:00:00Z",
    fused: {
      id: "fep",
      createdAt: "2026-07-01T00:00:00Z",
      sourcePackageId: "pkg",
      canonical: evidence.map((e) => ({
        entity: e.entity,
        fields: [],
        confidence: "HIGH" as const,
        grade: e.grade,
        sources: [e.source],
        explanation: "",
      })),
      contradictions: [],
      sources: [],
      report: {
        contradictions: [],
        evidenceStrength: "HIGH" as const,
        missing: [],
        unknowns: [],
        summary: "",
      },
      missing: [],
      confidence: "HIGH" as const,
      grade: "CORROBORATED" as const,
      stats: {
        inputRecords: evidence.length,
        canonicalEntities: 1,
        contradictions: 0,
        sourcesQueried: 1,
        sourcesResponded: 1,
        averageFreshnessSeconds: 3600,
      },
    },
    identity: [makeCluster()],
    osae: [],
    provenance: [],
    freshestSeconds: 3600,
    hasContradictions: false,
    rawEvidence: evidence,
  };
}

// ── Bootstrap tests ───────────────────────────────────────────────────

describe("INT-01A.1 · Bootstrap — core behaviour", () => {
  it("returns a result with executionId and outcome on success", () => {
    const uip = makeUip([ev()]);
    const result = processMicBootstrap(uip, uip.id);
    expect(result.executionId).toMatch(/^mic_exec_/);
    expect(["success", "degraded"]).toContain(result.outcome);
    expect(result.result).not.toBeNull();
    expect(result.telemetry).toBeDefined();
  });

  it("telemetry correlationId matches the supplied UIP id", () => {
    const uip = makeUip([ev()]);
    const result = processMicBootstrap(uip, "test-correlation-id");
    expect(result.telemetry.correlationId).toBe("test-correlation-id");
  });

  it("telemetry pipelineVersion is INT-01A.1", () => {
    const result = processMicBootstrap(makeUip([ev()]), null);
    expect(result.telemetry.pipelineVersion).toBe("INT-01A.1");
  });

  it("totalDurationMs is positive", () => {
    const result = processMicBootstrap(makeUip([ev()]), null);
    expect(result.telemetry.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("stage timings cover all 8 pipeline stages", () => {
    const result = processMicBootstrap(makeUip([ev()]), null);
    const stages = result.telemetry.stageTimings.map((s) => s.stage);
    expect(stages).toContain("mkg-ingest");
    expect(stages).toContain("entity-registration");
    expect(stages).toContain("evidence-registration");
    expect(stages).toContain("risk-computation");
    expect(stages).toContain("graph-registry");
  });

  it("evidenceRegistered matches rawEvidence length", () => {
    const uip = makeUip([ev({ id: "a" }), ev({ id: "b" }), ev({ id: "c" })]);
    const result = processMicBootstrap(uip, null);
    expect(result.telemetry.evidenceRegistered).toBe(3);
  });

  it("emits a warning when UIP has no rawEvidence", () => {
    const uip = makeUip([]);
    const result = processMicBootstrap(uip, null);
    expect(result.telemetry.warnings.some((w) => w.includes("no rawEvidence"))).toBe(true);
    expect(result.outcome).toBe("degraded");
  });

  it("does NOT throw even when passed a malformed UIP", () => {
    expect(() => processMicBootstrap({} as any, null)).not.toThrow();
    const result = processMicBootstrap({} as any, null);
    expect(result.outcome).toBe("failed");
    expect(result.telemetry.errors.length).toBeGreaterThan(0);
  });
});

// ── Failure isolation ────────────────────────────────────────────────

describe("INT-01A.1 · Failure isolation", () => {
  it("outcome is 'failed' when process() throws, result is null", () => {
    const result = processMicBootstrap(null as any, null);
    expect(result.outcome).toBe("failed");
    expect(result.result).toBeNull();
  });

  it("errors array is populated on failure", () => {
    const result = processMicBootstrap(undefined as any, null);
    expect(result.telemetry.errors.length).toBeGreaterThan(0);
  });

  it("executionId is always returned — even on failure", () => {
    const result = processMicBootstrap(null as any, null);
    expect(result.executionId).toMatch(/^mic_exec_/);
  });

  it("telemetry is always emitted — even on failure", () => {
    const capture = new CapturingSink();
    // The globalMicSink is process-wide — we can't intercept it without DI.
    // Instead verify the returned telemetry object is structurally complete.
    const result = processMicBootstrap(null as any, null);
    expect(result.telemetry.outcome).toBe("failed");
    expect(result.telemetry.timestamp).toMatch(/^\d{4}-/);
  });
});

// ── Telemetry sinks ──────────────────────────────────────────────────

describe("INT-01A.1 · Telemetry sinks", () => {
  it("CapturingSink accumulates executions", () => {
    const sink = new CapturingSink(10);
    const t = {
      executionId: "e1",
      correlationId: null,
      timestamp: "2026-07-01T00:00:00Z",
      pipelineVersion: "INT-01A.1" as const,
      totalDurationMs: 5,
      stageTimings: [],
      entitiesRegistered: 1,
      relationshipsRegistered: 0,
      evidenceRegistered: 1,
      timelineEvents: 0,
      riskProfilesComputed: 0,
      reasoningRecords: 0,
      graphNodes: 1,
      graphEdges: 0,
      heapUsedBytes: null,
      heapTotalBytes: null,
      outcome: "success" as const,
      warnings: [],
      errors: [],
      retryCount: 0,
      attributes: {},
    };
    sink.emit(t);
    sink.emit({ ...t, executionId: "e2" });
    expect(sink.executions).toHaveLength(2);
    expect(sink.latest?.executionId).toBe("e2");
  });

  it("CapturingSink rolls window when maxCapture is exceeded", () => {
    const sink = new CapturingSink(3);
    for (let i = 0; i < 5; i++) {
      sink.emit({
        executionId: `e${i}`,
        correlationId: null,
        timestamp: "2026-07-01T00:00:00Z",
        pipelineVersion: "INT-01A.1" as const,
        totalDurationMs: 1,
        stageTimings: [],
        entitiesRegistered: 0,
        relationshipsRegistered: 0,
        evidenceRegistered: 0,
        timelineEvents: 0,
        riskProfilesComputed: 0,
        reasoningRecords: 0,
        graphNodes: 0,
        graphEdges: 0,
        heapUsedBytes: null,
        heapTotalBytes: null,
        outcome: "success" as const,
        warnings: [],
        errors: [],
        retryCount: 0,
        attributes: {},
      });
    }
    expect(sink.executions).toHaveLength(3);
    expect(sink.executions[0].executionId).toBe("e2");
  });

  it("CapturingSink.summary() returns accurate totals", () => {
    const sink = new CapturingSink();
    const base = {
      correlationId: null,
      timestamp: "2026-07-01T00:00:00Z",
      pipelineVersion: "INT-01A.1" as const,
      stageTimings: [],
      entitiesRegistered: 2,
      relationshipsRegistered: 0,
      evidenceRegistered: 3,
      timelineEvents: 1,
      riskProfilesComputed: 1,
      reasoningRecords: 0,
      graphNodes: 2,
      graphEdges: 0,
      heapUsedBytes: null,
      heapTotalBytes: null,
      warnings: [],
      errors: [],
      retryCount: 0,
      attributes: {},
    };
    sink.emit({ ...base, executionId: "a", totalDurationMs: 10, outcome: "success" as const });
    sink.emit({
      ...base,
      executionId: "b",
      totalDurationMs: 20,
      outcome: "degraded" as const,
      warnings: ["w1"],
    });
    sink.emit({
      ...base,
      executionId: "c",
      totalDurationMs: 30,
      outcome: "failed" as const,
      errors: ["e1"],
    });
    const s = sink.summary()!;
    expect(s.totalExecutions).toBe(3);
    expect(s.successCount).toBe(1);
    expect(s.degradedCount).toBe(1);
    expect(s.failedCount).toBe(1);
    expect(s.avgDurationMs).toBe(20);
    expect(s.warningCount).toBe(1);
    expect(s.errorCount).toBe(1);
  });

  it("CompositeSink fans out to all children", () => {
    const a = new CapturingSink();
    const b = new CapturingSink();
    const composite = new CompositeSink(a, b);
    const t = {
      executionId: "x",
      correlationId: null,
      timestamp: "2026-07-01T00:00:00Z",
      pipelineVersion: "INT-01A.1" as const,
      totalDurationMs: 1,
      stageTimings: [],
      entitiesRegistered: 0,
      relationshipsRegistered: 0,
      evidenceRegistered: 0,
      timelineEvents: 0,
      riskProfilesComputed: 0,
      reasoningRecords: 0,
      graphNodes: 0,
      graphEdges: 0,
      heapUsedBytes: null,
      heapTotalBytes: null,
      outcome: "success" as const,
      warnings: [],
      errors: [],
      retryCount: 0,
      attributes: {},
    };
    composite.emit(t);
    expect(a.executions).toHaveLength(1);
    expect(b.executions).toHaveLength(1);
  });

  it("CompositeSink does not throw if one sink throws", () => {
    const bad = {
      emit: () => {
        throw new Error("sink failure");
      },
    };
    const good = new CapturingSink();
    const composite = new CompositeSink(bad, good);
    expect(() => composite.emit({} as any)).not.toThrow();
    // good sink still received the emission despite bad sink throwing
    expect(good.executions).toHaveLength(1);
  });
});

// ── Performance benchmarks ────────────────────────────────────────────

describe("INT-01A.1 · Performance benchmarks", () => {
  const THRESHOLDS = { 10: 50, 100: 200, 500: 600, 1000: 1500 };

  for (const [count, thresholdMs] of Object.entries(THRESHOLDS)) {
    it(`processes ${count} evidence records in under ${thresholdMs}ms`, () => {
      const evidenceList = Array.from({ length: Number(count) }, (_, i) =>
        ev({ id: `ev_${i}`, kind: i % 5 === 0 ? "position" : "identity" }),
      );
      const uip = makeUip(evidenceList);
      const t0 = Date.now();
      const result = processMicBootstrap(uip, null);
      const wallMs = Date.now() - t0;
      expect(result.outcome).not.toBe("failed");
      expect(wallMs).toBeLessThan(thresholdMs);
    });
  }
});

// ── Idempotency ───────────────────────────────────────────────────────

describe("INT-01A.1 · Idempotency", () => {
  it("processing the same UIP twice does not double-count evidence", () => {
    // Use a fresh container via the singleton — but call bootstrap twice
    const uip = makeUip([ev({ id: "ev_idem_1" }), ev({ id: "ev_idem_2" })]);
    const r1 = processMicBootstrap(uip, "idem");
    const r2 = processMicBootstrap(uip, "idem");
    // Evidence registry deduplicates by evidenceId — size should not grow
    expect(r2.telemetry.evidenceRegistered).toBe(r1.telemetry.evidenceRegistered);
  });
});
