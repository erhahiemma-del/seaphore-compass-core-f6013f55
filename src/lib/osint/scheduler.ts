/**
 * OSINT scheduler.
 *
 * Server-only. Reads the connector registry (DB rows), matches each
 * active row to an in-process ConnectorInterface implementation, and
 * runs due connectors. "Due" = now - last_sync_at >= polling_interval.
 *
 * Concurrency: at most one in-flight run per connector, enforced by
 * an in-process lock. The lock is intentionally not distributed —
 * pg_cron hits a single Worker instance per tick.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorInterface } from "./types";
import { getConnector } from "./registry";
import { ingestRecords } from "./ingestion";
import { writeGraphEdges } from "./graph";
import { refreshConnectorHealth } from "./health";
import { RateLimitedError } from "./retry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

const IN_FLIGHT = new Set<string>();

export interface RunOutcome {
  connectorName: string;
  syncRunId: string;
  status: "success" | "partial" | "failed" | "skipped";
  fetched: number;
  ingested: number;
  edges: number;
  errors: number;
  latencyMs: number;
  message?: string;
}

export async function runConnector(
  db: AnyDb,
  connectorRow: { id: string; name: string },
): Promise<RunOutcome> {
  const impl: ConnectorInterface | undefined = getConnector(connectorRow.name);
  if (!impl) {
    return {
      connectorName: connectorRow.name,
      syncRunId: "",
      status: "failed",
      fetched: 0,
      ingested: 0,
      edges: 0,
      errors: 1,
      latencyMs: 0,
      message: `No connector implementation registered for '${connectorRow.name}'`,
    };
  }

  if (IN_FLIGHT.has(connectorRow.id)) {
    return {
      connectorName: connectorRow.name,
      syncRunId: "",
      status: "skipped",
      fetched: 0,
      ingested: 0,
      edges: 0,
      errors: 0,
      latencyMs: 0,
      message: "already running",
    };
  }
  IN_FLIGHT.add(connectorRow.id);

  const started = Date.now();
  const { data: runRow, error: runErr } = await db
    .from("osint_sync_runs")
    .insert({
      connector_id: connectorRow.id,
      started_at: new Date().toISOString(),
      status: "running",
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    IN_FLIGHT.delete(connectorRow.id);
    return {
      connectorName: connectorRow.name,
      syncRunId: "",
      status: "failed",
      fetched: 0,
      ingested: 0,
      edges: 0,
      errors: 1,
      latencyMs: 0,
      message: runErr?.message ?? "could not create sync run",
    };
  }
  const syncRunId = (runRow as { id: string }).id;

  let status: RunOutcome["status"] = "success";
  let message: string | undefined;
  let fetched = 0;
  let ingested = 0;
  let edges = 0;
  let errorCount = 0;

  try {
    const raw = await impl.fetch();
    fetched = raw.length;
    const normalized = raw.map((r) => impl.normalize(r));
    const result = await ingestRecords(db, impl, syncRunId, normalized);
    ingested = result.ingested;
    errorCount = result.errors.length;
    edges = await writeGraphEdges(db, impl, normalized);
    if (result.errors.length > 0 && result.ingested > 0) status = "partial";
    else if (result.errors.length > 0 && result.ingested === 0) status = "failed";
  } catch (err) {
    status = "failed";
    if (err instanceof RateLimitedError) {
      message = `rate_limited: ${err.message}`;
    } else {
      message = err instanceof Error ? err.message : String(err);
    }
    errorCount = 1;
    // Backfill dead letter for connector-level failure (no per-row payload).
    await db.from("osint_dead_letters").insert({
      connector_id: connectorRow.id,
      sync_run_id: syncRunId,
      source_ref: null,
      raw_payload: {},
      error_message: `[connector] ${message}`,
      attempts: 1,
    });
    console.warn(`[OSINT] connector ${impl.name} failed: ${message}`);
  } finally {
    const latency = Date.now() - started;
    await db
      .from("osint_sync_runs")
      .update({
        completed_at: new Date().toISOString(),
        records_fetched: fetched,
        records_ingested: ingested,
        errors: message ? [{ error: message }] : [],
        status,
        latency_ms: latency,
      })
      .eq("id", syncRunId);
    await refreshConnectorHealth(db, connectorRow.id);
    IN_FLIGHT.delete(connectorRow.id);
  }

  return {
    connectorName: connectorRow.name,
    syncRunId,
    status,
    fetched,
    ingested,
    edges,
    errors: errorCount,
    latencyMs: Date.now() - started,
    message,
  };
}

export async function runDueConnectors(db: AnyDb): Promise<RunOutcome[]> {
  const { data: rows } = await db
    .from("osint_connectors")
    .select("id, name, polling_interval_minutes, last_sync_at, is_active")
    .eq("is_active", true);

  const now = Date.now();
  const due = (rows ?? []).filter((r) => {
    const row = r as { last_sync_at: string | null; polling_interval_minutes: number };
    if (!row.last_sync_at) return true;
    const age = now - new Date(row.last_sync_at).getTime();
    return age >= row.polling_interval_minutes * 60 * 1000;
  });

  const results: RunOutcome[] = [];
  for (const row of due) {
    results.push(await runConnector(db, row as { id: string; name: string }));
  }
  return results;
}

/**
 * Ensure a DB row exists for every registered connector implementation.
 * Called on server startup so newly-added connectors auto-register.
 */
export async function syncRegistryToDb(db: AnyDb, connectors: ConnectorInterface[]): Promise<void> {
  if (connectors.length === 0) return;
  const rows = connectors.map((c) => ({
    name: c.name,
    description: c.description,
    category: c.category,
    auth_method: c.authMethod,
    endpoint: c.endpoint,
    polling_interval_minutes: c.pollingIntervalMinutes,
    rate_limit_per_minute: c.rateLimitPerMinute,
    is_active: true,
  }));
  await db.from("osint_connectors").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
}
