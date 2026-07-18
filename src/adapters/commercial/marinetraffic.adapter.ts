import type { AisProvider, ProviderMeta, VesselPosition } from "../types";

export const MarineTrafficMeta: ProviderMeta = {
  id: "marinetraffic",
  name: "MarineTraffic",
  kind: "commercial",
  defaultConfidence: "VERIFIED",
  citation: "MarineTraffic AIS API (marinetraffic.com)",
};

/**
 * MarineTraffic AIS adapter — mock. Swap to a real fetch client once the
 * MARINETRAFFIC_API_KEY secret is provisioned. Keep the returned shape
 * consistent with VesselPosition so downstream map + timeline features
 * remain source-agnostic.
 */
export class MarineTrafficAdapter implements AisProvider {
  meta = MarineTrafficMeta;

  async getLatestPosition(mmsi: string): Promise<VesselPosition | null> {
    if (!mmsi) return null;
    // Deterministic Gulf of Guinea coordinate for mock.
    return {
      mmsi,
      lat: 4.05 + (Number(mmsi.slice(-2)) % 10) * 0.02,
      lng: 6.5 + (Number(mmsi.slice(-3)) % 10) * 0.02,
      sog: 11.4,
      cog: 210,
      timestamp: new Date().toISOString(),
      source: this.meta,
    };
  }

  async getTrack(mmsi: string, _sinceIso: string): Promise<VesselPosition[]> {
    const latest = await this.getLatestPosition(mmsi);
    return latest ? [latest] : [];
  }
}

export const marineTraffic = new MarineTrafficAdapter();
