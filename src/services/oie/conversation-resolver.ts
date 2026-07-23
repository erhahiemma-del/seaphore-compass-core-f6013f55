/**
 * OIE · Conversation Resolver.
 *
 * Anaphora / pronoun resolution using mission-context history. When the
 * officer says "it", "this vessel", "who owns it?", the resolver walks
 * the last few conversation turns, finds the most recent salient
 * entity, and rewrites the query for the interpreter downstream.
 *
 * Rule: entity anchoring only. Never modifies the officer's operational
 * verb ("who owns" stays "who owns"). The rewrite is transparent — the
 * resolver returns both the rewritten text and the anchor it used so
 * the response can acknowledge the assumption if needed.
 */
import { containsPronounReference, extractEntities } from "./query-interpreter";
import type { EntityMention, MissionConversationTurn } from "./types";

const PRONOUN_PATTERNS: Array<{ re: RegExp; replacementType: EntityMention["type"] | null }> = [
  { re: /\bthis vessel\b/gi, replacementType: "vessel" },
  { re: /\bthe vessel\b/gi, replacementType: "vessel" },
  { re: /\bthe ship\b/gi, replacementType: "vessel" },
  { re: /\bthat vessel\b/gi, replacementType: "vessel" },
  { re: /\bthis company\b/gi, replacementType: "company" },
  { re: /\bthe company\b/gi, replacementType: "company" },
  { re: /\bthat company\b/gi, replacementType: "company" },
  { re: /\bthis port\b/gi, replacementType: "port" },
  { re: /\bthe port\b/gi, replacementType: "port" },
  { re: /\bthis manifest\b/gi, replacementType: "manifest" },
  { re: /\bthe manifest\b/gi, replacementType: "manifest" },
  // Generic pronouns come last — they match any anchor.
  { re: /\bit\b/gi, replacementType: null },
  { re: /\bthem\b/gi, replacementType: null },
  { re: /\bthey\b/gi, replacementType: null },
  { re: /\btheir\b/gi, replacementType: null },
  { re: /\bits\b/gi, replacementType: null },
  { re: /\bthat one\b/gi, replacementType: null },
];

/**
 * Walks the conversation from most-recent to oldest and returns the
 * last mention that matches `preferType` (if given) or any entity.
 */
export function findAnchor(
  conversation: MissionConversationTurn[],
  preferType?: EntityMention["type"],
): EntityMention | undefined {
  for (let i = conversation.length - 1; i >= 0; i--) {
    const turn = conversation[i];
    const entities = turn.entities ?? extractEntities(turn.text);
    if (entities.length === 0) continue;
    if (preferType) {
      const match = entities.find((e) => e.type === preferType);
      if (match) return match;
    } else {
      // Prefer named entities (vessel > company > port) over IMO/MMSI numbers.
      const named =
        entities.find((e) => e.type === "vessel") ??
        entities.find((e) => e.type === "company") ??
        entities.find((e) => e.type === "port") ??
        entities[0];
      return named;
    }
  }
  return undefined;
}

export interface ResolutionResult {
  resolved: string;
  anchor?: EntityMention;
  changed: boolean;
}

/**
 * Rewrites pronoun references in `raw` using the conversation history.
 * If no pronouns present or no anchor available, returns raw unchanged.
 */
export function resolvePronouns(
  raw: string,
  conversation: MissionConversationTurn[],
): ResolutionResult {
  if (!containsPronounReference(raw)) {
    // Even without pronouns, expose the last anchor so the planner can
    // use it when the officer replies with a bare clarification pick
    // ("manifest", "ownership").
    const bareAnchor = raw.trim().split(/\s+/).length <= 4 ? findAnchor(conversation) : undefined;
    return { resolved: raw, anchor: bareAnchor, changed: false };
  }

  let text = raw;
  let anchor: EntityMention | undefined;
  let changed = false;

  for (const { re, replacementType } of PRONOUN_PATTERNS) {
    if (!re.test(text)) continue;
    const candidate = findAnchor(conversation, replacementType ?? undefined);
    if (!candidate) continue;
    text = text.replace(re, candidate.value);
    anchor = anchor ?? candidate;
    changed = true;
  }

  return { resolved: text, anchor, changed };
}

/**
 * Detects the "bare clarification pick" pattern — a very short reply
 * (1–4 tokens) that matches a skill keyword. When it does, the caller
 * carries the previous anchor forward and prepends the skill verb so
 * the interpreter classifies it correctly (e.g. "manifest" +
 * "Ocean Pearl" → "review manifest for Ocean Pearl").
 */
export function isBareSkillPick(raw: string): string | null {
  const q = raw.trim().toLowerCase();
  if (q.split(/\s+/).length > 4) return null;
  const map: Record<string, string> = {
    manifest: "review manifest for",
    "cargo": "inspect cargo for",
    "ownership": "review ownership for",
    "who owns": "who owns",
    "compliance": "compliance review for",
    "voyage": "compare voyage history for",
    "voyage history": "compare voyage history for",
    "revenue": "revenue assessment for",
    "revenue assessment": "revenue assessment for",
    "full assessment": "executive briefing for",
    "full intelligence assessment": "executive briefing for",
    "executive briefing": "executive briefing for",
  };
  for (const key of Object.keys(map)) {
    if (q === key || q === `the ${key}` || q === `${key} please`) {
      return map[key];
    }
  }
  return null;
}
