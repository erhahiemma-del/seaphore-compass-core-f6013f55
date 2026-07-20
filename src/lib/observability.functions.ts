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
  // Serialise ring-buffer records to plain JSON to satisfy the RPC boundary.
  const toJson = <T,>(rows: readonly T[]) => JSON.parse(JSON.stringify(rows)) as T[];
  return {
    at: new Date().toISOString(),
    snapshot: JSON.parse(JSON.stringify(snapshot)) as typeof snapshot,
    alerts: toJson(alerts),
    recentErrors: toJson(observability.store.errors.all().slice(-20).reverse()),
    recentFeedback: toJson(observability.store.feedback.all().slice(-20).reverse()),
    recentQueries: toJson(observability.store.queries.all().slice(-20).reverse()),
  };
});
