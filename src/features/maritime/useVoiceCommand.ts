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
import { sgs, type SharedGeospatialService } from "@/services/geospatial";
import type { Place } from "@/services/geospatial/places";

import { interpret, type VoiceIntent, type VoiceReading } from "./voice-intent";

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
  readonly start: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
  readonly toggle: () => void;
  /** Resolve a clarification by choosing one of the candidates. */
  readonly choose: (place: Place) => void;
  readonly dismiss: () => void;
}

/**
 * Carry out an interpreted command.
 *
 * Exported because it is the whole behavioural claim of this feature and
 * deserves testing without a microphone in the room.
 */
export function executeIntent(
  intent: VoiceIntent,
  service: SharedGeospatialService = sgs,
): boolean {
  switch (intent.kind) {
    case "navigate":
      return navigateTo({ place: intent.place.id, source: "voice" }, service).ok;
    case "coordinates":
      return navigateTo(
        { coordinates: intent.coordinates, zoom: 12, level: "LOCAL", source: "voice" },
        service,
      ).ok;
    case "global":
      return navigateTo({ place: "world", source: "voice" }, service).ok;
    case "zoom": {
      /*
       * Zoom is a navigation to where the officer already is.
       *
       * Reaching for `setCamera` here would be the fifth camera caller,
       * and the limits would have to be re-derived at the call site.
       */
      const state = service.get();
      const limits = MAP_SCOPES[state.scope];
      const target =
        intent.direction === "in"
          ? Math.min(limits.maxZoom, state.zoom + 2)
          : Math.max(limits.minZoom, state.zoom - 2);
      return navigateTo({ coordinates: state.center, zoom: target, source: "voice" }, service).ok;
    }
    case "clarify":
    case "unrecognised":
      return false;
  }
}

export function useVoiceCommand(service: SharedGeospatialService = sgs): VoiceCommand {
  const [state, setState] = useState<VoiceState>("idle");
  const [reading, setReading] = useState<VoiceReading | null>(null);
  const [candidates, setCandidates] = useState<readonly Place[]>([]);

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const restAfter = useCallback((next: VoiceState) => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setState("idle"), next === "understood" ? SETTLE_MS : 6000);
  }, []);

  const onFinal = useCallback(
    (text: string) => {
      const next = interpret(text);
      setReading(next);

      if (next.intent.kind === "clarify") {
        setCandidates(next.intent.candidates);
        setState("clarifying");
        return;
      }
      setCandidates([]);

      if (next.intent.kind === "unrecognised") {
        setState("failed");
        restAfter("failed");
        return;
      }

      const moved = executeIntent(next.intent, service);
      setState(moved ? "understood" : "failed");
      restAfter(moved ? "understood" : "failed");
    },
    [service, restAfter],
  );

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
      // The officer has resolved the ambiguity; this is now a plain
      // navigation and takes the same path as any other.
      const moved = executeIntent({ kind: "navigate", place, confidence: 1 }, service);
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

  return {
    state,
    unavailable: dictation.unavailable,
    issue: dictation.issue,
    level: dictation.level,
    reading,
    candidates,
    start,
    stop: dictation.stop,
    cancel,
    toggle,
    choose,
    dismiss,
  };
}
