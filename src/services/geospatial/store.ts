/**
 * GIP — Map state store (React bindings + session state).
 *
 * Two distinct things live here, deliberately separated:
 *
 *  1. **Bindings to the Shared Geospatial Service.** SGS already owns the
 *     canonical {@link MapState}, so these are `useSyncExternalStore`
 *     subscriptions rather than a second copy. Mirroring SGS into a Zustand
 *     store would create two sources of truth that drift the moment a
 *     non-React caller updates SGS.
 *
 *  2. **Session state**, which SGS deliberately does not own: which renderer
 *     is attached, whether it has mounted, how many vessels are on screen,
 *     and the last error. This is ephemeral, not shareable, and must never
 *     reach the URL — so it lives in its own Zustand store, matching the
 *     pattern used by `@/services/mkg/store`.
 */
import { useCallback, useSyncExternalStore } from "react";
import { create } from "zustand";
import {
  createDefaultMapState,
  sgs,
  type SharedGeospatialService,
} from "./shared-geospatial-service";
import type { MapState } from "./types";

/**
 * Stable server snapshot.
 *
 * `useSyncExternalStore` requires `getServerSnapshot` to return an identical
 * reference across calls or React will loop during hydration.
 */
const SERVER_SNAPSHOT: MapState = createDefaultMapState();

/** Subscribe a React component to the whole map state. */
export function useMapState(service: SharedGeospatialService = sgs): MapState {
  const subscribe = useCallback(
    (onChange: () => void) => service.subscribe(() => onChange()),
    [service],
  );
  const getSnapshot = useCallback(() => service.get(), [service]);
  const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Subscribe to a derived slice of map state.
 *
 * `selector` must return a stable value for unchanged input — return
 * primitives, or memoise — since React compares results with `Object.is`.
 */
export function useMapSelector<T>(
  selector: (state: MapState) => T,
  service: SharedGeospatialService = sgs,
): T {
  const subscribe = useCallback(
    (onChange: () => void) => service.subscribe(() => onChange()),
    [service],
  );
  const getSnapshot = useCallback(() => selector(service.get()), [selector, service]);
  const getServerSnapshot = useCallback(() => selector(SERVER_SNAPSHOT), [selector]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Lifecycle of the attached rendering engine. */
export type RendererStatus = "idle" | "mounting" | "ready" | "error";

interface MapSessionState {
  readonly rendererId: string | null;
  readonly rendererStatus: RendererStatus;
  /**
   * Whether the attached renderer actually draws. False while the stub
   * adapter is in use, so the UI can say so plainly instead of presenting an
   * empty canvas that reads as a data outage.
   */
  readonly rendererDraws: boolean;
  readonly vesselCount: number;
  /** Sampled renderer frame rate, or null when unmeasured. */
  readonly fps: number | null;
  readonly lastAppliedAt: string | null;
  readonly lastError: string | null;
  readonly setRenderer: (id: string | null, draws: boolean) => void;
  readonly setStatus: (status: RendererStatus) => void;
  readonly setVesselCount: (count: number, appliedAt?: string) => void;
  readonly setFps: (fps: number | null) => void;
  readonly setError: (message: string | null) => void;
  readonly reset: () => void;
}

const INITIAL_SESSION = {
  rendererId: null,
  rendererStatus: "idle" as RendererStatus,
  rendererDraws: false,
  vesselCount: 0,
  fps: null,
  lastAppliedAt: null,
  lastError: null,
};

/** Ephemeral, per-session map runtime state. Never serialised to the URL. */
export const useMapSessionStore = create<MapSessionState>((set) => ({
  ...INITIAL_SESSION,
  setRenderer: (rendererId, rendererDraws) => set({ rendererId, rendererDraws }),
  setStatus: (rendererStatus) => set({ rendererStatus }),
  setVesselCount: (vesselCount, appliedAt) =>
    set({ vesselCount, lastAppliedAt: appliedAt ?? new Date().toISOString() }),
  setFps: (fps) => set({ fps }),
  setError: (lastError) => set({ lastError, rendererStatus: lastError ? "error" : "ready" }),
  reset: () => set({ ...INITIAL_SESSION }),
}));
