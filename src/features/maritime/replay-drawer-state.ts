/**
 * What the vessel drawer must say while a recording is playing.
 *
 * The timeline bar already labels the window SESSION REPLAY, but the
 * drawer is the surface an officer reads a coordinate off, and it knew
 * nothing about replay at all. Measured during playback: the drawer
 * showed `POSITION 3.1692°, 7.2948°` with a `Fresh · 25s` chip beside
 * it, while the playhead sat at 15:39 and the frame it was showing was
 * historical. Two false claims in one panel — that the coordinate is
 * where the vessel is now, and that the reading is current.
 *
 * Neither was a rendering bug. The drawer was telling the truth about
 * the data it had; nobody had told it the data was a replay. So this is
 * the thing nobody told it.
 *
 * ## Why the freshness chip is replaced rather than recoloured
 *
 * Freshness answers "how much is this position still worth", and during
 * replay the question does not apply: the frame is exactly as old as the
 * playhead says, by construction. A stale-coloured chip would still be
 * asserting a live measurement. The replay timestamp answers the
 * question the officer actually has — *when* am I looking at.
 */
import type { DisplayOwner } from "./replay-ownership";

export interface ReplayDrawerContext {
  readonly owner: DisplayOwner;
  /** Where the playhead stands, ISO. Shown, never recomputed. */
  readonly playheadIso: string;
}

export interface ReplayDrawerNotice {
  /** Short label for the chip that replaces freshness. */
  readonly chipLabel: string;
  /** The banner heading. */
  readonly heading: string;
  /** One sentence naming what is being replayed, and from where. */
  readonly explanation: string;
  /** The playhead, formatted for reading rather than for parsing. */
  readonly timestampLabel: string;
}

/**
 * Format the playhead for an officer.
 *
 * Minute precision and an explicit Z. Seconds would imply the recording
 * is sampled far more finely than it is, and a bare time with no zone is
 * the kind of ambiguity that costs an hour of an investigation.
 */
export function formatPlayhead(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "Replay position not established";
  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")}Z`;
}

/**
 * What to show, or nothing at all when the picture is live.
 *
 * Returns null for LIVE deliberately: a drawer that carried a dormant
 * replay banner would train officers to ignore it, which is worse than
 * not having one.
 */
export function replayDrawerNotice(
  context: ReplayDrawerContext | null | undefined,
): ReplayDrawerNotice | null {
  if (!context || context.owner === "LIVE") return null;

  const paused = context.owner === "PAUSED_REPLAY";
  return {
    chipLabel: paused ? "SESSION REPLAY · PAUSED" : "SESSION REPLAY",
    heading: "SESSION REPLAY",
    /*
     * Named as this session's own observations. Calling it AIS history
     * would claim a provider archive that is not connected, and the
     * distinction matters most exactly here — beside a coordinate an
     * officer might act on.
     */
    explanation: "Replaying observations collected during this Maritime Command session.",
    timestampLabel: formatPlayhead(context.playheadIso),
  };
}
