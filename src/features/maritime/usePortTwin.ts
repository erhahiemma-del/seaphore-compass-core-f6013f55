/**
 * Port Digital Twin state (Phase 4B).
 *
 * Holds two things and nothing else: which twin is open, and which of its
 * layers the officer has switched on. Everything an officer then *sees* is
 * derived — the geometry from `port-twin.ts`, the vessels from the
 * canonical fleet the map already has, the selected asset from the shared
 * `MapSelection`. There is no twin store, no twin vessel list and no twin
 * copy of the estate.
 *
 * Layer choices are kept per twin. An officer who turns pipelines on at
 * Bonny and then opens Apapa should find Apapa as they left it, because
 * the two estates are different work and a shared toggle set would silently
 * carry one port's configuration into another's.
 */
import { useCallback, useMemo, useState } from "react";

import {
  defaultTwinLayers,
  portTwinFeatures,
  PORT_TWINS,
  twinCoverage,
  type PortDigitalTwin,
  type PortTwinFeatureCollection,
  type PortTwinLayerCoverage,
  type PortTwinLayerId,
} from "@/services/geospatial/port-twin";

export interface PortTwinState {
  /** Every twin available, for the selector. */
  readonly twins: readonly PortDigitalTwin[];
  /** The open twin, or null when the officer is working the national view. */
  readonly openTwin: PortDigitalTwin | null;
  /** Layers switched on for the open twin. Empty when no twin is open. */
  readonly visibleLayers: readonly PortTwinLayerId[];
  /** Layer-by-layer coverage for the open twin, including the gaps. */
  readonly coverage: readonly PortTwinLayerCoverage[];
  /** Infrastructure projected for the mounted renderer. Never null. */
  readonly features: PortTwinFeatureCollection;
  /** Open a twin by LOCODE. Passing the open twin's id closes it. */
  readonly openPortTwin: (twinId: string) => void;
  readonly close: () => void;
  readonly toggleLayer: (layer: PortTwinLayerId) => void;
  readonly isLayerVisible: (layer: PortTwinLayerId) => boolean;
}

export function usePortTwin(): PortTwinState {
  const [openTwinId, setOpenTwinId] = useState<string | null>(null);
  const [layersByTwin, setLayersByTwin] = useState<
    Readonly<Record<string, readonly PortTwinLayerId[]>>
  >({});

  const openTwin = useMemo(
    () => PORT_TWINS.find((twin) => twin.id === openTwinId) ?? null,
    [openTwinId],
  );

  const visibleLayers = useMemo(
    () => (openTwinId ? (layersByTwin[openTwinId] ?? []) : []),
    [openTwinId, layersByTwin],
  );

  const openPortTwin = useCallback((twinId: string) => {
    setOpenTwinId((current) => (current === twinId ? null : twinId));
    // Seed the twin's layers the first time it is opened, and leave them
    // alone afterwards so a re-open restores the officer's own choices.
    setLayersByTwin((current) =>
      current[twinId] ? current : { ...current, [twinId]: defaultTwinLayers() },
    );
  }, []);

  const close = useCallback(() => setOpenTwinId(null), []);

  const toggleLayer = useCallback(
    (layer: PortTwinLayerId) => {
      if (!openTwinId) return;
      setLayersByTwin((current) => {
        const active = current[openTwinId] ?? defaultTwinLayers();
        const next = active.includes(layer)
          ? active.filter((entry) => entry !== layer)
          : [...active, layer];
        return { ...current, [openTwinId]: next };
      });
    },
    [openTwinId],
  );

  const isLayerVisible = useCallback(
    (layer: PortTwinLayerId) => visibleLayers.includes(layer),
    [visibleLayers],
  );

  const features = useMemo(
    () => portTwinFeatures(openTwinId, visibleLayers),
    [openTwinId, visibleLayers],
  );

  const coverage = useMemo(() => (openTwinId ? twinCoverage(openTwinId) : []), [openTwinId]);

  return {
    twins: PORT_TWINS,
    openTwin,
    visibleLayers,
    coverage,
    features,
    openPortTwin,
    close,
    toggleLayer,
    isLayerVisible,
  };
}
