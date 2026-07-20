/**
 * Mock data sources — Layer 2.7 Capability Registry.
 * Each source is queried via `queryFactory(agentId)` which enforces the
 * agent's declared `allowedSources` whitelist at the scheduler boundary.
 *
 * Real Sprint 10 wiring swaps these functions for repository/adapter calls.
 */
import type { AgentId, DataSourceId } from "./types";

/** Simulated I/O — bounded latency, honours AbortSignal. */
async function delay(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

type Handler = (args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;

/** Deterministic fixtures scoped by MV Crimson Endeavour canonical scenario. */
const HANDLERS: Record<DataSourceId, Handler> = {
  cac_registry: async (args, signal) => {
    await delay(20, signal);
    return { entityId: args.entityId, legalOwner: { name: "Oceanic Lines Ltd", jurisdiction: "LR" } };
  },
  company_registry: async (args, signal) => {
    await delay(30, signal);
    return {
      entityId: args.entityId,
      chain: [
        { from: "Oceanic Lines Ltd", to: "Meridian Holdings", relation: "PARENT" },
        { from: "Meridian Holdings", to: "J. Adeyemi", relation: "UBO" },
      ],
      beneficialOwners: [{ name: "J. Adeyemi", sharePct: 62.5 }],
    };
  },
  sanctions_list: async (_a, signal) => {
    await delay(15, signal);
    return { hits: [] as string[] };
  },
  customs_db: async (a, signal) => {
    await delay(25, signal);
    return { entityId: a.entityId, declared: 1_240_000, currency: "USD" };
  },
  invoice_db: async (a, signal) => {
    await delay(25, signal);
    return { entityId: a.entityId, observed: 1_612_500 };
  },
  manifest_db: async (a, signal) => {
    await delay(20, signal);
    return { entityId: a.entityId, manifestId: "MAN-2026-0714-APP", declaredContainers: 348 };
  },
  container_db: async (_a, signal) => {
    await delay(30, signal);
    return {
      observedContainers: 351,
      mismatches: [
        { containerNo: "OCLU 774218-5", declared: "Palm oil, refined", observed: "Palm oil + unlisted drums" },
      ],
    };
  },
  certificate_registry: async (a, signal) => {
    await delay(20, signal);
    return {
      entityId: a.entityId,
      certificates: [
        { code: "SMC", issuer: "LR", validUntil: "2027-03-11" },
        { code: "ISM DOC", issuer: "LR", validUntil: "2026-11-30" },
      ],
    };
  },
  isps_registry: async (_a, signal) => {
    await delay(15, signal);
    return { code: "ISSC", issuer: "LR", validUntil: "2027-01-04" };
  },
  port_state_db: async (_a, signal) => {
    await delay(30, signal);
    return { findings: [{ port: "Apapa", finding: "Dwell > 48h without manifest update", severity: "med" as const }] };
  },
  document_store: async (a, signal) => {
    await delay(20, signal);
    return {
      items: [
        {
          id: "evd_ais_001",
          sourceSystem: "AIS_STREAM",
          grade: "verified" as const,
          contentHash: "sha256:9f3c…c2e1",
          collectedAt: "2026-07-15T04:12:03Z",
        },
      ],
      entityId: a.entityId,
    };
  },
  evidence_library: async (_a, signal) => {
    await delay(20, signal);
    return {
      items: [
        {
          id: "evd_manifest_014",
          sourceSystem: "MANIFEST_DB",
          grade: "corroborated" as const,
          contentHash: "sha256:b71a…9082",
          collectedAt: "2026-07-14T18:03:00Z",
        },
      ],
    };
  },
  historical_db: async (a, signal) => {
    await delay(35, signal);
    return { entityId: a.entityId, priorDwells: [42, 51, 68] };
  },
  pattern_engine: async (_a, signal) => {
    await delay(25, signal);
    return {
      patterns: [
        { id: "pat_dwell_apapa", label: "Extended dwell at Apapa", matchScore: 0.81, windowDays: 90 },
        { id: "pat_ubo_layering", label: "Suspected UBO layering", matchScore: 0.64, windowDays: 365 },
      ],
    };
  },
};

/**
 * Build a query function scoped to a single agent's whitelist.
 * Any attempt to reach a non-whitelisted source throws — this is the Capability
 * Registry boundary enforced at runtime.
 */
export function queryFactory(agentId: AgentId, allowed: readonly DataSourceId[]) {
  const allow = new Set(allowed);
  return async <T>(source: DataSourceId, args: Record<string, unknown>): Promise<T> => {
    if (!allow.has(source)) {
      throw new Error(
        `CAPABILITY_VIOLATION: agent '${agentId}' is not authorised to query source '${source}'`,
      );
    }
    const handler = HANDLERS[source];
    if (!handler) throw new Error(`UNKNOWN_SOURCE: '${source}'`);
    const signal = (args.__signal as AbortSignal | undefined) ?? new AbortController().signal;
    const result = await handler(args, signal);
    return result as T;
  };
}
