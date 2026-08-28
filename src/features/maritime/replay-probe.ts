/**
 * Replay — development instrumentation.
 *
 * Replay failed silently once already, and the reason it went undiagnosed
 * for so long is that the only visible signal — a frame counter — moved
 * for reasons unrelated to playback. The recorder is fed by the live feed,
 * so its totals climb whether or not a single frame has ever been applied
 * to the map. Reading that as progress was a false positive, and no amount
 * of care while reading the source removed the possibility of another one.
 *
 * So the chain reports itself. Every link between the Play button and a
 * vessel's drawn coordinate publishes what it actually holds, and a
 * verification consists of reading those values rather than inferring them
 * from a counter or a screenshot.
 *
 * Development only. It exposes vessel coordinates and internal player
 * state, which the deployment health probe deliberately does not.
 */
import type { ReplayStatus } from "@/services/geospatial";

/** One reading of the whole Play → drawn-position chain. */
export interface ReplayProbeSnapshot {
  /** Does the hook hold the recorder MapCanvas created? */
  readonly recorderAttached: boolean;
  /** Frames the recorder has accumulated from the live feed. */
  readonly recordedFrames: number;
  /**
   * Does the hook hold the update engine as its sink?
   *
   * The single most important field here: a null sink makes
   * `ensurePlayer` return null, and every control then does nothing at
   * all while the interface continues to look operable.
   */
  readonly sinkAttached: boolean;
  /** Has a player been constructed, and is it the same one as last read? */
  readonly playerExists: boolean;
  /** Stable per player instance, so a silent rebuild is visible. */
  readonly playerId: number | null;
  /** Frames the player was constructed with. Fixed at construction. */
  readonly playerFrames: number | null;
  /** The player's own state — not the button's. */
  readonly playerState: ReplayStatus["state"] | null;
  /** Frames the player has applied to the sink. */
  readonly cursor: number | null;
  /** Playhead, ISO, or null when there is no player. */
  readonly playhead: string | null;
  readonly speed: number | null;
  /** Is the hook's tick interval currently running? */
  readonly tickRunning: boolean;
  /** Ticks that have fired since the probe was installed. */
  readonly ticksFired: number;
  /** Frames those ticks applied. Zero with a rising tick count is the bug. */
  readonly framesApplied: number;
  /**
   * The canonical position of one vessel, as the engine holds it.
   *
   * The end of the chain that matters: if this does not change, nothing
   * downstream can, whatever the counters say.
   */
  readonly sampleVessel: {
    readonly imo: string;
    readonly lat: number;
    readonly lon: number;
    readonly timestamp: string;
  } | null;
}

export const REPLAY_PROBE_KEY = "__seaphoreReplay" as const;

type ProbeWindow = typeof globalThis & {
  [REPLAY_PROBE_KEY]?: () => ReplayProbeSnapshot;
};

/**
 * Publish a reader for the replay chain.
 *
 * Returns a teardown, so a remount cannot leave a closure reporting a
 * disposed player's last values — a stale reading is worse than none,
 * because it looks like evidence.
 */
export function installReplayProbe(read: () => ReplayProbeSnapshot): () => void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return () => {};
  const scope = window as ProbeWindow;
  scope[REPLAY_PROBE_KEY] = read;
  return () => {
    delete scope[REPLAY_PROBE_KEY];
  };
}
