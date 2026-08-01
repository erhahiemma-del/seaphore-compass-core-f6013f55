/**
 * IAL Administrative Controls.
 *
 * Thin facade over the default `ConnectorManager` that the Administration
 * Center calls when an officer with admin/director role force-refreshes a
 * connector or manipulates the evidence cache. Every mutating operation
 * writes an `audit_log` entry so that officer accountability (HR-8) is
 * preserved.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AcquisitionQuery, ConnectorId } from "./types";
import { getIntelligenceAcquisitionManager } from "./index";

export interface IalConnectorSummary {
  readonly id: ConnectorId;
  readonly displayName: string;
}

export interface IalCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly hitRate: number;
}

export interface RefreshOutcome {
  readonly connectorId: ConnectorId;
  readonly authenticated: boolean;
  readonly cacheEntriesCleared: number;
  readonly latencyMs: number;
  readonly error?: string;
}

export interface PrewarmOutcome {
  readonly query: AcquisitionQuery;
  readonly ok: boolean;
  readonly records: number;
  readonly sources: number;
  readonly latencyMs: number;
  readonly error?: string;
}

/** Default prewarm set — canonical high-value entities the system should
 *  keep warm at all times. Admins can extend this list via UI in future
 *  sprints; for now this is the deterministic seed. */
export const DEFAULT_PREWARM_QUERIES: ReadonlyArray<AcquisitionQuery> = [
  { entity: { kind: "vessel", id: "vessel:imo:9438291", label: "MV Ocean Pearl" } },
  { entity: { kind: "vessel", id: "vessel:imo:9111222", label: "MV Second Vessel" } },
  { entity: { kind: "port", id: "port:unlocode:NGLOS", label: "Lagos" } },
  { entity: { kind: "port", id: "port:unlocode:NGONN", label: "Onne" } },
  { text: "sanctioned tankers west africa" },
];

export function listIalConnectors(): ReadonlyArray<IalConnectorSummary> {
  return getIntelligenceAcquisitionManager().listConnectors();
}

export function ialCacheStats(): IalCacheStats {
  const s = getIntelligenceAcquisitionManager().cacheStats();
  const total = s.hits + s.misses;
  return { ...s, hitRate: total === 0 ? 0 : Math.round((s.hits / total) * 100) / 100 };
}

export async function forceRefreshConnector(connectorId: ConnectorId): Promise<RefreshOutcome> {
  const outcome = await getIntelligenceAcquisitionManager().refreshConnector(connectorId);
  await recordAudit("ial.connector.refresh", {
    connector_id: connectorId,
    authenticated: outcome.authenticated,
    cache_entries_cleared: outcome.cacheEntriesCleared,
    latency_ms: outcome.latencyMs,
    error: outcome.error ?? null,
  });
  return outcome;
}

export async function clearEvidenceCache(
  connectorId?: ConnectorId,
): Promise<{ cleared: number; scope: "all" | ConnectorId }> {
  const cleared = getIntelligenceAcquisitionManager().clearCache(connectorId);
  const scope: "all" | ConnectorId = connectorId ?? "all";
  await recordAudit("ial.cache.clear", { scope, cleared });
  return { cleared, scope };
}

export async function prewarmEvidenceCache(
  queries: ReadonlyArray<AcquisitionQuery> = DEFAULT_PREWARM_QUERIES,
): Promise<ReadonlyArray<PrewarmOutcome>> {
  const results = await getIntelligenceAcquisitionManager().prewarm(queries);
  const totalRecords = results.reduce((n, r) => n + r.records, 0);
  const failures = results.filter((r) => !r.ok).length;
  await recordAudit("ial.cache.prewarm", {
    queries: queries.length,
    records: totalRecords,
    failures,
  });
  return results;
}

async function recordAudit(action: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      action,
      entity: "ial",
      module: "administration",
      rule_refs: ["HR-8", "HR-9"],
      metadata: metadata as never,
      officer_id: user?.id ?? "00000000-0000-0000-0000-000000000000",
      ip_address: "client",
    });
  } catch {
    // audit_log is best-effort in dev-bypass mode; never block an admin
    // action on the log write.
  }
}
