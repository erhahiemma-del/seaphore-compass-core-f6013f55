/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-01A — Provider Resolver
 * ─────────────────────────────────────────────────────────────────────
 *
 *  ONE capability = ONE active provider.
 *
 *  The resolver sits inside the existing Connector Framework. It does
 *  not register connectors, does not acquire evidence, does not touch
 *  IAL/IFE/UIP/OKL/OIE/MIBC. It answers a single question:
 *
 *      "Which provider should serve this capability right now?"
 *
 *  Selection priority:
 *    1. Explicit provider override (env / call-site)
 *    2. Environment-specific provider (development → SIMULATOR,
 *       production → LIVE)
 *    3. Highest-priority healthy provider
 *    4. No provider  → graceful null result
 *
 *  Health: if the selected provider is unhealthy, the resolver fails
 *  over to the NEXT eligible provider for the SAME capability. It never
 *  returns two providers and never merges results.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { Connector, ConnectorCapability } from "./base";
import {
  hybridExecutionEnabled,
  providerMetadata,
  providerOverrideFor,
  resolveRuntimeEnvironment,
  type ProviderMetadata,
  type RuntimeEnvironment,
} from "./provider-metadata";

export interface ProviderCandidate {
  readonly connector: Connector;
  readonly metadata: ProviderMetadata;
}

export type ProviderRejectionReason =
  "disabled" | "environment-mismatch" | "unhealthy" | "not-selected";

export interface ProviderResolution {
  readonly capability: ConnectorCapability;
  readonly environment: RuntimeEnvironment;
  /** The single active provider, or null when none is available. */
  readonly provider: Connector | null;
  /** Human-readable explanation of the decision (audit / explainability). */
  readonly reason: string;
  /** Rule that produced the winner. */
  readonly rule: "override" | "environment" | "priority" | "none";
  /** Ordered failover chain (winner first). Never executed together. */
  readonly chain: ReadonlyArray<Connector>;
  readonly considered: ReadonlyArray<{
    id: string;
    type: ProviderMetadata["providerType"];
    priority: number;
  }>;
  readonly rejected: ReadonlyArray<{ id: string; reason: ProviderRejectionReason }>;
}

export interface ResolveProviderOptions {
  /** Explicit override (officer/connector hint or config). */
  readonly override?: string;
  /** Force an environment (tests, admin preview). */
  readonly environment?: RuntimeEnvironment;
  /** Health predicate — `true` means the provider may be selected. */
  readonly isHealthy?: (connector: Connector) => boolean;
  /** Escape hatch for an intentional future Multi-Provider strategy. */
  readonly allowHybrid?: boolean;
}

function metaOf(connector: Connector): ProviderMetadata {
  return providerMetadata(
    (connector as Connector & { provider?: Partial<ProviderMetadata> }).provider,
  );
}

function environmentMatches(meta: ProviderMetadata, env: RuntimeEnvironment): boolean {
  return meta.environment === "both" || meta.environment === env;
}

/** Environment preference: development prefers simulators, production live. */
function environmentRank(meta: ProviderMetadata, env: RuntimeEnvironment): number {
  if (env === "production") return meta.providerType === "LIVE" ? 1 : 0;
  return meta.providerType === "LIVE" ? 0 : 1;
}

/**
 * Resolve exactly one provider for a capability.
 *
 * `candidates` come from the EXISTING registry
 * (`ConnectorRegistry.getByCapability`) — the resolver never keeps its
 * own directory of connectors.
 */
export function resolveProvider(
  capability: ConnectorCapability,
  candidates: ReadonlyArray<Connector>,
  opts: ResolveProviderOptions = {},
): ProviderResolution {
  const environment = resolveRuntimeEnvironment(opts.environment);
  const isHealthy = opts.isHealthy ?? (() => true);
  const rejected: Array<{ id: string; reason: ProviderRejectionReason }> = [];

  const enriched: ProviderCandidate[] = candidates.map((connector) => ({
    connector,
    metadata: metaOf(connector),
  }));

  const considered = enriched.map((c) => ({
    id: String(c.connector.id),
    type: c.metadata.providerType,
    priority: c.metadata.priority,
  }));

  // Rule 0 — disabled providers are never resolvable.
  let eligible = enriched.filter((c) => {
    if (!c.metadata.enabled) {
      rejected.push({ id: String(c.connector.id), reason: "disabled" });
      return false;
    }
    return true;
  });

  // Rule 2 (filter) — environment gating.
  eligible = eligible.filter((c) => {
    if (!environmentMatches(c.metadata, environment)) {
      rejected.push({ id: String(c.connector.id), reason: "environment-mismatch" });
      return false;
    }
    return true;
  });

  // Rule 1 — explicit override wins outright when it is eligible.
  const override = opts.override ?? providerOverrideFor(capability);
  if (override) {
    const hit = eligible.find((c) => String(c.connector.id) === String(override));
    if (hit) {
      const chain = [hit, ...eligible.filter((c) => c !== hit)];
      return {
        capability,
        environment,
        provider: hit.connector,
        reason: `Explicit provider override → ${String(hit.connector.id)}`,
        rule: "override",
        chain: chain.map((c) => c.connector),
        considered,
        rejected: rejected.concat(
          chain
            .slice(1)
            .map((c) => ({ id: String(c.connector.id), reason: "not-selected" as const })),
        ),
      };
    }
  }

  // Rules 2 + 3 — environment fit first, then priority, then stable id.
  const ordered = [...eligible].sort((a, b) => {
    const envDelta =
      environmentRank(b.metadata, environment) - environmentRank(a.metadata, environment);
    if (envDelta !== 0) return envDelta;
    if (b.metadata.priority !== a.metadata.priority)
      return b.metadata.priority - a.metadata.priority;
    return String(a.connector.id).localeCompare(String(b.connector.id));
  });

  // Health-aware failover — first healthy provider in the ordered chain.
  let winner: ProviderCandidate | undefined;
  for (const candidate of ordered) {
    if (isHealthy(candidate.connector)) {
      winner = candidate;
      break;
    }
    rejected.push({ id: String(candidate.connector.id), reason: "unhealthy" });
  }

  if (!winner) {
    return {
      capability,
      environment,
      provider: null,
      reason:
        ordered.length === 0
          ? `No provider registered for capability ${capability} in ${environment}`
          : `Every provider for ${capability} is unhealthy`,
      rule: "none",
      chain: [],
      considered,
      rejected,
    };
  }

  for (const other of ordered) {
    if (other !== winner && !rejected.some((r) => r.id === String(other.connector.id))) {
      rejected.push({ id: String(other.connector.id), reason: "not-selected" });
    }
  }

  const rule =
    environmentRank(winner.metadata, environment) === 1 && ordered.length > 1
      ? "environment"
      : "priority";

  return {
    capability,
    environment,
    provider: winner.connector,
    reason: `${environment} → ${winner.metadata.providerType} provider ${String(winner.connector.id)} (priority ${winner.metadata.priority})`,
    rule,
    chain: ordered.map((c) => c.connector),
    considered,
    rejected,
  };
}

/**
 * The ONLY sanctioned way to obtain more than one provider for a
 * capability. Hybrid execution is disabled by default; when disabled
 * this returns the single resolved provider.
 */
export function resolveActiveProviders(
  capability: ConnectorCapability,
  candidates: ReadonlyArray<Connector>,
  opts: ResolveProviderOptions = {},
): ReadonlyArray<Connector> {
  const hybrid = opts.allowHybrid ?? hybridExecutionEnabled();
  const resolution = resolveProvider(capability, candidates, opts);
  if (!hybrid) return resolution.provider ? [resolution.provider] : [];
  return resolution.chain;
}
