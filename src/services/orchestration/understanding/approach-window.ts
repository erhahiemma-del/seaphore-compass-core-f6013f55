/**
 * "Within 24 hours" is not "last 24 hours".
 *
 * The time extractor reads periods a question covers, and every one of
 * its rules is anchored on `last` — because until now every question was
 * about the past. So "vessels approaching Nigeria within 24 hours"
 * matched nothing, fell through to the intent's default, and came back
 * as *last 30 days*: the officer asked about the next day and was
 * answered about the previous month.
 *
 * These are genuinely different quantities and must not share a field.
 * A recency window says which observations to retrieve. An approach
 * threshold says how soon a vessel must reach a boundary to be worth an
 * officer's attention. One looks backwards, one forwards, and collapsing
 * them produces an answer that is wrong in a direction nobody notices.
 *
 * This module reads only the forward one. The backward one is left
 * exactly as it was.
 */

/** How soon a vessel must arrive to meet the officer's request. */
export interface ApproachWindow {
  readonly hours: number;
  /** Officer-facing phrase, e.g. "within 24 hours". */
  readonly label: string;
  /** True when no period was stated and a default was applied. */
  readonly inferred: boolean;
}

/**
 * Thresholds an officer actually asks for.
 *
 * Free-form hours are accepted, but these are the ones the approach
 * engine is configured around and the ones a request usually names.
 */
export const SUPPORTED_APPROACH_HOURS: readonly number[] = [24, 48, 72];

/** The threshold used when a request asks about approach without saying when. */
export const DEFAULT_APPROACH_HOURS = 72;

/*
 * Forward-looking phrasings only.
 *
 * Deliberately narrow. A pattern loose enough to catch "24 hours"
 * anywhere in a sentence would also catch "in the last 24 hours" and
 * silently turn a historical question into a forward one — the same
 * confusion in the opposite direction.
 */
const FORWARD_RULES: readonly { readonly rx: RegExp; readonly unitHours: number }[] = [
  { rx: /\bwithin\s+(?:the\s+)?(?:next\s+)?(\d+)\s*(?:h|hours?|hrs?)\b/i, unitHours: 1 },
  { rx: /\bin\s+the\s+next\s+(\d+)\s*(?:h|hours?|hrs?)\b/i, unitHours: 1 },
  { rx: /\bnext\s+(\d+)\s*(?:h|hours?|hrs?)\b/i, unitHours: 1 },
  { rx: /\b(\d+)\s*(?:h|hours?|hrs?)\s+from\s+now\b/i, unitHours: 1 },
  { rx: /\bwithin\s+(?:the\s+)?(?:next\s+)?(\d+)\s*days?\b/i, unitHours: 24 },
  { rx: /\bin\s+the\s+next\s+(\d+)\s*days?\b/i, unitHours: 24 },
];

/** Phrases naming a horizon without a number. */
const NAMED_HORIZONS: readonly { readonly rx: RegExp; readonly hours: number }[] = [
  { rx: /\bwithin\s+(?:the\s+)?(?:next\s+)?day\b/i, hours: 24 },
  { rx: /\bin\s+the\s+next\s+day\b/i, hours: 24 },
  { rx: /\btoday\b/i, hours: 24 },
  { rx: /\btomorrow\b/i, hours: 48 },
];

/**
 * Whether the question is asking about a period that has not happened yet.
 *
 * Used to decide whether the recency window should be trusted at all:
 * a forward question's data window is about freshness of position, not
 * about the horizon the officer named.
 */
export function isForwardLooking(raw: string): boolean {
  return readApproachWindow(raw) !== null;
}

/**
 * The approach horizon stated in the question, if there is one.
 *
 * Returns `null` rather than a default, so the caller decides whether an
 * unstated horizon means "use the default" or "this was not an approach
 * question at all". Guessing here would attach a threshold to every
 * sentence that mentioned a number.
 */
export function readApproachWindow(raw: string): ApproachWindow | null {
  /*
   * A historical phrasing wins outright. "In the last 24 hours" contains
   * "24 hours", and without this check the looser forward rules would
   * claim it — turning a question about the past into one about the
   * future, which is the exact defect this module exists to fix.
   */
  if (/\b(last|past|previous|since|ago)\b/i.test(raw)) return null;

  for (const rule of FORWARD_RULES) {
    const match = raw.match(rule.rx);
    if (!match) continue;
    const quantity = Number(match[1]);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const hours = quantity * rule.unitHours;
    return { hours, label: labelFor(hours), inferred: false };
  }

  for (const horizon of NAMED_HORIZONS) {
    if (horizon.rx.test(raw)) {
      return { hours: horizon.hours, label: labelFor(horizon.hours), inferred: false };
    }
  }

  return null;
}

/**
 * The horizon to assess against, defaulting when none was stated.
 *
 * `inferred` is carried through so the interface can tell an officer
 * they are looking at an assumed threshold — the same rule the recency
 * window already follows, for the same reason.
 */
export function approachWindowFor(raw: string): ApproachWindow {
  return (
    readApproachWindow(raw) ?? {
      hours: DEFAULT_APPROACH_HOURS,
      label: labelFor(DEFAULT_APPROACH_HOURS),
      inferred: true,
    }
  );
}

function labelFor(hours: number): string {
  if (hours % 24 === 0 && hours >= 48) return `within ${hours / 24} days`;
  return `within ${hours} hours`;
}
