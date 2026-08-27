/**
 * What the replay bar should be showing, and why.
 *
 * The bar used to render one thing: a full transport strip — restart,
 * step, play, step, four speeds, a scrubber — permanently greyed out,
 * with a sentence beside it explaining that there was nothing to replay.
 * Every control was honestly `disabled`, so nothing was lying exactly.
 * It was still the wrong surface: an officer reads a row of playback
 * buttons as a capability the system has and they have failed to reach,
 * and goes looking for the setting that turns it on. A control that
 * cannot act should not be drawn.
 *
 * So this decides between two shapes rather than one shape in two
 * moods: either the controls are live, or they are gone and replaced by
 * a sentence saying what would make them appear.
 *
 * ## It derives, it does not decide
 *
 * Everything here is computed from state the application already owns —
 * the selection, the feed's own availability, and the player's status.
 * There is no second replay engine and no new source of truth; this is a
 * pure function from canonical inputs to what the officer sees, which is
 * also what makes it testable without mounting anything.
 *
 * ## Why a recording still plays with nothing selected
 *
 * The existing replay records the whole operational picture as it
 * arrives, so it can replay a period without any vessel being chosen.
 * That is genuinely useful and predates the per-vessel model, so
 * playability wins over selection: the bar only asks the officer to pick
 * a vessel when there is nothing it could play anyway. Asking for a
 * selection while holding a playable recording would be inventing a
 * requirement to make a state machine tidier.
 */
import type { ReplayAvailability } from "./useReplayTimeline";
import type { MapSelection } from "@/services/geospatial/selection";
import type { ReplayStatus } from "@/services/geospatial";

/**
 * Where the replay surface currently stands.
 *
 * The four terminal-ish states at the end are the ones where controls
 * are live; everything before them is a reason there is nothing to
 * drive.
 */
export type ReplayPresentationState =
  | "NO_VESSEL_SELECTED"
  | "VESSEL_SELECTED_NO_HISTORY"
  | "REPLAY_LOADING"
  | "REPLAY_ERROR"
  /** The source keeps an archive for this vessel. */
  | "HISTORY_AVAILABLE"
  | "REPLAY_READY"
  | "REPLAY_PLAYING"
  | "REPLAY_PAUSED";

/** An action offered beside an explanation, when one would help. */
export type ReplayOfferedAction = "view-vessel" | "view-position" | "open-intelligence";

export interface ReplayPresentation {
  readonly state: ReplayPresentationState;
  /**
   * Whether the transport controls should be rendered at all.
   *
   * Not "whether they are enabled". A control that cannot act is not
   * drawn, because a row of greyed-out playback buttons reads as a
   * capability the officer has failed to reach.
   */
  readonly controlsLive: boolean;
  /** One sentence, shown when the controls are absent. */
  readonly message: string;
  /** Offered beside the message. Empty when nothing would help. */
  readonly actions: readonly ReplayOfferedAction[];
}

export interface ReplayPresentationInput {
  /** What the officer currently has open. Null when nothing is selected. */
  readonly selection: MapSelection | null;
  /** The feed's own account of whether a period can be replayed. */
  readonly availability: ReplayAvailability;
  /** The player, when one has been built. Null when there is nothing to play. */
  readonly status: ReplayStatus | null;
  /** Officer-facing sentence the timeline layer already derives. */
  readonly unavailableReason: string;
  /**
   * Whether the selected vessel's archive is currently being fetched.
   *
   * Separate from the feed's `LOADING`, which is about the live vessel
   * source rather than one vessel's history.
   */
  readonly historyLoading?: boolean;
  /**
   * Whether the active source can answer questions about the past.
   *
   * Read from `hasHistory(source)` rather than inferred from a selection
   * existing. Without it this layer declared an absence it had never
   * checked.
   */
  readonly sourceSupportsHistory?: boolean;
}

/** Whether the selection is a vessel, which is the only kind with a track. */
function vesselSelected(selection: MapSelection | null): boolean {
  return selection?.kind === "vessel";
}

export function replayPresentation(input: ReplayPresentationInput): ReplayPresentation {
  const {
    selection,
    availability,
    status,
    unavailableReason,
    historyLoading,
    sourceSupportsHistory,
  } = input;

  /*
   * A playable recording outranks everything else.
   *
   * The player only exists when frames exist, so its presence is proof
   * there is something to drive. Checking it first is what stops the bar
   * demanding a vessel selection while holding a recording it could play
   * right now.
   */
  if (status) {
    const state: ReplayPresentationState =
      status.state === "playing"
        ? "REPLAY_PLAYING"
        : status.state === "paused"
          ? "REPLAY_PAUSED"
          : status.state === "ended"
            ? "REPLAY_READY"
            : "HISTORY_AVAILABLE";
    return { state, controlsLive: true, message: "", actions: [] };
  }

  if (historyLoading || availability === "LOADING") {
    // Not a failure and not an empty state — say so rather than showing
    // an explanation the next second will contradict.
    return {
      state: "REPLAY_LOADING",
      controlsLive: false,
      message: "Loading movement history.",
      actions: [],
    };
  }

  if (availability === "SOURCE_UNAVAILABLE") {
    /*
     * A connected source that is failing is a different situation from a
     * source that holds nothing, and the officer can act on it — it may
     * recover, and it means the live picture is suspect too.
     */
    return {
      state: "REPLAY_ERROR",
      controlsLive: false,
      message: unavailableReason,
      actions: [],
    };
  }

  if (vesselSelected(selection)) {
    /*
     * Ask the source before declaring an absence.
     *
     * This branch used to be reached for every selected vessel, so a
     * source that implements `history()` and holds a full track still
     * produced "historical movement data is not currently available".
     * A capability nobody consulted is a capability the officer does not
     * have: the feature worked and the interface said it did not, which
     * is worse than the feature being missing, because there is nothing
     * to investigate.
     *
     * Capability and data are still two questions. A source may keep an
     * archive and hold nothing for this hull, and the officer needs to
     * tell "this source does not do history" from "this vessel has no
     * recorded movement".
     */
    if (sourceSupportsHistory) {
      return {
        state: "HISTORY_AVAILABLE",
        controlsLive: false,
        message: "Movement history is available for this vessel from the connected source.",
        actions: ["view-position", "open-intelligence"],
      };
    }
    return {
      state: "VESSEL_SELECTED_NO_HISTORY",
      controlsLive: false,
      message: "The connected source does not hold movement history for this vessel.",
      /*
       * What is still worth doing. The vessel's present position and its
       * intelligence are both reachable and both useful — an officer who
       * cannot replay a track can still see where the ship is now and
       * what is known about it.
       */
      actions: ["view-position", "open-intelligence"],
    };
  }

  return {
    state: "NO_VESSEL_SELECTED",
    controlsLive: false,
    message: "Select a vessel to inspect movement history.",
    actions: [],
  };
}

/** Officer-facing label for an offered action. */
export const REPLAY_ACTION_LABELS: Readonly<Record<ReplayOfferedAction, string>> = {
  "view-vessel": "View vessel details",
  "view-position": "View current position",
  "open-intelligence": "Open vessel intelligence",
};
