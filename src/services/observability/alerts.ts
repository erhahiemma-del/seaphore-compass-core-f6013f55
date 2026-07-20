/**
 * Sprint 11 · Alert engine — thresholded, subscription-based.
 *
 * Alerts fire when a counter or histogram percentile crosses a threshold
 * over the current snapshot window. Subscribers can pipe to Slack/PagerDuty
 * in Sprint 12; this sprint ships an in-memory subscriber suitable for the
 * ops dashboard.
 */
import type { MetricsRegistry, MetricsSnapshot } from "./metrics";

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertRule {
  readonly name: string;
  readonly description: string;
  readonly severity: AlertSeverity;
  /** Return `true` if the rule fires against the snapshot. */
  evaluate(snapshot: MetricsSnapshot): boolean;
}

export interface AlertEvent {
  readonly at: string;
  readonly rule: string;
  readonly severity: AlertSeverity;
  readonly description: string;
  readonly snapshotAt: string;
}

/** Sprint 11 defaults — tune later. */
export function defaultRules(): AlertRule[] {
  return [
    {
      name: "error_rate_high",
      severity: "critical",
      description: "Pipeline error count exceeded 20 in the current window.",
      evaluate: (s) => (s.counters["pipeline_errors_total"] ?? 0) > 20,
    },
    {
      name: "latency_p95_slow",
      severity: "warning",
      description: "Total pipeline p95 latency > 3000 ms.",
      evaluate: (s) => (s.histograms['pipeline_stage_ms{stage="total"}']?.p95 ?? 0) > 3000,
    },
    {
      name: "reasoning_p99_slow",
      severity: "warning",
      description: "Reasoning stage p99 latency > 5000 ms.",
      evaluate: (s) => (s.histograms['pipeline_stage_ms{stage="reasoning"}']?.p99 ?? 0) > 5000,
    },
    {
      name: "disagree_rate_high",
      severity: "warning",
      description: "Officer disagree/dismiss ratio > 30% over the window.",
      evaluate: (s) => {
        const dis = (s.counters['feedback_total{outcome="disagree"}'] ?? 0)
                  + (s.counters['feedback_total{outcome="dismiss"}'] ?? 0);
        const total = ["agree", "disagree", "modify", "dismiss"]
          .reduce((acc, o) => acc + (s.counters[`feedback_total{outcome="${o}"}`] ?? 0), 0);
        return total >= 10 && dis / total > 0.3;
      },
    },
  ];
}

export interface AlertEngine {
  addRule(rule: AlertRule): void;
  evaluate(registry: MetricsRegistry): readonly AlertEvent[];
  subscribe(fn: (e: AlertEvent) => void): () => void;
  recent(limit?: number): readonly AlertEvent[];
}

export function createAlertEngine(rules: AlertRule[] = defaultRules()): AlertEngine {
  const ruleList = rules.slice();
  const subs = new Set<(e: AlertEvent) => void>();
  const history: AlertEvent[] = [];

  return {
    addRule(rule) { ruleList.push(rule); },
    evaluate(registry) {
      const snap = registry.snapshot();
      const snapshotAt = new Date().toISOString();
      const fired: AlertEvent[] = [];
      for (const r of ruleList) {
        if (r.evaluate(snap)) {
          const evt: AlertEvent = Object.freeze({
            at: snapshotAt, snapshotAt,
            rule: r.name, severity: r.severity, description: r.description,
          });
          fired.push(evt);
          history.push(evt);
          for (const fn of subs) { try { fn(evt); } catch { /* noop */ } }
        }
      }
      if (history.length > 500) history.splice(0, history.length - 500);
      return fired;
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    recent(limit = 50) { return history.slice(-limit).reverse(); },
  };
}
