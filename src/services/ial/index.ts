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
 *
 * Sprint 1A.2 consolidation:
 *   • The IAL `Connector` interface is the canonical connector contract.
 *   • The IAL `ConnectorRegistry` is the canonical registry.
 *   • Production OSINT connectors from `src/lib/osint/connectors` are
 *     bridged into this registry via `osint-bridge`.
 *   • Simulators remain available for tests via `VITE_IAL_MODE=simulation`
 *     or by manually registering them on the manager.
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
export { bridgeOsintConnector } from "./connectors/osint-bridge";
export {
  SimulatedAisConnector,
  SimulatedEquasisConnector,
  SimulatedImoConnector,
  SimulatedMarineTrafficConnector,
  SimulatedOpenSanctionsConnector,
} from "./connectors/simulated";

import { ConnectorManager } from "./manager";
import { bridgeOsintConnector } from "./connectors/osint-bridge";
import {
  SimulatedAisConnector,
  SimulatedEquasisConnector,
  SimulatedImoConnector,
  SimulatedMarineTrafficConnector,
  SimulatedOpenSanctionsConnector,
} from "./connectors/simulated";
// Side-effect import: registers all production OSINT connectors in
// `src/lib/osint/registry`. Bridged into the IAL registry below.
import "@/lib/osint/connectors";
import { listConnectors as listOsintConnectors } from "@/lib/osint/registry";
import type { AcquisitionQuery, EvidencePackage } from "./types";

let defaultManager: ConnectorManager | null = null;

type IalMode = "production" | "simulation" | "hybrid";

function resolveMode(): IalMode {
  const raw =
    (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_IAL_MODE) ||
    (typeof process !== "undefined" && process.env?.IAL_MODE) ||
    "hybrid";
  const m = String(raw).toLowerCase();
  if (m === "production" || m === "simulation" || m === "hybrid") return m;
  return "hybrid";
}

/**
 * Lazily-initialised default manager.
 *
 * Registration order:
 *   1. In `production` and `hybrid` modes, every OSINT connector
 *      registered in `src/lib/osint/connectors/index.ts` is bridged in.
 *   2. In `simulation` and `hybrid` modes, the deterministic simulators
 *      are also registered — so tests and offline dev keep working.
 *
 * Callers may `.register(new MyConnector())` to add more.
 */
export function getIntelligenceAcquisitionManager(): ConnectorManager {
  if (defaultManager) return defaultManager;
  const mgr = new ConnectorManager();
  const mode = resolveMode();

  if (mode === "production" || mode === "hybrid") {
    try {
      // Side-effect: fills the OSINT code registry with production connectors.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const osint = require("@/lib/osint/connectors") as unknown;
      void osint; // no-op — the import is for its side-effect
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { listConnectors } = require("@/lib/osint/registry") as {
        listConnectors: () => ReadonlyArray<import("@/lib/osint/types").ConnectorInterface>;
      };
      for (const c of listConnectors()) {
        mgr.register(bridgeOsintConnector(c));
      }
    } catch {
      // Environment (e.g. isolated unit test) without the OSINT bundle —
      // fall back to simulators below.
    }
  }

  if (mode === "simulation" || mode === "hybrid") {
    if (!mgr.listConnectors().some((c) => c.id === "ais")) mgr.register(new SimulatedAisConnector());
    if (!mgr.listConnectors().some((c) => c.id === "equasis")) mgr.register(new SimulatedEquasisConnector());
    if (!mgr.listConnectors().some((c) => c.id === "imo-gisis")) mgr.register(new SimulatedImoConnector());
    if (!mgr.listConnectors().some((c) => c.id === "marinetraffic")) mgr.register(new SimulatedMarineTrafficConnector());
    if (!mgr.listConnectors().some((c) => c.id === "opensanctions")) mgr.register(new SimulatedOpenSanctionsConnector());
  }

  defaultManager = mgr;
  // Kick off a background warmup so `healthCheck()` state is populated
  // before the first officer query lands. Never throws.
  void mgr.warmup().then(() => mgr.getHealth()).catch(() => undefined);
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
