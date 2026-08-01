/**
 * INT-01A.1 — MIC Health Dashboard
 * Routes: /admin/intelligence-core/health, /status, /metrics
 * Admin only. Three-panel view.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  getMicHealthFn,
  getMicStatusFn,
  getMicMetricsFn,
} from "@/lib/intelligence-core/health.functions";

export const Route = createFileRoute("/admin/intelligence-core")({
  head: () => ({ meta: [{ title: "Intelligence Core Health · Seaphore" }] }),
  component: IntelligenceCoreHealth,
});

type Health = Awaited<ReturnType<typeof getMicHealthFn>>;
type Status = Awaited<ReturnType<typeof getMicStatusFn>>;
type Metrics = Awaited<ReturnType<typeof getMicMetricsFn>>;

const STATUS_COLOR: Record<string, string> = {
  healthy: "text-emerald-600 bg-emerald-50 border-emerald-200",
  warning: "text-amber-700  bg-amber-50  border-amber-200",
  degraded: "text-amber-700  bg-amber-50  border-amber-200",
  disabled: "text-slate-500  bg-slate-50  border-slate-200",
  idle: "text-sky-600    bg-sky-50    border-sky-200",
  failed: "text-red-700    bg-red-50    border-red-200",
  success: "text-emerald-600 bg-emerald-50 border-emerald-200",
};

function Chip({ label }: { label: string }) {
  const cls = STATUS_COLOR[label.toLowerCase()] ?? "text-slate-500 bg-slate-50 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function KV({
  k,
  v,
  mono,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-b-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={`text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {v === null || v === undefined ? "—" : v}
      </dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function IntelligenceCoreHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useServerFn(getMicHealthFn);
  const fetchStatus = useServerFn(getMicStatusFn);
  const fetchMetrics = useServerFn(getMicMetricsFn);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, s, m] = await Promise.all([fetchHealth({}), fetchStatus({}), fetchMetrics({})]);
      setHealth(h);
      setStatus(s);
      setMetrics(m);
      setLastAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, [fetchHealth, fetchStatus, fetchMetrics]);

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Intelligence Core Health</h1>
          <p className="text-xs text-muted-foreground">
            MIC runtime status · Admin only
            {lastAt && <span className="ml-2 text-emerald-600">Updated {lastAt}</span>}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Liveness strip */}
      {health && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Status", val: <Chip label={health.status} /> },
            {
              label: "Feature Flag",
              val: <Chip label={health.enabled ? "enabled" : "disabled"} />,
            },
            {
              label: "Flag Source",
              val: <span className="font-mono text-xs">{health.flagSource}</span>,
            },
            { label: "Graph Live", val: <Chip label={health.graphLive ? "yes" : "no"} /> },
            {
              label: "Uptime",
              val: `${Math.floor(health.uptimeSeconds / 60)}m ${health.uptimeSeconds % 60}s`,
            },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
              <div className="mt-1">{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status panel */}
        <Panel title="Registry Status">
          {status ? (
            <dl>
              <KV k="Entities" v={status.registries.entities} mono />
              <KV k="Relationships" v={status.registries.relationships} mono />
              <KV k="Evidence" v={status.registries.evidence} mono />
              <KV k="Confidence" v={status.registries.confidence} mono />
              <KV k="Timeline events" v={status.registries.timelineEvents} mono />
              <KV k="Risk profiles" v={status.registries.riskProfiles} mono />
              <KV k="Graph nodes" v={status.graph.nodes} mono />
              <KV k="Graph edges" v={status.graph.edges} mono />
              <KV
                k="Executions"
                v={`${status.executions.total} total (${status.executions.success} ok / ${status.executions.failed} fail)`}
              />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </Panel>

        {/* Last execution */}
        <Panel title="Last Execution">
          {status?.lastExecution ? (
            <dl>
              <KV k="Execution ID" v={status.lastExecution.executionId} mono />
              <KV k="Timestamp" v={status.lastExecution.timestamp.replace("T", " ").slice(0, 19)} />
              <KV k="Outcome" v={<Chip label={status.lastExecution.outcome} />} />
              <KV k="Duration" v={`${status.lastExecution.durationMs}ms`} mono />
              <KV k="Entities" v={status.lastExecution.entities} mono />
              <KV k="Evidence" v={status.lastExecution.evidence} mono />
              <KV k="Risk profiles" v={status.lastExecution.risk} mono />
              <KV k="Warnings" v={status.lastExecution.warnings} mono />
              <KV k="Errors" v={status.lastExecution.errors} mono />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              {status?.enabled === false
                ? "MIC is disabled — set MIC_ENABLED=true to activate."
                : "No executions yet. Send a Copilot query to trigger the pipeline."}
            </p>
          )}
        </Panel>

        {/* Metrics panel */}
        <Panel title="Performance Metrics">
          {metrics ? (
            <dl>
              <KV
                k="Avg duration"
                v={
                  metrics.performance.avgDurationMs != null
                    ? `${metrics.performance.avgDurationMs}ms`
                    : null
                }
                mono
              />
              <KV
                k="Min / Max"
                v={
                  metrics.performance.minDurationMs != null
                    ? `${metrics.performance.minDurationMs}ms / ${metrics.performance.maxDurationMs}ms`
                    : null
                }
                mono
              />
              <KV
                k="P50"
                v={
                  metrics.performance.p50DurationMs != null
                    ? `${metrics.performance.p50DurationMs}ms`
                    : null
                }
                mono
              />
              <KV
                k="P95"
                v={
                  metrics.performance.p95DurationMs != null
                    ? `${metrics.performance.p95DurationMs}ms`
                    : null
                }
                mono
              />
              <KV
                k="Heap (last exec)"
                v={metrics.memory.heapUsedMb != null ? `${metrics.memory.heapUsedMb} MB` : null}
                mono
              />
              <KV
                k="Success rate"
                v={
                  metrics.reliability.successRate != null
                    ? `${metrics.reliability.successRate}%`
                    : null
                }
              />
              <KV
                k="Warning rate"
                v={
                  metrics.reliability.warningRate != null
                    ? `${metrics.reliability.warningRate}%`
                    : null
                }
              />
              <KV
                k="Failure rate"
                v={
                  metrics.reliability.failureRate != null
                    ? `${metrics.reliability.failureRate}%`
                    : null
                }
              />
              <KV k="Total warnings" v={metrics.reliability.totalWarnings} mono />
              <KV k="Total errors" v={metrics.reliability.totalErrors} mono />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </Panel>
      </div>

      {/* Scaling thresholds table */}
      {metrics && (
        <Panel title="Scaling Thresholds & Migration Guide">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Evidence records
                </th>
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Engineering action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metrics.scalingThresholds.map((t) => (
                <tr key={t.evidenceCount}>
                  <td className="py-1.5 font-mono text-foreground">
                    {t.evidenceCount.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{t.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Flag guide */}
      <Panel title="Feature Flag Reference">
        <dl className="space-y-0">
          <KV k="Server env (Lovable Cloud)" v="MIC_ENABLED=false  →  disables MIC" />
          <KV k="Browser / Vite env" v="VITE_MIC_ENABLED=false  →  disables in browser builds" />
          <KV k="Default (no flag set)" v="enabled=true" />
          <KV k="Reload required after change?" v="No — process.env is read per-execution" />
          <KV k="Current source" v={status?.flagSource ?? "—"} mono />
          <KV k="Raw value" v={status?.flagRaw ?? "(default)"} mono />
        </dl>
      </Panel>
    </div>
  );
}
