/**
 * Sprint 11 · Feedback correlator.
 *
 * Records officer feedback against a `traceId` and updates counters used by
 * the dashboard and disagree-rate alert.
 */
import type { Logger } from "./logger";
import type { MetricsRegistry } from "./metrics";
import { officerHash, scrub } from "./pii";
import type { ObservabilityStore } from "./store";
import type { FeedbackOutcome, OfficerFeedback } from "./types";

export interface FeedbackInput {
  readonly traceId: string;
  readonly officerId: string;
  readonly outcome: FeedbackOutcome;
  readonly note?: string;
}

export interface FeedbackRecorder {
  record(input: FeedbackInput): OfficerFeedback;
}

export function createFeedbackRecorder(
  store: ObservabilityStore,
  metrics: MetricsRegistry,
  logger: Logger,
): FeedbackRecorder {
  return {
    record(input) {
      const rec: OfficerFeedback = Object.freeze({
        traceId: input.traceId,
        at: new Date().toISOString(),
        officerHash: officerHash(input.officerId),
        outcome: input.outcome,
        note: input.note ? scrub(input.note) : undefined,
      });
      store.feedback.push(rec);
      metrics.incr("feedback_total", 1, { outcome: input.outcome });
      logger.info("feedback.recorded", { traceId: rec.traceId, outcome: rec.outcome });
      return rec;
    },
  };
}
