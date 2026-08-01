/**
 * Sprint 11 · Observability — shared types (Layer 5.5 / 5.6).
 * Every record is JSON-serialisable and free of raw PII.
 */
import type { WorkflowId } from "@/services/workflows";

/** The six-stage Copilot pipeline. */
export const PIPELINE_STAGES = [
  "classification",
  "retrieval",
  "fusion",
  "reasoning",
  "rendering",
  "total",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface QueryLog {
  readonly id: string; // trace id (also correlationId)
  readonly at: string; // ISO
  readonly officerHash: string; // anonymized (see pii.ts)
  readonly intent: string; // e.g. "revenue_leakage_query"
  readonly queryText: string; // PII-scrubbed
  readonly workspace?: string;
  readonly workflow?: WorkflowId;
}

export interface StageTiming {
  readonly traceId: string;
  readonly stage: PipelineStage;
  readonly startedAt: number; // epoch ms
  readonly durationMs: number;
  readonly ok: boolean;
}

export interface ModelUsage {
  readonly traceId: string;
  readonly stage: PipelineStage;
  readonly model: string; // "gemini-2.5-flash", "mock", ...
  readonly tier: 1 | 2 | 3;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costCredits: number;
}

export interface EvidenceUsage {
  readonly traceId: string;
  readonly evidenceId: string;
  readonly grade: string; // "SIGINT_VERIFIED", etc.
  readonly weight: number; // fusion confidence
}

export type FeedbackOutcome = "agree" | "disagree" | "modify" | "dismiss";

export interface OfficerFeedback {
  readonly traceId: string;
  readonly at: string;
  readonly officerHash: string;
  readonly outcome: FeedbackOutcome;
  readonly note?: string; // PII-scrubbed
}

export interface ErrorLog {
  readonly traceId: string;
  readonly at: string;
  readonly stage: PipelineStage;
  readonly message: string;
  readonly stack?: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface LogRecord {
  readonly at: string;
  readonly level: LogLevel;
  readonly msg: string;
  readonly fields: Readonly<Record<string, unknown>>;
}
