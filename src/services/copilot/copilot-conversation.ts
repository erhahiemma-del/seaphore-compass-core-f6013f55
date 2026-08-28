/**
 * What the Copilot is allowed to remember between sentences.
 *
 * Officers do not repeat themselves. "Show me Opobo Pioneer" followed by
 * "where has it been" is one conversation, and a system that answers the
 * second by asking which vessel is a system nobody uses twice. So a
 * small amount of state has to survive across turns.
 *
 * The danger is the opposite one. Memory is how an assistant starts
 * acting on things nobody said this turn: resolving "it" to a vessel the
 * officer moved on from, or treating an unrelated "yes" as approval for
 * a write it proposed a minute ago. Everything here is therefore
 * deliberately small, explicit and short-lived.
 *
 * ## One owner
 *
 * This is the only place conversational state lives. Scattering
 * `pendingConfirmation` across components is how two of them end up
 * disagreeing about whether the officer approved something.
 *
 * ## Nothing is inferred
 *
 * A pronoun resolves only against a vessel this conversation actually
 * established, or the map's current selection. When neither exists the
 * answer is a question, never a guess.
 */
import type { CopilotAction } from "./copilot-actions";

/** How long a proposed write waits for an answer before it lapses. */
export const PENDING_TTL_MS = 90_000;

export interface VesselChoice {
  readonly imo: string;
  readonly name: string;
  readonly flag?: string;
}

export interface PendingClarification {
  /** What the officer said that matched more than one vessel. */
  readonly query: string;
  readonly candidates: readonly VesselChoice[];
  /** What to do once one of them is chosen. */
  readonly then: "SELECT_VESSEL" | "SHOW_VESSEL_TRACK" | "SHOW_VESSEL_INTELLIGENCE";
  readonly at: number;
}

export interface PendingConfirmation {
  readonly action: CopilotAction;
  /** The sentence the officer is agreeing to, in their words. */
  readonly prompt: string;
  readonly at: number;
}

export interface ConversationContext {
  /** The vessel this conversation is about, for pronouns. */
  readonly lastReferencedVesselId?: string;
  readonly lastReferencedVesselName?: string;
  readonly pendingClarification?: PendingClarification;
  readonly pendingConfirmation?: PendingConfirmation;
  readonly lastResponse?: string;
}

export const EMPTY_CONTEXT: ConversationContext = {};

/**
 * Whether a pending item is still live.
 *
 * A confirmation that has sat unanswered is not consent waiting to be
 * collected — the officer moved on, and executing it later would act on
 * an intention they no longer hold.
 */
export function isLive(pending: { readonly at: number } | undefined, now = Date.now()): boolean {
  return pending != null && now - pending.at < PENDING_TTL_MS;
}

/* ── Agreement and refusal ───────────────────────────────────────────── */

const AFFIRMATIVE = [
  "yes",
  "yeah",
  "yep",
  "proceed",
  "go ahead",
  "do it",
  "confirm",
  "confirmed",
  "please do",
  "affirmative",
];

const NEGATIVE = ["no", "cancel", "stop", "never mind", "nevermind", "don't", "do not", "abort"];

/**
 * Whether a whole utterance is agreement.
 *
 * Matched against the entire sentence rather than searched for inside
 * it, because "no, show me the other one" contains "no" and is not a
 * refusal of a pending write — it is a new instruction. An assistant
 * that scans for a keyword will eventually hear consent inside a
 * sentence that withheld it.
 */
export function readsAsAffirmative(transcript: string): boolean {
  return AFFIRMATIVE.includes(normalise(transcript));
}

export function readsAsNegative(transcript: string): boolean {
  return NEGATIVE.includes(normalise(transcript));
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .trim();
}

/* ── Pronouns ────────────────────────────────────────────────────────── */

const PRONOUN = /\b(it|its|it's|this vessel|that vessel|this ship|that ship|the vessel)\b/i;

/** Whether the sentence leans on something already established. */
export function usesPronoun(transcript: string): boolean {
  return PRONOUN.test(transcript);
}

/**
 * The vessel a pronoun refers to.
 *
 * The conversation's own reference wins over the map's selection: an
 * officer who just asked about a vessel means that one, even if their
 * last click was elsewhere. When neither is available this returns null
 * and the caller must ask — resolving to "whichever vessel is nearest"
 * or "the first one held" is how the wrong hull ends up in a case file.
 */
export function resolvePronoun(
  context: ConversationContext,
  currentSelectionImo: string | null,
): string | null {
  return context.lastReferencedVesselId ?? currentSelectionImo ?? null;
}

/* ── Entity resolution ───────────────────────────────────────────────── */

export interface ResolvableVessel {
  readonly identity: {
    readonly imo: string;
    readonly mmsi?: string;
    readonly name: string;
    readonly callSign?: string;
    readonly flag?: string;
  };
}

export type EntityMatch =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly vessel: VesselChoice }
  | { readonly kind: "many"; readonly candidates: readonly VesselChoice[] };

/**
 * Find the vessel an officer named.
 *
 * Exact identifier matches — IMO, MMSI, call sign — are unambiguous and
 * win outright. Names are matched exactly first, then by prefix, and a
 * name that matches several hulls returns all of them rather than the
 * first: "Ocean Star" matching three vessels and silently selecting one
 * is the failure this exists to prevent.
 */
export function resolveVesselEntity(
  query: string,
  vessels: readonly ResolvableVessel[],
): EntityMatch {
  const wanted = normalise(query);
  if (!wanted) return { kind: "none" };

  const exactId = vessels.find(
    (v) =>
      v.identity.imo.toLowerCase() === wanted ||
      v.identity.mmsi?.toLowerCase() === wanted ||
      v.identity.callSign?.toLowerCase() === wanted,
  );
  if (exactId) return { kind: "one", vessel: choiceOf(exactId) };

  const byName = vessels.filter((v) => v.identity.name.toLowerCase() === wanted);
  if (byName.length === 1) return { kind: "one", vessel: choiceOf(byName[0]) };
  if (byName.length > 1) return { kind: "many", candidates: byName.map(choiceOf) };

  /*
   * Prefix rather than substring. "Star" should not pull back every
   * vessel with the word buried in it — an officer naming a vessel is
   * naming its beginning.
   */
  const byPrefix = vessels.filter((v) => v.identity.name.toLowerCase().startsWith(wanted));
  if (byPrefix.length === 1) return { kind: "one", vessel: choiceOf(byPrefix[0]) };
  if (byPrefix.length > 1) return { kind: "many", candidates: byPrefix.map(choiceOf) };

  return { kind: "none" };
}

/**
 * Pick from an offered list using the officer's reply.
 *
 * Handles the three ways people answer a spoken menu: by name, by
 * ordinal ("the second one"), and by a distinguishing attribute ("the
 * Nigerian one"). Anything else resolves to null so the question is
 * asked again rather than answered wrongly.
 */
export function resolveChoice(
  reply: string,
  candidates: readonly VesselChoice[],
): VesselChoice | null {
  const said = normalise(reply);
  if (!said || candidates.length === 0) return null;

  /*
   * Identifier first. When two candidates share a name — which is why
   * IMO numbers exist — it is the only thing that separates them, and
   * the officer was read it aloud for exactly this purpose.
   */
  const byId = candidates.find(
    (c) => said === c.imo.toLowerCase() || said.includes(c.imo.toLowerCase()),
  );
  if (byId) return byId;

  /*
   * By name, but only when the name picks out one candidate. A name
   * shared by several tells us nothing, and returning the first would be
   * the silent wrong selection this whole path exists to avoid.
   */
  const named = candidates.filter(
    (c) => c.name.toLowerCase() === said || said.includes(c.name.toLowerCase()),
  );
  if (named.length === 1) return named[0];

  const ordinals = ["first", "second", "third", "fourth", "fifth"];
  for (let index = 0; index < ordinals.length; index += 1) {
    if (new RegExp(`\\b${ordinals[index]}\\b`).test(said) || said === String(index + 1)) {
      return candidates[index] ?? null;
    }
  }

  /*
   * By flag — "the Nigerian one". Only when it picks out exactly one
   * candidate; two Nigerian vessels make the answer as ambiguous as the
   * question was.
   */
  const byFlag = candidates.filter((c) => c.flag && said.includes(c.flag.toLowerCase()));
  if (byFlag.length === 1) return byFlag[0];

  const demonyms: Readonly<Record<string, string>> = {
    nigerian: "ng",
    liberian: "lr",
    panamanian: "pa",
    ghanaian: "gh",
  };
  for (const [demonym, code] of Object.entries(demonyms)) {
    if (said.includes(demonym)) {
      const hits = candidates.filter((c) => c.flag?.toLowerCase().startsWith(code));
      if (hits.length === 1) return hits[0];
    }
  }

  return null;
}

function choiceOf(vessel: ResolvableVessel): VesselChoice {
  return {
    imo: vessel.identity.imo,
    name: vessel.identity.name,
    flag: vessel.identity.flag,
  };
}
