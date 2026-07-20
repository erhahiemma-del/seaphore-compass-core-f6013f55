/**
 * /admin/osint — OSINT Integration Engine dashboard.
 *
 * Officer+ only. Shows registered connectors with live health, recent
 * sync-run activity, and the dead-letter queue. Realtime subscriptions
 * refresh the view when the scheduler or a manual retry writes new rows.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, PlayCircle, PowerOff, RefreshCw, RotateCw, ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bootstrapOsintRegistry,
  forceSyncConnector,
  listOsintConnectors,
  listOsintDeadLetters,
  listOsintSyncRuns,
  retryDeadLetter,
  toggleConnectorActive,
} from "@/lib/osint/osint.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/osint")({
  head: () => ({
    meta: [
      { title: "OSINT Integration Engine · Seaphore" },
      {
        name: "description",
        content:
          "Registered OSINT connectors, live sync activity, and dead-letter queue for the Seaphore Integration Engine.",
      },
    ],
  }),
  component: OsintAdminPage,
});

function OsintAdminPage() {
  return (
    <AppShell
      title="OSINT Integration Engine"
      subtitle="Registered connectors. Live sync activity. Dead-letter queue."
      mode="dark"
    >
      <OsintDashboard />
    </AppShell>
  );
}

function OsintDashboard() {
  const qc = useQueryClient();
  const bootstrap = useServerFn(bootstrapOsintRegistry);
  const fetchConnectors = useServerFn(listOsintConnectors);
  const fetchRuns = useServerFn(listOsintSyncRuns);
  const fetchDlq = useServerFn(listOsintDeadLetters);

  // One-shot: make sure any in-code connectors are mirrored to the DB.
  useEffect(() => {
    bootstrap().catch((e) => console.warn("[OSINT] bootstrap failed", e));
  }, [bootstrap]);

  const connectors = useQuery({
    queryKey: ["osint", "connectors"],
    queryFn: () => fetchConnectors(),
    staleTime: 15_000,
  });
  const runs = useQuery({
    queryKey: ["osint", "runs"],
    queryFn: () => fetchRuns(),
    staleTime: 10_000,
  });
  const dlq = useQuery({
    queryKey: ["osint", "dlq"],
    queryFn: () => fetchDlq(),
    staleTime: 10_000,
  });

  // Realtime — refresh whenever the engine writes.
  useEffect(() => {
    const channel = supabase
      .channel("osint-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "osint_connectors" },
        () => qc.invalidateQueries({ queryKey: ["osint", "connectors"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "osint_sync_runs" },
        () => {
          qc.invalidateQueries({ queryKey: ["osint", "runs"] });
          qc.invalidateQueries({ queryKey: ["osint", "connectors"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "osint_dead_letters" },
        () => qc.invalidateQueries({ queryKey: ["osint", "dlq"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <div className="space-y-6 p-6">
      <ConnectorTable
        loading={connectors.isLoading}
        rows={connectors.data ?? []}
        onRefresh={() => connectors.refetch()}
      />
      <SyncRunsPanel loading={runs.isLoading} rows={runs.data ?? []} />
      <DeadLetterPanel loading={dlq.isLoading} rows={dlq.data ?? []} />
    </div>
  );
}

function ConnectorTable({
  loading,
  rows,
  onRefresh,
}: {
  loading: boolean;
  rows: Awaited<ReturnType<typeof listOsintConnectors>>;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const forceSync = useServerFn(forceSyncConnector);
  const toggle = useServerFn(toggleConnectorActive);
  const [busy, setBusy] = useState<string | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["osint"] });
  };

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="type-h3 text-foreground">Registered Connectors</h2>
          <p className="type-small text-slate">
            One row per connector in the registry. Adding a new source is a two-step change: implement
            ConnectorInterface and register it — no engine changes required.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
        </Button>
      </header>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate">
                  Loading connectors…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate">
                  No connectors registered yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="type-small text-slate">{c.description}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge active={c.is_active} lastStatus={c.last_sync_status} />
                  </TableCell>
                  <TableCell>{c.records_total.toLocaleString()}</TableCell>
                  <TableCell>
                    {c.last_sync_at
                      ? formatDistanceToNow(new Date(c.last_sync_at), { addSuffix: true })
                      : "never"}
                  </TableCell>
                  <TableCell>
                    <HealthBadge status={c.health_status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === c.id}
                        onClick={async () => {
                          setBusy(c.id);
                          try {
                            await forceSync({ data: { connectorId: c.id } });
                            invalidateAll();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        <PlayCircle className="mr-1 h-3.5 w-3.5" /> Force Sync
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === c.id}
                        onClick={async () => {
                          setBusy(c.id);
                          try {
                            await toggle({ data: { connectorId: c.id, isActive: !c.is_active } });
                            invalidateAll();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        <PowerOff className="mr-1 h-3.5 w-3.5" />
                        {c.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function StatusBadge({ active, lastStatus }: { active: boolean; lastStatus: string | null }) {
  if (!active) return <Badge className="bg-slate/20 text-slate">⚪ Disabled</Badge>;
  if (lastStatus === "failed") return <Badge className="bg-red-500/20 text-red-400">🔴 Error</Badge>;
  if (lastStatus === "partial")
    return <Badge className="bg-amber-500/20 text-amber-400">🟡 Partial</Badge>;
  if (lastStatus === "success")
    return <Badge className="bg-emerald-500/20 text-emerald-400">✅ Connected</Badge>;
  return <Badge className="bg-amber-500/20 text-amber-400">🟡 Syncing</Badge>;
}

function HealthBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const map = {
    healthy: { label: "🟢 Healthy", cls: "bg-emerald-500/20 text-emerald-400" },
    degraded: { label: "🟡 Degraded", cls: "bg-amber-500/20 text-amber-400" },
    down: { label: "🔴 Down", cls: "bg-red-500/20 text-red-400" },
  } as const;
  const it = map[status];
  return <Badge className={cn(it.cls)}>{it.label}</Badge>;
}

function SyncRunsPanel({
  loading,
  rows,
}: {
  loading: boolean;
  rows: Awaited<ReturnType<typeof listOsintSyncRuns>>;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-4 py-3">
        <h2 className="type-h3 text-foreground">Recent Sync Runs</h2>
        <p className="type-small text-slate">Last 20 runs across all connectors.</p>
      </header>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Connector</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fetched</TableHead>
              <TableHead>Ingested</TableHead>
              <TableHead>Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-slate">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-slate">
                  No sync runs yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.connector_name}</TableCell>
                  <TableCell>{formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}</TableCell>
                  <TableCell>
                    <RunStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>{r.records_fetched}</TableCell>
                  <TableCell>{r.records_ingested}</TableCell>
                  <TableCell>{r.latency_ms ? `${r.latency_ms} ms` : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const cls = {
    success: "bg-emerald-500/20 text-emerald-400",
    partial: "bg-amber-500/20 text-amber-400",
    failed: "bg-red-500/20 text-red-400",
    running: "bg-blue-500/20 text-blue-400",
  }[status] ?? "bg-slate/20 text-slate";
  return <Badge className={cls}>{status}</Badge>;
}

function DeadLetterPanel({
  loading,
  rows,
}: {
  loading: boolean;
  rows: Awaited<ReturnType<typeof listOsintDeadLetters>>;
}) {
  const qc = useQueryClient();
  const retry = useServerFn(retryDeadLetter);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-red-500/30 bg-red-500/5">
      <header className="flex items-center gap-2 border-b border-red-500/30 px-4 py-3">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <div>
          <h2 className="type-h3 text-foreground">Dead-Letter Queue</h2>
          <p className="type-small text-slate">
            Records that failed ingestion after {} 5 retry attempts. Retry re-runs the source
            connector — successful records land via upsert.
          </p>
        </div>
      </header>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Connector</TableHead>
              <TableHead>Source Ref</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Age</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-slate">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-emerald-400">
                  Queue is empty. Nothing to retry.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.connector_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.source_ref ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-red-400" title={r.error_message}>
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    {r.error_message}
                  </TableCell>
                  <TableCell>{r.attempts}</TableCell>
                  <TableCell>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={async () => {
                        setBusy(r.id);
                        try {
                          await retry({ data: { deadLetterId: r.id } });
                          qc.invalidateQueries({ queryKey: ["osint"] });
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
