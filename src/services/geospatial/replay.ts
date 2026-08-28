/**
 * GIP — Replay recorder and player.
 *
 * Records every accepted observation as it enters the map, then plays the
 * recording back through the *same* update engine the live feed uses.
 *
 * ## No duplicated vessel state
 *
 * The recorder stores observations, not map state. Playback reconstructs
 * the picture by replaying those observations into `VesselUpdateEngine`,
 * exactly as the live path does. There is no parallel vessel store, no
 * second source of truth, and no separate rendering path — which is why a
 * replayed frame is guaranteed to look like the live frame did.
 *
 * ## Time, not frames
 *
 * The recording is a timeline of timestamped observations, so seeking is a
 * binary search over time rather than a frame index. That keeps `jumpTo`
 * exact regardless of how irregularly observations arrived.
 *
 * APIs only — no playback UI in this commit.
 */
import type { Vessel } from "./vessel";

/** One recorded observation, with the moment it was admitted. */
export interface ReplayFrame {
  /** Epoch ms when the observation was accepted into the map. */
  readonly recordedAt: number;
  /** Epoch ms the observation itself claims. */
  readonly observedAt: number;
  readonly vessel: Vessel;
}

/**
 * Playback rate multipliers.
 *
 * 20 and 100 were added in Phase 8 for scrubbing long historical windows;
 * 10 is retained so existing callers and saved states keep working.
 */
export type ReplaySpeed = 1 | 5 | 10 | 20 | 100;

/** Speeds offered in the timeline UI, slowest first. */
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [1, 5, 20, 100] as const;

export interface ReplayRecorderOptions {
  /** Clock, injectable for deterministic tests. */
  readonly now?: () => number;
  /**
   * Maximum frames retained. Oldest are dropped first.
   * Default 50,000 — roughly a day of a busy feed, bounded so a long
   * session cannot exhaust memory.
   */
  readonly maxFrames?: number;
}

/**
 * Append-only recorder.
 *
 * Fed from the same point the update engine is fed, so a recording
 * contains exactly what the map was shown — no more, no less.
 */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private readonly now: () => number;
  private readonly maxFrames: number;
  private dropped = 0;

  constructor(options: ReplayRecorderOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.maxFrames = options.maxFrames ?? 50_000;
  }

  /** Record one accepted observation. */
  record(vessel: Vessel): void {
    const observedAt = Date.parse(vessel.position?.timestamp ?? "");
    this.frames.push({
      recordedAt: this.now(),
      observedAt: Number.isNaN(observedAt) ? this.now() : observedAt,
      vessel,
    });
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
      this.dropped += 1;
    }
  }

  /** Record a whole batch. */
  recordBatch(vessels: readonly Vessel[]): void {
    for (const vessel of vessels) this.record(vessel);
  }

  /** Every frame, oldest first. */
  snapshot(): readonly ReplayFrame[] {
    return [...this.frames];
  }

  get size(): number {
    return this.frames.length;
  }

  /** Frames discarded to stay within `maxFrames`. */
  get droppedCount(): number {
    return this.dropped;
  }

  /** Time span covered, or null when empty. */
  span(): { readonly from: number; readonly to: number } | null {
    if (this.frames.length === 0) return null;
    return {
      from: this.frames[0].observedAt,
      to: this.frames[this.frames.length - 1].observedAt,
    };
  }

  clear(): void {
    this.frames = [];
    this.dropped = 0;
  }
}

/** Sink the player pushes observations into — normally the update engine. */
export interface ReplaySink {
  applyPatch(vessel: Vessel): unknown;
  clear?(): void;
}

export type ReplayState = "idle" | "playing" | "paused" | "ended";

export interface ReplayPlayerOptions {
  readonly frames: readonly ReplayFrame[];
  /** Where observations are applied. The live update engine, normally. */
  readonly sink: ReplaySink;
  readonly speed?: ReplaySpeed;
  /** Notified whenever position or state changes. */
  readonly onChange?: (status: ReplayStatus) => void;
}

/** Everything a timeline UI needs, without owning any of it. */
export interface ReplayStatus {
  readonly state: ReplayState;
  readonly speed: ReplaySpeed;
  /** Current playhead, epoch ms. */
  readonly position: number;
  readonly from: number;
  readonly to: number;
  /** Frames applied so far. */
  readonly cursor: number;
  readonly total: number;
  /** Progress 0-1, or 0 for an empty recording. */
  readonly progress: number;
}

/**
 * Deterministic player over a recording.
 *
 * Advancing is driven by {@link tick}, not by a timer the player owns, so
 * playback is exact in tests and the host controls the cadence. A host
 * typically calls `tick` from `requestAnimationFrame` or `setInterval`.
 */
export class ReplayPlayer {
  private readonly frames: readonly ReplayFrame[];
  private readonly sink: ReplaySink;
  private readonly onChange?: (status: ReplayStatus) => void;

  private state: ReplayState = "idle";
  private speedValue: ReplaySpeed;
  private cursor = 0;
  private position: number;

  constructor(options: ReplayPlayerOptions) {
    // Sort defensively: a caller may concatenate recordings.
    this.frames = [...options.frames].sort((a, b) => a.observedAt - b.observedAt);
    this.sink = options.sink;
    this.onChange = options.onChange;
    this.speedValue = options.speed ?? 1;
    this.position = this.frames.length > 0 ? this.frames[0].observedAt : 0;
  }

  status(): ReplayStatus {
    const from = this.frames.length > 0 ? this.frames[0].observedAt : 0;
    const to = this.frames.length > 0 ? this.frames[this.frames.length - 1].observedAt : 0;
    const range = to - from;
    return {
      state: this.state,
      speed: this.speedValue,
      position: this.position,
      from,
      to,
      cursor: this.cursor,
      total: this.frames.length,
      progress: range <= 0 ? (this.frames.length > 0 ? 1 : 0) : (this.position - from) / range,
    };
  }

  /**
   * Start, or start again from the beginning once the recording has run out.
   *
   * The rewind happens before the state is set, and the order is the whole
   * point: `jumpTo` decides a state of its own, so rewinding afterwards
   * overwrote "playing" with "paused". Pressing play on a finished
   * recording then did nothing visible and needed a second press.
   */
  play(): void {
    if (this.frames.length === 0) return;
    if (this.cursor >= this.frames.length) this.jumpTo(this.status().from);
    this.state = "playing";
    this.emit();
  }

  pause(): void {
    if (this.state === "playing") {
      this.state = "paused";
      this.emit();
    }
  }

  /** Alias for {@link play}, for symmetry with pause. */
  resume(): void {
    this.play();
  }

  setSpeed(speed: ReplaySpeed): void {
    this.speedValue = speed;
    this.emit();
  }

  /**
   * Advance the playhead by `elapsedMs` of wall time, scaled by speed.
   *
   * Returns the number of frames applied.
   */
  tick(elapsedMs: number): number {
    if (this.state !== "playing" || this.frames.length === 0) return 0;
    const target = this.position + elapsedMs * this.speedValue;
    const applied = this.applyUntil(target);
    this.position = target;

    const end = this.frames[this.frames.length - 1].observedAt;
    if (this.position >= end && this.cursor >= this.frames.length) {
      this.position = end;
      this.state = "ended";
    }
    this.emit();
    return applied;
  }

  /** Apply the next frame and move the playhead to it. */
  stepForward(): boolean {
    if (this.cursor >= this.frames.length) return false;
    const frame = this.frames[this.cursor];
    this.sink.applyPatch(frame.vessel);
    this.cursor += 1;
    this.position = frame.observedAt;
    if (this.cursor >= this.frames.length) this.state = "ended";
    this.emit();
    return true;
  }

  /**
   * Move back one frame.
   *
   * Implemented as a rewind-and-replay: the sink is cleared and every frame
   * up to the new position is reapplied. Stepping back cannot be done by
   * subtraction — an observation has no inverse — and rebuilding from the
   * recording is what keeps replay state identical to live state.
   */
  stepBack(): boolean {
    if (this.cursor <= 0) return false;
    const targetCursor = this.cursor - 1;
    const targetTime = this.frames[Math.max(0, targetCursor - 1)]?.observedAt ?? this.status().from;
    this.rebuildTo(targetCursor);
    this.position = targetTime;
    this.emit();
    return true;
  }

  /** Move the playhead to a timestamp, rebuilding the picture at that moment. */
  jumpTo(timestamp: number): void {
    const clamped = Math.min(Math.max(timestamp, this.status().from), this.status().to);
    // Binary search for the first frame after the target.
    let low = 0;
    let high = this.frames.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.frames[mid].observedAt <= clamped) low = mid + 1;
      else high = mid;
    }
    this.rebuildTo(low);
    this.position = clamped;
    this.state = this.cursor >= this.frames.length ? "ended" : "paused";
    this.emit();
  }

  /** Alias used by timeline scrubbers. */
  seekTo(timestamp: number): void {
    this.jumpTo(timestamp);
  }

  private applyUntil(target: number): number {
    let applied = 0;
    while (this.cursor < this.frames.length && this.frames[this.cursor].observedAt <= target) {
      this.sink.applyPatch(this.frames[this.cursor].vessel);
      this.cursor += 1;
      applied += 1;
    }
    return applied;
  }

  /** Clear the sink and reapply frames `[0, cursor)`. */
  private rebuildTo(cursor: number): void {
    this.sink.clear?.();
    for (let i = 0; i < cursor; i++) this.sink.applyPatch(this.frames[i].vessel);
    this.cursor = cursor;
  }

  private emit(): void {
    this.onChange?.(this.status());
  }
}
