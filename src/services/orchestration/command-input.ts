/**
 * The one door into understanding.
 *
 * Seaphore accumulated four ways to read an instruction: the
 * orchestration engine behind typed search, the voice intent parser, the
 * Copilot's own turn planner, and the map search box. Each knew a
 * slightly different set of phrasings, so the same sentence could mean
 * one thing typed and another spoken — and nobody could say which
 * reading a given surface had used.
 *
 * This is the boundary that ends that. Every surface produces a
 * `CommandInput`, and everything downstream of it is shared. It is
 * deliberately not another interpreter: it normalises text and records
 * where the text came from. The reading itself belongs to `understand`.
 *
 * ## Why source is carried but not branched on
 *
 * A spoken sentence needs work a typed one does not — lead-ins removed,
 * coordinates spelled out, phonetic slips repaired — and that work must
 * happen *before* understanding, not inside it. Carrying the source lets
 * the normaliser do the right preprocessing while leaving exactly one
 * classifier downstream. Business logic keyed on source after this point
 * is how two brains grow back.
 */
import type { ConversationContext } from "@/services/copilot/copilot-conversation";

export type CommandSource = "SEARCH" | "VOICE" | "COPILOT";

export interface CommandInput {
  /** What the officer typed, or what the recogniser heard. */
  readonly text: string;
  readonly source: CommandSource;
  /** Carried so pronouns and pending answers survive across turns. */
  readonly conversationContext?: ConversationContext;
}

export function commandInput(
  text: string,
  source: CommandSource,
  conversationContext?: ConversationContext,
): CommandInput {
  return { text, source, conversationContext };
}

/**
 * The text `understand` should read.
 *
 * Typed text is passed through: an officer who typed it meant it. Spoken
 * text goes through the voice normaliser first, so "Seaphore, please can
 * you show me Opobo Pioneer" and "show me Opobo Pioneer" reach the
 * classifier as the same sentence — which is the whole claim of having
 * one engine.
 */
export function normalisedText(input: CommandInput): string {
  return input.source === "VOICE" ? normaliseSpokenText(input.text) : input.text.trim();
}

/* ── Voice preprocessing ─────────────────────────────────────────────── */

/**
 * Openers an officer puts in front of the actual request.
 *
 * People do not speak in commands. "Right, can you take me to Onne" is
 * one request with four words of runway, and a classifier that treats
 * the runway as part of the request matches nothing.
 *
 * Preserved from the voice intent parser, which is the part of it worth
 * keeping: it was never the classification that made voice work, it was
 * knowing how people actually talk.
 */
const LEAD_INS = [
  /^(ok(ay)?|right|so|well|um+|uh+|erm?)\b[,\s]*/i,
  /^(hey |hi )?seaphore\b[,\s]*/i,
  /^(please\s+)?(can|could|would)\s+you\s+(please\s+)?/i,
  /^(please|kindly)\s+/i,
  /^i\s+(want|need|would like)\s+(to\s+)?(see\s+)?/i,
  /^(let'?s|lets)\s+/i,
];

/** Spoken numbers that appear in coordinates and thresholds. */
const SPOKEN_NUMBERS: Readonly<Record<string, string>> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  twelve: "12",
  twenty: "20",
  "twenty four": "24",
  "forty eight": "48",
  "seventy two": "72",
};

export function normaliseSpokenText(transcript: string): string {
  let text = transcript.trim().replace(/\s+/g, " ");

  // Repeatedly, because people stack them: "ok so please can you…".
  let previous = "";
  while (previous !== text) {
    previous = text;
    for (const lead of LEAD_INS) text = text.replace(lead, "").trim();
  }

  /*
   * Numbers before coordinates. The coordinate pattern expects digits,
   * and a recogniser hands back "six point four north" — so running the
   * coordinate pass first meant it never matched a spoken position at
   * all, which is exactly the case it exists for.
   */
  text = spokenNumbers(text);
  text = spokenCoordinates(text);

  // A trailing question mark is punctuation the recogniser guessed at.
  return text.replace(/[?.!]+$/, "").trim();
}

/**
 * "six point four north, three point three east" → "6.4, 3.3".
 *
 * Recognisers spell coordinates out, and a decimal point spoken aloud is
 * the word "point". Left as digits and a comma, which is what the
 * coordinate reader downstream already accepts.
 */
function spokenCoordinates(text: string): string {
  const spelled =
    /(\d+)\s+point\s+(\d+)\s*(north|south)\b[,\s]*(?:and\s+)?(\d+)\s+point\s+(\d+)\s*(east|west)\b/i;
  const match = text.match(spelled);
  if (!match) return text;

  const lat = Number(`${match[1]}.${match[2]}`) * (/south/i.test(match[3]) ? -1 : 1);
  const lon = Number(`${match[4]}.${match[5]}`) * (/west/i.test(match[6]) ? -1 : 1);
  return text.replace(spelled, `${lat}, ${lon}`);
}

function spokenNumbers(text: string): string {
  let out = text;
  /*
   * Longest first, so "twenty four" is not consumed as "twenty" and left
   * with a stray "four" — which would turn a 24-hour window into 20.
   */
  const words = Object.keys(SPOKEN_NUMBERS).sort((a, b) => b.length - a.length);
  for (const word of words) {
    out = out.replace(new RegExp(`\\b${word}\\b`, "gi"), SPOKEN_NUMBERS[word]);
  }
  return out;
}
