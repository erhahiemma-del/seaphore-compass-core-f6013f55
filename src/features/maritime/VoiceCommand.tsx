/**
 * The officer-facing half of voice command.
 *
 * A capability with no affordance is not a feature — it is code. This is
 * the button an officer presses, the state they read while speaking, and
 * the answer they get back, all on the map rather than behind a menu.
 *
 * ## It always says what it heard
 *
 * Every outcome shows the transcript, including the successful ones. An
 * officer shown only "Going to Onne" cannot tell a clean recognition from
 * a lucky one, and when it eventually goes wrong they have no way to
 * learn what phrasing works. Showing the words costs a line and turns a
 * black box into an instrument.
 *
 * ## An unavailable microphone explains itself
 *
 * A dead button is the worst possible answer to "why is nothing
 * happening". Where the microphone cannot work — an insecure origin, a
 * blocked permission, no device — the control says which, and what to do
 * about it.
 */
import { Loader2, Mic, MicOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { sgs, type SharedGeospatialService } from "@/services/geospatial";

import { describeIntent } from "./voice-intent";
import { useVoiceCommand } from "./useVoiceCommand";
import { MAP_ZONE } from "./map-zones";

export function VoiceCommand({
  service = sgs,
  className,
}: {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
}) {
  const voice = useVoiceCommand(service);
  const { state, reading, candidates, unavailable, issue } = voice;

  const listening = state === "listening";
  const busy = state === "processing";
  /*
   * A permission the browser has already refused blocks this as surely
   * as a missing device. The dictation engine reports the two
   * separately — one is "never here", the other "not right now" — and
   * the officer needs the same answer from the control either way:
   * pressing it will not work, and here is what to change.
   */
  const barrier = unavailable ?? (issue?.blocking ? issue : null);
  const blocked = barrier !== null;

  /*
   * Only render the card when it has something to say.
   *
   * It rendered whenever an issue existed, and the engine raises a
   * permission issue on mount — so a denied microphone drew an empty
   * box above the button containing nothing but its own dismiss
   * control. The barrier belongs on the button, which is where an
   * officer looks to find out whether pressing it is worth trying.
   */
  const showReadout = reading !== null || (issue !== null && state === "failed");

  // A ring that follows the officer's voice, so "it is hearing me" needs
  // no words. Clamped: a loud room should not fill the screen.
  const ring = listening ? 1 + Math.min(voice.level * 4, 0.6) : 1;

  return (
    <div
      data-testid="voice-command"
      data-voice-state={state}
      className={cn(MAP_ZONE.VOICE, "flex flex-col items-center gap-2", className)}
    >
      {/* What was heard, what it meant, and anything to choose between. */}
      {showReadout ? (
        <div
          data-testid="voice-readout"
          className="pointer-events-auto relative max-w-sm rounded-md border border-border/60 bg-background/95 px-3 py-2 text-center shadow-lg backdrop-blur-sm"
        >
          {reading ? (
            <>
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Heard</p>
              <p data-testid="voice-heard" className="text-[12px] font-medium text-foreground">
                “{reading.heard}”
              </p>
              <p
                data-testid="voice-meaning"
                className={cn(
                  "mt-0.5 text-[11px]",
                  state === "failed" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {state === "understood" ? "Went to " : ""}
                {describeIntent(reading.intent)}
              </p>
            </>
          ) : null}

          {candidates.length > 0 ? (
            <div
              data-testid="voice-candidates"
              className="mt-1.5 flex flex-wrap justify-center gap-1"
            >
              {candidates.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => voice.choose(place)}
                  className="rounded bg-[color:var(--color-blue)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-blue)] hover:bg-[color:var(--color-blue)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]"
                >
                  {place.name}
                </button>
              ))}
            </div>
          ) : null}

          {/* The engine's own failures carry a remedy; show it. */}
          {issue && state === "failed" ? (
            <p data-testid="voice-issue" className="mt-1 text-[11px] text-muted-foreground">
              {issue.hint}
            </p>
          ) : null}

          <button
            type="button"
            aria-label="Dismiss"
            onClick={voice.dismiss}
            className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="voice-button"
        disabled={blocked}
        onClick={voice.toggle}
        aria-pressed={listening}
        aria-label={
          barrier
            ? `Voice command unavailable — ${barrier.title}`
            : listening
              ? "Stop listening"
              : "Speak a command"
        }
        title={
          barrier
            ? `${barrier.title}. ${barrier.hint}`
            : "Speak a command — a place, a coordinate, or the global view"
        }
        className={cn(
          /*
           * 36px on screen, not 44 — this application's root font is
           * 13px, so `h-11` resolves to 35.75. That is deliberate here:
           * it makes the control exactly the width of the control rail
           * beside it, which is the size every other primary map control
           * on this surface already is.
           *
           * `shrink-0` because the wrapper is shrink-to-fit around the
           * state label beneath, and a label narrower than the button
           * would otherwise let flex take the difference out of the
           * control.
           */
          "pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-lg transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]",
          listening
            ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)] text-white"
            : "border-border/60 bg-background/95 text-foreground hover:border-[color:var(--color-blue)] hover:text-[color:var(--color-blue)]",
          blocked && "cursor-not-allowed opacity-50",
        )}
        style={listening ? { transform: `scale(${ring})` } : undefined}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : blocked ? (
          <MicOff className="h-5 w-5" aria-hidden />
        ) : (
          <Mic className="h-5 w-5" aria-hidden />
        )}
      </button>

      {/* One word of state, under the button, where it does not cover the map. */}
      <span
        data-testid="voice-state-label"
        className="rounded bg-background/80 px-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground backdrop-blur-sm"
      >
        {/*
          "Try again" rather than a second failure word.
          The control is the retry, so the label says what pressing it
          will do — an officer reading "Failed" has been told the
          outcome and not the way out of it.
        */}
        {blocked
          ? "Unavailable"
          : listening
            ? "Listening"
            : busy
              ? "Working"
              : state === "clarifying"
                ? "Which one?"
                : state === "failed"
                  ? "Try again"
                  : "Speak"}
      </span>
    </div>
  );
}
