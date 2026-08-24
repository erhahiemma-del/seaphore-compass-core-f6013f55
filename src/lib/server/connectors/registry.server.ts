/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE — SERVER-SIDE AUTHENTICATED CONNECTOR REGISTRY
 * ─────────────────────────────────────────────────────────────────────
 *
 * The permanent architecture for every authenticated intelligence
 * provider (Global Fishing Watch, MarineTraffic, Windward, Kpler,
 * Datalastic, Lloyd's, sanctions providers, …).
 *
 * The BROWSER never decides whether a connector exists — this module
 * is the single source of truth, running only on the server. Client
 * code queries it via `createServerFn` wrappers.
 *
 * Every entry:
 *   • declares the env-var name for its secret (read server-side only);
 *   • exposes a `probe()` that performs an authenticated request and
 *     returns `HealthReport` (never leaks credentials);
 *   • is evidence-only — priority/risk assignment stays inside OSAE.
 *
 * Blocked from client bundles by the `.server.ts` filename convention.
 * ─────────────────────────────────────────────────────────────────────
 */
import { credentialCandidates } from "@/connectors/implementations/shared/provider-io";

export type ConnectorHealthState =
  | "healthy"
  | "auth_failed"
  | "offline"
  | "rate_limited"
  | "degraded"
  | "unavailable";

export interface HealthReport {
  state: ConnectorHealthState;
  httpStatus: number | null;
  latencyMs: number;
  message?: string;
  checkedAt: string;
  /** Timestamp of the last authenticated request that returned data. */
  lastSuccessAt?: string | null;
}

export interface AuthenticatedConnectorMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  secretEnv: string;
  supportedEntityTypes: readonly string[];
  /** Perform an authenticated request; return sanitised HealthReport. */
  probe: () => Promise<HealthReport>;
}

export interface ConnectorAdminSnapshot extends Omit<AuthenticatedConnectorMeta, "probe"> {
  credentialsPresent: boolean;
  lastHealth: HealthReport | null;
  lastSuccessAt: string | null;
  averageResponseTimeMs: number | null;
}

interface InternalRecord {
  meta: AuthenticatedConnectorMeta;
  lastHealth: HealthReport | null;
  lastSuccessAt: string | null;
  samples: number[];
}

const registry = new Map<string, InternalRecord>();

export function registerAuthenticatedConnector(meta: AuthenticatedConnectorMeta): void {
  registry.set(meta.id, {
    meta,
    lastHealth: null,
    lastSuccessAt: null,
    samples: [],
  });
}

export function hasSecret(envName: string): boolean {
  return credentialCandidates(envName).some((candidate) => {
    const v = process.env[candidate];
    return typeof v === "string" && v.length > 0;
  });
}

function snapshotOf(record: InternalRecord): ConnectorAdminSnapshot {
  const avg =
    record.samples.length === 0
      ? null
      : Math.round(record.samples.reduce((a, b) => a + b, 0) / record.samples.length);
  return {
    id: record.meta.id,
    name: record.meta.name,
    description: record.meta.description,
    version: record.meta.version,
    secretEnv: record.meta.secretEnv,
    supportedEntityTypes: record.meta.supportedEntityTypes,
    credentialsPresent: hasSecret(record.meta.secretEnv),
    lastHealth: record.lastHealth,
    lastSuccessAt: record.lastSuccessAt,
    averageResponseTimeMs: avg,
  };
}

export function listConnectorSnapshots(): ConnectorAdminSnapshot[] {
  return Array.from(registry.values()).map(snapshotOf);
}

export async function probeConnector(id: string): Promise<ConnectorAdminSnapshot | null> {
  const record = registry.get(id);
  if (!record) return null;
  const report = await record.meta.probe();
  record.lastHealth = report;
  // Keep a rolling window of the last 10 latency samples.
  record.samples.push(report.latencyMs);
  if (record.samples.length > 10) record.samples.shift();
  if (report.state === "healthy") record.lastSuccessAt = report.checkedAt;
  return snapshotOf(record);
}

export async function probeAllConnectors(): Promise<ConnectorAdminSnapshot[]> {
  const ids = Array.from(registry.keys());
  await Promise.all(ids.map((id) => probeConnector(id)));
  return listConnectorSnapshots();
}

/** Test seam only. */
export function __resetConnectorRegistry(): void {
  registry.clear();
}
