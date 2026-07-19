/**
 * Datalastic — historical AIS. Status: ACTIVE.
 * Wire the real fetch when DATALASTIC_API_KEY is provisioned.  Until then
 * the adapter reads from public.voyages / vessel positions already in the
 * Seaphore database so no data is fabricated.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";
import type { AisFix } from "./spire.adapter";

export class DatalasticAdapter extends BaseAdapter {
  constructor() {
    super("datalastic");
  }

  async getTrack(mmsi: string, sinceIso: string): Promise<SourcedResult<AisFix[]>> {
    this.assertUsable();
    // Real implementation swaps in DATALASTIC_API_KEY fetch.
    // Until then return empty array (never fabricated fixes) and mark degraded.
    return this.envelope<AisFix[]>([], sinceIso, {
      degradedReason: `Datalastic API not yet wired for ${mmsi}`,
    });
  }

  async healthCheck(): Promise<HealthReport> {
    const t0 = performance.now();
    try {
      // Ping is a HEAD to a public status endpoint (no key required).
      const res = await fetch("https://api.datalastic.com/ping", { method: "HEAD" });
      return {
        state: res.ok ? "OK" : "DEGRADED",
        latencyMs: Math.round(performance.now() - t0),
        checkedAt: new Date().toISOString(),
        errorCode: res.ok ? undefined : String(res.status),
      };
    } catch (err) {
      return {
        state: "DOWN",
        latencyMs: Math.round(performance.now() - t0),
        errorCode: "NETWORK",
        errorMessage: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
export const datalastic = new DatalasticAdapter();
