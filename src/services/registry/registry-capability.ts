/**
 * Deriving each registry layer's capability from the dataset itself.
 *
 * The layer definitions say what a layer *is*; this says what it can
 * currently *do*, by counting what the registry actually holds. Nobody
 * types a status here, so a status cannot go stale — which is the whole
 * reason it exists. Terminals read "Unavailable" while ten of them were
 * on screen, because the label was a field and the field was never
 * revisited.
 *
 * ## What counts as drawable
 *
 * Records with a `PORT_ANCHORED` position are deliberately not drawable.
 * The coordinate exists and is correct — it is the parent port's — and
 * MAP CONFIG is explicit that plotting it would stack false markers on
 * one point. So nineteen of twenty-nine terminals hold a coordinate that
 * this counts as no geometry, on purpose.
 */
import {
  resolveCapability,
  type CapabilityInputs,
  type CapabilityStatus,
} from "@/services/geospatial/capability";

import type { FacilityRegistry } from "./registry-ingest";

/** The registry-backed layers whose status is derived from the data. */
export type RegistryLayerId =
  | "maritime-infrastructure"
  | "terminals"
  | "offshore-infrastructure"
  | "berths";

export interface RegistryCapability {
  readonly status: CapabilityStatus;
  /** Records Seaphore holds, drawable or not. */
  readonly records: number;
  /** Records with a position drawable as the facility itself. */
  readonly drawable: number;
  /** Officer-facing sentence. Always set. */
  readonly detail: string;
}

/**
 * Count what the registry holds for each layer, and derive from that.
 *
 * `installed` is passed in rather than imported so this stays a pure
 * function of two inputs — the data and the renderer's install list —
 * and can be exercised without a map.
 */
export function registryCapabilities(
  registry: FacilityRegistry | null,
  installed: ReadonlySet<string>,
  renderLayerIds: Readonly<Record<RegistryLayerId, readonly string[]>>,
  npaBerthCount = 0,
): Readonly<Record<RegistryLayerId, RegistryCapability>> {
  const drawableIn = <T extends { readonly point: { readonly geometry: string } }>(
    records: readonly T[],
  ) => records.filter((record) => record.point.geometry === "VERIFIED_GEOMETRY").length;

  const layerIsInstalled = (id: RegistryLayerId) => {
    const ids = renderLayerIds[id];
    return ids.length > 0 && ids.every((renderId) => installed.has(renderId));
  };

  const derive = (id: RegistryLayerId, inputs: Omit<CapabilityInputs, "layerInstalled">) =>
    resolveCapability({ ...inputs, layerInstalled: layerIsInstalled(id) });

  const ports = registry?.ports ?? [];
  const terminals = registry?.terminals ?? [];
  const facilities = registry?.facilities ?? [];
  const offshore = registry?.offshore ?? [];
  const lngGas = registry?.lngGas ?? [];

  const allFacilities = [...ports, ...terminals, ...facilities, ...offshore, ...lngGas];
  const allDrawable = drawableIn(allFacilities);

  const infrastructure: RegistryCapability = {
    status: derive("maritime-infrastructure", {
      hasRecords: allFacilities.length > 0,
      hasDrawableGeometry: allDrawable > 0,
    }),
    records: allFacilities.length,
    drawable: allDrawable,
    detail: `${allDrawable} of ${allFacilities.length} registry facilities carry a position of their own. The rest are located only to their parent port, or not at all, and appear in the port panel rather than as a pin.`,
  };

  const terminalDrawable = drawableIn(terminals);
  const terminalCapability: RegistryCapability = {
    status: derive("terminals", {
      hasRecords: terminals.length > 0,
      hasDrawableGeometry: terminalDrawable > 0,
    }),
    records: terminals.length,
    drawable: terminalDrawable,
    detail: `${terminals.length} terminals are held, ${terminalDrawable} with a facility-level position. The remainder sit at their port's coordinate, which the registry states must not be drawn as the terminal's own.`,
  };

  const offshoreAll = [...offshore, ...lngGas];
  const offshoreDrawable = drawableIn(offshoreAll);
  const offshoreCapability: RegistryCapability = {
    status: derive("offshore-infrastructure", {
      hasRecords: offshoreAll.length > 0,
      hasDrawableGeometry: offshoreDrawable > 0,
    }),
    records: offshoreAll.length,
    drawable: offshoreDrawable,
    detail: `${offshoreDrawable} of ${offshoreAll.length} offshore and gas facilities carry a position. Offshore estimates are drawn but excluded from distance work until confirmed.`,
  };

  /*
   * Berths are the case this model was built to express. NPA names 525 of
   * them and publishes a coordinate for none, so there is nothing to draw
   * — and yet occupancy, vacancy and the vessel alongside are all
   * available in the port and terminal panels. "Unavailable" would have
   * hidden every one of those.
   */
  const berthCapability: RegistryCapability = {
    status: derive("berths", {
      hasRecords: npaBerthCount > 0,
      hasDrawableGeometry: false,
    }),
    records: npaBerthCount,
    drawable: 0,
    detail: `${npaBerthCount} berth records are held with occupancy and vacancy, and no source publishes berth coordinates. Berth data is available in the port and terminal panels; the map cannot place it.`,
  };

  return {
    "maritime-infrastructure": infrastructure,
    terminals: terminalCapability,
    "offshore-infrastructure": offshoreCapability,
    berths: berthCapability,
  };
}
