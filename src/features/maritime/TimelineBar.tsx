/**
 * Timeline and replay controls.
 *
 * UI over the existing `ReplayPlayer`. It owns no playback logic — the
 * player advances on `tick`, the host drives the cadence, and this bar
 * only renders status and sends commands.
 *
 * ## Playhead is not the window
 *
 * `timelinePosition` is where the officer is standing in time.
 * A historical *window* is what to query. The state layer keeps them
 * apart and so does this bar: the scrubber moves the playhead, and the
 * window label beside it is read-only here.
 *
 * ## Absence of history is stated, not drawn as calm water
 *
 * With no historical provider connected there is nothing to replay. The
 * bar says so rather than rendering an empty track that reads as a quiet
 * period.
 *
 * ## A control that cannot act is not drawn
 *
 * This used to render the full transport strip — restart, step, play,
 * step, four speeds, a scrubber — permanently greyed out, with the
 * explanation beside it. Every button was honestly `disabled`, so
 * nothing was lying exactly. It was still the wrong surface: a row of
 * playback controls reads as a capability the system has and the officer
 * has failed to reach, and they go looking for the setting that turns it
 * on. There is no such setting.
 *
 * So the bar is now one of two shapes rather than one shape in two
 * moods. Either the controls are live, or they are gone and a sentence
 * says what would bring them back. Which shape is chosen is decided by
 * `replayPresentation`, from state the application already owns.
 */
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPLAY_SPEEDS, type ReplaySpeed, type ReplayStatus } from "@/services/geospatial";
import { SESSION_REPLAY_EXPLANATION } from "./replay-ownership";
import {
  REPLAY_ACTION_LABELS,
  type ReplayOfferedAction,
  type ReplayPresentation,
} from "./replay-presentation";

export interface TimelineBarProps {
  /** Null when no recording is loaded. */
  readonly status: ReplayStatus | null;
  /** Officer-facing description of the query window, e.g. "last 24 hours". */
  readonly windowLabel: string;
  /**
   * Why no recording exists, when none does. Required whenever `status`
   * is null so the bar can never be silently empty.
   */
  readonly unavailableReason?: string;
  /**
   * Which of the two shapes to draw, and the copy for the quiet one.
   *
   * Optional so existing callers and stories keep working; absent means
   * "draw the controls", which is what this component did before the
   * distinction existed.
   */
  readonly presentation?: ReplayPresentation;
  /** Invoked when the officer takes one of the offered actions. */
  readonly onAction?: (action: ReplayOfferedAction) => void;
  readonly onPlay?: () => void;
  readonly onPause?: () => void;
  readonly onStep?: (direction: 1 | -1) => void;
  readonly onRestart?: () => void;
  readonly onSpeed?: (speed: ReplaySpeed) => void;
  readonly onScrub?: (position: number) => void;
  readonly className?: string;
}

export function TimelineBar({
  status,
  windowLabel,
  unavailableReason,
  presentation,
  onPlay,
  onPause,
  onStep,
  onRestart,
  onSpeed,
  onScrub,
  onAction,
  className,
}: TimelineBarProps) {
  const playing = status?.state === "playing";

  /*
   * The transport is never disabled on `status`.
   *
   * It used to be, and that was the second half of the deadlock that made
   * replay unreachable: the player is built lazily by the first command,
   * so `status` is null until something presses Play — and every control
   * that could press Play was disabled until `status` existed. Nothing
   * could ever start. `controlsLive` is the honest gate and it is checked
   * above; by the time this strip renders there is a recording to drive.
   */

  /*
   * Nothing to drive: say what would help, and draw no controls.
   *
   * The whole point of the rewrite. An officer must be able to tell "this
   * system cannot do that right now" from "this system can do that and
   * you have not found the switch", and a greyed-out transport strip
   * says the second when the truth is the first.
   */
  if (presentation && !presentation.controlsLive) {
    return (
      <footer
        aria-label="Timeline and replay"
        data-testid="timeline-bar"
        data-replay-state={presentation.state}
        className={cn(
          "flex shrink-0 items-center gap-3 border-t border-border bg-background px-3 py-2",
          className,
        )}
      >
        <span
          data-testid="replay-explanation"
          className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground"
        >
          {presentation.message}
        </span>

        {presentation.actions.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {presentation.actions.map((action) => (
              <Button
                key={action}
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10.5px]"
                onClick={() => onAction?.(action)}
              >
                {REPLAY_ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        ) : null}

        <span
          className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground"
          title="The period queried, which is distinct from the replay playhead."
        >
          Window · {windowLabel}
        </span>
      </footer>
    );
  }

  return (
    <footer
      aria-label="Timeline and replay"
      data-testid="timeline-bar"
      data-replay-state={presentation?.state ?? "HISTORY_AVAILABLE"}
      className={cn(
        "flex shrink-0 items-center gap-3 border-t border-border bg-background px-3 py-1.5",
        className,
      )}
    >
      <div role="group" aria-label="Replay controls" className="flex items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Restart replay"
          onClick={onRestart}
        >
          <SkipBack className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Step back"
          onClick={() => onStep?.(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => (playing ? onPause?.() : onPlay?.())}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Step forward"
          onClick={() => onStep?.(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <div role="group" aria-label="Replay speed" className="flex items-center gap-0.5">
        {REPLAY_SPEEDS.map((speed) => (
          <Button
            key={speed}
            size="sm"
            variant={status?.speed === speed ? "default" : "ghost"}
            className="h-6 px-1.5 text-[10px]"
            aria-label={`${speed} times speed`}
            aria-pressed={status?.speed === speed}
            onClick={() => onSpeed?.(speed)}
          >
            {speed}×
          </Button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {status ? (
          <>
            <input
              type="range"
              aria-label="Replay position"
              className="h-1 min-w-0 flex-1 accent-[color:var(--color-teal)]"
              min={status.from}
              max={status.to}
              value={status.position}
              onChange={(event) => onScrub?.(Number(event.target.value))}
            />
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
              {new Date(status.position).toISOString().slice(0, 16).replace("T", " ")}Z
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {status.cursor}/{status.total}
            </span>
          </>
        ) : (
          /*
            Never an empty track: an empty scrubber reads as a period with
            no activity, which is the opposite of what is true.

            The scrubber itself does need a player — it has no range to
            draw without one — so this stands in until playback starts.
            It says what the recording is rather than denying one exists,
            because at this point the controls beside it are live.
          */
          <span className="truncate text-[11px] text-muted-foreground">
            {unavailableReason || SESSION_REPLAY_EXPLANATION}
          </span>
        )}
      </div>

      <span
        className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground"
        title="The period queried, which is distinct from the replay playhead."
      >
        Window · {windowLabel}
      </span>
    </footer>
  );
}
