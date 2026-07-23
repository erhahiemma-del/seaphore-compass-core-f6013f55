/**
 * Connector Manager — orchestrates the pipeline:
 *
 *   query → cache → parallel connector fan-out → validator → resolver →
 *   package builder → EvidencePackage
 *
 * Failures are contained: a connector timeout, throw, or auth error does
 * not stop the pipeline. The manager records the failure in the health
 * tracker and returns whatever the surviving connectors produced. If
 * every connector fails, the manager falls back to any stale cache entry
 * so the OIE still receives a package (with `missing` populated).
 */
import { EvidenceCache } from "./cache";
import { ConnectorRegistry } from "./connectors/registry";
import { HealthTracker } from "./health";
import { buildEvidencePackage } from "./package-builder";
import { stableHash } from "./hash";
import type { Connector } from "./connectors/base";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  EvidencePackage,
} from "./types";

export interface ManagerOptions {
  readonly cache?: EvidenceCache;
  readonly registry?: ConnectorRegistry;
  readonly health?: HealthTracker;
  readonly perConnectorTimeoutMs?: number;
}

export class ConnectorManager {
  private readonly registry: ConnectorRegistry;
  private readonly cache: EvidenceCache;
  private readonly health: HealthTracker;
  private readonly timeoutMs: number;

  constructor(opts: ManagerOptions = {}) {
    this.registry = opts.registry ?? new ConnectorRegistry();
    this.cache = opts.cache ?? new EvidenceCache();
    this.health = opts.health ?? new HealthTracker();
    this.timeoutMs = opts.perConnectorTimeoutMs ?? 3_000;
  }

  register(connector: Connector): void {
    this.registry.register(connector);
  }

  /** Warms up: authenticates every registered connector. Errors captured
   *  in the health tracker; not thrown. */
  async warmup(): Promise<void> {
    await Promise.all(
      this.registry.list().map(async (c) => {
        try {
          await c.connect();
          const ok = await c.authenticate();
          this.health.recordAuth(c.id, ok);
        } catch (err) {
          this.health.recordAuth(c.id, false);
          this.health.recordCall(c.id, false, 0, describe(err));
        }
      }),
    );
  }

  async acquire(query: AcquisitionQuery): Promise<EvidencePackage> {
    const cacheKey = this.cacheKey(query);
    let cacheHits = 0;

    if (!query.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        cacheHits = 1;
        return buildEvidencePackage({
          query,
          results: [cached],
          cacheHits,
        });
      }
    }

    const targets = this.selectTargets(query);
    const results = await Promise.all(targets.map((c) => this.callWithTimeout(c, query)));

    const successful = results.filter((r) => r.ok && r.records.length > 0);
    if (successful.length === 0) {
      // Offline fallback: return the last stale cache entry rather than
      // give the OIE nothing to work with. `missing` in the package will
      // still tell the OIE the freshness story.
      const stale = this.cache.peekStale(cacheKey);
      if (stale) {
        return buildEvidencePackage({
          query,
          results: [stale, ...results.filter((r) => !r.ok)],
          cacheHits: 1,
        });
      }
    } else {
      // Cache the merged successful envelope so the next call skips
      // fan-out. We store a synthetic ConnectorResult so cache hits still
      // reproduce every source attribution.
      for (const r of successful) {
        this.cache.set(`${cacheKey}::${r.connectorId}`, r);
      }
      const merged: ConnectorResult = {
        connectorId: "ial-cache" as ConnectorId,
        ok: true,
        records: successful.flatMap((r) => r.records),
        latencyMs: Math.max(...successful.map((r) => r.latencyMs)),
      };
      this.cache.set(cacheKey, merged);
    }

    return buildEvidencePackage({ query, results, cacheHits });
  }

  getHealth(): ReadonlyArray<ConnectorHealth> {
    return this.registry.list().map((c) => this.health.snapshot(c.id));
  }

  invalidate(query: AcquisitionQuery): void {
    this.cache.invalidate(this.cacheKey(query));
  }

  /** Administrative surface — used by the IAL Admin Controls in the
   *  Administration Center. Kept on the manager so all cache/connector
   *  state stays behind one facade. */
  listConnectors(): ReadonlyArray<{ id: ConnectorId; displayName: string }> {
    return this.registry.list().map((c) => ({ id: c.id, displayName: c.displayName }));
  }

  cacheStats(): { hits: number; misses: number; size: number } {
    return this.cache.stats();
  }

  clearCache(connectorId?: ConnectorId): number {
    if (!connectorId) {
      const size = this.cache.stats().size;
      this.cache.reset();
      return size;
    }
    return this.cache.invalidateWhere((k) => k.endsWith(`::${connectorId}`) || k === `ial:${connectorId}`);
  }

  /** Re-authenticate a single connector and drop its cached envelopes.
   *  Subsequent `acquire()` calls will hit the provider fresh. */
  async refreshConnector(connectorId: ConnectorId): Promise<{
    connectorId: ConnectorId;
    authenticated: boolean;
    cacheEntriesCleared: number;
    latencyMs: number;
    error?: string;
  }> {
    const connector = this.registry.get(connectorId);
    if (!connector) {
      return { connectorId, authenticated: false, cacheEntriesCleared: 0, latencyMs: 0, error: "connector not registered" };
    }
    const started = performance.now();
    let authenticated = false;
    let error: string | undefined;
    try {
      await connector.connect();
      authenticated = await connector.authenticate();
      this.health.recordAuth(connectorId, authenticated);
    } catch (err) {
      error = describe(err);
      this.health.recordAuth(connectorId, false);
      this.health.recordCall(connectorId, false, 0, error);
    }
    const cleared = this.clearCache(connectorId);
    // Also drop merged envelopes that reference this connector's payload
    // — the merged key doesn't carry the connector id, so we clear all
    // top-level `ial:*` merged entries whose per-connector child was
    // just invalidated. This is a bounded set and only fires on admin
    // action.
    const mergedCleared = this.cache.invalidateWhere((k) => k.startsWith("ial:") && !k.includes("::"));
    return {
      connectorId,
      authenticated,
      cacheEntriesCleared: cleared + mergedCleared,
      latencyMs: Math.round(performance.now() - started),
      error,
    };
  }

  /** Prewarm the cache by running acquisition (with forceRefresh) for a
   *  set of queries. Returns per-query outcomes. Failures never throw —
   *  the OIE contract is that acquisition always yields a package. */
  async prewarm(queries: ReadonlyArray<AcquisitionQuery>): Promise<
    ReadonlyArray<{
      query: AcquisitionQuery;
      ok: boolean;
      records: number;
      sources: number;
      latencyMs: number;
      error?: string;
    }>
  > {
    return Promise.all(
      queries.map(async (q) => {
        const started = performance.now();
        try {
          const pkg = await this.acquire({ ...q, forceRefresh: true });
          return {
            query: q,
            ok: true,
            records: pkg.verified.length,
            sources: pkg.sources.length,
            latencyMs: Math.round(performance.now() - started),
          };
        } catch (err) {
          return {
            query: q,
            ok: false,
            records: 0,
            sources: 0,
            latencyMs: Math.round(performance.now() - started),
            error: describe(err),
          };
        }
      }),
    );
  }


  private selectTargets(query: AcquisitionQuery): ReadonlyArray<Connector> {
    const all = this.registry.list();
    if (!query.connectors || query.connectors.length === 0) return all;
    const allow = new Set(query.connectors);
    return all.filter((c) => allow.has(c.id));
  }

  private cacheKey(query: AcquisitionQuery): string {
    return `ial:${stableHash({
      entity: query.entity?.id,
      text: query.text,
      kinds: query.kinds,
      connectors: query.connectors,
    })}`;
  }

  private async callWithTimeout(
    connector: Connector,
    query: AcquisitionQuery,
  ): Promise<ConnectorResult> {
    const started = performance.now();
    const timeout = new Promise<ConnectorResult>((resolve) => {
      setTimeout(() => {
        resolve({
          connectorId: connector.id,
          ok: false,
          records: [],
          error: `timeout after ${this.timeoutMs}ms`,
          latencyMs: this.timeoutMs,
        });
      }, this.timeoutMs);
    });
    try {
      const call = query.entity ? connector.lookup(query) : connector.search(query);
      const result = await Promise.race([call, timeout]);
      const latency = Math.round(performance.now() - started);
      this.health.recordCall(connector.id, result.ok, latency, result.error);
      // Sprint 1A.2: publish connector completion onto the canonical
      // orchestration event bus. Reuses `evidence.collected` — no new
      // event system introduced.
      void emitConnectorEvent(connector.id, result.ok, latency, result.records.length, result.error);
      return result;
    } catch (err) {
      const latency = Math.round(performance.now() - started);
      this.health.recordCall(connector.id, false, latency, describe(err));
      void emitConnectorEvent(connector.id, false, latency, 0, describe(err));
      return {
        connectorId: connector.id,
        ok: false,
        records: [],
        error: describe(err),
        latencyMs: latency,
      };
    }
  }
}

async function emitConnectorEvent(
  connectorId: ConnectorId,
  ok: boolean,
  latencyMs: number,
  recordCount: number,
  error?: string,
): Promise<void> {
  try {
    const { emitEvent } = await import("@/services/orchestration/event-bus");
    await emitEvent({
      event_type: "evidence.collected",
      payload: { connectorId, ok, latencyMs, recordCount, error: error ?? null },
      emitted_by: "ial.connector-manager",
    });
  } catch {
    /* best-effort — the pipeline never fails on telemetry */
  }

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
