/**
 * Sprint 7 · Layer 2 — Deduplication.
 *
 * Two items are duplicates when they come from the same source system and
 * share the same claim hash (source + attribute + value + unit).
 * Hash bucketing avoids the O(n²) full-comparison risk.
 *
 * Merge rules (HR-10: grades are never upgraded silently):
 *  - Winner is the highest-confidence duplicate.
 *  - Loser ids are recorded in `mergedFrom` for audit.
 */
import type { ScoredEvidence } from "./types";

export interface DedupResult {
  readonly kept: readonly ScoredEvidence[];
  readonly duplicateCount: number;
}

export function dedupe(items: readonly ScoredEvidence[]): DedupResult {
  const buckets = new Map<string, ScoredEvidence[]>();
  for (const it of items) {
    const key = `${it.sourceSystem}::${it.contentHash}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(it);
    else buckets.set(key, [it]);
  }

  const kept: ScoredEvidence[] = [];
  let duplicates = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      kept.push(bucket[0]);
      continue;
    }
    // Pick the strongest witness in the bucket; record losers' ids.
    const sorted = [...bucket].sort((a, b) => b.confidence - a.confidence);
    const winner = sorted[0];
    const merged = Object.freeze([winner.id, ...sorted.slice(1).map((x) => x.id)]);
    duplicates += bucket.length - 1;
    kept.push(Object.freeze({ ...winner, mergedFrom: merged }));
  }

  return { kept: Object.freeze(kept), duplicateCount: duplicates };
}
