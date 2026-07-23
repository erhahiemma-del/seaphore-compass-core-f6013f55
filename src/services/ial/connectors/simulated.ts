/**
 * Simulated connectors — deterministic, offline-safe implementations used
 * for development, tests, and fallback when a real provider is disabled.
 *
 * Each connector mirrors the field vocabulary of its real counterpart but
 * emits Seaphore-canonical evidence via `normalizeRecord`. Provider outages
 * are simulated by constructing the connector with `{ failing: true }` —
 * the pipeline must remain up regardless.
 */
import { normalizeRecord } from "../normalizer";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  NormalizedEvidence,
} from "../types";
import type { Connector } from "./base";

interface SimOptions {
  readonly failing?: boolean;
  readonly latencyMs?: number;
}

abstract class SimConnector implements Connector {
  abstract readonly id: ConnectorId;
  abstract readonly displayName: string;
  protected readonly opts: SimOptions;
  private authed = false;

  constructor(opts: SimOptions = {}) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    /* no-op */
  }
  async authenticate(): Promise<boolean> {
    this.authed = !this.opts.failing;
    return this.authed;
  }

  async search(q: AcquisitionQuery): Promise<ConnectorResult> {
    return this.run(q);
  }
  async lookup(q: AcquisitionQuery): Promise<ConnectorResult> {
    return this.run(q);
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.id,
      available: !this.opts.failing,
      authenticated: this.authed,
      latencyMsP50: this.opts.latencyMs ?? 40,
      failureRate: this.opts.failing ? 1 : 0,
      quotaRemaining: null,
      lastSuccessAt: this.authed ? new Date().toISOString() : null,
      lastError: this.opts.failing ? "simulated outage" : null,
    };
  }

  normalize(raw: unknown, _q: AcquisitionQuery): NormalizedEvidence | null {
    return raw as NormalizedEvidence;
  }

  protected async run(q: AcquisitionQuery): Promise<ConnectorResult> {
    const started = performance.now();
    if (this.opts.failing) {
      return {
        connectorId: this.id,
        ok: false,
        records: [],
        error: "simulated outage",
        latencyMs: Math.round(performance.now() - started),
      };
    }
    const records = this.produce(q);
    return {
      connectorId: this.id,
      ok: true,
      records,
      latencyMs: Math.round(performance.now() - started),
    };
  }

  protected abstract produce(q: AcquisitionQuery): ReadonlyArray<NormalizedEvidence>;
}

/** Simulated AIS — position + voyage kinds for vessels. */
export class SimulatedAisConnector extends SimConnector {
  readonly id: ConnectorId = "ais";
  readonly displayName = "AIS Feed (Simulated)";
  protected produce(q: AcquisitionQuery): ReadonlyArray<NormalizedEvidence> {
    if (q.entity?.kind !== "vessel") return [];
    const nativeId = extractImo(q.entity.id) ?? q.entity.id;
    return [
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "OBSERVED",
        entity: { kind: "vessel", nativeId, label: q.entity.label },
        kind: "position",
        fields: { lat: 6.4531, lon: 3.3956, speedKn: 11.2, headingDeg: 87 },
        units: { lat: "deg", lon: "deg", speedKn: "kn", headingDeg: "deg" },
        observedAt: new Date(Date.now() - 15 * 60_000),
        excerpt: "AIS position report",
      }),
    ];
  }
}

/** Simulated Equasis — identity + ownership. */
export class SimulatedEquasisConnector extends SimConnector {
  readonly id: ConnectorId = "equasis";
  readonly displayName = "Equasis (Simulated)";
  protected produce(q: AcquisitionQuery): ReadonlyArray<NormalizedEvidence> {
    if (q.entity?.kind !== "vessel") return [];
    const nativeId = extractImo(q.entity.id) ?? q.entity.id;
    return [
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "VERIFIED",
        entity: { kind: "vessel", nativeId, label: q.entity.label },
        kind: "identity",
        fields: { name: q.entity.label ?? "Unknown", flag: "PA", type: "General Cargo" },
        observedAt: new Date(Date.now() - 3 * 86400_000),
        excerpt: "Equasis identity record",
      }),
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "VERIFIED",
        entity: { kind: "vessel", nativeId, label: q.entity.label },
        kind: "ownership",
        fields: { ownerName: "OceanLine Shipping SA", ownerCountry: "PA" },
        observedAt: new Date(Date.now() - 3 * 86400_000),
        excerpt: "Equasis ownership record",
      }),
    ];
  }
}

/** Simulated IMO GISIS. */
export class SimulatedImoConnector extends SimConnector {
  readonly id: ConnectorId = "imo-gisis";
  readonly displayName = "IMO GISIS (Simulated)";
  protected produce(q: AcquisitionQuery): ReadonlyArray<NormalizedEvidence> {
    if (q.entity?.kind !== "vessel") return [];
    const nativeId = extractImo(q.entity.id) ?? q.entity.id;
    return [
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "VERIFIED",
        entity: { kind: "vessel", nativeId, label: q.entity.label },
        kind: "identity",
        fields: { name: q.entity.label ?? "Unknown", flag: "PA", built: 2011 },
        observedAt: new Date(Date.now() - 7 * 86400_000),
        excerpt: "IMO registry record",
      }),
    ];
  }
}

/** Simulated OpenSanctions — sanctions matches for entities. */
export class SimulatedOpenSanctionsConnector extends SimConnector {
  readonly id: ConnectorId = "opensanctions";
  readonly displayName = "OpenSanctions (Simulated)";
  protected produce(q: AcquisitionQuery): ReadonlyArray<NormalizedEvidence> {
    const target = q.entity?.label ?? q.text;
    if (!target) return [];
    return [
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "CORROBORATED",
        entity: q.entity ?? { kind: "company", nativeId: target, label: target },
        kind: "sanctions",
        fields: { listName: "OFAC-SDN", match: "none", score: 0.02 },
        observedAt: new Date(Date.now() - 6 * 3600_000),
        excerpt: "No sanctions match",
      }),
    ];
  }
}

/** Simulated MarineTraffic — port calls. */
export class SimulatedMarineTrafficConnector extends SimConnector {
  readonly id: ConnectorId = "marinetraffic";
  readonly displayName = "MarineTraffic (Simulated)";
  protected produce(q: AcquisitionQuery): ReadonlyArray<NormalizedEvidence> {
    if (q.entity?.kind !== "vessel") return [];
    const nativeId = extractImo(q.entity.id) ?? q.entity.id;
    return [
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "REPORTED",
        entity: { kind: "vessel", nativeId, label: q.entity.label },
        kind: "port-call",
        fields: { port: "NGLOS", eta: new Date(Date.now() + 6 * 3600_000).toISOString() },
        observedAt: new Date(Date.now() - 30 * 60_000),
        excerpt: "Reported ETA Lagos",
      }),
    ];
  }
}

function extractImo(canonicalId: string): string | null {
  const m = /vessel:imo:(\d{7})/.exec(canonicalId);
  return m ? m[1] : null;
}
