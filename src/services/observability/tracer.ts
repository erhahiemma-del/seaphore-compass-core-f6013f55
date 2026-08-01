/**
 * Sprint 11 · Pipeline tracer.
 *
 * Wraps the six-stage Copilot pipeline with structured logging, per-stage
 * timings, model/evidence usage, and error capture. Every trace has a
 * `traceId` used to correlate downstream officer feedback.
 *
 *   const trace = observability.startQuery({ officerId, intent, queryText })
 *   const classification = await trace.stage("classification", () => ...)
 *   trace.recordModel({ stage: "reasoning", model, tier, ... })
 *   trace.recordEvidence({ evidenceId, grade, weight })
 *   trace.finish({ ok: true })
 */
import type { Logger } from "./logger";
import type { MetricsRegistry } from "./metrics";
import { officerHash, scrub } from "./pii";
import type { ObservabilityStore } from "./store";
import type { ErrorLog, EvidenceUsage, ModelUsage, PipelineStage, QueryLog } from "./types";

export interface QueryContext {
  readonly officerId: string;
  readonly intent: string;
  readonly queryText: string;
  readonly workspace?: string;
}

export interface Trace {
  readonly id: string;
  readonly startedAt: number;
  stage<T>(stage: PipelineStage, fn: () => T | Promise<T>): Promise<T>;
  recordModel(u: Omit<ModelUsage, "traceId">): void;
  recordEvidence(e: Omit<EvidenceUsage, "traceId">): void;
  recordError(err: unknown, stage: PipelineStage, context?: Record<string, unknown>): void;
  finish(opts: { ok: boolean }): void;
}

export interface Tracer {
  startQuery(ctx: QueryContext): Trace;
}

let counter = 0;
function newTraceId(): string {
  return `trc_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}

export interface TracerDeps {
  logger: Logger;
  metrics: MetricsRegistry;
  store: ObservabilityStore;
}

export function createTracer({ logger, metrics, store }: TracerDeps): Tracer {
  return {
    startQuery(ctx) {
      const id = newTraceId();
      const startedAt = Date.now();
      const scrubbedText = scrub(ctx.queryText);
      const hash = officerHash(ctx.officerId);

      const query: QueryLog = Object.freeze({
        id,
        at: new Date(startedAt).toISOString(),
        officerHash: hash,
        intent: ctx.intent,
        queryText: scrubbedText,
        workspace: ctx.workspace,
      });
      store.queries.push(query);
      metrics.incr("queries_total", 1, { intent: ctx.intent });
      logger.info("query.received", {
        traceId: id,
        officerHash: hash,
        intent: ctx.intent,
        workspace: ctx.workspace,
      });

      const trace: Trace = {
        id,
        startedAt,
        async stage(stage, fn) {
          const t0 = Date.now();
          let ok = true;
          try {
            return await fn();
          } catch (err) {
            ok = false;
            trace.recordError(err, stage);
            throw err;
          } finally {
            const durationMs = Date.now() - t0;
            store.timings.push(
              Object.freeze({ traceId: id, stage, startedAt: t0, durationMs, ok }),
            );
            metrics.observe("pipeline_stage_ms", durationMs, { stage });
            metrics.incr("pipeline_stage_total", 1, { stage, ok: ok ? "true" : "false" });
            logger.debug("stage.timing", { traceId: id, stage, durationMs, ok });
          }
        },
        recordModel(u) {
          const rec: ModelUsage = Object.freeze({ ...u, traceId: id });
          store.models.push(rec);
          metrics.incr("model_calls_total", 1, {
            model: u.model,
            tier: String(u.tier),
            stage: u.stage,
          });
          metrics.incr("tokens_prompt_total", u.promptTokens, { model: u.model });
          metrics.incr("tokens_completion_total", u.completionTokens, { model: u.model });
          metrics.incr("cost_credits_total", u.costCredits, { model: u.model });
        },
        recordEvidence(e) {
          const rec: EvidenceUsage = Object.freeze({ ...e, traceId: id });
          store.evidence.push(rec);
          metrics.incr("evidence_used_total", 1, { grade: e.grade });
        },
        recordError(err, stage, context = {}) {
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          const rec: ErrorLog = Object.freeze({
            traceId: id,
            at: new Date().toISOString(),
            stage,
            message,
            stack,
            context: Object.freeze({ ...context }),
          });
          store.errors.push(rec);
          metrics.incr("pipeline_errors_total", 1, { stage });
          logger.error("pipeline.error", { traceId: id, stage, message });
        },
        finish({ ok }) {
          const total = Date.now() - startedAt;
          store.timings.push(
            Object.freeze({ traceId: id, stage: "total", startedAt, durationMs: total, ok }),
          );
          metrics.observe("pipeline_stage_ms", total, { stage: "total" });
          metrics.incr("queries_completed_total", 1, { ok: ok ? "true" : "false" });
          logger.info("query.completed", { traceId: id, ok, totalMs: total });
        },
      };
      return trace;
    },
  };
}
