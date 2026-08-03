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
// Sprint EP-MASTER — Evidence Expansion Program (EP-02 … EP-08).
import {
  OPENCORPORATES_METADATA,
  OpenCorporatesProvider,
  openCorporatesProvider,
} from "./implementations/OpenCorporatesProvider";
import {
  EQUASIS_METADATA,
  EquasisProvider,
  equasisProvider,
} from "./implementations/EquasisProvider";
import {
  IMO_GISIS_METADATA,
  ImoGisisProvider,
  imoGisisProvider,
} from "./implementations/ImoGisisProvider";
import {
  GFW_METADATA,
  GlobalFishingWatchProvider,
  globalFishingWatchProvider,
} from "./implementations/GlobalFishingWatchProvider";
import { OFAC_METADATA, OfacProvider, ofacProvider } from "./implementations/OfacProvider";
import {
  UNSC_METADATA,
  UnSecurityCouncilProvider,
  unSecurityCouncilProvider,
} from "./implementations/UnSecurityCouncilProvider";
import {
  NCS_CUSTOMS_METADATA,
  NcsCustomsProvider,
  ncsCustomsProvider,
} from "./implementations/NcsCustomsProvider";
export {
  GovernmentMaritimeProvider,
  governmentMaritimeProvider,
  GOVERNMENT_MARITIME_METADATA,
  GOVERNMENT_MARITIME_CACHE_TTL_MS,
} from "./implementations/GovernmentMaritimeProvider";
import { governmentMaritimeProvider as govMaritime } from "./implementations/GovernmentMaritimeProvider";
import {
  COPERNICUS_METADATA,
  COPERNICUS_CACHE_TTL_MS,
  COPERNICUS_CREDENTIAL_ENV,
  CopernicusProvider,
  copernicusProvider,
} from "./implementations/CopernicusProvider";

export { OpenSanctionsConnector, openSanctionsConnector, OPEN_SANCTIONS_METADATA };
export {
  EnvironmentalIntelligenceProvider,
  environmentalIntelligenceProvider,
  ENVIRONMENTAL_INTELLIGENCE_METADATA,
  ENVIRONMENTAL_CACHE_TTL_MS,
  OpenMeteoMarineAdapter,
};
export { OpenCorporatesProvider, openCorporatesProvider, OPENCORPORATES_METADATA };
export { EquasisProvider, equasisProvider, EQUASIS_METADATA };
export { ImoGisisProvider, imoGisisProvider, IMO_GISIS_METADATA };
export { GlobalFishingWatchProvider, globalFishingWatchProvider, GFW_METADATA };
export { OfacProvider, ofacProvider, OFAC_METADATA };
export { UnSecurityCouncilProvider, unSecurityCouncilProvider, UNSC_METADATA };
export { NcsCustomsProvider, ncsCustomsProvider, NCS_CUSTOMS_METADATA };
export {
  CopernicusProvider,
  copernicusProvider,
  COPERNICUS_METADATA,
  COPERNICUS_CACHE_TTL_MS,
  COPERNICUS_CREDENTIAL_ENV,
};
export type {
  CopernicusAuthState,
  CdseStacFeature,
  CopernicusProviderOptions,
} from "./implementations/CopernicusProvider";
export {
  buildEvidenceProviderCatalog,
  catalogProviderIds,
  formatCacheTtl,
  type CatalogRow,
} from "./catalog";

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
  for (const provider of [
    openSanctionsConnector,
    openCorporatesProvider,
    equasisProvider,
    imoGisisProvider,
    environmentalIntelligenceProvider,
    globalFishingWatchProvider,
    ofacProvider,
    unSecurityCouncilProvider,
    ncsCustomsProvider,
    govMaritime,
    copernicusProvider,
  ]) {
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
