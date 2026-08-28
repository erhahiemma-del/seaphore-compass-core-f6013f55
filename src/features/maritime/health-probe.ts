/**
 * Maritime — post-deploy health probe.
 *
 * A deployment can build, typecheck, and serve HTML while the two things
 * an officer actually opens the map for are broken: the camera refusing
 * to reach the depth the imagery serves, and vessels arriving but never
 * being drawn. Neither failure raises an error — the page simply looks
 * calm and says nothing — so both have to be *asked about* after a
 * deploy rather than waited for.
 *
 * This publishes a read-only snapshot of that answer. Unlike
 * `__seaphoreCamera` and `__seaphoreMapStyle`, it is NOT dev-gated: a
 * check that only exists in development cannot verify a deployment. It
 * is deliberately narrow in exchange — counts, the camera ceiling, and
 * which providers are on. No renderer handle, no vessel identities, no
 * positions, nothing an unauthenticated visitor could not already read
 * off the screen.
 */
import { MAX_CAMERA_ZOOM } from "@/services/geospatial/constants";

/** What a post-deploy check is allowed to see. */
export interface MapHealthSnapshot {
  /** True once a real drawing engine is attached (not the empty stub). */
  readonly rendererDraws: boolean;
  /** Current camera zoom, as the shared geospatial service holds it. */
  readonly zoom: number;
  /** The camera ceiling this build was compiled with. */
  readonly maxZoom: number;
  /** Vessels currently held by the update engine, after filters. */
  readonly vesselCount: number;
  /** Enabled vessel provider ids. */
  readonly sources: readonly string[];
  /**
   * How many vessels the current answer is about.
   *
   * Zero means no fleet answer is on screen. Reported because a
   * highlight is otherwise only checkable by eye, and "the map looks
   * dimmer" is not a verification.
   */
  readonly highlightedVessels: number;
  /**
   * Vessels currently drawing an operational attention ring.
   *
   * Reported for the same reason the highlight count is: a beacon is
   * otherwise only checkable by eye, and "the ring looks like it is
   * there" is not a verification. Counts only, no identities.
   */
  readonly alertBeacons: number;
  /** Milliseconds since the probe was installed. */
  readonly uptimeMs: number;
}

/** Global key the deployment check reads. */
export const MAP_HEALTH_KEY = "__seaphoreMapHealth" as const;

type ProbeWindow = typeof globalThis & {
  [MAP_HEALTH_KEY]?: () => MapHealthSnapshot;
};

/**
 * Install the probe.
 *
 * Returns a teardown so a remount cannot leave a stale closure pointing
 * at a disposed engine — a probe reporting a dead engine's last count is
 * worse than no probe, because it would report health that is gone.
 */
export function installMapHealthProbe(
  read: () => Omit<MapHealthSnapshot, "maxZoom" | "uptimeMs">,
): () => void {
  if (typeof window === "undefined") return () => {};
  const scope = window as ProbeWindow;
  const installedAt = Date.now();
  scope[MAP_HEALTH_KEY] = () => ({
    ...read(),
    maxZoom: MAX_CAMERA_ZOOM,
    uptimeMs: Date.now() - installedAt,
  });
  return () => {
    delete scope[MAP_HEALTH_KEY];
  };
}
