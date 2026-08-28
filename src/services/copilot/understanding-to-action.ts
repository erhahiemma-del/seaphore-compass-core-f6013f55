/**
 * From what the officer meant to what the system should do.
 *
 * `understand` produces a reading. This decides whether that reading is
 * an instruction, and if so which action carries it out. Keeping the two
 * apart is the point of the split: the engine can learn a new phrasing
 * without learning a new capability, and a capability can change without
 * touching how sentences are read.
 *
 * ## It translates; it never executes
 *
 * Nothing here calls the map, the selection model or a server function.
 * It returns a `CopilotAction`, and `executeCopilotAction` is the only
 * thing that runs one. A translator that acted would be the fourth
 * dispatcher, reachable from typed text nobody reviewed.
 *
 * ## Not every understanding is an action
 *
 * Most readings are questions — fleet intelligence, ownership, risk —
 * and those belong to retrieval, not to the camera. `null` means "this
 * was not an instruction", which the caller answers some other way.
 */
import { findPlace } from "@/services/geospatial/places";
import { listVesselSources } from "@/services/geospatial/vessel-source";
import { PLACE_CLARIFY_THRESHOLD, rankPlaces } from "@/features/maritime/voice-intent";
import type { QueryUnderstanding } from "@/services/orchestration";
import { approachWindowFor } from "@/services/orchestration/understanding/approach-window";

import type { CopilotAction } from "./copilot-actions";
import { type ResolvableVessel, resolveVesselEntity } from "./copilot-conversation";

export type Translation =
  | { readonly kind: "ACTION"; readonly action: CopilotAction; readonly speech: string }
  /** The sentence named a vessel that matches several hulls. */
  | {
      readonly kind: "AMBIGUOUS";
      readonly subject: string;
      readonly candidates: readonly {
        readonly imo: string;
        readonly name: string;
        readonly flag?: string;
      }[];
      readonly then: "SELECT_VESSEL" | "SHOW_VESSEL_TRACK";
    }
  /** An instruction whose subject could not be resolved at all. */
  | { readonly kind: "UNRESOLVED"; readonly speech: string }
  /** Not an instruction. */
  | { readonly kind: "NOT_ACTIONABLE" };

export interface TranslationInput {
  readonly understanding: QueryUnderstanding;
  /** The normalised text, for the parts an intent alone cannot carry. */
  readonly text: string;
  readonly vessels: readonly ResolvableVessel[];
  /** The vessel a pronoun refers to, already resolved by the caller. */
  readonly contextVesselImo: string | null;
  readonly contextVesselName?: string;
}

export function translateUnderstanding(input: TranslationInput): Translation {
  switch (input.understanding.intent) {
    case "map-zoom":
      return {
        kind: "ACTION",
        action: { type: "ZOOM", direction: /\bout|further\b/i.test(input.text) ? "out" : "in" },
        speech: /\bout|further\b/i.test(input.text) ? "Zooming out." : "Zooming in.",
      };

    case "map-navigation":
      return navigation(input);

    case "vessel-selection":
      return vessel(input, "SELECT_VESSEL");

    case "vessel-track":
      return vessel(input, "SHOW_VESSEL_TRACK");

    case "source-switch":
      return sourceSwitch(input);

    case "approach-intelligence": {
      /*
       * The horizon comes from the officer's own words. `approachWindowFor`
       * reads a forward threshold and never a recency window — "within 24
       * hours" and "in the last 24 hours" are opposite questions, and the
       * default is flagged as inferred so the interface can say the
       * threshold was assumed rather than asked for.
       */
      const window = approachWindowFor(input.text);
      return {
        kind: "ACTION",
        action: { type: "SHOW_APPROACHING_VESSELS", thresholdHours: window.hours },
        /*
         * Deliberately no count here. The number belongs to the
         * assessment, which has not run yet; promising one now would be
         * the assistant answering before it looked.
         */
        speech: window.inferred
          ? `Assessing the fleet against the default ${window.hours}-hour approach threshold.`
          : `Assessing the fleet ${window.label}.`,
      };
    }

    case "vessel-investigation":
      /*
       * The one intent that is a question or an instruction depending on
       * the verb. "What did the investigation find" asks; "open an
       * investigation" instructs. The classifier reads the subject
       * correctly either way, so the distinction belongs here, where
       * actionability is decided — not as a second intent that would
       * make the same sentence classify two ways.
       */
      return /\b(open|start|create|raise)\b/i.test(input.text)
        ? investigation(input)
        : { kind: "NOT_ACTIONABLE" };

    default:
      /*
       * Every other intent is a question. Deliberately not a catch-all
       * that guesses: an unrecognised sentence must not become a camera
       * movement because it happened to contain a place name.
       */
      return { kind: "NOT_ACTIONABLE" };
  }
}

function navigation(input: TranslationInput): Translation {
  const coordinates = readCoordinates(input.text);
  if (coordinates) {
    return {
      kind: "ACTION",
      action: { type: "NAVIGATE_COORDINATES", coordinates, zoom: 12 },
      speech: "Moving to those coordinates.",
    };
  }

  if (/\b(global|world) view\b/i.test(input.text)) {
    return {
      kind: "ACTION",
      action: { type: "NAVIGATE_PLACE", place: "world" },
      speech: "Showing the global view.",
    };
  }

  /*
   * The place comes from the understanding's own entities where it found
   * one, and from the text otherwise. Resolution stays with the places
   * registry rather than being re-derived here — there is one list of
   * what Seaphore can navigate to.
   */
  const named =
    input.understanding.entities.find((entity) => entity.kind === "port")?.text ??
    stripVerb(input.text);
  /*
   * Exact name first, then the fuzzy matcher, which is the behaviour
   * worth preserving from the voice parser: officers say "Apapa" for
   * Lagos Port Complex and "Tin Can" for Tin Can Island, and an exact
   * lookup finds neither.
   */
  const place = named ? (findPlace(named) ?? bestPlace(named)) : null;

  return place
    ? {
        kind: "ACTION",
        action: { type: "NAVIGATE_PLACE", place: place.id },
        speech: `Taking you to ${place.name}.`,
      }
    : {
        kind: "UNRESOLVED",
        speech: named
          ? `I could not find a place called ${named}.`
          : "I did not catch where you would like to go.",
      };
}

/**
 * Change which providers feed the map.
 *
 * Named against the registry rather than parsed freely, so the Copilot
 * cannot enable a provider that does not exist and then report success.
 * State-changing, so it reaches the officer as a proposal: switching
 * sources alters what every other surface reports, and an officer who
 * did not notice would be reading a different picture than they think.
 */
function sourceSwitch(input: TranslationInput): Translation {
  const said = input.text.toLowerCase();
  const match = listVesselSources()
    .map((source) => source.describe())
    .find(
      (descriptor) =>
        said.includes(descriptor.id.toLowerCase()) || said.includes(descriptor.label.toLowerCase()),
    );

  return match
    ? {
        kind: "ACTION",
        action: { type: "SET_SOURCES", sourceIds: [match.id] },
        speech: `Switching to the ${match.label} source.`,
      }
    : {
        kind: "UNRESOLVED",
        speech: `I do not have a source by that name. Available sources are ${listVesselSources()
          .map((source) => source.describe().label)
          .join(", ")}.`,
      };
}

function bestPlace(phrase: string) {
  const top = rankPlaces(phrase)[0];
  return top && top.value >= PLACE_CLARIFY_THRESHOLD ? top.place : null;
}

function vessel(input: TranslationInput, then: "SELECT_VESSEL" | "SHOW_VESSEL_TRACK"): Translation {
  const subject = stripVerb(input.text);

  /*
   * A pronoun, or a bare instruction with no subject, refers to the
   * vessel the conversation is already about. The caller resolved that;
   * inventing a fallback here — nearest vessel, first held — is how the
   * wrong hull ends up in front of an officer.
   */
  if (!subject || isPronoun(subject)) {
    if (!input.contextVesselImo) {
      return {
        kind: "UNRESOLVED",
        speech: "I do not have a vessel selected. Which vessel would you like?",
      };
    }
    return {
      kind: "ACTION",
      action: { type: then, imo: input.contextVesselImo },
      speech: speechFor(then, input.contextVesselName ?? input.contextVesselImo),
    };
  }

  const match = resolveVesselEntity(subject, input.vessels);
  if (match.kind === "none") {
    return { kind: "UNRESOLVED", speech: `I could not find a vessel matching ${subject}.` };
  }
  if (match.kind === "many") {
    return { kind: "AMBIGUOUS", subject, candidates: match.candidates, then };
  }
  return {
    kind: "ACTION",
    action: { type: then, imo: match.vessel.imo },
    speech: speechFor(then, match.vessel.name),
  };
}

/**
 * Opening a case, about the vessel already under discussion.
 *
 * Deliberately refuses to resolve a hull from the sentence. "Open an
 * investigation on the Ocean Star" naming one of several matching
 * vessels would put the wrong hull on a case record — the one action
 * here that writes something an officer cannot undo by looking
 * elsewhere. It acts on the vessel in front of them or asks.
 */
function investigation(input: TranslationInput): Translation {
  if (!input.contextVesselImo) {
    return {
      kind: "UNRESOLVED",
      speech: "Which vessel should the investigation be for? Select it first.",
    };
  }
  return {
    kind: "ACTION",
    action: {
      type: "OPEN_INVESTIGATION",
      imo: input.contextVesselImo,
      vesselName: input.contextVesselName,
    },
    speech: `Opening an investigation for ${input.contextVesselName ?? input.contextVesselImo}.`,
  };
}

function speechFor(then: "SELECT_VESSEL" | "SHOW_VESSEL_TRACK", name: string): string {
  /*
   * Never "tracked", "observed" or "verified". Whether the history is
   * recorded or simulated is a fact about the source, and the drawer —
   * which knows — states it. The spoken line promises only to open it.
   */
  return then === "SHOW_VESSEL_TRACK"
    ? `Opening the available movement history for ${name}.`
    : `I have located ${name}. Opening vessel intelligence now.`;
}

const VERBS =
  /^(?:take me to|go to|navigate to|fly to|zoom into|show me|find|select|locate|pull up|bring up|open)\s+(?:the\s+)?(?:vessel\s+)?/i;

const TRAILING =
  /\s*(?:'s|s')?\s*(?:track|history|movement history|voyage history|journey|intelligence|dossier)\s*$/i;

/** The subject of an instruction, with the instruction words removed. */
function stripVerb(text: string): string {
  const withoutQuestion = text
    .replace(/^where has\s+/i, "")
    .replace(/\s+been\??\s*$/i, "")
    .trim();
  const source = withoutQuestion.length > 0 ? withoutQuestion : text;
  return (
    source
      .replace(VERBS, "")
      /*
       * "find IMO IMO-1" — the officer named the identifier kind before
       * the identifier. Left in, the subject becomes "imo imo-1" and
       * matches no hull.
       */
      .replace(/^(?:imo|mmsi|call ?sign)\s*[:#]?\s*/i, "")
      .replace(TRAILING, "")
      .replace(/[?.!]+$/, "")
      .trim()
  );
}

function isPronoun(subject: string): boolean {
  return /^(it|its|it's|this|that|this vessel|that vessel|this ship|that ship|the vessel)$/i.test(
    subject,
  );
}

function readCoordinates(text: string): [number, number] | null {
  const match = text.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  /*
   * Latitude first, because that is the order people say and write it,
   * and the action carries [lon, lat] because that is the order the map
   * uses. Getting this backwards puts a Nigerian vessel in Somalia.
   */
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}
