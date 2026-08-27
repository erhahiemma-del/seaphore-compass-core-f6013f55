/**
 * Replay timeline binding.
 *
 * Connects the existing `ReplayRecorder` and `ReplayPlayer` to the
 * timeline UI and to `MapState.timelinePosition`. It creates no player of
 * its own beyond the single canonical one, owns no second clock beyond
 * the interval that drives `tick`, and stores no copy of the playhead.
 *
 * ## One playhead
 *
 * `ReplayPlayer` holds the authoritative position. This hook mirrors it
 * into `MapState.timelinePosition` on every change so the map, the
 * drawer and the national picture all read the same instant — but it
 * never writes a position the player has not reached, so the two cannot
 * drift.
 *
 * ## Why replay needs no separate historical fleet
 *
 * The player's sink is the same `VesselUpdateEngine` the map draws from.
 * Applying a frame moves the vessels on screen, and everything computed
 * from `engine.snapshot()` — including the national picture — becomes
 * historical automatically. A live count therefore cannot be presented as
 * a historical one, because at a replay position there is no live count
 * in the engine to present.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ReplayPlayer,
  sgs,
  type ReplayRecorder,
  type ReplaySink,
  type ReplaySpeed,
  type ReplayStatus,
  type SharedGeospatialService,
} from "@/services/geospatial";

/**
 * Why no recording is available.
 *
 * Six distinct states. Collapsing any two would let a hole in collection
 * read as a quiet stretch of sea.
 */
export type ReplayAvailability =
  /** A recording exists and can be played. */
  | "READY"
  /** The live feed has not yet produced enough observations to replay. */
  | "NO_HISTORY"
  /** Observations exist but all at one instant — nothing to play through. */
  | "NO_MOVEMENT"
  /** The vessel feed is still loading its first response. */
  | "LOADING"
  /** The vessel source is connected but failing. */
  | "SOURCE_UNAVAILABLE"
  /** No historical provider is configured at all. */
  | "PENDING_CREDENTIALS";

export interface ReplayTimeline {
  readonly status: ReplayStatus | null;
  readonly availability: ReplayAvailability;
  /** Officer-facing sentence. Always set when `status` is null. */
  readonly unavailableReason: string;
  readonly attachRecorder: (recorder: ReplayRecorder) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly step: (direction: 1 | -1) => void;
  readonly restart: () => void;
  readonly setSpeed: (speed: ReplaySpeed) => void;
  readonly scrub: (position: number) => void;
}

const REASONS: Readonly<Record<Exclude<ReplayAvailability, "READY">, string>> = {
  NO_HISTORY:
    "No historical track loaded. Seaphore has not yet accumulated enough observations from the live feed to replay.",
  NO_MOVEMENT:
    "Observations exist for this period but all at a single instant, so there is nothing to play through.",
  LOADING: "Loading observations.",
  SOURCE_UNAVAILABLE:
    "The vessel source is connected but currently failing, so no period can be replayed.",
  PENDING_CREDENTIALS:
    "Historical movement is not available. Replay covers what this session has observed.",
};

/** How often `tick` runs. The player advances by elapsed time, not by frame. */
const TICK_MS = 250;

export interface UseReplayTimelineOptions {
  readonly service?: SharedGeospatialService;
  /** The engine the player applies frames to. Same one the map draws. */
  readonly sink?: ReplaySink | null;
  readonly feedLoading?: boolean;
  readonly feedError?: string | null;
  readonly historicalProviderConnected?: boolean;
}

export function useReplayTimeline(options: UseReplayTimelineOptions = {}): ReplayTimeline {
  const {
    service = sgs,
    sink = null,
    feedLoading = false,
    feedError = null,
    historicalProviderConnected = false,
  } = options;

  const recorderRef = useRef<ReplayRecorder | null>(null);
  const playerRef = useRef<ReplayPlayer | null>(null);
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  const attachRecorder = useCallback((recorder: ReplayRecorder) => {
    recorderRef.current = recorder;
    setFrameCount(recorder.snapshot().length);
  }, []);

  // Keep the frame count fresh so availability reflects what the live
  // feed has actually accumulated.
  useEffect(() => {
    const poll = setInterval(() => {
      const recorder = recorderRef.current;
      if (recorder) setFrameCount(recorder.snapshot().length);
    }, 2_000);
    return () => clearInterval(poll);
  }, []);

  /** Build the player lazily — there is nothing to play until frames exist. */
  const ensurePlayer = useCallback((): ReplayPlayer | null => {
    if (playerRef.current) return playerRef.current;
    const recorder = recorderRef.current;
    if (!recorder || !sink) return null;

    const frames = recorder.snapshot();
    if (frames.length === 0) return null;

    const player = new ReplayPlayer({
      frames,
      sink,
      onChange: (next) => {
        setStatus(next);
        // Mirror, never lead: the player owns the position and this only
        // publishes where it already is.
        service.update({
          timelinePosition: new Date(next.position).toISOString(),
          timelinePlaying: next.state === "playing",
        });
      },
    });
    playerRef.current = player;
    setStatus(player.status());
    return player;
  }, [sink, service]);

  // Advance the canonical player. One interval, owned here, disposed here.
  useEffect(() => {
    if (!status || status.state !== "playing") return;
    const timer = setInterval(() => {
      playerRef.current?.tick(TICK_MS);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status]);

  const availability: ReplayAvailability = (() => {
    if (playerRef.current || frameCount > 1) return "READY";
    if (feedError) return "SOURCE_UNAVAILABLE";
    if (feedLoading) return "LOADING";
    if (frameCount === 1) return "NO_MOVEMENT";
    // Nothing accumulated locally. Whether that is worth explaining as a
    // missing provider depends on whether one could exist.
    return historicalProviderConnected ? "NO_HISTORY" : "PENDING_CREDENTIALS";
  })();

  return {
    status,
    availability,
    unavailableReason: availability === "READY" ? "" : REASONS[availability],
    attachRecorder,
    play: useCallback(() => {
      const player = ensurePlayer();
      if (!player) return;
      if (player.status().state === "paused") player.resume();
      else player.play();
    }, [ensurePlayer]),
    pause: useCallback(() => playerRef.current?.pause(), []),
    step: useCallback(
      (direction: 1 | -1) => {
        const player = ensurePlayer();
        if (!player) return;
        if (direction === 1) player.stepForward();
        else player.stepBack();
      },
      [ensurePlayer],
    ),
    restart: useCallback(() => {
      const player = ensurePlayer();
      if (!player) return;
      player.jumpTo(player.status().from);
    }, [ensurePlayer]),
    setSpeed: useCallback(
      (speed: ReplaySpeed) => {
        const player = ensurePlayer();
        player?.setSpeed(speed);
      },
      [ensurePlayer],
    ),
    // Scrubbing moves the canonical playhead and re-applies frames, so
    // vessels on the map move with the drag. It is not a UI-only slider.
    scrub: useCallback(
      (position: number) => {
        const player = ensurePlayer();
        player?.seekTo(position);
      },
      [ensurePlayer],
    ),
  };
}
