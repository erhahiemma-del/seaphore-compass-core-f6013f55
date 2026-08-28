/**
 * Speaking, and being honest about whose voice it is.
 *
 * Seaphore has listened since voice was built and has never once
 * answered aloud: a repository-wide search for `speechSynthesis` returned
 * nothing. The capture path exists in full — microphone to WAV to a
 * transcription service — and every byte flows one direction. This is the
 * other direction.
 *
 * ## The naming trap
 *
 * The brief asks for a Nigerian-accented voice. `en-NG` is not a locale
 * browsers reliably ship; Chrome and Edge on Windows typically offer
 * en-US, en-GB, en-AU and en-IN and nothing else. So the honest design is
 * a ladder that prefers `en-NG` where it genuinely exists, falls back
 * deliberately, and — this is the part that matters — always reports
 * which voice it actually selected.
 *
 * Labelling en-GB "Nigerian" because the product asked for one would be
 * the same class of falsehood as calling simulated positions observed.
 * The service therefore never returns a claim about accent, only the
 * voice's own name and locale, and leaves the interface to state it.
 *
 * ## Nothing here queues
 *
 * A second response arriving while the first is speaking replaces it. An
 * assistant that finishes a stale answer before starting the current one
 * is talking over the officer's own question, and in an operational
 * setting the newest answer is the only one worth hearing.
 */

import { deliveryFor, speakable, type SpeechTone } from "./speech-style";

/** Where a voice sits on the fallback ladder. */
export type VoiceMatchQuality =
  /** The requested locale exactly — a genuine Nigerian English voice. */
  | "EXACT_LOCALE"
  /** English, but a different region. */
  | "ENGLISH_FALLBACK"
  /** Whatever the platform offers as its default. */
  | "PLATFORM_DEFAULT"
  /** Nothing usable. */
  | "NONE";

export interface SelectedVoice {
  readonly name: string;
  readonly lang: string;
  readonly quality: VoiceMatchQuality;
}

/**
 * Preference order, most specific first.
 *
 * `en-NG` leads because it is what the product actually wants. The rest
 * are ordered by how close the English is likely to sound to a Nigerian
 * officer's ear — West African and British English before American —
 * which is a judgement, and one worth stating rather than hiding in a
 * sort comparator.
 */
export const VOICE_LOCALE_PREFERENCE: readonly string[] = [
  "en-NG",
  "en-GH",
  "en-ZA",
  "en-GB",
  "en-IN",
  "en-AU",
  "en-US",
];

/**
 * Voices this platform ships that are female.
 *
 * A name list, because the Web Speech API exposes no gender field at
 * all — `SpeechSynthesisVoice` carries a name, a language and a URI and
 * nothing else. So this is a heuristic over known platform voices, and
 * it is honest about being one: an unrecognised name is treated as
 * unknown rather than guessed at, and locale still wins over gender.
 *
 * It exists because the selection had no gender criterion whatsoever.
 * The en-GB block on this machine is George, Hazel, Susan, and `find`
 * returned the first — so Seaphore spoke with a male voice not by
 * preference but by array order.
 */
const KNOWN_FEMALE_VOICES: readonly string[] = [
  // Microsoft / Windows
  "hazel",
  "susan",
  "zira",
  "aria",
  "jenny",
  "michelle",
  "sonia",
  "libby",
  "maisie",
  "ada",
  "ezinne",
  // Apple
  "samantha",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "serena",
  "kate",
  "victoria",
  "allison",
  "ava",
  "susan (enhanced)",
  // Google / Android / Chrome
  "google uk english female",
  "google us english",
  "english female",
];

/** Whether a voice is one this platform is known to ship as female. */
export function isLikelyFemale(name: string): boolean {
  const lower = name.toLowerCase();
  return KNOWN_FEMALE_VOICES.some((known) => lower.includes(known));
}

/**
 * Pick a voice, and say how good the match is.
 *
 * Pure, so the ladder can be asserted without a speech engine — which
 * matters because the interesting cases are the ones this machine cannot
 * produce. Takes the voice list rather than reading it, for the same
 * reason.
 */
export function selectVoice(
  voices: readonly { readonly name: string; readonly lang: string }[],
): SelectedVoice | null {
  if (voices.length === 0) return null;

  const normalise = (lang: string) => lang.replace("_", "-").toLowerCase();

  for (const preferred of VOICE_LOCALE_PREFERENCE) {
    const inLocale = voices.filter((voice) => normalise(voice.lang) === preferred.toLowerCase());
    /*
     * Female first *within* each locale, never across them. A female
     * American voice must not outrank a West African one — the accent
     * an officer hears matters more than the gender, and reordering the
     * locale ladder to chase a voice would quietly undo the judgement
     * the ladder encodes.
     */
    const match = inLocale.find((voice) => isLikelyFemale(voice.name)) ?? inLocale[0];
    if (match) {
      return {
        name: match.name,
        lang: match.lang,
        /*
         * Only the first entry earns EXACT_LOCALE. Everything below it
         * is a fallback and is labelled as one, however good it sounds —
         * the whole point is that the interface can tell the officer it
         * did not get what was asked for.
         */
        quality: preferred === "en-NG" ? "EXACT_LOCALE" : "ENGLISH_FALLBACK",
      };
    }
  }

  // Any English at all, before giving up on language entirely.
  const english = voices.filter((voice) => normalise(voice.lang).startsWith("en"));
  const anyEnglish = english.find((voice) => isLikelyFemale(voice.name)) ?? english[0];
  if (anyEnglish) {
    return { name: anyEnglish.name, lang: anyEnglish.lang, quality: "ENGLISH_FALLBACK" };
  }

  const first = voices[0]!;
  return { name: first.name, lang: first.lang, quality: "PLATFORM_DEFAULT" };
}

/**
 * What the interface tells the officer about the voice in use.
 *
 * Never asserts an accent. "Nigerian English voice" is only said when the
 * locale genuinely is `en-NG`; otherwise the voice names itself and the
 * officer can draw their own conclusion.
 */
export function describeVoice(voice: SelectedVoice | null): string {
  if (!voice) return "No speech voice is available in this browser.";
  switch (voice.quality) {
    case "EXACT_LOCALE":
      return `Nigerian English voice (${voice.name}).`;
    case "ENGLISH_FALLBACK":
      return `No Nigerian English voice is installed. Using ${voice.name} (${voice.lang}).`;
    case "PLATFORM_DEFAULT":
      return `No English voice is installed. Using the system default, ${voice.name} (${voice.lang}).`;
    case "NONE":
      return "No speech voice is available in this browser.";
  }
}

export type VoiceOutputState = "idle" | "speaking" | "unavailable";

export interface VoiceOutputService {
  /** Say it. `tone` changes delivery, never the voice or the words. */
  speak(text: string, tone?: SpeechTone): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** The voice actually in use, once the platform has published its list. */
  selected(): SelectedVoice | null;
  availableVoices(): readonly SelectedVoice[];
  state(): VoiceOutputState;
  /** Officer-facing sentence naming the real voice. Never claims an accent. */
  description(): string;
  onChange(listener: () => void): () => void;
}

/**
 * Browser speech synthesis, wrapped so callers never touch the global.
 *
 * The awkwardness this hides is real: `getVoices()` returns an empty
 * array on first call in most browsers and fills in later, announced by
 * `voiceschanged`. A naive implementation reads the list once at startup,
 * finds nothing, and silently concludes speech is unavailable forever.
 */
export function createVoiceOutput(
  synth: SpeechSynthesis | undefined = typeof window === "undefined"
    ? undefined
    : window.speechSynthesis,
): VoiceOutputService {
  const listeners = new Set<() => void>();
  let voices: SelectedVoice[] = [];
  let chosen: SelectedVoice | null = null;
  let speaking = false;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const refresh = () => {
    if (!synth) return;
    const list = synth.getVoices();
    voices = list.map((voice) => ({ name: voice.name, lang: voice.lang, quality: "NONE" }));
    chosen = selectVoice(list);
    notify();
  };

  if (synth) {
    refresh();
    // The list usually arrives after the first read; without this the
    // service would decide speech is unavailable before the platform has
    // finished answering.
    synth.addEventListener?.("voiceschanged", refresh);
  }

  return {
    speak(text: string, tone: SpeechTone = "CALM") {
      if (!synth || text.trim() === "") return;
      /*
       * Replace, never queue.
       *
       * A second response arriving while the first is speaking means the
       * officer has moved on. Finishing the stale answer first would talk
       * over their current question.
       */
      synth.cancel();

      /*
       * Spoken form, not screen form. The same fact, pronounced — a
       * degree sign read aloud is "degree sign", and one stray character
       * undoes an otherwise natural sentence.
       */
      const utterance = new SpeechSynthesisUtterance(speakable(text));
      const match = synth.getVoices().find((voice) => voice.name === chosen?.name);
      if (match) utterance.voice = match;
      if (chosen) utterance.lang = chosen.lang;

      /*
       * Delivery is set explicitly. Browser defaults produce the flat,
       * clipped cadence people call robotic, and leaving them unset is
       * not a neutral choice — it is a choice to sound like a stock
       * ticker.
       */
      const delivery = deliveryFor(tone);
      utterance.rate = delivery.rate;
      utterance.pitch = delivery.pitch;
      utterance.volume = delivery.volume;
      utterance.onstart = () => {
        speaking = true;
        notify();
      };
      const finish = () => {
        speaking = false;
        notify();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    },
    stop() {
      synth?.cancel();
      speaking = false;
      notify();
    },
    pause() {
      synth?.pause();
    },
    resume() {
      synth?.resume();
    },
    selected: () => chosen,
    availableVoices: () => voices,
    state: () => (!synth ? "unavailable" : speaking ? "speaking" : "idle"),
    description: () => (!synth ? describeVoice(null) : describeVoice(chosen)),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
