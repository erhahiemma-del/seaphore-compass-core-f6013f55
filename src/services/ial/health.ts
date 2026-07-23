/**
 * Connector Health Tracker — availability, latency, failure rate,
 * quota, last-success timestamp. Exposed only to administrators via the
 * IAL manager's `getHealth()` API.
 */
import type { ConnectorHealth, ConnectorId } from "./types";

interface HealthState {
  latencies: number[];
  failures: number;
  attempts: number;
  authenticated: boolean;
  available: boolean;
  quotaRemaining: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const MAX_SAMPLES = 32;

export class HealthTracker {
  private readonly state = new Map<ConnectorId, HealthState>();

  private ensure(id: ConnectorId): HealthState {
    let s = this.state.get(id);
    if (!s) {
      s = {
        latencies: [],
        failures: 0,
        attempts: 0,
        authenticated: false,
        available: false,
        quotaRemaining: null,
        lastSuccessAt: null,
        lastError: null,
      };
      this.state.set(id, s);
    }
    return s;
  }

  recordAuth(id: ConnectorId, ok: boolean): void {
    const s = this.ensure(id);
    s.authenticated = ok;
    s.available = ok;
  }

  recordCall(id: ConnectorId, ok: boolean, latencyMs: number, error?: string): void {
    const s = this.ensure(id);
    s.attempts++;
    if (!ok) {
      s.failures++;
      s.lastError = error ?? "call failed";
      s.available = false;
      return;
    }
    s.available = true;
    s.lastError = null;
    s.lastSuccessAt = new Date().toISOString();
    s.latencies.push(Math.max(0, latencyMs));
    if (s.latencies.length > MAX_SAMPLES) s.latencies.shift();
  }

  recordQuota(id: ConnectorId, remaining: number | null): void {
    this.ensure(id).quotaRemaining = remaining;
  }

  snapshot(id: ConnectorId): ConnectorHealth {
    const s = this.ensure(id);
    const sorted = [...s.latencies].sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const failureRate = s.attempts === 0 ? 0 : s.failures / s.attempts;
    return {
      connectorId: id,
      available: s.available,
      authenticated: s.authenticated,
      latencyMsP50: p50,
      failureRate,
      quotaRemaining: s.quotaRemaining,
      lastSuccessAt: s.lastSuccessAt,
      lastError: s.lastError,
    };
  }
}
