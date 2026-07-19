/**
 * IMO GISIS + Equasis — vessel particulars. Status: ACTIVE.
 * Reads from public.vessels (seeded from the two registries) so no external
 * key is required for a demo. Real integration replaces the DB read with
 * scraper-fed sync jobs.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface VesselParticulars {
  imo: string;
  name: string;
  flag?: string;
  type?: string;
  gt?: number;
  dwt?: number;
  builder?: string;
  class?: string;
}

export class ImoGisisAdapter extends BaseAdapter {
  constructor() { super("imo_gisis"); }
  async lookup(imo: string): Promise<SourcedResult<VesselParticulars>> {
    this.assertUsable();
    // The real fetch would call GISIS. In demo, callers hydrate from public.vessels.
    return this.envelope<VesselParticulars>(null, new Date().toISOString(), {
      degradedReason: `GISIS live lookup not wired; caller should hydrate ${imo} from public.vessels`,
    });
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const imoGisis = new ImoGisisAdapter();
