/**
 * Central adapter registry. Feature code resolves providers through here so
 * concrete implementations can be swapped (real, mock, alternate vendor)
 * without touching any feature.
 *
 * Registration is client-safe: adapters that require server secrets keep the
 * secret-bearing fetch inside a server function and expose only the interface
 * declared in `src/adapters/types.ts`.
 */

import type { AisProvider, SanctionsProvider } from "./types";
import type { CommodityFlowProvider } from "./commercial/kpler.adapter";
import type { NewsProvider } from "./osint/gdelt.adapter";

import { marineTraffic } from "./commercial/marinetraffic.adapter";
import { kpler } from "./commercial/kpler.adapter";
import { openSanctions } from "./osint/opensanctions.adapter";
import { gdelt } from "./osint/gdelt.adapter";

export interface AdapterRegistry {
  ais: AisProvider;
  sanctions: SanctionsProvider;
  commodityFlows: CommodityFlowProvider;
  news: NewsProvider;
}

let registry: AdapterRegistry = {
  ais: marineTraffic,
  sanctions: openSanctions,
  commodityFlows: kpler,
  news: gdelt,
};

export function getAdapters(): AdapterRegistry {
  return registry;
}

/** Swap one or more providers (tests, feature flags, alternate vendors). */
export function overrideAdapters(patch: Partial<AdapterRegistry>): void {
  registry = { ...registry, ...patch };
}
