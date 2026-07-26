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
 * Called once by `getIntelligenceAcquisitionManager()` — the existing
 * IAL bootstrap. Callers with their own manager (tests, admin tooling)
 * may call this directly.
 */
export function registerEvidenceProviders(manager: ConnectorManager): void {
  manager.register(openSanctionsConnector);
  // Sprint EP-02 — the single environmental evidence source. Future
  // environmental providers are ADAPTERS inside this provider, so this
  // registration line never changes as sources are added.
  manager.register(environmentalIntelligenceProvider);
}
