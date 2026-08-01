/**
 * INT-01A.2 — Maritime Intelligence Observatory (MIO)
 * Route: /admin/mio | Admin only | Live runtime data
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {

/** Optional registry counters projected by newer MIC revisions. */
interface MioRegistryExtras {
  intelligenceObjects?: number;
  resolutionMerges?: number;
  intelligenceObjectsByKind?: Record<string, number>;
}
  getMioRegistrySnapshotFn,
  getMioExecutionHistoryFn,
  getMioPipelineStatusFn,
  getMioConnectorStatusFn,
  getMioRiskDistributionFn,
} from "@/lib/mio/mio.functions";

export const Route = createFileRoute("/admin/mio")({
  head: () => ({
    meta: [{ title: "Maritime Intelligence Observatory · Seaphore" }],
  }),
  component: MIOPage,
});

type Tab = "pipeline" | "registries" | "executions" | "risk" | "connectors";

const STATUS_COLORS: Record<string, string> = {
  healthy: "text-emerald-600 bg-emerald-50 border-emerald-200",
  warning: "text-amber-700  bg-amber-50  border-amber-200",
  critical: "text-red-700    bg-red-50    border-red-200",
  "not-run": "text-slate-500  bg-slate-50  border-slate-200",
  degraded: "text-amber-700  bg-amber-50  border-amber-200",
  success: "text-emerald-600 bg-emerald-50 border-emerald-200",
  failed: "text-red-700    bg-red-50    border-red-200",
  unknown: "text-slate-400  bg-slate-50  border-slate-200",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number | null;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value ?? "—"}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MIOPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const [registrySnap, setRegistrySnap] = useState<Awaited<
    ReturnType<typeof getMioRegistrySnapshotFn>
  > | null>(null);
  const [execHistory, setExecHistory] = useState<Awaited<
    ReturnType<typeof getMioExecutionHistoryFn>
  > | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<Awaited<
    ReturnType<typeof getMioPipelineStatusFn>
  > | null>(null);
  const [connectors, setConnectors] = useState<Awaited<
    ReturnType<typeof getMioConnectorStatusFn>
  > | null>(null);
  const [riskDist, setRiskDist] = useState<Awaited<
    ReturnType<typeof getMioRiskDistributionFn>
  > | null>(null);

  const fetchRegistry = useServerFn(getMioRegistrySnapshotFn);
  const fetchHistory = useServerFn(getMioExecutionHistoryFn);
  const fetchPipeline = useServerFn(getMioPipelineStatusFn);
  const fetchConnectors = useServerFn(getMioConnectorStatusFn);
  const fetchRisk = useServerFn(getMioRiskDistributionFn);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [reg, hist, pipe, conn, risk] = await Promise.all([
        fetchRegistry({}),
        fetchHistory({}),
        fetchPipeline({}),
        fetchConnectors({}),
        fetchRisk({}),
      ]);
      setRegistrySnap(reg);
      setExecHistory(hist);
      setPipelineStatus(pipe);
      setConnectors(conn);
      setRiskDist(risk);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("[MIO] refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchRegistry, fetchHistory, fetchPipeline, fetchConnectors, fetchRisk]);

  useEffect(() => {
    refresh();
  }, []);

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "pipeline", label: "Pipeline Monitor" },
    { id: "registries", label: "Registry Explorer" },
    { id: "executions", label: "Execution History" },
    { id: "risk", label: "Risk Monitor" },
    { id: "connectors", label: "Connector Status" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Maritime Intelligence Observatory
            </h1>
            <p className="text-xs text-muted-foreground">
              Live runtime state · All data from production services · Admin only
              {lastRefresh && (
                <span className="ml-2 text-emerald-600">Last refresh: {lastRefresh}</span>
              )}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ── PIPELINE MONITOR ── */}
        {tab === "pipeline" && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Intelligence pipeline health. MIC stage data is sourced from the telemetry
              CapturingSink — populated after the first Copilot query.
            </p>

            {/* Summary stats */}
            {pipelineStatus?.summary && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <StatCard label="Total executions" value={pipelineStatus.summary.totalExecutions} />
                <StatCard
                  label="Success"
                  value={pipelineStatus.summary.successCount}
                  sub="outcome=success"
                />
                <StatCard
                  label="Degraded"
                  value={pipelineStatus.summary.degradedCount}
                  sub="with warnings"
                />
                <StatCard
                  label="Failed"
                  value={pipelineStatus.summary.failedCount}
                  sub="outcome=failed"
                />
                <StatCard label="Avg latency" value={`${pipelineStatus.summary.avgDurationMs}ms`} />
                <StatCard label="Min latency" value={`${pipelineStatus.summary.minDurationMs}ms`} />
                <StatCard label="Max latency" value={`${pipelineStatus.summary.maxDurationMs}ms`} />
              </div>
            )}

            {/* Full pipeline */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Intelligence Pipeline
                </span>
              </div>
              <div className="divide-y divide-border">
                {(pipelineStatus?.pipeline ?? []).map((stage) => (
                  <div key={stage.stage} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={stage.status} />
                      <span className="font-medium text-foreground">{stage.stage}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {stage.latencyMs != null && (
                        <span className="font-mono">{stage.latencyMs}ms</span>
                      )}
                      <span>{stage.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MIC stage breakdown */}
            {(pipelineStatus?.micStages ?? []).length > 0 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-4 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    MIC Stage Breakdown (last execution)
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {pipelineStatus!.micStages.map((s) => (
                    <div key={s.stage} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={s.status} />
                        <span className="font-mono text-xs text-foreground">{s.stage}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full bg-emerald-500/20"
                          style={{ width: `${Math.max(4, Math.min(200, s.durationMs))}px` }}
                        />
                        <span className="font-mono text-xs text-muted-foreground w-14 text-right">
                          {s.durationMs}ms
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REGISTRY EXPLORER ── */}
        {tab === "registries" && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Live state of all 8 MIC registries and the Maritime Knowledge Graph. Counts grow as
              Copilot queries are processed.
            </p>
            {registrySnap ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
                  <StatCard
                    label="Base entities"
                    value={registrySnap.registries.entities}
                    sub="canonical intelligence objects"
                  />
                  <StatCard
                    label="IO objects"
                    value={(registrySnap.registries as MioRegistryExtras).intelligenceObjects ?? 0}
                    sub="typed entity layer"
                  />
                  <StatCard
                    label="Resolution merges"
                    value={(registrySnap.registries as MioRegistryExtras).resolutionMerges ?? 0}
                    sub="duplicate entities merged"
                  />
                  <StatCard
                    label="Relationships"
                    value={registrySnap.registries.relationships}
                    sub="graph edges (non-alias)"
                  />
                  <StatCard
                    label="Evidence records"
                    value={registrySnap.registries.evidence}
                    sub="from all providers"
                  />
                  <StatCard
                    label="Confidence entries"
                    value={registrySnap.registries.confidence}
                    sub="multi-factor scores"
                  />
                  <StatCard
                    label="Timeline events"
                    value={registrySnap.registries.timelineEvents}
                    sub="chronological intelligence"
                  />
                  <StatCard
                    label="Risk profiles"
                    value={registrySnap.registries.riskProfiles}
                    sub="entity risk scores"
                  />
                </div>
                {(registrySnap.registries as MioRegistryExtras).intelligenceObjectsByKind &&
                  Object.keys((registrySnap.registries as MioRegistryExtras).intelligenceObjectsByKind).length >
                    0 && (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Entity Activity by Kind
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries(
                          (registrySnap.registries as MioRegistryExtras).intelligenceObjectsByKind ?? {},
                        ).map(([kind, count]) => (
                          <div
                            key={kind}
                            className="flex items-center justify-between text-xs border border-border rounded p-2"
                          >
                            <span className="text-muted-foreground">{kind}</span>
                            <span className="font-semibold text-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Knowledge Graph
                    </div>
                    <div className="flex gap-8">
                      <div>
                        <div className="text-3xl font-semibold text-foreground">
                          {registrySnap.graph.nodes}
                        </div>
                        <div className="text-xs text-muted-foreground">Nodes</div>
                      </div>
                      <div>
                        <div className="text-3xl font-semibold text-foreground">
                          {registrySnap.graph.edges}
                        </div>
                        <div className="text-xs text-muted-foreground">Edges</div>
                      </div>
                    </div>
                    {registrySnap.graph.connectors.length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        Connectors: {registrySnap.graph.connectors.join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Telemetry Summary
                    </div>
                    {registrySnap.telemetry ? (
                      <dl className="space-y-1.5 text-xs">
                        {[
                          ["Total executions", registrySnap.telemetry.totalExecutions],
                          [
                            "Success / Degraded / Failed",
                            `${registrySnap.telemetry.successCount} / ${registrySnap.telemetry.degradedCount} / ${registrySnap.telemetry.failedCount}`,
                          ],
                          ["Avg duration", `${registrySnap.telemetry.avgDurationMs}ms`],
                          ["Warnings total", registrySnap.telemetry.warningCount],
                          ["Errors total", registrySnap.telemetry.errorCount],
                          ["Last executed", registrySnap.telemetry.lastExecutedAt ?? "—"],
                        ].map(([k, v]) => (
                          <div key={String(k)} className="flex justify-between">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="font-mono font-medium text-foreground">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No executions yet. Run a Copilot query to populate.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading registry state…</p>
            )}
          </div>
        )}

        {/* ── EXECUTION HISTORY ── */}
        {tab === "executions" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Rolling window of the last 100 MIC executions (newest first). Populated by the
              CapturingSink on every Copilot query.
            </p>
            {execHistory && execHistory.executions.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {[
                        "Time",
                        "Outcome",
                        "Duration",
                        "Entities",
                        "Evidence",
                        "Risk",
                        "Timeline",
                        "Heap MB",
                        "Warnings",
                        "Errors",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {execHistory.executions.map((e) => (
                      <tr key={e.executionId} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                          {e.timestamp.slice(11, 19)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={e.outcome} />
                        </td>
                        <td className="px-3 py-2 font-mono">{e.totalDurationMs}ms</td>
                        <td className="px-3 py-2 font-mono">{e.entitiesRegistered}</td>
                        <td className="px-3 py-2 font-mono">{e.evidenceRegistered}</td>
                        <td className="px-3 py-2 font-mono">{e.riskProfilesComputed}</td>
                        <td className="px-3 py-2 font-mono">{e.timelineEvents}</td>
                        <td className="px-3 py-2 font-mono">{e.heapUsedMb ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">
                          {e.warnings.length > 0 ? (
                            <span className="text-amber-600">{e.warnings.length}</span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {e.errors.length > 0 ? (
                            <span className="text-red-600">{e.errors.length}</span>
                          ) : (
                            "0"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-10 text-center">
                <p className="text-sm font-medium text-foreground">No executions captured yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send a Copilot query from the main interface. The MIC will execute automatically
                  and execution data will appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── RISK MONITOR ── */}
        {tab === "risk" && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Risk distribution across all entities in the MIC risk registry. Populated as UIPs are
              processed.
            </p>
            {riskDist ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Critical" value={riskDist.byCritical} sub="score ≥ 75" />
                  <StatCard label="High" value={riskDist.byHigh} sub="score 50–74" />
                  <StatCard label="Elevated" value={riskDist.byElevated} sub="score 25–49" />
                  <StatCard label="Low" value={riskDist.byLow} sub="score < 25" />
                </div>
                {riskDist.topRisk.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="border-b border-border bg-muted/30 px-4 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Top Risk Entities
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {riskDist.topRisk.map((r) => (
                        <div key={r.entityId} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                  {r.entityLabel}
                                </span>
                                <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {r.entityKind}
                                </span>
                                <StatusBadge status={r.band} />
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">{r.narrative}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-lg font-bold text-foreground">
                                {r.score.toFixed(0)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {r.indicators} indicators
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {riskDist.total === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No risk profiles yet. Send a Copilot query to populate.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading risk data…</p>
            )}
          </div>
        )}

        {/* ── CONNECTOR STATUS ── */}
        {tab === "connectors" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All registered Evidence Providers from the certified catalog. For live health probes,
              see Provider Health.
            </p>
            {connectors && (
              <>
                <div className="flex gap-4 text-sm">
                  <span className="font-medium">{connectors.total} providers registered</span>
                  <span className="text-emerald-600">{connectors.certified} certified</span>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {[
                          "Provider",
                          "Sprint",
                          "Authentication",
                          "Credential Env",
                          "Certification",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-medium text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {connectors.providers.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{p.sprint}</td>
                          <td className="px-3 py-2">{p.authentication}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">
                            {p.credentialEnv.length > 0 ? p.credentialEnv.join(", ") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge
                              status={p.certification === "CERTIFIED" ? "healthy" : "warning"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
