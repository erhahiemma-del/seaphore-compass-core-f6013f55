/**
 * What each registry-backed layer can currently do, resolved from data.
 *
 * The Layer Panel used to render a status somebody typed into the layer
 * definition. That is a claim the system never checks, and it went stale
 * twice: observed tracks read "awaiting connector" long after the
 * connector shipped, and terminals read "unavailable" with ten of them
 * on screen.
 *
 * This asks the actual dataset instead — how many records, how many carry
 * a drawable position, is the render layer installed — and lets the
 * status fall out of the answer. A capability that starts working reports
 * itself without anyone remembering to edit a label.
 *
 * Only the registry-backed layers are covered. A licence or a credential
 * is a fact about an agreement, not about code, so those layers keep a
 * declared status; the panel falls back to it.
 */
import { useMemo } from "react";

import { INSTALLED_RENDER_LAYERS, layerRegistry } from "@/services/geospatial";
import {
  registryCapabilities,
  type RegistryCapability,
  type RegistryLayerId,
} from "@/services/registry/registry-capability";

import { useFacilityRegistry, useNpaDataset } from "./use-npa-context";

const REGISTRY_LAYER_IDS: readonly RegistryLayerId[] = [
  "maritime-infrastructure",
  "terminals",
  "offshore-infrastructure",
  "berths",
];

export interface LayerCapabilities {
  readonly byLayer: ReadonlyMap<string, RegistryCapability>;
  /** True until both datasets have settled — not "no capability". */
  readonly pending: boolean;
}

export function useLayerCapabilities(): LayerCapabilities {
  const { registry, pending: registryPending } = useFacilityRegistry();
  const { dataset, pending: npaPending } = useNpaDataset();

  const byLayer = useMemo(() => {
    const installed = new Set(INSTALLED_RENDER_LAYERS);

    /*
     * Render layer ids come from the registry definitions rather than a
     * second list here. A layer that changes which render layers it owns
     * must not need this file edited too — that is exactly the
     * duplication that let the statuses drift in the first place.
     */
    const renderLayerIds = Object.fromEntries(
      REGISTRY_LAYER_IDS.map((id) => [id, layerRegistry.get(id)?.renderLayerIds ?? []]),
    ) as Record<RegistryLayerId, readonly string[]>;

    const resolved = registryCapabilities(
      registry,
      installed,
      renderLayerIds,
      dataset?.berths.length ?? 0,
    );

    return new Map<string, RegistryCapability>(Object.entries(resolved));
  }, [registry, dataset]);

  return { byLayer, pending: registryPending || npaPending };
}
