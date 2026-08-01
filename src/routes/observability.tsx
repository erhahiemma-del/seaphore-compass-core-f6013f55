/**
 * Sprint 11 · Ops Observability Dashboard.
 *
 * Real-time metrics: throughput, per-stage latency percentiles, error rate,
 * model usage, officer feedback breakdown, and firing alerts. Polls every
 * 2 s. Read-only — no mutations.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getObservabilitySnapshot } from "@/lib/observability.functions";
import { PIPELINE_STAGES } from "@/services/observability";

export const Route = createFileRoute("/observability")({
  head: () => ({
    meta: [
      { title: "Observability · Seaphore Ops" },
      {
        name: "description",
        content: "Real-time pipeline metrics, model usage, feedback, and alerts.",
      },
    ],
  }),
  component: ObservabilityDashboard,
});

function ObservabilityDashboard() {
  const q = useQuery({
    queryKey: ["observability", "snapshot"],
    queryFn: () => getObservabilitySnapshot(),
    refetchInterval: 2000,
  });

  if (!q.data)
    return <div className="p-6 text-sm text-muted-foreground">Loading pipeline metrics…</div>;
  const { snapshot, alerts, recentErrors, recentFeedback, recentQueries } = q.data;
  const totalQueries = snapshot.counters["queries_total"] ?? 0;
  const completed = snapshot.counters['queries_completed_total{ok="true"}'] ?? 0;
  const failed = snapshot.counters['queries_completed_total{ok="false"}'] ?? 0;
  const errorRate = totalQueries === 0 ? 0 : ((failed / totalQueries) * 100).toFixed(1);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ops Observability</h1>
          <p className="text-sm text-muted-foreground">
            Live pipeline metrics. Last snapshot: {new Date(q.data.at).toLocaleTimeString()}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Auto-refresh · 2s · Evidence first. Explainable always. Officer decides.
        </div>
      </header>

      {alerts.length > 0 && (
        <section
          aria-label="Firing alerts"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
          <h2 className="text-sm font-semibold text-destructive">Firing alerts</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.rule}>
                <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-xs font-mono">
                  {a.severity}
                </span>{" "}
                <strong>{a.rule}</strong> — {a.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Queries" value={totalQueries} />
        <Kpi label="Completed" value={completed} />
        <Kpi label="Failed" value={failed} />
        <Kpi label="Error rate" value={`${errorRate}%`} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Per-stage latency (ms)
        </h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Stage</th>
                <th className="p-2 text-right">count</th>
                <th className="p-2 text-right">p50</th>
                <th className="p-2 text-right">p90</th>
                <th className="p-2 text-right">p95</th>
                <th className="p-2 text-right">p99</th>
                <th className="p-2 text-right">max</th>
              </tr>
            </thead>
            <tbody>
              {PIPELINE_STAGES.map((s) => {
                const h = snapshot.histograms[`pipeline_stage_ms{stage="${s}"}`];
                return (
                  <tr key={s} className="border-t">
                    <td className="p-2 font-mono">{s}</td>
                    <td className="p-2 text-right">{h?.count ?? 0}</td>
                    <td className="p-2 text-right">{h?.p50?.toFixed(1) ?? "—"}</td>
                    <td className="p-2 text-right">{h?.p90?.toFixed(1) ?? "—"}</td>
                    <td className="p-2 text-right">{h?.p95?.toFixed(1) ?? "—"}</td>
                    <td className="p-2 text-right">{h?.p99?.toFixed(1) ?? "—"}</td>
                    <td className="p-2 text-right">{h?.max?.toFixed(1) ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="Officer feedback">
          <ul className="text-sm">
            {(["agree", "disagree", "modify", "dismiss"] as const).map((o) => (
              <li key={o} className="flex justify-between border-b py-1 last:border-b-0">
                <span className="capitalize">{o}</span>
                <span className="font-mono">
                  {snapshot.counters[`feedback_total{outcome="${o}"}`] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Model usage">
          <ul className="text-sm">
            {Object.entries(snapshot.counters)
              .filter(([k]) => k.startsWith("model_calls_total{"))
              .slice(0, 10)
              .map(([k, v]) => (
                <li key={k} className="flex justify-between border-b py-1 last:border-b-0">
                  <span className="truncate font-mono text-xs">{k}</span>
                  <span className="font-mono">{v}</span>
                </li>
              ))}
            {Object.keys(snapshot.counters).filter((k) => k.startsWith("model_calls_total{"))
              .length === 0 && <li className="text-muted-foreground">No model calls yet.</li>}
          </ul>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="Recent queries">
          <ul className="space-y-1 text-xs">
            {recentQueries.map((q) => (
              <li key={q.id} className="truncate">
                <span className="font-mono text-muted-foreground">
                  {new Date(q.at).toLocaleTimeString()}
                </span>{" "}
                <span className="font-mono">{q.officerHash}</span>{" "}
                <em className="text-primary">{q.intent}</em> — {q.queryText}
              </li>
            ))}
            {recentQueries.length === 0 && <li className="text-muted-foreground">None yet.</li>}
          </ul>
        </Panel>

        <Panel title="Recent errors">
          <ul className="space-y-1 text-xs">
            {recentErrors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString()}
                </span>{" "}
                <span className="rounded bg-destructive/10 px-1 font-mono">{e.stage}</span>{" "}
                {e.message}
              </li>
            ))}
            {recentErrors.length === 0 && (
              <li className="text-muted-foreground">No errors — nice.</li>
            )}
          </ul>
        </Panel>
      </section>

      <section>
        <Panel title="Recent feedback">
          <ul className="space-y-1 text-xs">
            {recentFeedback.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-muted-foreground">
                  {new Date(f.at).toLocaleTimeString()}
                </span>{" "}
                <span className="font-mono">{f.officerHash}</span>{" "}
                <span className="capitalize">{f.outcome}</span> · trace{" "}
                <span className="font-mono">{f.traceId}</span>
                {f.note && <> — {f.note}</>}
              </li>
            ))}
            {recentFeedback.length === 0 && (
              <li className="text-muted-foreground">No feedback yet.</li>
            )}
          </ul>
        </Panel>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
