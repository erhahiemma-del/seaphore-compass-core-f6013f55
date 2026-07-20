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

export function authorityScore(sourceSystem: string, opts: ConfidenceOptions = {}): number {
  const table = opts.authorityOverrides ?? AUTHORITY_WEIGHT;
  const key = sourceSystem;
  return table[key] ?? AUTHORITY_WEIGHT[key] ?? DEFAULT_AUTHORITY;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function score(item: NormalizedEvidence, opts: ConfidenceOptions = {}): ScoredEvidence {
  const gradeWeight = GRADE_WEIGHT[item.grade];
  const authority = authorityScore(item.sourceSystem, opts);
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
