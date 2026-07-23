/**
 * Intelligence Acquisition Layer — public entry point.
 *
 * Rules for callers (including the OIE Evidence Collector):
 *   1. Never call an external provider or connector directly.
 *   2. Always request evidence via `acquireEvidence(query)`, which returns
 *      a single `EvidencePackage` regardless of which connectors were
 *      queried.
 *   3. Treat `EvidencePackage.missing`, `conflicting`, and `issues` as
 *      first-class inputs — they are the honesty signals the compliance
 *      framework requires.
 */
export * from "./types";
export { ConnectorRegistry } from "./connectors/registry";
export { ConnectorManager } from "./manager";
export type { Connector } from "./connectors/base";
export { EvidenceCache } from "./cache";
export { HealthTracker } from "./health";
export { normalizeRecord, canonicalEntityId } from "./normalizer";
export { validateRecords } from "./validator";
export { resolveEntities } from "./entity-resolver";
export { buildEvidencePackage } from "./package-builder";
export {
  SimulatedAisConnector,
  SimulatedEquasisConnector,
  SimulatedImoConnector,
  SimulatedMarineTrafficConnector,
  SimulatedOpenSanctionsConnector,
} from "./connectors/simulated";

import { ConnectorManager } from "./manager";
import {
  SimulatedAisConnector,
  SimulatedEquasisConnector,
  SimulatedImoConnector,
  SimulatedMarineTrafficConnector,
  SimulatedOpenSanctionsConnector,
} from "./connectors/simulated";
import type { AcquisitionQuery, EvidencePackage } from "./types";

let defaultManager: ConnectorManager | null = null;

/** Lazily-initialised default manager wired with the simulated connector
 *  suite. Production wiring (real Equasis/IMO/AIS adapters) can register
 *  additional connectors via `getIntelligenceAcquisitionManager()`. */
export function getIntelligenceAcquisitionManager(): ConnectorManager {
  if (defaultManager) return defaultManager;
  const mgr = new ConnectorManager();
  mgr.register(new SimulatedAisConnector());
  mgr.register(new SimulatedEquasisConnector());
  mgr.register(new SimulatedImoConnector());
  mgr.register(new SimulatedMarineTrafficConnector());
  mgr.register(new SimulatedOpenSanctionsConnector());
  defaultManager = mgr;
  return mgr;
}

/** Convenience wrapper — the single entry point every caller should use. */
export async function acquireEvidence(query: AcquisitionQuery): Promise<EvidencePackage> {
  return getIntelligenceAcquisitionManager().acquire(query);
}

/** Test seam: replace the default manager (e.g. with a manager wired
 *  with `{ failing: true }` connectors). */
export function __setDefaultManager(mgr: ConnectorManager | null): void {
  defaultManager = mgr;
}
