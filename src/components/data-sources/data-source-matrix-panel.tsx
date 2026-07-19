/**
 * DataSourceMatrixPanel — full-matrix table for Administration Center.
 * Shows every Data Source Matrix entry, its live health, and lets
 * administrators trigger a fresh round of health checks.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useDataSources } from "@/hooks/use-data-sources";
import { runDataSourceHealthChecks } from "@/lib/data-sources.functions";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceStatusBadge } from "./source-status-badge";
import { toast } from "sonner";

export function DataSourceMatrixPanel() {
  const { data: sources, isLoading, refetch } = useDataSources();
  const runChecks = useServerFn(runDataSourceHealthChecks);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const trigger = async () => {
    setBusy(true);
    try {
      const res = await runChecks({});
      toast.success(`Health check complete — ${res.checked} sources probed`);
      await qc.invalidateQueries({ queryKey: ["data-sources"] });
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Data Source Matrix</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Reality over Assumption — {sources?.length ?? 0} sources tracked. Every UI number cites one of these.
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
                  <th className="py-2 pr-4">Health</th>
                  <th className="py-2 pr-4">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sources?.map((s) => (
                  <tr key={s.id} className="border-b border-border/30 align-top">
                    <td className="py-2 pr-4 font-medium">{s.dataType}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.provider}</td>
                    <td className="py-2 pr-4">
                      <SourceStatusBadge source={s} compact />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {s.latestHealth
                        ? `${s.latestHealth.state}${s.latestHealth.latencyMs != null ? ` · ${s.latestHealth.latencyMs}ms` : ""}`
                        : "no check yet"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground max-w-md">{s.notes}</td>
                  </tr>
                ))}
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
