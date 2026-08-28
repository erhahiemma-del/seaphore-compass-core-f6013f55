/**
 * Who owns the position on screen.
 *
 * Replay and the live feed write to the same update engine, which is what
 * guarantees a replayed frame looks exactly like the live frame did — one
 * engine, one renderer, no parallel fleet. The cost of that design is that
 * both writers are equally entitled to the same vessel, and the live feed
 * writes far more often. Measured during playback, the playhead sat at
 * 12:46:43 while the vessel the engine held carried a 12:48:39 timestamp:
 * every replayed frame was overwritten within a poll cycle, so the map
 * showed the present while the transport reported the past.
 *
 * That is not fixed by giving replay its own store — that would recreate
 * the divergence the single engine exists to prevent. It is fixed by
 * saying, explicitly and in one place, which writer owns the display.
 *
 * ## Collection continues; presentation does not
 *
 * While replay owns the display the live source keeps polling and keeps
 * recording. Nothing is discarded and no gap appears in the recording — an
 * officer who replays two minutes does not lose those two minutes of
 * observation. Only the write to the displayed picture is withheld, and it
 * is applied on release, so leaving replay restores the present rather
 * than stranding the vessel at a historical coordinate.
 *
 * The reverse is equally important: historical values are never written
 * back into the live source. Replay reads the recording; it does not
 * rewrite what the provider reported.
 */
import type { ReplayStatus } from "@/services/geospatial";

/**
 * The three presentation states, kept distinct on purpose.
 *
 * A paused replay is not live — the vessel must stay where the playhead
 * left it — and calling it live would be the single most misleading label
 * this surface could carry.
 */
export type DisplayOwner = "LIVE" | "SESSION_REPLAY" | "PAUSED_REPLAY";

/**
 * Read the owner from the player's own state.
 *
 * `idle` and `ended` return to LIVE deliberately. A player that has been
 * built but never started, or one that has run to the end of the
 * recording, has no claim on the picture; holding the display at the last
 * historical frame after playback finishes would strand the vessel in the
 * past with nothing on screen explaining why.
 */
export function displayOwner(status: ReplayStatus | null): DisplayOwner {
  if (!status) return "LIVE";
  if (status.state === "playing") return "SESSION_REPLAY";
  if (status.state === "paused") return "PAUSED_REPLAY";
  return "LIVE";
}

/** Whether the live feed must withhold its writes to the displayed picture. */
export function replayOwnsDisplay(owner: DisplayOwner): boolean {
  return owner !== "LIVE";
}

/**
 * What the officer is told, verbatim.
 *
 * "SESSION REPLAY" rather than "AIS SOURCE HISTORY", because this is a
 * recording of what this browser session observed, not an archive
 * retrieved from a provider. No historical provider is connected, and
 * naming one would be an invention.
 */
export const DISPLAY_OWNER_LABEL: Readonly<Record<DisplayOwner, string>> = {
  LIVE: "LIVE",
  SESSION_REPLAY: "SESSION REPLAY",
  PAUSED_REPLAY: "SESSION REPLAY · PAUSED",
};

export const SESSION_REPLAY_EXPLANATION =
  "Replaying observations collected during this Maritime Command session.";
