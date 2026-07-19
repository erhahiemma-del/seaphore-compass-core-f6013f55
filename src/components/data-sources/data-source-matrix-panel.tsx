/**
 * DataSourceMatrixPanel — full-matrix table for Administration Center.
 * Shows every Data Source Matrix entry, its live health, and lets
 * administrators trigger a fresh round of health checks. Each row
 * expands into a run-history drawer listing the last N health checks
 * (state, latency, error code + message) so trends and failures are
 * inspectable over time (HR-3 Explainability).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useDataSources } from "@/hooks/use-data-sources";
import { runDataSourceHealthChecks } from "@/lib/data-sources.functions";
import {
  listSourceHealthHistory,
  type HealthCheckRecord,
} from "@/services/data-sources.service";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceStatusBadge } from "./source-status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATE_STYLES: Record<HealthCheckRecord["state"], string> = {
  OK: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  DEGRADED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DOWN: "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  NOT_APPLICABLE: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function formatTs(iso: string) {
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function HealthHistoryRow({ sourceId }: { sourceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.dataSourceHealthHistory(sourceId, 25),
    queryFn: () => listSourceHealthHistory(sourceId, 25),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <tr>
        <td colSpan={5} className="py-3 text-xs text-muted-foreground">
          Loading history…
        </td>
      </tr>
    );
  }
  if (!data || data.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="py-3 text-xs text-muted-foreground italic">
          No health checks recorded yet. Run health checks to populate history.
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={5} className="bg-muted/20 px-3 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          Last {data.length} check{data.length === 1 ? "" : "s"} · newest first
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/40">
                <th className="py-1 pr-3 font-medium">Checked at</th>
                <th className="py-1 pr-3 font-medium">Outcome</th>
                <th className="py-1 pr-3 font-medium">Latency</th>
                <th className="py-1 pr-3 font-medium">Error code</th>
                <th className="py-1 pr-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((h) => (
                <tr key={h.id} className="border-b border-border/20 align-top">
                  <td className="py-1 pr-3 font-mono text-[11px]">{formatTs(h.checkedAt)}</td>
                  <td className="py-1 pr-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                        STATE_STYLES[h.state],
                      )}
                    >
                      {h.state}
                    </span>
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    {h.latencyMs != null ? `${h.latencyMs} ms` : "—"}
                  </td>
                  <td className="py-1 pr-3 font-mono text-[11px]">
                    {h.errorCode ?? "—"}
                  </td>
                  <td className="py-1 pr-3 text-muted-foreground max-w-md">
                    {h.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

export function DataSourceMatrixPanel() {
  const { data: sources, isLoading, refetch } = useDataSources();
  const runChecks = useServerFn(runDataSourceHealthChecks);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const trigger = async () => {
    setBusy(true);
    try {
      const res = await runChecks({});
      toast.success(`Health check complete — ${res.checked} sources probed`);
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.dataSources() });
      await qc.invalidateQueries({ queryKey: ["data-sources", "health-history"] });
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Data Source Matrix</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Reality over Assumption — {sources?.length ?? 0} sources tracked. Click a row to inspect its health-check run history.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={trigger} disabled={busy}>
          <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          <span className="ml-2">Run health checks</span>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading source registry…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-4">Data type</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Latest health</th>
                  <th className="py-2 pr-4">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sources?.map((s) => {
                  const isOpen = expanded === s.id;
                  return (
                    <>
                      <tr
                        key={s.id}
                        className="border-b border-border/30 align-top cursor-pointer hover:bg-muted/30"
                        onClick={() => toggle(s.id)}
                      >
                        <td className="py-2 pr-4 font-medium">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                                isOpen && "rotate-90",
                              )}
                            />
                            {s.dataType}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{s.provider}</td>
                        <td className="py-2 pr-4">
                          <SourceStatusBadge source={s} compact />
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {s.latestHealth ? (
                            <div className="flex flex-col gap-0.5">
                              <span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold mr-1.5",
                                    STATE_STYLES[s.latestHealth.state],
                                  )}
                                >
                                  {s.latestHealth.state}
                                </span>
                                {s.latestHealth.latencyMs != null
                                  ? `${s.latestHealth.latencyMs} ms`
                                  : ""}
                              </span>
                              <span className="font-mono text-[10px]">
                                {formatTs(s.latestHealth.checkedAt)}
                              </span>
                            </div>
                          ) : (
                            "no check yet"
                          )}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground max-w-md">{s.notes}</td>
                      </tr>
                      {isOpen && <HealthHistoryRow sourceId={s.id} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground italic">
          Evidence first. Explainable always. Officer decides.
        </p>
      </CardContent>
    </Card>
  );
}
