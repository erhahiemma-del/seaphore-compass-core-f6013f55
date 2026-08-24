/**
 * Source health monitor.
 *
 * After each sync run, derive health metrics for a connector and write
 * them back to osint_connectors. Health rules:
 *   healthy:  last sync < 2× polling interval AND error_rate_7d < 5%
 *   degraded: last sync < 5× polling interval AND error_rate_7d < 20%
 *   down:     last sync > 5× polling interval OR  error_rate_7d > 20%
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OsintHealthStatus } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

interface HealthInput {
  pollingIntervalMinutes: number;
  lastSyncAt: Date;
  errorRate7d: number; // percent 0..100
}

export function computeHealth(input: HealthInput, now: Date = new Date()): OsintHealthStatus {
  const ageMinutes = (now.getTime() - input.lastSyncAt.getTime()) / 60_000;
  const window = input.pollingIntervalMinutes;
  if (ageMinutes > window * 5 || input.errorRate7d > 20) return "down";
  if (ageMinutes > window * 2 || input.errorRate7d > 5) return "degraded";
  return "healthy";
}

export async function refreshConnectorHealth(db: AnyDb, connectorId: string): Promise<void> {
  const { data: connector } = await db
    .from("osint_connectors")
    .select("id, polling_interval_minutes")
    .eq("id", connectorId)
    .maybeSingle();
  if (!connector) return;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: runs } = await db
    .from("osint_sync_runs")
    .select("status, started_at, completed_at, records_ingested, latency_ms")
    .eq("connector_id", connectorId)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(200);

  const rows = runs ?? [];
  const total = rows.length;
  const failed = rows.filter(
    (r: { status: string }) => r.status === "failed" || r.status === "partial",
  ).length;
  const errorRate = total === 0 ? 0 : (failed / total) * 100;

  const latencies = rows
    .map((r: { latency_ms: number | null }) => r.latency_ms ?? 0)
    .filter((n: number) => n > 0);
  const avgLatency =
    latencies.length === 0
      ? 0
      : Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length);

  const last = rows[0] as
    | { started_at?: string; status?: string; records_ingested?: number }
    | undefined;
  const lastSyncAt = last?.started_at ? new Date(last.started_at) : new Date(0);
  const health = computeHealth({
    pollingIntervalMinutes: (connector as { polling_interval_minutes: number })
      .polling_interval_minutes,
    lastSyncAt,
    errorRate7d: errorRate,
  });

  const { data: totalRow } = await db
    .from("osint_records")
    .select("id", { count: "exact", head: true })
    .eq("source_id", (connector as { id: string }).id);

  await db
    .from("osint_connectors")
    .update({
      last_sync_at: last?.started_at ?? null,
      last_sync_status: last?.status === "running" ? null : (last?.status ?? null),
      records_total: (totalRow as unknown as { count?: number } | null)?.count ?? undefined,
      records_last_run: last?.records_ingested ?? 0,
      error_rate_7d: Number(errorRate.toFixed(2)),
      avg_latency_ms: avgLatency,
      health_status: health,
    })
    .eq("id", connectorId);
}
