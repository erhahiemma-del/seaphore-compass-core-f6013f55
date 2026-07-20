/**
 * Sprint 7 · Layer 3 — Conflict Detection.
 *
 * Two evidence atoms conflict when they describe the SAME (entity, attribute)
 * with DIFFERENT canonical values AND come from DIFFERENT source systems.
 * BOTH sides are preserved — nothing is discarded. Ids are cross-linked into
 * `conflictsWith` so the Reasoning Engine can present each side.
 */
import type { EvidenceConflict, ScoredEvidence } from "./types";

export interface ConflictResult {
  readonly items: readonly ScoredEvidence[];
  readonly conflicts: readonly EvidenceConflict[];
}

function valuesDiffer(a: ScoredEvidence["value"], b: ScoredEvidence["value"]): boolean {
  if (typeof a === "number" && typeof b === "number") {
    // Small tolerance for float noise; anything above is a real disagreement.
    return Math.abs(a - b) > 1e-6;
  }
  return a !== b;
}

export function detectConflicts(items: readonly ScoredEvidence[]): ConflictResult {
  const conflictsById = new Map<string, Set<string>>();
  const conflicts: EvidenceConflict[] = [];

  // Bucket by (attribute, entityId) — only compare within these buckets.
  const buckets = new Map<string, ScoredEvidence[]>();
  for (const it of items) {
    for (const entityId of it.entityIds) {
      const key = `${it.attribute}::${entityId}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(it);
      else buckets.set(key, [it]);
    }
  }

  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const [attribute, entityId] = key.split("::");
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (a.sourceSystem === b.sourceSystem) continue;
        if (!valuesDiffer(a.value, b.value)) continue;
        conflicts.push({
          attribute,
          entityId,
          a,
          b,
          reason: `Contradictory ${attribute} for ${entityId}: ${JSON.stringify(a.value)} (${a.sourceSystem}) vs ${JSON.stringify(b.value)} (${b.sourceSystem})`,
        });
        for (const [x, y] of [
          [a.id, b.id],
          [b.id, a.id],
        ]) {
          const set = conflictsById.get(x) ?? new Set<string>();
          set.add(y);
          conflictsById.set(x, set);
        }
      }
    }
  }

  const annotated = items.map((it) => {
    const links = conflictsById.get(it.id);
    if (!links || links.size === 0) return it;
    return Object.freeze({ ...it, conflictsWith: Object.freeze([...links]) });
  });

  return { items: Object.freeze(annotated), conflicts: Object.freeze(conflicts) };
}
