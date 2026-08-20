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
 */
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPLAY_SPEEDS, type ReplaySpeed, type ReplayStatus } from "@/services/geospatial";

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
  onPlay,
  onPause,
  onStep,
  onRestart,
  onSpeed,
  onScrub,
  className,
}: TimelineBarProps) {
  const playing = status?.state === "playing";

  return (
    <footer
      aria-label="Timeline and replay"
      data-testid="timeline-bar"
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
          disabled={!status}
          onClick={onRestart}
        >
          <SkipBack className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Step back"
          disabled={!status}
          onClick={() => onStep?.(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={playing ? "Pause replay" : "Play replay"}
          disabled={!status}
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
          disabled={!status}
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
            disabled={!status}
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
          // Never an empty track: an empty scrubber reads as a period with
          // no activity, which is the opposite of what is true.
          <span className="truncate text-[11px] text-amber-700">
            {unavailableReason ??
              "No recording loaded. Historical AIS is not connected, so no period can be replayed."}
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
