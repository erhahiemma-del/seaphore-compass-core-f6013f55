/** P&I Club insurance — PLANNED. */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface PIInsurance { imo: string; clubName: string; coverExpiresAt: string }

export class PIInsuranceAdapter extends BaseAdapter {
  constructor() { super("pi_insurance"); }
  async lookup(_imo: string): Promise<SourcedResult<PIInsurance>> {
    this.assertUsable(); // throws PlannedSourceError
    return this.envelope<PIInsurance>(null, new Date().toISOString());
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
  }
}
export const piInsurance = new PIInsuranceAdapter();
