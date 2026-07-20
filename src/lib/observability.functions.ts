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
  // Round-trip through JSON so the payload is a plain, RPC-serialisable tree.
  const dto = {
    at: new Date().toISOString(),
    snapshot,
    alerts,
    recentErrors: observability.store.errors.all().slice(-20).reverse(),
    recentFeedback: observability.store.feedback.all().slice(-20).reverse(),
    recentQueries: observability.store.queries.all().slice(-20).reverse(),
  };
  return JSON.parse(JSON.stringify(dto)) as {
    at: string;
    snapshot: typeof snapshot;
    alerts: Array<{ at: string; rule: string; severity: string; description: string; snapshotAt: string }>;
    recentErrors: Array<{ traceId: string; at: string; stage: string; message: string; stack?: string; context: Record<string, string> }>;
    recentFeedback: Array<{ traceId: string; at: string; officerHash: string; outcome: string; note?: string }>;
    recentQueries: Array<{ id: string; at: string; officerHash: string; intent: string; queryText: string; workspace?: string }>;
  };
});
