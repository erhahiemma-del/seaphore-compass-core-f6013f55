/**
 * INT-01A.1 — MIC Telemetry · Sinks
 *
 * Two sinks ship with the platform:
 *
 *   ConsoleSink   — structured JSON to console.info. Default in production.
 *                   Captured by Lovable Cloud logs and any log aggregator
 *                   that tails stdout (Datadog, CloudWatch, Elastic, etc).
 *
 *   CapturingSink — in-memory capture for tests and the MIO Observatory.
 *                   Also used by the Observatory to replay execution history.
 *
 * Future sinks (OpenTelemetry, Sentry, Datadog APM) implement
 * MicTelemetrySink — zero changes to the MIC itself.
 */
import type { MicExecutionTelemetry, MicTelemetrySink } from "./types";

// ── Console Sink (production default) ─────────────────────────────────
export class ConsoleSink implements MicTelemetrySink {
  emit(t: MicExecutionTelemetry): void {
    const level = t.outcome === "failed" ? "error"
      : t.outcome === "degraded" ? "warn"
      : "info";
    console[level]("[MIC]", JSON.stringify({
      executionId:             t.executionId,
      correlationId:           t.correlationId,
      timestamp:               t.timestamp,
      outcome:                 t.outcome,
      totalDurationMs:         t.totalDurationMs,
      entitiesRegistered:      t.entitiesRegistered,
      relationshipsRegistered: t.relationshipsRegistered,
      evidenceRegistered:      t.evidenceRegistered,
      timelineEvents:          t.timelineEvents,
      riskProfilesComputed:    t.riskProfilesComputed,
      graphNodes:              t.graphNodes,
      graphEdges:              t.graphEdges,
      heapUsedMb:              t.heapUsedBytes != null
        ? +(t.heapUsedBytes / 1_048_576).toFixed(1)
        : null,
      warnings: t.warnings,
      errors:   t.errors,
    }));
  }
}

// ── Capturing Sink (tests + MIO Observatory) ──────────────────────────
export class CapturingSink implements MicTelemetrySink {
  private readonly _executions: MicExecutionTelemetry[] = [];
  private readonly _maxCapture: number;

  constructor(maxCapture = 500) {
    this._maxCapture = maxCapture;
  }

  emit(t: MicExecutionTelemetry): void {
    if (this._executions.length >= this._maxCapture) {
      this._executions.shift();   // rolling window
    }
    this._executions.push(t);
  }

  get executions(): ReadonlyArray<MicExecutionTelemetry> {
    return this._executions;
  }

  get latest(): MicExecutionTelemetry | null {
    return this._executions[this._executions.length - 1] ?? null;
  }

  clear(): void {
    this._executions.length = 0;
  }

  /** Summary metrics for the Observatory dashboard. */
  summary() {
    const all = this._executions;
    if (all.length === 0) return null;
    const durations = all.map((e) => e.totalDurationMs);
    return {
      totalExecutions:  all.length,
      successCount:     all.filter((e) => e.outcome === "success").length,
      degradedCount:    all.filter((e) => e.outcome === "degraded").length,
      failedCount:      all.filter((e) => e.outcome === "failed").length,
      avgDurationMs:    Math.round(durations.reduce((s, d) => s + d, 0) / all.length),
      minDurationMs:    Math.min(...durations),
      maxDurationMs:    Math.max(...durations),
      totalEntities:    all.reduce((s, e) => s + e.entitiesRegistered, 0),
      totalEvidence:    all.reduce((s, e) => s + e.evidenceRegistered, 0),
      totalRisk:        all.reduce((s, e) => s + e.riskProfilesComputed, 0),
      warningCount:     all.reduce((s, e) => s + e.warnings.length, 0),
      errorCount:       all.reduce((s, e) => s + e.errors.length, 0),
      lastExecutedAt:   all[all.length - 1]?.timestamp ?? null,
    };
  }
}

// ── Composite Sink (fan-out to multiple sinks) ────────────────────────
export class CompositeSink implements MicTelemetrySink {
  private readonly sinks: MicTelemetrySink[];
  constructor(...sinks: MicTelemetrySink[]) {
    this.sinks = sinks;
  }
  emit(t: MicExecutionTelemetry): void {
    for (const sink of this.sinks) {
      try { sink.emit(t); } catch { /* one sink must never break another */ }
    }
  }
}
