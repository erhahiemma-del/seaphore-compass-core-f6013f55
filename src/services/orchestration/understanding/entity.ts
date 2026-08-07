/**
 * Orchestration — entity resolution.
 *
 * Extracts the things a question is *about*. Extraction only: this never
 * looks an entity up, never decides whether it exists, and never attaches
 * intelligence to it. A name in a question is a name in a question until
 * some connector says otherwise.
 *
 * `confidence` here grades the extraction. An IMO number is unambiguous; a
 * capitalised phrase is a guess, and scores like one.
 */
import type { EntityKind, ResolvedEntity } from "./types";

/** ISO 6346 container number, e.g. MSCU1234567. */
const CONTAINER = /\b([A-Z]{3}[UJZ])\s?(\d{7})\b/g;
/** 7-digit IMO, with or without the prefix. */
const IMO = /\bimo\s*(?:no\.?|number)?\s*:?\s*(\d{7})\b|\b(\d{7})\b/gi;
/** 9-digit MMSI. */
const MMSI = /\bmmsi\s*:?\s*(\d{9})\b/gi;

/** Vessel name prefixes, e.g. "MV Ocean Pearl". */
const VESSEL_PREFIXED = /\b(?:mv|m\/v|mt|m\/t|ss|fv)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/gi;

/** Corporate suffixes and markers. */
const COMPANY =
  /\b([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*)*)\s+(ltd|limited|plc|llc|inc|gmbh|b\.?v\.?|s\.?a\.?|pte|group|holdings?|shipping|lines?|maritime|marine)\b/gi;

/** Nigerian ports the platform covers, plus the generic "port of X" form. */
const KNOWN_PORTS = /\b(apapa|tin ?can|onne|calabar|warri|bonny|escravos|lagos|port harcourt)\b/gi;
const PORT_OF = /\bport of\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/gi;

/** A bare capitalised multi-word phrase. In this console, usually a vessel. */
const PROPER_PHRASE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+)\b/g;

/**
 * Words that look like proper nouns at the head of a sentence but name no
 * entity. Without this, "Show Vessels Owned By Maersk" yields "Show
 * Vessels" as a vessel.
 */
const STOP_PHRASES = new Set([
  "show me",
  "find all",
  "list all",
  "give me",
  "tell me",
  "what vessels",
  "which vessels",
  "show vessels",
  "executive brief",
  "port state control",
]);

function push(out: ResolvedEntity[], seen: Set<string>, entity: ResolvedEntity): void {
  const key = `${entity.kind}:${entity.text.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(entity);
}

/**
 * Extract every entity named in a question, most confidently-identified
 * first.
 *
 * Identifiers are only populated when the text actually carried one. A
 * vessel named but not numbered gets `identifier: null` rather than a
 * lookup — resolving a name to an IMO is an intelligence operation with its
 * own confidence, and it belongs to the connectors, not to a regex.
 */
export function resolveEntities(raw: string): readonly ResolvedEntity[] {
  const text = raw.trim();
  const out: ResolvedEntity[] = [];
  const seen = new Set<string>();
  if (text.length < 2) return out;

  // ── Identifiers: unambiguous, so highest confidence ─────────────
  for (const m of text.matchAll(CONTAINER)) {
    push(out, seen, {
      kind: "container",
      text: m[0],
      identifier: `${m[1]}${m[2]}`,
      identifierKind: "container",
      confidence: 0.98,
    });
  }

  for (const m of text.matchAll(MMSI)) {
    push(out, seen, {
      kind: "vessel",
      text: m[0],
      identifier: m[1],
      identifierKind: "mmsi",
      confidence: 0.98,
    });
  }

  for (const m of text.matchAll(IMO)) {
    const digits = m[1] ?? m[2];
    if (!digits) continue;
    // A bare 7-digit run is only probably an IMO; a prefixed one is certain.
    const prefixed = Boolean(m[1]);
    push(out, seen, {
      kind: "vessel",
      text: m[0].trim(),
      identifier: digits,
      identifierKind: "imo",
      confidence: prefixed ? 0.98 : 0.75,
    });
  }

  // ── Named entities ──────────────────────────────────────────────
  for (const m of text.matchAll(VESSEL_PREFIXED)) {
    push(out, seen, {
      kind: "vessel",
      text: m[1].trim(),
      identifier: null,
      identifierKind: null,
      confidence: 0.9,
    });
  }

  for (const m of text.matchAll(COMPANY)) {
    push(out, seen, {
      kind: "company",
      text: `${m[1]} ${m[2]}`.trim(),
      identifier: null,
      identifierKind: null,
      confidence: 0.85,
    });
  }

  for (const m of text.matchAll(KNOWN_PORTS)) {
    push(out, seen, {
      kind: "port",
      text: m[1],
      identifier: null,
      identifierKind: null,
      confidence: 0.88,
    });
  }

  for (const m of text.matchAll(PORT_OF)) {
    push(out, seen, {
      kind: "port",
      text: m[1].trim(),
      identifier: null,
      identifierKind: null,
      confidence: 0.85,
    });
  }

  // ── Bare proper phrases, last and least confident ───────────────
  // Only consulted when nothing better was found: a capitalised phrase is
  // weak evidence, and treating it as strong is how an unrelated question
  // ends up anchored to whichever vessel was mentioned in passing.
  if (out.length === 0) {
    for (const m of text.matchAll(PROPER_PHRASE)) {
      const phrase = m[1].trim();
      if (STOP_PHRASES.has(phrase.toLowerCase())) continue;
      push(out, seen, {
        kind: "vessel",
        text: phrase,
        identifier: null,
        identifierKind: null,
        confidence: 0.45,
      });
    }
  }

  return [...out].sort((a, b) => b.confidence - a.confidence);
}

/**
 * The entity the workspace should centre on.
 *
 * Prefers the kind the intent is about — a company question centres on the
 * company even when a vessel is also named — then falls back to the most
 * confidently extracted entity.
 */
export function primaryEntityFor(
  entities: readonly ResolvedEntity[],
  preferred: EntityKind | null,
): ResolvedEntity | null {
  if (entities.length === 0) return null;
  if (preferred) {
    const match = entities.find((e) => e.kind === preferred);
    if (match) return match;
  }
  return entities[0];
}
