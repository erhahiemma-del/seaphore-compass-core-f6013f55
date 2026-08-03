/**
 * Sprint 11 · Observability server functions.
 *
 * `getObservabilitySnapshot` returns metrics + recent errors/feedback for
 * the ops dashboard, evaluating alert rules on read so the panel always
 * reflects current state. Payload is mapped to plain records for the RPC
 * boundary (no `unknown`-typed maps, no readonly modifiers).
 */
import { createServerFn } from "@tanstack/react-start";
import { observability } from "@/services/observability";

interface ErrorDto {
  traceId: string;
  at: string;
  stage: string;
  message: string;
  stack?: string;
  context: Record<string, string>;
}
interface FeedbackDto {
  traceId: string;
  at: string;
  officerHash: string;
  outcome: string;
  note?: string;
}
interface QueryDto {
  id: string;
  at: string;
  officerHash: string;
  intent: string;
  queryText: string;
  workspace?: string;
}
interface AlertDto {
  at: string;
  rule: string;
  severity: string;
  description: string;
  snapshotAt: string;
}
interface HistDto {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}
interface SnapshotDto {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistDto>;
}
interface DashboardDto {
  at: string;
  snapshot: SnapshotDto;
  alerts: AlertDto[];
  recentErrors: ErrorDto[];
  recentFeedback: FeedbackDto[];
  recentQueries: QueryDto[];
}

export const getObservabilitySnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardDto> => {
    const snapshot = observability.snapshot();
    const alerts = observability.alerts.evaluate(observability.metrics);
    return {
      at: new Date().toISOString(),
      snapshot: {
        counters: { ...snapshot.counters },
        gauges: { ...snapshot.gauges },
        histograms: Object.fromEntries(
          Object.entries(snapshot.histograms).map(([k, v]) => [k, { ...v }]),
        ),
      },
      alerts: alerts.map((a) => ({
        at: a.at,
        rule: a.rule,
        severity: a.severity,
        description: a.description,
        snapshotAt: a.snapshotAt,
      })),
      recentErrors: observability.store.errors
        .all()
        .slice(-20)
        .reverse()
        .map((e) => ({
          traceId: e.traceId,
          at: e.at,
          stage: e.stage,
          message: e.message,
          stack: e.stack,
          context: Object.fromEntries(Object.entries(e.context).map(([k, v]) => [k, String(v)])),
        })),
      recentFeedback: observability.store.feedback
        .all()
        .slice(-20)
        .reverse()
        .map((f) => ({
          traceId: f.traceId,
          at: f.at,
          officerHash: f.officerHash,
          outcome: f.outcome,
          note: f.note,
        })),
      recentQueries: observability.store.queries
        .all()
        .slice(-20)
        .reverse()
        .map((q) => ({
          id: q.id,
          at: q.at,
          officerHash: q.officerHash,
          intent: q.intent,
          queryText: q.queryText,
          workspace: q.workspace,
        })),
    };
  },
);
