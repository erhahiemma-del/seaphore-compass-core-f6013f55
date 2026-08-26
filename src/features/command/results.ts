/**
 * Turning rows into an answer.
 *
 * The second half of the command pipeline: score what came back, group
 * it, and describe what happened when nothing did. Pure — the caller
 * supplies rows from the entity repository, and this decides only how
 * they read.
 *
 * ## Ranking is evidence about the match, never a guess about the entity
 *
 * Every signal below is a property of how the query relates to the row:
 * whether the identifier matched exactly, whether the name starts with
 * the term, whether it was an alias rather than the primary name. None
 * of it invents relevance the data does not support, and none of it is a
 * risk or importance judgement — `risk_score` is deliberately not a
 * ranking input, because "most relevant to what I typed" and "most
 * dangerous" are different questions and conflating them would bury an
 * exact match under an unrelated high-risk vessel.
 *
 * ## Mode reorders and never filters
 *
 * The lens boosts the kinds it cares about. It cannot remove a kind:
 * search stays universal, so an officer in Revenue Assurance who types a
 * port name still finds the port. The same rule the KPI tiering follows —
 * demote, never conceal.
 */
import type { EntityKind } from "@/types/entity.types";
import type { MissionMode } from "@/features/mission-control/modes";

import type { CommandQuery } from "./query";
import { isIdentifier } from "./query";

/* ═══════════ What a row looks like ═══════════ */

/**
 * The fields this reads from an `entities` row.
 *
 * A structural subset rather than the generated row type, so the model
 * stays testable without a database and so it is obvious at a glance
 * exactly which columns the command surface depends on.
 */
export interface CommandEntityRow {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly aliases?: readonly string[] | null;
  readonly confidence?: string | null;
  readonly source_name?: string | null;
  /** Evidence records already linked to this entity. Real, or absent. */
  readonly evidence_ids?: readonly string[] | null;
}

export interface CommandResult {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  /** Which alias matched, when the hit was not on the primary name. */
  readonly matchedAlias?: string;
  /** Confidence as the row records it. Never computed here. */
  readonly confidence?: string;
  /** Source as the row records it. */
  readonly source?: string;
  /**
   * Linked evidence count, or undefined when the column is absent.
   *
   * Undefined and 0 are different: one means the row does not carry the
   * column, the other means it carries an empty list. The surface must
   * be able to tell them apart rather than printing "0 evidence" for a
   * question nobody asked.
   */
  readonly evidenceCount?: number;
  /** Ranking score. Exposed so ordering is inspectable in tests. */
  readonly score: number;
}

export interface CommandResultGroup {
  readonly kind: string;
  readonly results: readonly CommandResult[];
}

/* ═══════════ Availability ═══════════ */

/**
 * Why there are no results.
 *
 * Nine distinct states, because collapsing them is how an officer comes
 * to believe an empty screen means "nothing exists". "No vessel matches
 * that IMO", "you are not signed in" and "the provider is offline" are
 * three completely different instructions to the person reading them.
 */
export type CommandSearchState =
  | { readonly state: "idle" }
  | { readonly state: "typing" }
  | { readonly state: "searching" }
  | {
      readonly state: "results";
      readonly groups: readonly CommandResultGroup[];
      readonly total: number;
    }
  | { readonly state: "no-match"; readonly query: string }
  | { readonly state: "auth-required" }
  | { readonly state: "permission-denied" }
  | { readonly state: "source-unavailable"; readonly detail?: string }
  | { readonly state: "failed"; readonly detail?: string };

export const COMMAND_STATE_LABELS: Readonly<Record<string, string>> = {
  idle: "Search IMO / MMSI / Vessel / Company / Cargo / Manifest / Port / Location / Event",
  typing: "Keep typing…",
  searching: "Searching…",
  // Borrowed in spirit from the MCP tool's wording, which gets this
  // exactly right: absence of a record is not proof of absence.
  "no-match": "No matching entity. This is an evidence gap, not a confirmation of absence.",
  "auth-required": "Sign in to search the entity registry",
  "permission-denied": "You do not have permission to read entities",
  "source-unavailable": "Entity source unavailable",
  failed: "Search failed",
};

/* ═══════════ Mode affinity ═══════════ */

/**
 * Entity kinds each lens leads with.
 *
 * A boost, not a filter. Kinds absent from a lens's list still appear —
 * they simply sort below the ones the officer is most likely to be
 * looking for from that perspective.
 */
const MODE_AFFINITY: Readonly<Record<string, readonly EntityKind[]>> = {
  "national-picture": ["port", "vessel"],
  "vessel-operations": ["vessel", "voyage"],
  "revenue-assurance": ["manifest", "cargo_item", "container", "company"],
  "risk-compliance": ["company", "vessel"],
  investigation: ["vessel", "company", "document"],
  "port-intelligence": ["port", "voyage"],
  "decision-coordination": ["document", "manifest"],
  "strategic-intelligence": ["company", "port"],
};

export function modeAffinity(mode: MissionMode): readonly EntityKind[] {
  return MODE_AFFINITY[mode.id] ?? [];
}

/* ═══════════ Scoring ═══════════ */

const EXACT = 1000;
const ALIAS_EXACT = 900;
const PREFIX = 500;
const CONTAINS = 250;
const ALIAS_CONTAINS = 200;

/** Affinity is a nudge, never enough to outrank a better textual match. */
const AFFINITY_BOOST = 60;
const AFFINITY_RUNNER_UP = 30;

function textScore(row: CommandEntityRow, term: string): number {
  const name = row.name.toLowerCase();
  const q = term.toLowerCase();
  if (!q) return 0;

  if (name === q) return EXACT;

  const aliases = (row.aliases ?? []).map((a) => a.toLowerCase());
  if (aliases.includes(q)) return ALIAS_EXACT;
  if (name.startsWith(q)) return PREFIX;
  if (name.includes(q)) return CONTAINS;
  if (aliases.some((a) => a.includes(q))) return ALIAS_CONTAINS;

  /*
   * Returned by the server's `ilike`/alias filter but matching neither
   * here — possible when the term contains characters the two treat
   * differently. Kept with a floor score rather than discarded: the
   * database matched it, and silently dropping a row the source
   * considered relevant would be this layer overruling it.
   */
  return 1;
}

function affinityScore(kind: string, affinity: readonly EntityKind[]): number {
  const index = affinity.indexOf(kind as EntityKind);
  if (index === 0) return AFFINITY_BOOST;
  if (index > 0) return AFFINITY_RUNNER_UP;
  return 0;
}

function matchedAliasOf(row: CommandEntityRow, term: string): string | undefined {
  const q = term.toLowerCase();
  if (!q || row.name.toLowerCase().includes(q)) return undefined;
  return (row.aliases ?? []).find((a) => a.toLowerCase().includes(q));
}

/**
 * Score and order rows for a query under a lens.
 *
 * Identifier queries score on the identifier itself; a name query scores
 * on the name. Both run through the same path because an IMO *is* the
 * text the officer typed — the difference is that an identifier match is
 * expected to be exact, which the scoring already rewards.
 */
export function rankResults(
  rows: readonly CommandEntityRow[],
  query: CommandQuery,
  mode: MissionMode,
): readonly CommandResult[] {
  const affinity = modeAffinity(mode);
  const term = query.normalized;

  return rows
    .map((row) => ({
      id: row.id,
      kind: row.type,
      title: row.name,
      matchedAlias: matchedAliasOf(row, term),
      confidence: row.confidence ?? undefined,
      source: row.source_name ?? undefined,
      evidenceCount: row.evidence_ids ? row.evidence_ids.length : undefined,
      score: textScore(row, term) + affinityScore(row.type, affinity),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/**
 * Group ranked results by kind, keeping the strongest group first.
 *
 * Groups are ordered by their best member rather than by size, so one
 * exact vessel match still leads a list containing nine partial company
 * matches — which is what the officer meant when they typed the IMO.
 */
export function groupResults(results: readonly CommandResult[]): readonly CommandResultGroup[] {
  const byKind = new Map<string, CommandResult[]>();
  for (const r of results) {
    const list = byKind.get(r.kind);
    if (list) list.push(r);
    else byKind.set(r.kind, [r]);
  }
  return [...byKind.entries()]
    .map(([kind, list]) => ({ kind, results: list }))
    .sort((a, b) => (b.results[0]?.score ?? 0) - (a.results[0]?.score ?? 0));
}

/**
 * Build the search state from rows.
 *
 * An empty result set for a real query is `no-match` — never an empty
 * results list, which the surface would render as a blank panel that
 * says nothing.
 */
export function toSearchState(
  rows: readonly CommandEntityRow[],
  query: CommandQuery,
  mode: MissionMode,
): CommandSearchState {
  if (query.kind === "empty") return { state: "idle" };
  const ranked = rankResults(rows, query, mode);
  if (ranked.length === 0) return { state: "no-match", query: query.normalized };
  return { state: "results", groups: groupResults(ranked), total: ranked.length };
}

/** Minimum characters before a free-text search is worth running. */
export const MIN_FREE_TEXT_LENGTH = 2;

/**
 * Whether a query is worth sending.
 *
 * Identifiers are searched at full length whatever that is — a
 * seven-digit IMO is complete on the seventh character. Free text waits
 * for two, because one letter matches most of the registry and costs a
 * round trip to say so.
 */
export function isSearchable(query: CommandQuery): boolean {
  if (query.kind === "empty") return false;
  if (isIdentifier(query.kind)) return true;
  return query.normalized.length >= MIN_FREE_TEXT_LENGTH;
}
