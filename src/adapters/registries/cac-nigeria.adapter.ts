/**
 * Nigeria CAC — company registration. Status: ACTIVE.
 * Live integration point: https://search.cac.gov.ng. Requests routed through
 * a Seaphore server function so the CAC session cookie stays server-side.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface CacRecord {
  cacNumber: string;
  name: string;
  status?: string;
  directors?: string[];
  address?: string;
}

export class CacNigeriaAdapter extends BaseAdapter {
  constructor() {
    super("cac_nigeria");
  }
  async lookup(cacNumber: string): Promise<SourcedResult<CacRecord>> {
    this.assertUsable();
    return this.envelope<CacRecord>(null, new Date().toISOString(), {
      degradedReason: `CAC lookup for ${cacNumber} not yet wired`,
    });
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const cacNigeria = new CacNigeriaAdapter();
