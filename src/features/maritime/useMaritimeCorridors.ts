/**
 * Corridor state (Phase 4C).
 *
 * Holds three things: which corridor layers the officer switched on, the
 * animation phase, and whether the animation is running. Everything drawn
 * is derived from those by `maritime-corridors.ts` — there is no corridor
 * store, no corridor vessel list, and nothing here touches the canonical
 * fleet or `VesselUpdateEngine`.
 *
 * ## One clock
 *
 * The phase advances on a single interval owned by this hook, so a corridor
 * cannot pick up a second driver. Reduced motion holds the phase still: the
 * markers stay drawn at their ETA readouts and simply stop travelling,
 * which keeps the information and drops the movement.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  corridorProjection,
  corridorTransits,
  defaultCorridorLayers,
  CORRIDOR_LAYERS,
  CORRIDOR_PROVENANCE_NOTE,
  MARITIME_CORRIDORS,
  type CorridorLayerId,
  type CorridorProjection,
  type CorridorTransit,
} from "@/services/geospatial/maritime-corridors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/** One full corridor traverse, in seconds of wall clock. */
const LOOP_SECONDS = 240;
const TICK_MS = 1000;

export interface MaritimeCorridorState {
  readonly layers: typeof CORRIDOR_LAYERS;
  readonly visibleLayers: readonly CorridorLayerId[];
  readonly projection: CorridorProjection;
  readonly transits: readonly CorridorTransit[];
  readonly animating: boolean;
  readonly reducedMotion: boolean;
  /** What the overlay is, in one officer-facing sentence. */
  readonly note: string;
  readonly toggleLayer: (layer: CorridorLayerId) => void;
  readonly isLayerVisible: (layer: CorridorLayerId) => boolean;
  readonly toggleAnimation: () => void;
}

export function useMaritimeCorridors(active: boolean): MaritimeCorridorState {
  const reducedMotion = useReducedMotion();
  const [visibleLayers, setVisibleLayers] = useState<readonly CorridorLayerId[]>(() =>
    defaultCorridorLayers(),
  );
  const [phase, setPhase] = useState(0);
  const [animating, setAnimating] = useState(true);

  const running = active && animating && !reducedMotion;

  useEffect(() => {
    if (!running) return;
    const handle = window.setInterval(() => {
      setPhase((current) => (current + TICK_MS / 1000 / LOOP_SECONDS) % 1);
    }, TICK_MS);
    return () => window.clearInterval(handle);
  }, [running]);

  const toggleLayer = useCallback((layer: CorridorLayerId) => {
    setVisibleLayers((current) =>
      current.includes(layer) ? current.filter((entry) => entry !== layer) : [...current, layer],
    );
  }, []);

  const isLayerVisible = useCallback(
    (layer: CorridorLayerId) => visibleLayers.includes(layer),
    [visibleLayers],
  );

  const toggleAnimation = useCallback(() => setAnimating((current) => !current), []);

  const projection = useMemo(
    () => corridorProjection(active ? visibleLayers : []),
    [active, visibleLayers],
  );

  const transits = useMemo(
    () => (active ? corridorTransits(visibleLayers, phase) : []),
    [active, visibleLayers, phase],
  );

  return {
    layers: CORRIDOR_LAYERS,
    visibleLayers,
    projection,
    transits,
    animating: running,
    reducedMotion,
    note: `${CORRIDOR_PROVENANCE_NOTE} ${projection.drawn} of ${MARITIME_CORRIDORS.length} corridors drawn.`,
    toggleLayer,
    isLayerVisible,
    toggleAnimation,
  };
}
