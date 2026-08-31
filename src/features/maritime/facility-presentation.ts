/**
 * Looking up a facility, and naming its kind.
 *
 * Split from the panel so the panel file exports only a component —
 * mixing the two costs fast refresh, and the same split already exists
 * between `npa-presentation` and the panels that render it.
 */
import type { FacilityKind } from "@/services/registry/facility-features";
import type {
  FacilityRegistry,
  RegistryFacility,
  RegistryOffshore,
  RegistryPort,
  RegistryTerminal,
} from "@/services/registry/registry-ingest";

/** Every record type the facility layer can open. */
export type FacilityRecord = RegistryPort | RegistryTerminal | RegistryFacility | RegistryOffshore;

export const FACILITY_KIND_LABELS: Readonly<Record<FacilityKind, string>> = {
  PORT: "Port",
  TERMINAL: "Terminal",
  JETTY: "Jetty / facility",
  OFFSHORE: "Offshore facility",
  LNG_GAS: "LNG / gas facility",
};

/**
 * Find a facility across every master, by id.
 *
 * Searched rather than indexed by kind because the click carries the
 * registry's own id, and those are unique across the workbook — an id is
 * enough to identify a record without also trusting the kind the feature
 * property claimed.
 */
export function findFacility(
  registry: FacilityRegistry | null,
  id: string,
): { readonly record: FacilityRecord; readonly kind: FacilityKind } | null {
  if (!registry) return null;

  const port = registry.ports.find((entry) => entry.id === id);
  if (port) return { record: port, kind: "PORT" };
  const terminal = registry.terminals.find((entry) => entry.id === id);
  if (terminal) return { record: terminal, kind: "TERMINAL" };
  const facility = registry.facilities.find((entry) => entry.id === id);
  if (facility) return { record: facility, kind: "JETTY" };
  const offshore = registry.offshore.find((entry) => entry.id === id);
  if (offshore) return { record: offshore, kind: "OFFSHORE" };
  const gas = registry.lngGas.find((entry) => entry.id === id);
  if (gas) return { record: gas, kind: "LNG_GAS" };

  return null;
}

/** Narrowings used by the panel to pick the right field set. */
export function isTerminalRecord(record: FacilityRecord): record is RegistryTerminal {
  return "berthDesignations" in record;
}

export function isOffshoreRecord(record: FacilityRecord): record is RegistryOffshore {
  return "loadingSystem" in record;
}

export function isJettyRecord(record: FacilityRecord): record is RegistryFacility {
  return "cargoFunction" in record;
}
