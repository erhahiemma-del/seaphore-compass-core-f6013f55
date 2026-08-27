/**
 * What an officer meant, from what the recogniser heard.
 *
 * Speech reaches this as ordinary text — the transcription service is a
 * transport surface and interprets nothing. Everything that turns words
 * into a map movement happens here, in one pure function, so the meaning
 * of a spoken command can be asserted without a microphone.
 *
 * ## Recognition is approximate, so matching must be
 *
 * A recogniser trained mostly on American and British English will not
 * return "Onne" reliably from a Nigerian officer saying it. It returns
 * something adjacent — a real English word, a respelling, a split into
 * two words. Demanding an exact string would make the feature work for
 * the accents the model was trained on and fail for the officers who
 * will actually use it, which is not a tolerable way for this to behave.
 *
 * So matching is phonetic and uniform: every place goes through the same
 * reduction, and the same threshold decides all of them. There is no
 * table of Nigerian port spellings. A per-port alias list would work for
 * the six ports someone thought of and fail silently for the seventh,
 * and it would put implementation branches where the canonical registry
 * is supposed to be the only place a port is described.
 *
 * ## Three answers, not two
 *
 * Understood, ambiguous, and not recognised are different situations and
 * the officer needs them told apart. Moving the map on a 60%-confident
 * guess is the worst outcome available: the officer looks up at a
 * different port than they asked for, with nothing on screen to say a
 * guess was made. Ambiguity asks; it does not gamble.
 */
import { allPlaces, type Place } from "@/services/geospatial/places";
import type { LonLat } from "@/services/geospatial/types";

import { parseCoordinates } from "./coordinate-math";

export type VoiceIntent =
  | { readonly kind: "navigate"; readonly place: Place; readonly confidence: number }
  | { readonly kind: "coordinates"; readonly coordinates: LonLat }
  | { readonly kind: "global" }
  | { readonly kind: "zoom"; readonly direction: "in" | "out" }
  /** Heard something place-shaped, not confidently enough to act on it. */
  | { readonly kind: "clarify"; readonly candidates: readonly Place[] }
  | { readonly kind: "unrecognised"; readonly reason: string };

export interface VoiceReading {
  /** What the recogniser returned, unmodified. Always shown to the officer. */
  readonly heard: string;
  readonly intent: VoiceIntent;
}

/**
 * Openers an officer puts in front of the actual request.
 *
 * People do not speak in commands. "Right, can you take me to Onne" is
 * one request with four words of runway, and a parser that treats the
 * runway as part of the destination will never match anything.
 */
const LEAD_INS = [
  "seaphore",
  "please",
  "okay",
  "ok",
  "right",
  "now",
  "can you",
  "could you",
  "would you",
  "i want to see",
  "i'd like to see",
  "let me see",
  "let's see",
  "show me",
  "take me to",
  "take me",
  "bring up",
  "bring me to",
  "navigate to",
  "navigate",
  "go to",
  "go",
  "fly to",
  "fly",
  "jump to",
  "move to",
  "open",
  "display",
  "the",
  "a",
];

/** Confidence at or above which the map moves without asking. */
const ACT_THRESHOLD = 0.82;
/** Below this, nothing was heard that resembles a place. */
const CLARIFY_THRESHOLD = 0.6;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.'°′-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Peel off openers, repeatedly — officers stack them. */
function stripLeadIns(text: string): string {
  let current = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const lead of LEAD_INS) {
      if (current === lead) return "";
      if (current.startsWith(`${lead} `)) {
        current = current.slice(lead.length + 1);
        changed = true;
      }
    }
  }
  return current.trim();
}

/**
 * A spelling-independent key for a spoken name.
 *
 * Reduces only the distinctions a recogniser genuinely gets wrong — the
 * sounds English spells more than one way, and doubled letters, which
 * carry no sound at all. "Appapa" and "Apapa" are the same key; so are
 * "Lecki" and "Lekki", and "Kalabar" and "Calabar".
 *
 * Vowels stay. An earlier version dropped them for a consonant skeleton,
 * which is the classic approach and much too lossy here: it reduced both
 * "Lekki" and the ordinary English word "like" to `lk`, so "what is the
 * weather like" was a confident request for a Nigerian port. Keeping
 * vowels costs a little tolerance and removes a whole class of command
 * that means something else entirely.
 */
function phonetic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/(.)\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * How well a spoken phrase matches a place name.
 *
 * Exact and containment cases short-circuit; everything else is scored
 * phonetically, on the whole phrase and on its best-matching window of
 * words, because "the port of onne please" contains the name inside a
 * sentence rather than being it.
 */
function score(phrase: string, name: string): number {
  const spoken = normalise(phrase);
  const target = normalise(name);
  if (spoken === "" || target === "") return 0;
  if (spoken === target) return 1;
  if (spoken.includes(target)) return 0.95;

  const whole = similarity(phonetic(spoken), phonetic(target));

  /*
   * Slide a window the width of the name across the phrase.
   *
   * Without this, a two-word destination inside a six-word sentence is
   * diluted by four words of context it has nothing to do with, and
   * scores below the threshold no matter how clearly it was said.
   */
  const words = spoken.split(" ");
  const width = target.split(" ").length;
  let best = whole;
  for (let i = 0; i + width <= words.length; i++) {
    const window = words.slice(i, i + width).join(" ");
    best = Math.max(best, similarity(phonetic(window), phonetic(target)));
  }
  return best;
}

/** Spoken coordinate words, rewritten as the symbols the parser reads. */
function spokenCoordinatesToSymbols(text: string): string {
  return text
    .replace(/\bdegrees?\b/gi, "°")
    .replace(/\bminutes?\b/gi, "'")
    .replace(/\bpoint\b/gi, ".")
    .replace(/\bnorth\b/gi, "N")
    .replace(/\bsouth\b/gi, "S")
    .replace(/\beast\b/gi, "E")
    .replace(/\bwest\b/gi, "W")
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generic maritime words that end a facility's registered name.
 *
 * "Onne Port Complex" is what the registry calls it and "Onne" is what an
 * officer says. Scoring the spoken word against the full registered name
 * dilutes it below the threshold, so the whole command becomes a question
 * about a place that was named perfectly clearly.
 *
 * These are words about the *kind* of thing, not about any particular
 * one — the same suffix rule applies to every entry in the registry, and
 * the registered name is kept as a key alongside the shortened form, so
 * nothing is renamed and no port is described twice.
 */
const GENERIC_SUFFIXES = ["port complex", "deep sea port", "island port", "port"];

/**
 * Every form of a place's name an officer might say.
 *
 * Derived from the canonical name, never authored per place. A hand-kept
 * alias list is how a registry acquires a second, drifting description of
 * the same facility.
 */
function matchKeys(name: string, id: string): readonly string[] {
  const keys = new Set<string>([name, id]);

  // The parenthetical is usually the working name: "Lagos Port Complex
  // (Apapa)" is asked for as Apapa.
  const parenthetical = /\(([^)]+)\)/.exec(name);
  if (parenthetical) keys.add(parenthetical[1]!);

  const withoutParens = name.replace(/\s*\([^)]*\)/g, "").trim();
  if (withoutParens) keys.add(withoutParens);

  for (const key of [...keys]) {
    const lower = key.toLowerCase();
    for (const suffix of GENERIC_SUFFIXES) {
      if (lower.endsWith(` ${suffix}`)) {
        keys.add(key.slice(0, key.length - suffix.length - 1).trim());
      }
    }
  }

  return [...keys].filter((key) => key !== "");
}

const GLOBAL_PHRASES = [
  "global view",
  "whole world",
  "the world",
  "world view",
  "globe",
  "zoom all the way out",
  "zoom out to the world",
];

/**
 * Read a transcript.
 *
 * Returns what was heard alongside the interpretation, always. An officer
 * shown only the outcome cannot tell a misheard word from a
 * misunderstood one, and those need different corrections.
 */
export function interpret(transcript: string): VoiceReading {
  const heard = transcript.trim();
  const text = normalise(heard);

  if (text === "") {
    return { heard, intent: { kind: "unrecognised", reason: "Nothing was said." } };
  }

  // Coordinates before places: "six twenty five north" is a position, and
  // scoring it against place names would find something eventually.
  const coordinates = parseCoordinates(spokenCoordinatesToSymbols(heard));
  if (coordinates) return { heard, intent: { kind: "coordinates", coordinates } };

  if (GLOBAL_PHRASES.some((phrase) => text.includes(phrase))) {
    return { heard, intent: { kind: "global" } };
  }

  if (/\bzoom (in|closer)\b|\bcloser\b/.test(text)) {
    return { heard, intent: { kind: "zoom", direction: "in" } };
  }
  if (/\bzoom out\b|\bfurther out\b|\bback out\b|\bwider\b/.test(text)) {
    return { heard, intent: { kind: "zoom", direction: "out" } };
  }

  const phrase = stripLeadIns(text);
  if (phrase === "") {
    return {
      heard,
      intent: { kind: "unrecognised", reason: "That was an instruction with no destination." },
    };
  }

  const ranked = allPlaces()
    .map((place) => ({
      place,
      value: Math.max(...matchKeys(place.name, place.id).map((key) => score(phrase, key))),
    }))
    .sort((a, b) => b.value - a.value);

  const top = ranked[0];
  if (!top || top.value < CLARIFY_THRESHOLD) {
    return {
      heard,
      intent: { kind: "unrecognised", reason: "That does not match a place on the map." },
    };
  }

  /*
   * A clear winner, or a question.
   *
   * Two places within a hair of each other is not a confident match even
   * when both score well — that is precisely the case where acting sends
   * the officer to the wrong harbour with nothing on screen admitting a
   * choice was made.
   */
  const runnerUp = ranked[1]?.value ?? 0;
  if (top.value >= ACT_THRESHOLD && top.value - runnerUp > 0.05) {
    return { heard, intent: { kind: "navigate", place: top.place, confidence: top.value } };
  }

  return {
    heard,
    intent: {
      kind: "clarify",
      candidates: ranked
        .filter((entry) => entry.value >= CLARIFY_THRESHOLD)
        .slice(0, 3)
        .map((entry) => entry.place),
    },
  };
}

/** One line an officer reads to confirm what the map is about to do. */
export function describeIntent(intent: VoiceIntent): string {
  switch (intent.kind) {
    case "navigate":
      return `${intent.place.name}`;
    case "coordinates":
      return "that position";
    case "global":
      return "the global view";
    case "zoom":
      return intent.direction === "in" ? "closer in" : "further out";
    case "clarify":
      return "which of these?";
    case "unrecognised":
      return intent.reason;
  }
}
