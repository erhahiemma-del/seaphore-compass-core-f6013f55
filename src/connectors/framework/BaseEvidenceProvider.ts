/**
 * ─────────────────────────────────────────────────────────────────────
 *  PART 3 — EVIDENCE PROVIDER TEMPLATE (Sprint PF-01)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  All platform logic lives here ONCE: cache handling, result envelopes,
 *  latency/failure metrics, validation, lookup delegation. A new provider
 *  implements only:
 *
 *    • metadata      (id, displayName, capabilities, provider, contract)
 *    • connect()
 *    • healthCheck() — the default below is usually enough
 *    • search()      — via fetchEvidence()
 *    • normalize()
 *    • validate()    — the default below is usually enough
 *    • tests
 *
 *  It reuses the frozen framework verbatim (EvidenceCache, normalizeRecord,
 *  validateRecords, stableHash) and never persists, resolves identities,
 *  or creates UIPs.
 * ─────────────────────────────────────────────────────────────────────
 */
import { EvidenceCache } from "@/services/ial/cache";
import { validateRecords } from "@/services/ial/validator";
import type { ConnectorCapability } from "@/services/ial/connectors/base";
import type { ProviderMetadata } from "@/services/ial/connectors/provider-metadata";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  NormalizedEvidence,
} from "@/services/ial/types";
import {
  EVIDENCE_PROVIDER_SPEC_VERSION,
  type EvidenceProviderSpecVersion,
  type EvidenceProviderV1,
  type ProviderValidation,
} from "./spec";

export interface BaseEvidenceProviderOptions {
  readonly cache?: EvidenceCache;
  readonly clock?: () => number;
  readonly cacheTtlMs?: number;
}

export abstract class BaseEvidenceProvider implements EvidenceProviderV1 {
  readonly specVersion: EvidenceProviderSpecVersion = EVIDENCE_PROVIDER_SPEC_VERSION;

  abstract readonly id: ConnectorId;
  abstract readonly displayName: string;
  abstract readonly capabilities: ReadonlyArray<ConnectorCapability>;
  abstract readonly provider: ProviderMetadata;
  abstract readonly projectionContractId: string;

  protected readonly cache: EvidenceCache;
  protected readonly now: () => number;
  protected available = true;
  protected authed = false;
  protected lastError: string | null = null;
  protected lastSuccessAt: string | null = null;
  protected latencies: number[] = [];
  protected calls = 0;
  protected failures = 0;

  constructor(opts: BaseEvidenceProviderOptions = {}) {
    this.now = opts.clock ?? Date.now;
    this.cache =
      opts.cache ?? new EvidenceCache({ defaultTtlMs: opts.cacheTtlMs, clock: this.now });
  }

  // ── Provider-supplied ───────────────────────────────────────────────

  /** Cache key for a query. Override when the provider keys differently. */
  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${(query.entity?.label ?? query.text ?? "").toLowerCase()}`;
  }

  /** Fetch + normalize. The ONLY method a typical provider must write. */
  protected abstract fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>>;

  abstract normalize(raw: unknown, query: AcquisitionQuery): NormalizedEvidence | null;

  // ── Frozen public API ───────────────────────────────────────────────

  async connect(): Promise<void> {
    this.available = true;
  }

  async authenticate(): Promise<boolean> {
    this.authed = true;
    return true;
  }

  async search(query: AcquisitionQuery): Promise<ConnectorResult> {
    const started = this.now();
    const key = this.cacheKey(query);
    if (!query.forceRefresh) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }
    try {
      const records = await this.fetchEvidence(query);
      this.validate(records);
      const result = this.succeed(records, started);
      this.cache.set(key, result);
      return result;
    } catch (err) {
      return this.fail(err instanceof Error ? err.message : String(err), started);
    }
  }

  async lookup(query: AcquisitionQuery): Promise<ConnectorResult> {
    return this.search(query);
  }

  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    return validateRecords(records);
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.id,
      available: this.available,
      authenticated: this.authed,
      latencyMsP50: median(this.latencies),
      failureRate: this.calls === 0 ? 0 : this.failures / this.calls,
      quotaRemaining: null,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  // ── Platform internals (never re-implemented by providers) ──────────

  protected succeed(records: ReadonlyArray<NormalizedEvidence>, started: number): ConnectorResult {
    const latencyMs = Math.max(0, Math.round(this.now() - started));
    this.calls += 1;
    this.lastSuccessAt = new Date(this.now()).toISOString();
    this.latencies = [...this.latencies.slice(-49), latencyMs];
    return { connectorId: this.id, ok: true, records: [...records], latencyMs };
  }

  protected fail(error: string, started: number): ConnectorResult {
    const latencyMs = Math.max(0, Math.round(this.now() - started));
    this.calls += 1;
    this.failures += 1;
    this.lastError = error;
    this.latencies = [...this.latencies.slice(-49), latencyMs];
    return { connectorId: this.id, ok: false, records: [], error, latencyMs };
  }
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
