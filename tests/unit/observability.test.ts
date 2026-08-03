/**
 * Sprint 11 · Observability — end-to-end tests.
 * Covers logger async flush, PII scrubbing, tracer stage timings + errors,
 * metrics snapshots, feedback correlation, alert rules, and a small
 * load-test run.
 */
import { describe, expect, it } from "vitest";
import {
  createLogger,
  createMetricsRegistry,
  createObservability,
  officerHash,
  scrub,
  runLoadTest,
} from "@/services/observability";

describe("Sprint 11 · PII scrubbing & hashing", () => {
  it("scrubs emails, phones, IMOs, long digit runs", () => {
    const s = scrub(
      "Reach kayode@example.com or +234 803 555 1234, ref IMO 9837456 batch 123456789012",
    );
    expect(s).toContain("[email]");
    expect(s).toContain("[phone]");
    expect(s).toContain("[imo]");
    expect(s).toContain("[num]");
    expect(s).not.toContain("@example.com");
  });
  it("officer hash is stable within a run and unlike raw id", () => {
    const a = officerHash("u_1");
    expect(a).toBe(officerHash("u_1"));
    expect(a).not.toContain("u_1");
    expect(a.startsWith("off_")).toBe(true);
  });
});

describe("Sprint 11 · async logger", () => {
  it("delivers records to subscribers after flush()", async () => {
    const log = createLogger({ minLevel: "debug" });
    const rows: string[] = [];
    log.subscribe((r) => rows.push(`${r.level}:${r.msg}`));
    log.info("hello", { x: 1 });
    log.warn("careful");
    log.error("boom");
    await log.flush();
    expect(rows).toEqual(["info:hello", "warn:careful", "error:boom"]);
  });
  it("respects minLevel", async () => {
    const log = createLogger({ minLevel: "warn" });
    const rows: string[] = [];
    log.subscribe((r) => rows.push(r.level));
    log.info("skip");
    log.warn("keep");
    await log.flush();
    expect(rows).toEqual(["warn"]);
  });
});

describe("Sprint 11 · metrics registry", () => {
  it("counts and computes percentiles", () => {
    const m = createMetricsRegistry();
    m.incr("hits", 1, { route: "/a" });
    m.incr("hits", 2, { route: "/a" });
    for (let i = 1; i <= 100; i++) m.observe("latency_ms", i);
    const s = m.snapshot();
    expect(s.counters['hits{route="/a"}']).toBe(3);
    expect(s.histograms["latency_ms"].p50).toBeGreaterThan(45);
    expect(s.histograms["latency_ms"].p99).toBeGreaterThan(90);
  });
});

describe("Sprint 11 · tracer", () => {
  it("records stage timings and total latency", async () => {
    const obs = createObservability({ minLogLevel: "debug" });
    const trace = obs.tracer.startQuery({
      officerId: "u_1",
      intent: "revenue",
      queryText: "audit IMO 9837456 for user@nimasa.gov",
    });
    await trace.stage("classification", async () => 1);
    await trace.stage("retrieval", async () => 2);
    await trace.stage("reasoning", async () => 3);
    trace.recordModel({
      stage: "reasoning",
      model: "google/gemini-2.5-flash",
      tier: 1,
      promptTokens: 100,
      completionTokens: 20,
      costCredits: 0.1,
    });
    trace.recordEvidence({ evidenceId: "ev1", grade: "SIGINT_VERIFIED", weight: 0.9 });
    trace.finish({ ok: true });

    const snap = obs.snapshot();
    expect(snap.counters['queries_total{intent="revenue"}']).toBe(1);
    expect(snap.counters['queries_completed_total{ok="true"}']).toBe(1);
    expect(snap.histograms['pipeline_stage_ms{stage="total"}'].count).toBe(1);
    expect(snap.histograms['pipeline_stage_ms{stage="classification"}'].count).toBe(1);
    expect(obs.store.queries.all()[0].queryText).toContain("[imo]");
    expect(obs.store.queries.all()[0].queryText).toContain("[email]");
    expect(obs.store.evidence.all()).toHaveLength(1);
  });

  it("captures stage errors with stack and increments error counter", async () => {
    const obs = createObservability();
    const trace = obs.tracer.startQuery({ officerId: "u", intent: "x", queryText: "q" });
    await expect(
      trace.stage("reasoning", async () => {
        throw new Error("model down");
      }),
    ).rejects.toThrow("model down");
    trace.finish({ ok: false });

    const errors = obs.store.errors.all();
    expect(errors).toHaveLength(1);
    expect(errors[0].stage).toBe("reasoning");
    expect(errors[0].message).toBe("model down");
    expect(errors[0].stack).toBeTruthy();
    const s = obs.snapshot();
    expect(s.counters['pipeline_errors_total{stage="reasoning"}']).toBe(1);
    expect(s.counters['queries_completed_total{ok="false"}']).toBe(1);
  });
});

describe("Sprint 11 · feedback correlation", () => {
  it("associates outcomes with traceIds and updates counters", () => {
    const obs = createObservability();
    obs.feedback.record({ traceId: "trc_1", officerId: "u", outcome: "agree" });
    obs.feedback.record({
      traceId: "trc_1",
      officerId: "u",
      outcome: "modify",
      note: "add IMO 9837456",
    });
    obs.feedback.record({ traceId: "trc_2", officerId: "u2", outcome: "disagree" });

    const rows = obs.store.feedback.all();
    expect(rows).toHaveLength(3);
    expect(rows[1].note).toContain("[imo]");
    const s = obs.snapshot();
    expect(s.counters['feedback_total{outcome="agree"}']).toBe(1);
    expect(s.counters['feedback_total{outcome="modify"}']).toBe(1);
    expect(s.counters['feedback_total{outcome="disagree"}']).toBe(1);
  });
});

describe("Sprint 11 · alerts", () => {
  it("fires error_rate_high when threshold crossed", () => {
    const obs = createObservability();
    for (let i = 0; i < 21; i++)
      obs.metrics.incr("pipeline_errors_total", 1, { stage: "reasoning" });
    const fired = obs.alerts.evaluate(obs.metrics);
    expect(fired.map((f) => f.rule)).toContain("error_rate_high");
  });

  it("fires disagree_rate_high when ratio exceeds 30% over ≥10 samples", () => {
    const obs = createObservability();
    for (let i = 0; i < 6; i++)
      obs.feedback.record({ traceId: `t${i}`, officerId: "u", outcome: "agree" });
    for (let i = 0; i < 5; i++)
      obs.feedback.record({ traceId: `t${i}`, officerId: "u", outcome: "disagree" });
    const fired = obs.alerts.evaluate(obs.metrics);
    expect(fired.map((f) => f.rule)).toContain("disagree_rate_high");
  });
});

describe("Sprint 11 · load test integration", () => {
  it("runs synthetic load and produces a budget-checked report", async () => {
    const obs = createObservability();
    const report = await runLoadTest(
      obs.tracer,
      obs.metrics,
      { totalQueries: 40, concurrency: 8 },
      3000,
    );
    expect(report.totalQueries).toBe(40);
    expect(report.completed).toBe(40);
    expect(report.errors).toBe(0);
    expect(report.snapshot.histograms['pipeline_stage_ms{stage="total"}'].count).toBe(40);
    expect(report.budget.passed).toBe(true);
  });

  it("captures errors when synthetic failures are injected", async () => {
    const obs = createObservability();
    const report = await runLoadTest(obs.tracer, obs.metrics, {
      totalQueries: 20,
      concurrency: 4,
      failureRate: 1,
    });
    expect(report.errors).toBeGreaterThan(0);
    expect(report.snapshot.counters['pipeline_errors_total{stage="reasoning"}']).toBeGreaterThan(0);
  });
});
