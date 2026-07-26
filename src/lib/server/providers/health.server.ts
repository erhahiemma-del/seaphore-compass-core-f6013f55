/**
 * ─────────────────────────────────────────────────────────────────────
 *  Provider Health Probe (server-side)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Runs the frozen `healthCheck()` method of every certified Evidence
 *  Provider and projects the result for the officer-facing dashboard.
 *
 *  This module ADDS NOTHING to the architecture: it uses the existing
 *  IAL ConnectorRegistry and the Evidence Provider certification gate.
 *  It never fuses, scores, or persists — it reports.
 * ─────────────────────────────────────────────────────────────────────
 */
import { registerEvidenceProviders } from "@/connectors";
import { ConnectorRegistry } from "@/services/ial/connectors/registry";
import type { Connector } from "@/services/ial/connectors/base";
import type { ConnectorHealth } from "@/services/ial/types";

export type ProviderHealthState = "healthy" | "degraded" | "unauthenticated" | "offline";

export interface ProviderHealthSnapshot {
  readonly id: string;
  readonly displayName: string;
  readonly specVersion: string | null;
  readonly providerType: string;
  readonly environment: string;
  readonly enabled: boolean;
  readonly capabilities: ReadonlyArray<string>;
  readonly state: ProviderHealthState;
  /** ISO timestamp of THIS probe — "last check time" in the dashboard. */
  readonly checkedAt: string;
  /** Wall-clock duration of the healthCheck() call itself. */
  readonly probeLatencyMs: number;
  /** Provider-reported p50 latency (0 when the provider has no traffic). */
  readonly reportedLatencyMsP50: number;
  readonly failureRate: number;
  readonly quotaRemaining: number | null;
  readonly lastSuccessAt: string | null;
  /** Provider-reported error, or the thrown probe error. Never swallowed. */
  readonly lastError: string | null;
  /** True when healthCheck() itself threw rather than returning a report. */
  readonly probeFailed: boolean;
}

const PROBE_TIMEOUT_MS = 5_000;

let registry: ConnectorRegistry | null = null;

/** Lazily build the certified provider registry (idempotent). */
function getRegistry(): ConnectorRegistry {
  if (registry) return registry;
  const built = new ConnectorRegistry();
  registerEvidenceProviders({ register: (c: Connector) => built.register(c) } as never);
  registry = built;
  return built;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`healthCheck() timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function stateOf(health: ConnectorHealth): ProviderHealthState {
  if (!health.available) return "offline";
  if (!health.authenticated) return "unauthenticated";
  if (health.failureRate > 0.2 || health.lastError) return "degraded";
  return "healthy";
}

function baseSnapshot(connector: Connector, checkedAt: string) {
  const meta = connector.provider ?? {};
  return {
    id: connector.id,
    displayName: connector.displayName,
    specVersion:
      (connector as unknown as { specVersion?: string }).specVersion ?? null,
    providerType: String(meta.providerType ?? "LIVE"),
    environment: String(meta.environment ?? "both"),
    enabled: meta.enabled ?? true,
    capabilities: [...(connector.capabilities ?? [])].map(String),
    checkedAt,
  };
}

/** Probe one provider. Never throws — failures ARE the signal. */
export async function probeProvider(connector: Connector): Promise<ProviderHealthSnapshot> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  try {
    await connector.connect();
    const health = await withTimeout(connector.healthCheck(), PROBE_TIMEOUT_MS);
    return {
      ...baseSnapshot(connector, checkedAt),
      state: stateOf(health),
      probeLatencyMs: Date.now() - started,
      reportedLatencyMsP50: health.latencyMsP50,
      failureRate: health.failureRate,
      quotaRemaining: health.quotaRemaining,
      lastSuccessAt: health.lastSuccessAt,
      lastError: health.lastError,
      probeFailed: false,
    };
  } catch (err) {
    return {
      ...baseSnapshot(connector, checkedAt),
      state: "offline",
      probeLatencyMs: Date.now() - started,
      reportedLatencyMsP50: 0,
      failureRate: 1,
      quotaRemaining: null,
      lastSuccessAt: null,
      lastError: describe(err),
      probeFailed: true,
    };
  }
}

/** Probe every certified provider in parallel. */
export async function probeAllProviders(): Promise<ProviderHealthSnapshot[]> {
  const connectors = getRegistry().list();
  return Promise.all(connectors.map((c) => probeProvider(c)));
}

/** Probe a single provider by id. Returns null when it is not registered. */
export async function probeProviderById(id: string): Promise<ProviderHealthSnapshot | null> {
  const connector = getRegistry()
    .list()
    .find((c) => c.id === id);
  return connector ? probeProvider(connector) : null;
}
