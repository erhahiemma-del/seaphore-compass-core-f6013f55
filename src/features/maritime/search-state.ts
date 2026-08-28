/**
 * What the search box knows, and what it refuses to work out for itself.
 *
 * The old search routed text straight into the orchestration pipeline
 * and applied a map plan. This keeps that discipline and extends it: the
 * panel classifies nothing. It calls `understand`, shows what came back,
 * and hands any instruction to the canonical dispatcher.
 *
 * Keyword parsing inside a search component is how the fifth
 * interpretation engine gets built — it always starts as "just a quick
 * check for the word vessel".
 */
import { understand, type QueryUnderstanding } from "@/services/orchestration";
import { commandInput, normalisedText } from "@/services/orchestration/command-input";
import {
  type ResolvableVessel,
  resolveVesselEntity,
} from "@/services/copilot/copilot-conversation";
import {
  translateUnderstanding,
  type Translation,
} from "@/services/copilot/understanding-to-action";
import { allPlaces, type Place } from "@/services/geospatial/places";
import { rankPlaces, PLACE_CLARIFY_THRESHOLD } from "./voice-intent";

/** The categories that have a source behind them today. */
export const SEARCH_CATEGORIES = ["all", "vessels", "places"] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const CATEGORY_LABEL: Readonly<Record<SearchCategory, string>> = {
  all: "All",
  vessels: "Vessels",
  places: "Ports & Locations",
};

export interface VesselHit {
  readonly kind: "vessel";
  readonly imo: string;
  readonly name: string;
  readonly mmsi?: string;
  readonly flag?: string;
  readonly type?: string;
  /**
   * Where the vessel is, when the caller passed a positioned vessel.
   *
   * Carried so selecting from search can also bring the hull into view.
   * Without it the drawer opens on a vessel the map has since scrolled
   * away from and honestly reports it as not loaded — truthful, and
   * useless to the officer who just asked for it.
   */
  readonly coordinates?: readonly [number, number];
}

export interface PlaceHit {
  readonly kind: "place";
  readonly id: string;
  readonly name: string;
}

export type SearchHit = VesselHit | PlaceHit;

export interface SearchReading {
  readonly understanding: QueryUnderstanding;
  readonly translation: Translation;
  readonly hits: readonly SearchHit[];
  /**
   * Whether the reading is worth showing as an interpretation.
   *
   * A bare vessel name is not — the officer typed a name and got a list
   * of vessels, and narrating "understood as: vessel selection" over the
   * top of that is noise. The card earns its place when the engine
   * extracted something the officer did not literally type: a time
   * window, a scope, an intent beyond lookup.
   */
  readonly showInterpretation: boolean;
}

/**
 * Read a query once, for everything the panel needs to draw.
 *
 * Deliberately one pass: the interpretation card, the result list and
 * the action a submission would take all come from the same reading, so
 * the panel cannot show one thing and do another.
 */
export function readQuery(
  raw: string,
  vessels: readonly ResolvableVessel[],
  category: SearchCategory = "all",
): SearchReading | null {
  const text = normalisedText(commandInput(raw, "SEARCH"));
  if (text.length < 2) return null;

  const understanding = understand(text);
  const translation = translateUnderstanding({
    understanding,
    text,
    vessels,
    contextVesselImo: null,
  });

  return {
    understanding,
    translation,
    hits: findHits(text, vessels, category),
    showInterpretation: isInterpretationWorthShowing(understanding, text),
  };
}

function isInterpretationWorthShowing(understanding: QueryUnderstanding, text: string): boolean {
  if (understanding.intent === "unknown") return false;
  // A single word is a lookup, not a question worth narrating back.
  return text.trim().split(/\s+/).length > 1;
}

/**
 * Entities matching what has been typed so far.
 *
 * Prefix matching on names, exact matching on identifiers — the same
 * rules the Copilot resolves by, so typing a name and speaking it find
 * the same hull.
 */
function findHits(
  text: string,
  vessels: readonly ResolvableVessel[],
  category: SearchCategory,
): readonly SearchHit[] {
  const wanted = text.toLowerCase().trim();
  const hits: SearchHit[] = [];

  if (category === "all" || category === "vessels") {
    const exact = resolveVesselEntity(wanted, vessels);
    if (exact.kind === "one") {
      hits.push(vesselHit(vessels.find((v) => v.identity.imo === exact.vessel.imo)!));
    } else {
      for (const vessel of vessels) {
        const identity = vessel.identity;
        const matches =
          identity.name.toLowerCase().startsWith(wanted) ||
          identity.imo.toLowerCase().includes(wanted) ||
          identity.mmsi?.toLowerCase().startsWith(wanted);
        if (matches) hits.push(vesselHit(vessel));
        if (hits.length >= 8) break;
      }
    }
  }

  if (category === "all" || category === "places") {
    /*
     * Places go through the same fuzzy matcher voice uses, so "Apapa"
     * finds Lagos Port Complex whether it is typed or spoken.
     */
    for (const ranked of rankPlaces(wanted).slice(0, 5)) {
      if (ranked.value < PLACE_CLARIFY_THRESHOLD) break;
      hits.push({ kind: "place", id: ranked.place.id, name: ranked.place.name });
    }
  }

  return hits;
}

function vesselHit(vessel: ResolvableVessel): VesselHit {
  const position = (vessel as { position?: { lon: number; lat: number } }).position;
  return {
    kind: "vessel",
    imo: vessel.identity.imo,
    name: vessel.identity.name,
    mmsi: vessel.identity.mmsi,
    flag: vessel.identity.flag,
    coordinates:
      position && Number.isFinite(position.lon) && Number.isFinite(position.lat)
        ? [position.lon, position.lat]
        : undefined,
  };
}

/** Places worth offering before anything has been typed. */
export function suggestedPlaces(): readonly Place[] {
  return allPlaces()
    .filter((place) => place.id !== "world")
    .slice(0, 5);
}

/* ── Recent searches ─────────────────────────────────────────────────── */

const RECENT_KEY = "seaphore.search.recent";
const RECENT_LIMIT = 6;

export interface RecentSearch {
  /** The query as the officer expressed it, replayed through `understand`. */
  readonly text: string;
  readonly at: number;
}

/**
 * Recent searches, stored as text rather than as results.
 *
 * A stored result would be a second source of truth that goes stale the
 * moment the fleet moves. Replaying the text through the same
 * interpretation path means a recent search behaves exactly as it did
 * when it was new — or honestly reports that the vessel has gone.
 */
export function readRecent(): readonly RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentSearch[]).slice(0, RECENT_LIMIT) : [];
  } catch {
    // Private windows and blocked site data both throw here.
    return [];
  }
}

export function rememberSearch(text: string): readonly RecentSearch[] {
  const trimmed = text.trim();
  if (trimmed.length < 2) return readRecent();
  const next = [
    { text: trimmed, at: Date.now() },
    ...readRecent().filter((entry) => entry.text.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Nothing to do; the list simply does not persist. */
  }
  return next;
}

export function clearRecent(): readonly RecentSearch[] {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* As above. */
  }
  return [];
}
