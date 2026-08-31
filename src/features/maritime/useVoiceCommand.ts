/**
 * Spoken commands, from the microphone to the camera.
 *
 * Capture and transcription already existed for Copilot dictation, so
 * this adds no second speech engine — it borrows `useVoiceDictation` and
 * supplies the two things a map command needs that dictation does not:
 * an end-of-utterance that tolerates the way people actually talk, and
 * an interpretation that ends in a navigation.
 *
 * ## Ending on silence, not on a pause
 *
 * Dictation ends when the officer presses stop, which is right for a
 * paragraph and wrong for a command: nobody wants to press twice to say
 * two words. But a recogniser that ends at the first gap cuts "take
 * me to…" — pause — "…Tin Can Island" in half and acts on the first
 * fragment. So the utterance ends after a sustained silence, long enough
 * that thinking mid-sentence is not treated as finishing, and the officer
 * can still end it deliberately at any moment.
 *
 * ## It never guesses the camera
 *
 * Every outcome that moves the map goes through `navigateTo`. Voice was
 * always going to be the fifth caller tempted to fly the camera itself,
 * which is exactly why the navigation layer was built before it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useVoiceDictation, type DictationIssue } from "@/hooks/use-voice-dictation";
import { navigateTo } from "@/services/geospatial/navigation";
import { MAP_SCOPES } from "@/services/geospatial/constants";
import { sgs, type SharedGeospatialService, type Vessel } from "@/services/geospatial";
import { eezRingIfLoaded } from "@/services/geospatial/eez-ring";
import type { Place } from "@/services/geospatial/places";

import { requestVesselScreening } from "@/lib/sanctions/screen-request";
import { executeCopilotAction, type CopilotAction } from "@/services/copilot/copilot-actions";
import {
  EMPTY_CONTEXT,
  type ConversationContext,
  type ResolvableVessel,
} from "@/services/copilot/copilot-conversation";
import { planTurn } from "@/services/copilot/copilot-turn";
import { useVoiceOutputService } from "@/services/voice/use-voice-output";

import { type VoiceIntent, type VoiceReading } from "./voice-intent";
import { devTranscriptsFrom } from "./voice-dev-harness";

export interface VoiceCommandOptions {
  /** Vessels currently held, for naming and identifier resolution. */
  readonly vessels?: readonly ResolvableVessel[];
  /** The full fleet, for assessments that read every vessel. */
  readonly fleet?: readonly Vessel[];
  /** How to open a case, when the surface has a workflow. */
  readonly openInvestigation?: (imo: string) => void;
  /** Replay controls owned by the map surface. */
  readonly replay?: ActionExecutionOptions["replay"];
  /** How to compile a briefing, when the surface has one. */
  readonly generateBrief?: ActionExecutionOptions["generateBrief"];
  /** How to open a comparison, when the surface has one. */
  readonly compareEntities?: ActionExecutionOptions["compareEntities"];
}

/**
 * What the officer is looking at.
 *
 * `understood` is a state and not a transient toast because a command
 * that moved the map needs to say what it did — an officer who was
 * looking at the chart rather than the button must be able to find out
 * why the view changed.
 */
export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "understood"
  | "clarifying"
  /** A write has been proposed and is waiting for a plain yes or no. */
  | "confirming"
  /** The action is running. Shown only while something is genuinely in flight. */
  | "executing"
  /** Speaking the result. Interruptible. */
  | "speaking"
  | "completed"
  | "failed";

/** Sustained silence that ends an utterance. Long enough to think in. */
const SILENCE_MS = 1600;
/** Peak amplitude that counts as speech rather than room noise. */
const SPEECH_LEVEL = 0.04;
/** How long a completed command stays on screen before the affordance rests. */
const SETTLE_MS = 3200;

export interface VoiceCommand {
  readonly state: VoiceState;
  /** Non-null once the microphone can never work here. */
  readonly unavailable: DictationIssue | null;
  /** The most recent failure, with a remedy the officer can act on. */
  readonly issue: DictationIssue | null;
  /** Live input level, for the listening indicator. */
  readonly level: number;
  /** What was heard and what it was taken to mean. */
  readonly reading: VoiceReading | null;
  /** Places to choose between, when the command was ambiguous. */
  readonly candidates: readonly Place[];
  /** The sentence Seaphore last said, shown alongside being spoken. */
  readonly spoken: string | null;
  /** Stop speech immediately. The barge-in control. */
  readonly stopSpeaking: () => void;
  readonly start: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
  readonly toggle: () => void;
  /** Resolve a clarification by choosing one of the candidates. */
  readonly choose: (place: Place) => void;
  readonly dismiss: () => void;
}

export function useVoiceCommand(
  service: SharedGeospatialService = sgs,
  options: VoiceCommandOptions = {},
): VoiceCommand {
  const [state, setState] = useState<VoiceState>("idle");
  const [reading, setReading] = useState<VoiceReading | null>(null);
  const [candidates, setCandidates] = useState<readonly Place[]>([]);
  const [spoken, setSpoken] = useState<string | null>(null);

  /*
   * The conversation lives in a ref, not in state.
   *
   * It is read inside the transcript handler and must be the value as of
   * that moment; a state variable captured in a callback would resolve
   * "it" against whatever the conversation looked like when the handler
   * was created, which is one turn stale exactly when it matters.
   */
  const conversation = useRef<ConversationContext>(EMPTY_CONTEXT);
  /** The dev harness runs once per page load, never per fleet update. */
  const harnessRan = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voice = useVoiceOutputService();

  const restAfter = useCallback((next: VoiceState) => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setState("idle"), next === "completed" ? SETTLE_MS : 6000);
  }, []);

  /**
   * Say it, and show it.
   *
   * One response, two renderings. Separate text and speech paths would
   * eventually disagree, and the officer would have no way to tell which
   * one the system actually acted on.
   */
  const respond = useCallback(
    (speech: string, next: VoiceState) => {
      setSpoken(speech);
      voice.speak(speech);

      /*
       * `speaking` has to outlast the call that starts it.
       *
       * Setting it and then immediately setting the next state put both
       * in one React batch, so the speaking state was never rendered —
       * measured: a state trace across a five-turn conversation showed
       * idle, completed, confirming, completed, idle, and no speaking at
       * all. The officer could not see they were being talked to, and
       * the Stop control never appeared.
       *
       * So the state follows the utterance: speaking while the service
       * says it is speaking, and the resting state once it finishes. If
       * synthesis is unavailable there is nothing to wait for and the
       * response settles immediately.
       */
      if (voice.state() === "unavailable") {
        setState(next);
        restAfter(next);
        return;
      }

      /*
       * Subscribe before deciding, because `onstart` is asynchronous:
       * reading `state()` on the line after `speak()` returns "idle" for
       * an utterance that is about to begin, which made the speaking
       * state appear for some responses and not others. Waiting for the
       * service to say it has finished is the only reading that is true
       * in both cases.
       */
      setState("speaking");
      let started = false;
      const unsubscribe = voice.onChange(() => {
        if (voice.state() === "speaking") {
          started = true;
          return;
        }
        if (!started) return;
        unsubscribe();
        setState((current) => (current === "speaking" ? next : current));
        restAfter(next);
      });

      /*
       * A backstop, so a browser that never fires `onstart` — muted tab,
       * blocked autoplay — cannot leave the affordance claiming to speak
       * forever.
       */
      setTimeout(() => {
        if (started) return;
        unsubscribe();
        setState((current) => (current === "speaking" ? next : current));
        restAfter(next);
      }, 1200);
    },
    [voice, restAfter],
  );

  const handleTranscript = useCallback(
    (text: string) => {
      setState("processing");

      /*
       * Every route in — microphone, transcription endpoint, dev harness
       * — arrives here. There is no second path from speech to system
       * state, which is the only reason a harness-driven verification
       * says anything about the real product.
       */
      const selection = service.get().selection;
      const plan = planTurn({
        transcript: text,
        context: conversation.current,
        vessels: options.vessels ?? [],
        selectedImo: selection?.kind === "vessel" ? selection.imo : null,
      });
      conversation.current = plan.context;
      setReading({ heard: text, intent: { kind: "unrecognised", reason: "" } });
      setCandidates([]);

      switch (plan.outcome.kind) {
        case "CLARIFY":
          respond(plan.outcome.speech, "clarifying");
          return;
        case "CONFIRM":
          // The write has not happened and must not look as if it has.
          respond(plan.outcome.speech, "confirming");
          return;
        case "REPLY":
          respond(plan.outcome.speech, "completed");
          return;
        case "EXECUTE": {
          setState("executing");
          const result = executeCopilotAction(plan.outcome.action, {
            service,
            confirmed: true,
            knownImos: options.vessels?.map((v) => v.identity.imo),
            /*
             * The same fleet the map is drawing, so an approach
             * assessment cannot disagree with what the officer sees.
             */
            fleet: options.fleet,
            boundaryRing: eezRingIfLoaded() ?? undefined,
            openInvestigation: options.openInvestigation,
            /*
             * Replay, briefing and comparison are owned by the map
             * surface; the voice path only asks for them.
             */
            replay: options.replay,
            generateBrief: options.generateBrief,
            compareEntities: options.compareEntities,
            /*
             * Screening runs in the drawer panel that owns the canonical
             * call; the voice path only asks for it.
             */
            requestSanctionsScreening: requestVesselScreening,
          });
          /*
           * The spoken line reports what happened, not what was
           * attempted. A failed action that announces success is the
           * worst outcome available to a voice interface, because there
           * is no screen state contradicting it.
           */
          /*
           * The answer wins over the intent. "Assessing the fleet" is a
           * statement of having started, and an officer who asked a
           * question and hears only that has been left without one.
           */
          respond(
            result.ok ? (result.answer ?? plan.outcome.speech) : (result.reason ?? result.summary),
            result.ok ? "completed" : "failed",
          );
          return;
        }
      }
    },
    [
      service,
      options.vessels,
      options.fleet,
      options.openInvestigation,
      options.replay,
      options.generateBrief,
      options.compareEntities,
      respond,
    ],
  );

  /*
   * Held in a ref so the harness can call the current handler without
   * taking a dependency on its identity — the dependency that made the
   * scripted conversation restart on every vessel tick.
   */
  const handleTranscriptRef = useRef(handleTranscript);
  handleTranscriptRef.current = handleTranscript;

  const onFinal = handleTranscript;

  const onError = useCallback(() => {
    setState("failed");
    restAfter("failed");
  }, [restAfter]);

  const dictation = useVoiceDictation({ onFinal, onError, maxSeconds: 20 });

  // Mirror the engine's own state, which owns the transition from
  // recording into transcription.
  useEffect(() => {
    if (dictation.state === "recording") setState("listening");
    else if (dictation.state === "transcribing") setState("processing");
  }, [dictation.state]);

  /*
   * End the utterance on sustained silence.
   *
   * Tracked from the live input level: any peak above the speech floor
   * refreshes the clock, so a pause mid-sentence does not end the
   * command and a genuine finish does. Silence before the officer has
   * said anything at all never ends it — that is a mic being found, not
   * a command being completed.
   */
  const spokeAt = useRef<number | null>(null);
  useEffect(() => {
    if (dictation.state !== "recording") {
      spokeAt.current = null;
      return;
    }
    if (dictation.level >= SPEECH_LEVEL) spokeAt.current = Date.now();
  }, [dictation.level, dictation.state]);

  const stopRef = useRef(dictation.stop);
  stopRef.current = dictation.stop;
  useEffect(() => {
    if (dictation.state !== "recording") return;
    const timer = setInterval(() => {
      const last = spokeAt.current;
      if (last !== null && Date.now() - last >= SILENCE_MS) stopRef.current();
    }, 200);
    return () => clearInterval(timer);
  }, [dictation.state]);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const start = useCallback(() => {
    setReading(null);
    setCandidates([]);
    setState("listening");
    void dictation.start();
  }, [dictation]);

  const cancel = useCallback(() => {
    dictation.cancel();
    setState("idle");
    setReading(null);
    setCandidates([]);
  }, [dictation]);

  const toggle = useCallback(() => {
    if (state === "listening") dictation.stop();
    else if (state === "idle" || state === "understood" || state === "failed") start();
  }, [state, dictation, start]);

  const choose = useCallback(
    (place: Place) => {
      /*
       * The officer resolved the ambiguity, so this is now a plain
       * navigation and goes straight to the one dispatcher — the same
       * call a typed search or a spoken command lands on.
       */
      const moved = executeCopilotAction(
        { type: "NAVIGATE_PLACE", place: place.id },
        { service },
      ).ok;
      setCandidates([]);
      setReading((current) =>
        current ? { ...current, intent: { kind: "navigate", place, confidence: 1 } } : current,
      );
      setState(moved ? "understood" : "failed");
      restAfter(moved ? "understood" : "failed");
    },
    [service, restAfter],
  );

  const dismiss = useCallback(() => {
    setState("idle");
    setReading(null);
    setCandidates([]);
  }, []);

  /*
   * Barge-in. Speech stops the instant the officer starts a new
   * interaction, because finishing a stale sentence talks over the
   * question they are asking now. Routed through the service so there is
   * one thing that can be cancelled.
   */
  const stopSpeaking = useCallback(() => {
    voice.stop();
    setState((current) => (current === "speaking" ? "completed" : current));
  }, [voice]);

  /*
   * The development harness enters here and nowhere else — the same
   * handler the transcription endpoint calls, with the same conversation
   * and the same dispatcher behind it. Sequential rather than parallel,
   * so a clarification can be answered by the transcript after it.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    /*
     * A latch, because the effect's dependency is a callback that closes
     * over the fleet — and simulated vessels move, so the fleet changes
     * every tick. Without this the scripted conversation restarted on
     * every vessel update: measured, fifteen utterances from five
     * transcripts, cycling forever. The same reason `?select=` fires
     * once.
     */
    if (harnessRan.current) return;
    const scripted = devTranscriptsFrom(window.location.search);
    if (scripted.length === 0) return;
    harnessRan.current = true;

    /*
     * No cleanup, deliberately. React's development double-invoke runs
     * the effect, tears it down, and runs it again — so a cleanup that
     * cancelled the timers cancelled the only scheduled run, and the
     * latch then refused to schedule another. Measured: nothing spoke at
     * all. A one-shot script that outlives a remount is the correct
     * behaviour for a harness; it is gated out of production entirely.
     */
    let index = 0;
    const next = () => {
      if (index >= scripted.length) return;
      handleTranscriptRef.current(scripted[index]);
      index += 1;
      setTimeout(next, 1600);
    };
    setTimeout(next, 1500);
  }, []);

  return {
    state,
    unavailable: dictation.unavailable,
    issue: dictation.issue,
    level: dictation.level,
    reading,
    candidates,
    spoken,
    stopSpeaking,
    start,
    stop: dictation.stop,
    cancel,
    toggle,
    choose,
    dismiss,
  };
}
