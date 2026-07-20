/**
 * Server functions for the OSINT admin dashboard.
 *
 * All actions require an authenticated officer+; row-level security on
 * the underlying tables is the authoritative gate. The heavy lifting
 * (scheduler, ingestion pipeline) lives in server-only modules that we
 * dynamic-import inside each handler to keep them out of client bundles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OsintConnectorRow {
  id: string;
  name: string;
  description: string;
  category: string;
  auth_method: string;
  endpoint: string;
  polling_interval_minutes: number;
  rate_limit_per_minute: number;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  records_total: number;
  records_last_run: number;
  error_rate_7d: number;
  avg_latency_ms: number;
  health_status: "healthy" | "degraded" | "down";
}

export interface OsintSyncRunRow {
  id: string;
  connector_id: string;
  connector_name: string;
  started_at: string;
  completed_at: string | null;
  records_fetched: number;
  records_ingested: number;
  status: string;
  latency_ms: number | null;
}

export interface OsintDeadLetterRow {
  id: string;
  connector_id: string | null;
  connector_name: string | null;
  source_ref: string | null;
  error_message: string;
  attempts: number;
  last_attempt_at: string;
  resolved: boolean;
  created_at: string;
}

async function ensureRegistryLoaded() {
  await import("./connectors");
  const { syncRegistryToDb } = await import("./scheduler");
  const { listConnectors } = await import("./registry");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await syncRegistryToDb(supabaseAdmin, listConnectors());
}

export const bootstrapOsintRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    await ensureRegistryLoaded();
    return { ok: true };
  });

export const listOsintConnectors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OsintConnectorRow[]> => {
    await ensureRegistryLoaded();
    const { data, error } = await context.supabase
      .from("osint_connectors")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as OsintConnectorRow[];
  });

export const listOsintSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OsintSyncRunRow[]> => {
    const { data, error } = await context.supabase
      .from("osint_sync_runs")
      .select("id, connector_id, started_at, completed_at, records_fetched, records_ingested, status, latency_ms, osint_connectors(name)")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const row = r as unknown as OsintSyncRunRow & { osint_connectors?: { name?: string } | null };
      return {
        id: row.id,
        connector_id: row.connector_id,
        connector_name: row.osint_connectors?.name ?? "—",
        started_at: row.started_at,
        completed_at: row.completed_at,
        records_fetched: row.records_fetched,
        records_ingested: row.records_ingested,
        status: row.status,
        latency_ms: row.latency_ms,
      };
    });
  });

export const listOsintDeadLetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OsintDeadLetterRow[]> => {
    const { data, error } = await context.supabase
      .from("osint_dead_letters")
      .select("id, connector_id, source_ref, error_message, attempts, last_attempt_at, resolved, created_at, osint_connectors(name)")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const row = r as unknown as OsintDeadLetterRow & { osint_connectors?: { name?: string } | null };
      return {
        id: row.id,
        connector_id: row.connector_id,
        connector_name: row.osint_connectors?.name ?? null,
        source_ref: row.source_ref,
        error_message: row.error_message,
        attempts: row.attempts,
        last_attempt_at: row.last_attempt_at,
        resolved: row.resolved,
        created_at: row.created_at,
      };
    });
  });

export const forceSyncConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ connectorId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureRegistryLoaded();
    const { data: row, error } = await context.supabase
      .from("osint_connectors")
      .select("id, name")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Connector not found");

    const { runConnector } = await import("./scheduler");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runConnector(supabaseAdmin, row as { id: string; name: string });
  });

export const toggleConnectorActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ connectorId: z.string().uuid(), isActive: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("osint_connectors")
      .update({ is_active: data.isActive })
      .eq("id", data.connectorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retryDeadLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ deadLetterId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: dl, error } = await context.supabase
      .from("osint_dead_letters")
      .select("id, connector_id, attempts")
      .eq("id", data.deadLetterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!dl) throw new Error("Dead letter not found");

    const row = dl as { id: string; connector_id: string | null; attempts: number };
    if (!row.connector_id) throw new Error("Dead letter has no connector");

    const { data: connector } = await context.supabase
      .from("osint_connectors")
      .select("id, name")
      .eq("id", row.connector_id)
      .maybeSingle();
    if (!connector) throw new Error("Connector not found");

    await ensureRegistryLoaded();
    const { runConnector } = await import("./scheduler");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const outcome = await runConnector(supabaseAdmin, connector as { id: string; name: string });

    // Mark this dead letter resolved regardless; the retry either
    // succeeded (record ingested via upsert) or produced a fresh DLQ entry.
    await context.supabase
      .from("osint_dead_letters")
      .update({
        resolved: true,
        attempts: row.attempts + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return outcome;
  });
