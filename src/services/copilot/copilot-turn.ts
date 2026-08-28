/**
 * One turn of conversation: a transcript in, an action and an answer out.
 *
 * This is the join between understanding and doing, and it is
 * deliberately the only one. Everything upstream — the microphone, the
 * transcription endpoint, the development harness — hands it the same
 * normalised string, and everything downstream goes through
 * `executeCopilotAction`. A second route from speech to system state
 * would be a second set of rules about what the Copilot may do, and only
 * one of them would have the confirmation gate.
 *
 * ## It plans; it does not act
 *
 * `planTurn` is pure. It reads the transcript and the conversation, and
 * returns what should happen. Executing is the caller's job, which is
 * what makes the whole decision path testable without a map, a browser
 * or a voice.
 *
 * ## Order matters
 *
 * A pending question is answered before a new command is looked for. An
 * officer replying "yes" to a proposed investigation is not issuing a
 * fresh instruction, and parsing their reply as one would drop the
 * approval on the floor and leave the write pending forever.
 */
import { understand } from "@/services/orchestration";
import { describeCapability, isConnected, type CapabilityId } from "@/services/intelligence-layer";
import {
  commandInput,
  normalisedText,
  type CommandSource,
} from "@/services/orchestration/command-input";

import { translateUnderstanding } from "./understanding-to-action";

import type { CopilotAction } from "./copilot-actions";
import { isStateChanging } from "./copilot-actions";
import {
  type ConversationContext,
  type ResolvableVessel,
  type VesselChoice,
  isLive,
  readsAsAffirmative,
  readsAsNegative,
  resolveChoice,
  resolvePronoun,
  resolveVesselEntity,
  usesPronoun,
} from "./copilot-conversation";

/** What the interface should do next. */
export type TurnOutcome =
  /** Run this, then speak the result. */
  | { readonly kind: "EXECUTE"; readonly action: CopilotAction; readonly speech: string }
  /** Ask which vessel, and wait. */
  | { readonly kind: "CLARIFY"; readonly speech: string }
  /** Propose a write, and wait for a plain yes. */
  | { readonly kind: "CONFIRM"; readonly speech: string }
  /** Nothing to do — an answer, a refusal, or a question we cannot take. */
  | { readonly kind: "REPLY"; readonly speech: string };

export interface TurnPlan {
  readonly outcome: TurnOutcome;
  /** The conversation as it stands after this turn. */
  readonly context: ConversationContext;
}

export interface TurnInput {
  readonly transcript: string;
  readonly context: ConversationContext;
  readonly vessels: readonly ResolvableVessel[];
  /** The map's current selection, for pronouns with no prior reference. */
  readonly selectedImo: string | null;
  /** Where the text came from, so voice gets its preprocessing. */
  readonly source?: CommandSource;
  readonly now?: number;
}

/** Phrases that ask for something the deployment cannot answer. */
/**
 * Questions whose answer depends on a provider, mapped to the capability
 * that would answer them.
 *
 * The sentences are not written here. Whether ownership is available is
 * a fact about the deployment, and hardcoding "not connected" in the
 * assistant means the day a registry is wired the Copilot keeps saying
 * no. Asking the layer means the answer changes when the deployment
 * does, and stays honest either way.
 */
const TOPIC_CAPABILITIES: readonly { readonly test: RegExp; readonly capability: CapabilityId }[] =
  [
    { test: /\b(who owns|owner|ownership|operator|manager)\b/i, capability: "vessel.ownership" },
    { test: /\b(crew|master|captain|who is on board)\b/i, capability: "vessel.crew" },
    {
      test: /\b(depart|departed|origin|come from|came from|sailed from|port calls?)\b/i,
      capability: "vessel.voyage",
    },
    { test: /\b(cargo|manifest|what is it carrying)\b/i, capability: "vessel.cargo" },
    {
      test: /\b(sanction\w*|detention|inspection|complian\w*)\b/i,
      capability: "vessel.compliance",
    },
  ];

export function planTurn(input: TurnInput): TurnPlan {
  const now = input.now ?? Date.now();
  const said = input.transcript.trim();
  const context = input.context;

  if (!said) {
    return reply(context, "I did not catch that. Please say that again.");
  }

  /*
   * A live confirmation is answered first. Only a bare yes or no counts:
   * anything else is a new instruction, and the proposed write is
   * dropped rather than left waiting to catch a later "yes" that was
   * meant for something else.
   */
  const confirmation = context.pendingConfirmation;
  if (isLive(confirmation, now) && confirmation) {
    if (readsAsAffirmative(said)) {
      return {
        outcome: {
          kind: "EXECUTE",
          action: confirmation.action,
          speech: "Confirmed.",
        },
        context: { ...context, pendingConfirmation: undefined },
      };
    }
    if (readsAsNegative(said)) {
      return reply(
        { ...context, pendingConfirmation: undefined },
        "Understood. I have not done that.",
      );
    }
    // Neither — fall through and treat it as a new command, having
    // discarded the proposal the officer declined to answer.
    return planTurn({
      ...input,
      context: { ...context, pendingConfirmation: undefined },
    });
  }

  /* A live clarification is answered next, for the same reason. */
  const clarification = context.pendingClarification;
  if (isLive(clarification, now) && clarification) {
    const chosen = resolveChoice(said, clarification.candidates);
    if (chosen) {
      return {
        outcome: {
          kind: "EXECUTE",
          action: { type: clarification.then, imo: chosen.imo },
          speech: `Opening ${chosen.name}.`,
        },
        context: {
          ...context,
          pendingClarification: undefined,
          lastReferencedVesselId: chosen.imo,
          lastReferencedVesselName: chosen.name,
        },
      };
    }
    if (readsAsNegative(said)) {
      return reply({ ...context, pendingClarification: undefined }, "Cancelled.");
    }
    return planTurn({
      ...input,
      context: { ...context, pendingClarification: undefined },
    });
  }

  /*
   * Questions the deployment cannot answer are refused before any intent
   * parsing. "Who owns it" must never become a vessel selection that
   * looks like it answered the question.
   */
  for (const topic of TOPIC_CAPABILITIES) {
    if (!topic.test.test(said)) continue;
    if (isConnected(topic.capability)) break;
    /*
     * Stated as a missing connection, never as a missing record. "We
     * have no owner for this vessel" and "nothing here can resolve an
     * owner for any vessel" are different facts, and only one of them
     * is true today.
     */
    return reply(
      context,
      `${sentenceCase(describeCapability(topic.capability))} is not available. No provider is connected for it in this deployment.`,
    );
  }

  /*
   * One engine. The text goes to `understand`, and what comes back is
   * either an instruction or a question — the same reading whether the
   * officer typed it, spoke it, or asked the Copilot.
   */
  const normalised = normalisedText(commandInput(said, input.source ?? "COPILOT", context));
  const understanding = understand(normalised);
  const translation = translateUnderstanding({
    understanding,
    text: normalised,
    vessels: input.vessels,
    contextVesselImo: resolvePronoun(context, input.selectedImo),
    contextVesselName: context.lastReferencedVesselName,
  });

  switch (translation.kind) {
    case "ACTION": {
      /*
       * A write is proposed, never performed. `isStateChanging` decides,
       * so a capability added to the action union without a considered
       * answer cannot slip past the gate.
       */
      const remembered = rememberVessel(context, translation.action, input.vessels);
      if (isStateChanging(translation.action)) {
        return {
          outcome: { kind: "CONFIRM", speech: confirmationFor(translation.action) },
          context: {
            ...remembered,
            pendingConfirmation: {
              action: translation.action,
              prompt: confirmationFor(translation.action),
              at: now,
            },
          },
        };
      }
      return execute(remembered, translation.action, translation.speech);
    }

    case "AMBIGUOUS":
      return {
        outcome: {
          kind: "CLARIFY",
          speech: `I found ${translation.candidates.length} vessels matching ${translation.subject}. Which one do you mean? ${describeCandidates(translation.candidates)}.`,
        },
        context: {
          ...context,
          pendingClarification: {
            query: translation.subject,
            candidates: translation.candidates,
            then: translation.then,
            at: now,
          },
        },
      };

    case "UNRESOLVED":
      return reply(context, translation.speech);

    case "NOT_ACTIONABLE":
      /*
       * A question, not an instruction. Retrieval is not wired to this
       * surface, so the honest answer names what can be done rather than
       * pretending to have searched.
       */
      return reply(
        context,
        understanding.intent === "unknown"
          ? "I am not sure what you would like me to do. You can ask me to find a vessel, move the map, show a vessel's movement history, or open its intelligence."
          : "I understood that as a question rather than an instruction, and query results are not available from this surface yet.",
      );
  }
}

/** Remember the hull an action is about, so the next pronoun resolves. */
function rememberVessel(
  context: ConversationContext,
  action: CopilotAction,
  vessels: readonly ResolvableVessel[],
): ConversationContext {
  if (!("imo" in action)) return context;
  const name = vessels.find((v) => v.identity.imo === action.imo)?.identity.name;
  return { ...context, lastReferencedVesselId: action.imo, lastReferencedVesselName: name };
}

function confirmationFor(action: CopilotAction): string {
  return action.type === "OPEN_INVESTIGATION"
    ? `This will open an investigation for ${action.vesselName ?? action.imo}. Should I proceed?`
    : "This changes what the map reports. Should I proceed?";
}

/* ── Vessel commands ─────────────────────────────────────────────────── */

type VesselVerb =
  | "SELECT_VESSEL"
  | "SHOW_VESSEL_TRACK"
  | "SHOW_VESSEL_INTELLIGENCE"
  | "OPEN_INVESTIGATION";

interface VesselCommand {
  readonly verb: VesselVerb;
  /** The name or identifier the officer gave, if any. */
  readonly subject: string | null;
}

const TRACK_PHRASES =
  /\b(where has it been|where has this vessel been|movement history|its journey|the journey|track|where it went|voyage history)\b/i;
const INTELLIGENCE_PHRASES = /\b(intelligence|dossier|what do we know|details|tell me about)\b/i;
const INVESTIGATION_PHRASES = /\b(investigation|investigate|open a case|case file)\b/i;
const SELECT_PHRASES = /\b(show me|find|select|open|locate|pull up|bring up)\b/i;

function readVesselCommand(said: string): VesselCommand | null {
  if (INVESTIGATION_PHRASES.test(said)) {
    return { verb: "OPEN_INVESTIGATION", subject: subjectFrom(said) };
  }
  if (TRACK_PHRASES.test(said)) {
    return { verb: "SHOW_VESSEL_TRACK", subject: subjectFrom(said) };
  }
  if (INTELLIGENCE_PHRASES.test(said)) {
    return { verb: "SHOW_VESSEL_INTELLIGENCE", subject: subjectFrom(said) };
  }
  if (SELECT_PHRASES.test(said)) {
    const subject = subjectFrom(said);
    return subject ? { verb: "SELECT_VESSEL", subject } : null;
  }
  return null;
}

/**
 * The vessel the officer named, stripped of the words around it.
 *
 * Returns null for a pronoun, which is the signal to resolve against the
 * conversation rather than search for a hull called "it".
 */
function subjectFrom(said: string): string | null {
  if (usesPronoun(said)) return null;

  const identifier = said.match(/\b(?:imo|mmsi)\s*[:\s]?\s*([a-z0-9-]+)/i);
  if (identifier) return identifier[1];

  const named = said.match(
    /\b(?:show me|find|select|open|locate|pull up|bring up|tell me about|intelligence for|investigation (?:on|for))\s+(?:the\s+)?(?:vessel\s+)?([a-z0-9][a-z0-9 '-]*?)(?:\s*(?:'s|s')?\s*(?:track|history|intelligence|dossier|details|journey|voyage))?\s*$/i,
  );
  const subject = named?.[1]?.trim();
  return subject && subject.length > 1 ? subject : null;
}

function planVesselCommand(
  command: VesselCommand,
  input: TurnInput,
  context: ConversationContext,
  now: number,
): TurnPlan {
  let imo: string | null = null;
  let name: string | undefined;

  if (command.subject) {
    const match = resolveVesselEntity(command.subject, input.vessels);
    if (match.kind === "none") {
      return reply(context, `I could not find a vessel matching ${command.subject}.`);
    }
    if (match.kind === "many") {
      /*
       * Never a guess. Selecting one of three vessels the officer might
       * have meant is worse than asking, because the panel then looks
       * authoritative about the wrong hull.
       */
      return {
        outcome: {
          kind: "CLARIFY",
          speech: `I found ${match.candidates.length} vessels matching ${command.subject}. Which one do you mean? ${describeCandidates(match.candidates)}.`,
        },
        context: {
          ...context,
          pendingClarification: {
            query: command.subject,
            candidates: match.candidates,
            then: command.verb === "OPEN_INVESTIGATION" ? "SELECT_VESSEL" : command.verb,
            at: now,
          },
        },
      };
    }
    imo = match.vessel.imo;
    name = match.vessel.name;
  } else {
    imo = resolvePronoun(context, input.selectedImo);
    name =
      context.lastReferencedVesselName ??
      input.vessels.find((v) => v.identity.imo === imo)?.identity.name;
    if (!imo) {
      return reply(context, "I do not have a vessel selected. Which vessel would you like?");
    }
  }

  const remembered: ConversationContext = {
    ...context,
    lastReferencedVesselId: imo,
    lastReferencedVesselName: name,
  };

  const action: CopilotAction =
    command.verb === "OPEN_INVESTIGATION"
      ? { type: "OPEN_INVESTIGATION", imo, vesselName: name }
      : { type: command.verb, imo };

  if (isStateChanging(action)) {
    return {
      outcome: {
        kind: "CONFIRM",
        speech: `This will open an investigation for ${name ?? imo}. Should I proceed?`,
      },
      context: {
        ...remembered,
        pendingConfirmation: {
          action,
          prompt: `Open an investigation for ${name ?? imo}?`,
          at: now,
        },
      },
    };
  }

  return execute(remembered, action, speechFor(command.verb, name ?? imo));
}

/**
 * Name the candidates so the officer can actually pick one.
 *
 * Two vessels can carry the same name — that is precisely why IMO
 * numbers exist, and the simulated fleet reproduces it. Reading back
 * "Opobo Pioneer, or Opobo Pioneer" asks a question that cannot be
 * answered, so a name shared by more than one candidate is qualified by
 * its identifier and by flag where they differ.
 */
function describeCandidates(candidates: readonly VesselChoice[]): string {
  const duplicated = new Set(
    candidates
      .map((c) => c.name.toLowerCase())
      .filter((name, index, all) => all.indexOf(name) !== index),
  );
  return candidates
    .map((c) => {
      if (!duplicated.has(c.name.toLowerCase())) return c.name;
      const flag = c.flag ? `, flag ${c.flag}` : "";
      return `${c.name}, ${c.imo}${flag}`;
    })
    .join(", or ");
}

function speechFor(verb: VesselVerb, name: string): string {
  switch (verb) {
    case "SHOW_VESSEL_TRACK":
      /*
       * Deliberately not "tracked" or "observed". What the source holds
       * is described by the drawer, which knows whether the track is
       * recorded or simulated; the spoken line promises only to open it.
       */
      return `Opening the available movement history for ${name}.`;
    case "SHOW_VESSEL_INTELLIGENCE":
      return `Opening vessel intelligence for ${name}.`;
    case "SELECT_VESSEL":
      return `I have located ${name}. Opening vessel intelligence now.`;
    case "OPEN_INVESTIGATION":
      return `Opening an investigation for ${name}.`;
  }
}

/* ── Small constructors ──────────────────────────────────────────────── */

function execute(context: ConversationContext, action: CopilotAction, speech: string): TurnPlan {
  return {
    outcome: { kind: "EXECUTE", action, speech },
    context: { ...context, lastResponse: speech },
  };
}

function reply(context: ConversationContext, speech: string): TurnPlan {
  return { outcome: { kind: "REPLY", speech }, context: { ...context, lastResponse: speech } };
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
