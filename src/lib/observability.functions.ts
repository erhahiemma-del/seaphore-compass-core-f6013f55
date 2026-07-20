/**
 * Sprint 11 · Observability server functions.
 *
 * `getObservabilitySnapshot` returns metrics + recent errors/feedback for
 * the ops dashboard, evaluating alert rules on read so the panel always
 * reflects current state.
 */
import { createServerFn } from "@tanstack/react-start";
import { observability } from "@/services/observability";

export const getObservabilitySnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const snapshot = observability.snapshot();
  const alerts = observability.alerts.evaluate(observability.metrics);
  return {
    at: new Date().toISOString(),
    snapshot,
    alerts,
    recentErrors: observability.store.errors.all().slice(-20).reverse(),
    recentFeedback: observability.store.feedback.all().slice(-20).reverse(),
    recentQueries: observability.store.queries.all().slice(-20).reverse(),
  };
});
