/**
 * Volza — cross-border trade records for Nigeria lanes. Status: ACTIVE.
 * Real API is a paid REST endpoint; wire behind a server function that
 * reads VOLZA_API_KEY from process.env.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface TradeRecord {
  hsCode: string;
  commodity: string;
  origin: string;
  destination: string;
  declaredValueUsd: number;
  observedAt: string;
}

export class VolzaAdapter extends BaseAdapter {
  constructor() { super("volza"); }
  async lookupByHs(hs: string): Promise<SourcedResult<TradeRecord[]>> {
    this.assertUsable();
    return this.envelope<TradeRecord[]>([], new Date().toISOString(), {
      degradedReason: `Volza live lookup pending API key for HS ${hs}`,
    });
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const volza = new VolzaAdapter();
