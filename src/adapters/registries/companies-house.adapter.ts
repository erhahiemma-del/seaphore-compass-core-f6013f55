/**
 * UK Companies House + offshore corporate registries — ownership. PARTIAL.
 * Only returns fields the adapter can actually verify; unknown fields stay
 * null and the envelope records degradedReason so the UI shows a partial
 * banner rather than pretending completeness.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface OwnershipRecord {
  companyNumber: string;
  jurisdiction: string;
  name: string;
  directors: string[] | null;
  beneficialOwners: string[] | null;
  incorporationDate: string | null;
}

export class CompaniesHouseAdapter extends BaseAdapter {
  constructor() {
    super("companies_house");
  }
  async lookup(
    companyNumber: string,
    jurisdiction = "GB",
  ): Promise<SourcedResult<OwnershipRecord>> {
    this.assertUsable();
    // PARTIAL: return only fields we can verify; leave beneficialOwners null.
    return this.envelope<OwnershipRecord>(
      {
        companyNumber,
        jurisdiction,
        name: "",
        directors: null,
        beneficialOwners: null,
        incorporationDate: null,
      },
      new Date().toISOString(),
      { degradedReason: "PARTIAL source — beneficial ownership often INFERRED" },
    );
  }
  async healthCheck(): Promise<HealthReport> {
    return {
      state: "DEGRADED",
      errorMessage: "PARTIAL — offshore feeds intermittent",
      checkedAt: new Date().toISOString(),
    };
  }
}
export const companiesHouse = new CompaniesHouseAdapter();
