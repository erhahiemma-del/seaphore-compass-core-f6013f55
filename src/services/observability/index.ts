/**
 * Sprint 11 · Observability — assembled singleton + public API.
 *
 * `observability` binds the logger, metrics registry, store, tracer,
 * feedback recorder, and alert engine into a single object the app can
 * import from anywhere.
 */
import { createAlertEngine, defaultRules, type AlertEngine, type AlertRule } from "./alerts";
import { createFeedbackRecorder, type FeedbackRecorder } from "./feedback";
import { createLogger, type Logger } from "./logger";
import { createMetricsRegistry, type MetricsRegistry, type MetricsSnapshot } from "./metrics";
import { createObservabilityStore, type ObservabilityStore } from "./store";
import { createTracer, type Tracer } from "./tracer";

export * from "./types";
export * from "./pii";
export * from "./logger";
export * from "./metrics";
export * from "./store";
export * from "./tracer";
export * from "./alerts";
export * from "./feedback";
export * from "./loadtest";

export interface Observability {
  readonly logger: Logger;
  readonly metrics: MetricsRegistry;
  readonly store: ObservabilityStore;
  readonly tracer: Tracer;
  readonly feedback: FeedbackRecorder;
  readonly alerts: AlertEngine;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

export interface ObservabilityOptions {
  minLogLevel?: "debug" | "info" | "warn" | "error";
  historyCapacity?: number;
  alertRules?: AlertRule[];
}

export function createObservability(opts: ObservabilityOptions = {}): Observability {
  const logger = createLogger({ minLevel: opts.minLogLevel ?? "info" });
  const metrics = createMetricsRegistry();
  const store = createObservabilityStore(opts.historyCapacity ?? 1000);
  const tracer = createTracer({ logger, metrics, store });
  const feedback = createFeedbackRecorder(store, metrics, logger);
  const alerts = createAlertEngine(opts.alertRules ?? defaultRules());
  return {
    logger,
    metrics,
    store,
    tracer,
    feedback,
    alerts,
    snapshot: () => metrics.snapshot(),
    reset() {
      metrics.reset();
      store.queries.clear();
      store.timings.clear();
      store.models.clear();
      store.evidence.clear();
      store.feedback.clear();
      store.errors.clear();
    },
  };
}

/** Process-wide singleton. */
export const observability: Observability = createObservability();
