/**
 * How Seaphore says things, as distinct from what it says.
 *
 * A screen sentence and a spoken sentence are not the same artefact. On
 * screen, "6.4272° N, 3.2578° E" is precise and scannable; read aloud by
 * a synthesiser it becomes "six point four two seven two degree sign N
 * comma", which is neither. So the spoken form is derived from the same
 * fact rather than being a second version of it — the data never
 * changes, only its pronunciation.
 *
 * ## Delivery
 *
 * Browser defaults produce the flat, clipped cadence people describe as
 * robotic: rate 1.0 with no pausing reads a command like a stock ticker.
 * Slowing slightly and letting punctuation breathe is most of the
 * difference between "GPS unit" and "someone talking to you".
 *
 * These are starting values, not measurements. Nobody here has heard
 * them: the pipeline can be verified without audio, but naturalness
 * cannot, and tuning past this point needs a person listening.
 */

/** Delivery settings applied to every utterance. */
export interface SpeechDelivery {
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
}

/**
 * Calm, unhurried, level.
 *
 * Rate below 1 because operational speech carries identifiers and
 * bearings an officer may be writing down. Pitch left at 1: raising it
 * to sound "warmer" is what produces the bright, artificial register
 * that reads as a phone menu.
 */
export const CALM_DELIVERY: SpeechDelivery = { rate: 0.94, pitch: 1.0, volume: 1.0 };

/**
 * Slightly more direct, for something that needs acting on.
 *
 * A small change on purpose. An assistant that becomes audibly agitated
 * during an alert adds pressure to a moment that already has some, and
 * an officer stops trusting a voice that performs urgency.
 */
export const ALERT_DELIVERY: SpeechDelivery = { rate: 1.0, pitch: 1.02, volume: 1.0 };

export type SpeechTone = "CALM" | "ALERT";

export function deliveryFor(tone: SpeechTone): SpeechDelivery {
  return tone === "ALERT" ? ALERT_DELIVERY : CALM_DELIVERY;
}

/* ── Saying things the way a person would ────────────────────────────── */

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

/**
 * A bearing, read as digits.
 *
 * Mariners say "zero four nine", not "forty-nine", and the leading zero
 * carries meaning. Reading it as a cardinal number loses the convention
 * an officer's ear is tuned to.
 */
export function spokenHeading(degrees: number): string {
  const padded = String(Math.round(degrees) % 360).padStart(3, "0");
  return [...padded].map((digit) => DIGIT_WORDS[Number(digit)]).join(" ");
}

/**
 * An identifier, grouped so it can be written down.
 *
 * "IMO nine three one two four seven three" in one breath is unusable.
 * Grouping in threes gives the natural pauses a person leaves when
 * reading a number to someone holding a pen.
 */
export function spokenIdentifier(value: string): string {
  const cleaned = value.replace(/[^0-9A-Za-z]/g, "");
  if (!/^\d+$/.test(cleaned)) return value;
  const groups = cleaned.match(/\d{1,3}/g) ?? [cleaned];
  return groups.map((group) => [...group].map((d) => DIGIT_WORDS[Number(d)]).join(" ")).join(", ");
}

/** A position, said rather than printed. */
export function spokenCoordinates(lat: number, lon: number): string {
  const say = (value: number, positive: string, negative: string) => {
    const hemisphere = value >= 0 ? positive : negative;
    const magnitude = Math.abs(value);
    const degrees = Math.floor(magnitude);
    const minutes = Math.round((magnitude - degrees) * 60);
    return `${degrees} degrees ${minutes} minutes ${hemisphere}`;
  };
  return `${say(lat, "north", "south")}, ${say(lon, "east", "west")}`;
}

/**
 * Strip what a synthesiser should not read out.
 *
 * Degree signs, arrows, bullet characters and stray slashes are typography
 * for the eye. Left in, they are pronounced — "degree sign", "slash" —
 * and one stray character undoes an otherwise natural sentence.
 */
export function speakable(text: string): string {
  return (
    text
      .replace(/[°]/g, " degrees ")
      .replace(/[·•—–]/g, ", ")
      .replace(/\s*\/\s*/g, " ")
      .replace(/\bkn\b/g, "knots")
      .replace(/\bnm\b/gi, "nautical miles")
      .replace(/\butc\b/gi, "U T C")
      /*
       * Acronyms an officer says letter by letter. Spelled with spaces so
       * the synthesiser does not attempt them as words — "IMO" becomes
       * "eye-moh" otherwise, and NIMASA is a word and must not be split.
       */
      .replace(/\bIMO\b/g, "I M O")
      .replace(/\bMMSI\b/g, "M M S I")
      .replace(/\bAIS\b/g, "A I S")
      .replace(/\bEEZ\b/g, "E E Z")
      .replace(/\bETA\b/g, "E T A")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}
