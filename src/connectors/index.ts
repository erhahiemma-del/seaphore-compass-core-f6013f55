/**
 * ─────────────────────────────────────────────────────────────────────
 *  Seaphore Evidence Providers — registration surface (Sprint EP-01)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  This module is the ONLY place production Evidence Providers are
 *  registered. It uses the EXISTING IAL Connector Registry — no new
 *  registry, no factory, no service locator is introduced.
 *
 *  Registration is idempotent: `ConnectorRegistry.register` is a map
 *  set, so re-registration (hot reload, repeated manager warmup) is
 *  safe and last-write-wins.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { ConnectorManager } from "@/services/ial/manager";
import { registerCertifiedProvider } from "./framework";
import {
  ENVIRONMENTAL_CACHE_TTL_MS,
  ENVIRONMENTAL_INTELLIGENCE_METADATA,
  EnvironmentalIntelligenceProvider,
  OpenMeteoMarineAdapter,
  environmentalIntelligenceProvider,
} from "./implementations/EnvironmentalIntelligenceProvider";
import {
  OPEN_SANCTIONS_METADATA,
  OpenSanctionsConnector,
  openSanctionsConnector,
} from "./implementations/OpenSanctionsConnector";

export { OpenSanctionsConnector, openSanctionsConnector, OPEN_SANCTIONS_METADATA };
export {
  EnvironmentalIntelligenceProvider,
  environmentalIntelligenceProvider,
  ENVIRONMENTAL_INTELLIGENCE_METADATA,
  ENVIRONMENTAL_CACHE_TTL_MS,
  OpenMeteoMarineAdapter,
};
export type {
  EnvironmentalRequest,
  EnvironmentalObservation,
  EnvironmentalSourceAdapter,
  EnvironmentalAdapterContext,
  EnvironmentalTimeRange,
} from "./implementations/EnvironmentalIntelligenceProvider";

/**
 * Register every production Evidence Provider on a ConnectorManager.
 *
 * Sprint PF-01 — registration now runs through the Evidence Provider
 * certification gate. Failed certification = failed registration. No new
 * registry is introduced: the gate simply calls the existing
 * `ConnectorManager.register`.
 */
export function registerEvidenceProviders(manager: ConnectorManager): void {
  const registered: string[] = [];
  for (const provider of [openSanctionsConnector, environmentalIntelligenceProvider]) {
    registerCertifiedProvider(manager, provider, {
      existingIds: registered,
      // Source-level prohibitions are certified in the regression suite,
      // where provider files are readable; the bundle only carries the
      // runtime-checkable subset.
      allowSkipped: true,
    });
    registered.push(provider.id);
  }
}

