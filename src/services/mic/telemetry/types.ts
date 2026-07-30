/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A.1 — MIC Telemetry · Types
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Structured telemetry emitted by every MIC execution.
 *  Designed for future OpenTelemetry export — no logging provider is
 *  hardcoded. The MicTelemetrySink interface is the only coupling point.
 *
 *  Shape mirrors the OpenTelemetry Span model:
 *    executionId   → TraceId
 *    correlationId → SpanId (caller-supplied for cross-service tracing)
 *    outcome       → SpanStatus
 *    durations.*   → SpanAttributes
 * ─────────────────────────────────────────────────────────────────────
 */

export type MicExecutionOutcome = "success" | "degraded" | "failed";

export type MicPipelineStage =
  | "mkg-ingest"
  | "entity-registration"
  | "relationship-registration"
  | "evidence-registration"
  | "confidence-computation"
  | "timeline-extraction"
  | "risk-computation"
  | "graph-registry";

export interface MicStageTiming {
  readonly stage: MicPipelineStage;
  readonly startedAt: number;   // Date.now()
  readonly durationMs: number;
}

export interface MicExecutionTelemetry {
  // Correlation
  readonly executionId: string;          // mic_exec_<timestamp>_<random>
  readonly correlationId: string | null; // caller-supplied (UIP id or request id)
  readonly timestamp: string;            // ISO 8601
  readonly pipelineVersion: "INT-01A.1";

  // Timing
  readonly totalDurationMs: number;
  readonly stageTimings: ReadonlyArray<MicStageTiming>;

  // Registry output
  readonly entitiesRegistered: number;
  readonly relationshipsRegistered: number;
  readonly evidenceRegistered: number;
  readonly timelineEvents: number;
  readonly riskProfilesComputed: number;
  readonly reasoningRecords: number;

  // Graph state
  readonly graphNodes: number;
  readonly graphEdges: number;

  // Resource estimates (JS process — best-effort via performance.memory when available)
  readonly heapUsedBytes: number | null;
  readonly heapTotalBytes: number | null;

  // Outcome
  readonly outcome: MicExecutionOutcome;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
  readonly retryCount: number;

  // OpenTelemetry extension point
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Sink interface — the ONLY coupling point between the MIC and any
 * logging / telemetry provider. Production ships with ConsoleSink.
 * Tests ship with CapturingSink. OpenTelemetry export is a future swap.
 */
export interface MicTelemetrySink {
  emit(telemetry: MicExecutionTelemetry): void;
}
