/**
 * Platts / Trading Economics — market price. Status: PLANNED.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface MarketPrice {
  commodity: string;
  unit: string;
  pricePerUnit: number;
  observedAt: string;
}

export class PlattsAdapter extends BaseAdapter {
  constructor() {
    super("platts");
  }
  async spot(commodity: string): Promise<SourcedResult<MarketPrice>> {
    this.assertUsable(); // throws PlannedSourceError
    return this.envelope<MarketPrice>(null, new Date().toISOString());
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
  }
}
export const platts = new PlattsAdapter();
