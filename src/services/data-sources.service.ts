/**
 * Data-source service — the single client-side entry point for reading
 * the Data Source Matrix + its runtime health from Supabase.
 */
import { supabase } from "@/integrations/supabase/client";
import { DATA_SOURCE_MATRIX } from "@/adapters/matrix";
import type { SourceRegistryEntry, SourceStatus } from "@/adapters/status";

export interface DataSourceRow extends SourceRegistryEntry {
  latestHealth?: {
    state: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN" | "NOT_APPLICABLE";
    latencyMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    checkedAt: string;
  } | null;
}

/**
 * Fetch every source row + its most recent health check.  Falls back to the
 * client-side matrix constant if the DB is unreachable, so status chips
 * never blank the UI.
 */
export async function listDataSources(): Promise<DataSourceRow[]> {
  const { data: sources, error } = await supabase
    .from("data_sources")
    .select("*")
    .order("data_type");

  if (error || !sources) {
    return DATA_SOURCE_MATRIX.map((m) => ({ ...m, latestHealth: null }));
  }

  const { data: healths } = await supabase
    .from("data_source_health")
    .select("source_id,state,latency_ms,error_code,error_message,checked_at")
    .order("checked_at", { ascending: false });

  const latest = new Map<string, DataSourceRow["latestHealth"]>();
  for (const h of healths ?? []) {
    if (latest.has(h.source_id)) continue;
    latest.set(h.source_id, {
      state: h.state as NonNullable<DataSourceRow["latestHealth"]>["state"],
      latencyMs: h.latency_ms,
      errorCode: h.error_code,
      errorMessage: h.error_message,
      checkedAt: h.checked_at,
    });
  }

  return sources.map((row) => ({
    id: row.id,
    dataType: row.data_type,
    provider: row.provider,
    status: row.status as SourceStatus,
    kind: row.kind as SourceRegistryEntry["kind"],
    defaultConfidence: row.default_confidence as SourceRegistryEntry["defaultConfidence"],
    citation: row.citation,
    scope: (row.scope ?? "osint") as SourceRegistryEntry["scope"],
    notes: row.notes ?? undefined,
    latestHealth: latest.get(row.id) ?? null,
  }));
}

export interface HealthCheckRecord {
  id: string;
  state: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN" | "NOT_APPLICABLE";
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
}

/**
 * Fetch the last N health checks for a single source, newest first.
 * Powers the run-history drawer in the Data Source Matrix panel so
 * administrators can inspect trends and error details over time (HR-3).
 */
export async function listSourceHealthHistory(
  sourceId: string,
  limit = 25,
): Promise<HealthCheckRecord[]> {
  const { data, error } = await supabase
    .from("data_source_health")
    .select("id,state,latency_ms,error_code,error_message,checked_at")
    .eq("source_id", sourceId)
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((h) => ({
    id: h.id,
    state: h.state as HealthCheckRecord["state"],
    latencyMs: h.latency_ms,
    errorCode: h.error_code,
    errorMessage: h.error_message,
    checkedAt: h.checked_at,
  }));
}
