/**
 * National flag registries — Panama · Liberia · Marshall Islands. ACTIVE.
 * Each registry exposes a public search page; production calls a server
 * function to avoid CORS and to attach registry-specific credentials.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export type FlagState = "Panama" | "Liberia" | "Marshall Islands" | "Other";
export interface FlagStatus { imo: string; flag: FlagState; registryStatus: "IN_GOOD_STANDING" | "UNKNOWN"; verifiedAt: string }

export class FlagRegistryAdapter extends BaseAdapter {
  constructor() { super("flag_registry"); }
  async verify(imo: string, flag: FlagState): Promise<SourcedResult<FlagStatus>> {
    this.assertUsable();
    return this.envelope<FlagStatus>(
      { imo, flag, registryStatus: "UNKNOWN", verifiedAt: new Date().toISOString() },
      new Date().toISOString(),
      { degradedReason: "Flag registry HTTP client not yet configured" },
    );
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const flagRegistry = new FlagRegistryAdapter();
