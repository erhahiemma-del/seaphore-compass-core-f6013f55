/**
 * Sprint 7 · Layer 4 — Confidence Assignment (Layer 2.11 formula).
 *
 *   confidence = gradeWeight × authority × recency
 *
 * - gradeWeight: canonical per Layer 2.9.
 * - authority:   per-source weight (Capability Registry), default 0.7.
 * - recency:     exponential half-life decay with configurable half-life.
 *
 * All outputs are frozen and rounded to 3 decimals for stable comparisons.
 */
import {
  ATTRIBUTE_AUTHORITY,
  AUTHORITY_WEIGHT,
  DEFAULT_AUTHORITY,
  GRADE_WEIGHT,
  type NormalizedEvidence,
  type ScoredEvidence,
} from "./types";

const DAY_MS = 86_400_000;

export interface ConfidenceOptions {
  /** Reference "now" for recency (default: Date.now()). */
  now?: number;
  /** Half-life in days for recency decay (default: 30 days). */
  halfLifeDays?: number;
  /** Optional overrides on the authority table. */
  authorityOverrides?: Readonly<Record<string, number>>;
}

export function recencyScore(collectedAt: string, opts: ConfidenceOptions = {}): number {
  const now = opts.now ?? Date.now();
  const halfLifeDays = opts.halfLifeDays ?? 30;
  const t = Date.parse(collectedAt);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = Math.max(0, (now - t) / DAY_MS);
  const score = Math.pow(0.5, ageDays / halfLifeDays);
  // Clamp — future timestamps score 1.0, ancient records asymptote to 0.
  return Math.min(1, Math.max(0, score));
}

/**
 * Longest attribute prefix in {@link ATTRIBUTE_AUTHORITY} matching `attribute`.
 *
 * Longest wins so a future `vessel.position.satellite` entry can override
 * `vessel.position` without disturbing it. Returns null when the
 * attribute has no property-specific opinion recorded at all.
 */
function attributeAuthorityFor(sourceSystem: string, attribute: string): number | null {
  let best: { length: number; weight: number } | null = null;
  for (const [prefix, table] of Object.entries(ATTRIBUTE_AUTHORITY)) {
    if (attribute !== prefix && !attribute.startsWith(`${prefix}.`)) continue;
    const weight = table[sourceSystem];
    if (weight === undefined) continue;
    if (!best || prefix.length > best.length) best = { length: prefix.length, weight };
  }
  return best?.weight ?? null;
}

/**
 * How much weight a source's claim carries.
 *
 * `attribute` is optional, and omitting it reproduces the original global
 * behaviour exactly — every existing caller is unchanged. Supplying it
 * lets a source be authoritative about one thing and unqualified about
 * another, which is the whole reason M2.8 touched this function: a
 * sanctions provider should not out-rank an AIS feed on a position, and
 * a single global table cannot express that.
 *
 * Precedence, highest first:
 *
 *   1. an explicit `authorityOverrides` entry — the caller's own decision
 *   2. the attribute-specific table, longest matching prefix
 *   3. the global table
 *   4. `DEFAULT_AUTHORITY`
 *
 * Overrides stay on top so a test or a one-off reconciliation can still
 * pin a value without editing the tables.
 */
export function authorityScore(
  sourceSystem: string,
  attributeOrOpts?: string | ConfidenceOptions,
  maybeOpts: ConfidenceOptions = {},
): number {
  const attribute = typeof attributeOrOpts === "string" ? attributeOrOpts : undefined;
  const opts = typeof attributeOrOpts === "string" ? maybeOpts : (attributeOrOpts ?? {});

  const override = opts.authorityOverrides?.[sourceSystem];
  if (override !== undefined) return override;

  if (attribute) {
    const specific = attributeAuthorityFor(sourceSystem, attribute);
    if (specific !== null) return specific;
  }

  return AUTHORITY_WEIGHT[sourceSystem] ?? DEFAULT_AUTHORITY;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function score(item: NormalizedEvidence, opts: ConfidenceOptions = {}): ScoredEvidence {
  const gradeWeight = GRADE_WEIGHT[item.grade];
  // The attribute is passed through, so a source is weighed on what it
  // is actually claiming rather than on a single global reputation.
  const authority = authorityScore(item.sourceSystem, item.attribute, opts);
  const recency = recencyScore(item.collectedAt, opts);
  const confidence = round3(gradeWeight * authority * recency);
  const scored: ScoredEvidence = {
    ...item,
    gradeWeight: round3(gradeWeight),
    authority: round3(authority),
    recency: round3(recency),
    confidence,
    mergedFrom: Object.freeze([item.id]),
    conflictsWith: Object.freeze([] as string[]),
  };
  return Object.freeze(scored);
}

export function scoreAll(
  items: readonly NormalizedEvidence[],
  opts: ConfidenceOptions = {},
): readonly ScoredEvidence[] {
  return Object.freeze(items.map((it) => score(it, opts)));
}
