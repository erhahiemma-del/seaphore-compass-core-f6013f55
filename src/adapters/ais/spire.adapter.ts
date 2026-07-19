/**
 * Spire Maritime — live vessel AIS.  Status: PLANNED.
 *
 * All fetch methods throw PlannedSourceError. Feature code MUST handle that
 * and fall back to the last-known Datalastic position with an OBSERVED chip
 * and the observedAt timestamp, per Data Source Matrix v1.0.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface AisFix { mmsi: string; lat: number; lng: number; sog?: number; cog?: number; timestamp: string }

export class SpireAdapter extends BaseAdapter {
  constructor() { super("spire"); }
  async getLatestPosition(_mmsi: string): Promise<SourcedResult<AisFix>> {
    this.assertUsable(); // throws PlannedSourceError
    return this.envelope<AisFix>(null, new Date().toISOString());
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
  }
}
export const spire = new SpireAdapter();
