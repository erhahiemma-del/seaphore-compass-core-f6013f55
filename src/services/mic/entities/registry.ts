/**
 * INT-01B — Intelligence Object Registry
 *
 * Typed store for all 20 IntelligenceObject kinds. Sits alongside the
 * existing MicEntityRegistry — does not replace it. Every Intelligence
 * Object is also registered in MicEntityRegistry (base layer);
 * IntelligenceObjectRegistry adds the typed attribute layer on top.
 *
 * Upsert semantics: attribute fields are merged — the highest-grade
 * evidence wins per field (same discipline as the IFE). Null fields
 * from new evidence do not overwrite populated fields from earlier evidence.
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type {
  IntelligenceObject,
  IntelligenceObjectKind,
  IntelligenceObjectBase,
} from "./types";
import type { MicCitation, MicConfidenceTier } from "../types";

const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5, CORROBORATED: 4, OBSERVED: 3, REPORTED: 2, INFERRED: 1, UNKNOWN: 0,
};

function mergeAttributes<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
  incomingGrade: EvidenceGrade,
  existingGrade: EvidenceGrade,
): T {
  const inRank = GRADE_RANK[incomingGrade] ?? 0;
  const exRank = GRADE_RANK[existingGrade] ?? 0;
  const result = { ...existing };
  for (const key of Object.keys(incoming) as Array<keyof T>) {
    const inVal = incoming[key];
    if (inVal === null || inVal === undefined) continue;  // null incoming never overwrites
    const exVal = existing[key];
    if (exVal === null || exVal === undefined) {
      // Populate empty field from any evidence
      result[key] = inVal as T[typeof key];
    } else if (inRank >= exRank) {
      // Higher-grade evidence wins; tie goes to incoming (most recent)
      result[key] = inVal as T[typeof key];
    }
    // else: lower grade evidence does not overwrite populated field
  }
  return result;
}

export class IntelligenceObjectRegistry {
  private readonly store = new Map<string, IntelligenceObject>();
  private readonly byKind = new Map<IntelligenceObjectKind, Set<string>>();
  private _totalRevisions = 0;

  /**
   * Upsert an Intelligence Object. On first registration, stores it
   * verbatim. On subsequent registrations, merges attributes per the
   * grade-wins rule.
   */
  upsert(obj: IntelligenceObject): IntelligenceObject {
    const existing = this.store.get(obj.objectId);
    let merged: IntelligenceObject;

    if (!existing || existing.objectKind !== obj.objectKind) {
      merged = obj;
    } else {
      const base: IntelligenceObjectBase = {
        objectId:     obj.objectId,
        objectKind:   obj.objectKind,
        label:        obj.label || existing.label,
        aliases:      dedupe([...existing.aliases, ...obj.aliases]),
        confidence:   betterTier(existing.confidence, obj.confidence),
        grade:        betterGrade(existing.grade, obj.grade),
        citations:    dedupe([...existing.citations, ...obj.citations], (c) => c.evidenceId),
        sourceUipIds: dedupe([...existing.sourceUipIds, ...obj.sourceUipIds]),
        firstSeenAt:  earlier(existing.firstSeenAt, obj.firstSeenAt),
        lastSeenAt:   later(existing.lastSeenAt, obj.lastSeenAt),
        revision:     existing.revision + 1,
      };
      // Merge attributes — type-safe via the discriminated union
      merged = {
        ...base,
        objectKind: existing.objectKind,
        attributes: mergeAttributes(
          existing.attributes as Record<string, unknown>,
          obj.attributes as Partial<Record<string, unknown>>,
          obj.grade,
          existing.grade,
        ),
      } as unknown as IntelligenceObject;
    }

    this.store.set(obj.objectId, merged);
    this._totalRevisions++;

    // Index by kind
    const kindSet = this.byKind.get(obj.objectKind) ?? new Set<string>();
    kindSet.add(obj.objectId);
    this.byKind.set(obj.objectKind, kindSet);

    return merged;
  }

  get(id: string): IntelligenceObject | undefined {
    return this.store.get(id);
  }

  getByKind<K extends IntelligenceObjectKind>(
    kind: K,
  ): ReadonlyArray<Extract<IntelligenceObject, { objectKind: K }>> {
    const ids = this.byKind.get(kind);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.store.get(id))
      .filter((o): o is Extract<IntelligenceObject, { objectKind: K }> =>
        o?.objectKind === kind,
      );
  }

  getAll(): ReadonlyArray<IntelligenceObject> {
    return Array.from(this.store.values());
  }

  get size(): number { return this.store.size; }
  get totalRevisions(): number { return this._totalRevisions; }

  stats(): Record<IntelligenceObjectKind, number> {
    const result = {} as Record<IntelligenceObjectKind, number>;
    for (const [kind, ids] of this.byKind) result[kind] = ids.size;
    return result;
  }

  clear(): void {
    this.store.clear();
    this.byKind.clear();
    this._totalRevisions = 0;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function dedupe<T>(arr: T[], key?: (t: T) => unknown): T[] {
  if (!key) return Array.from(new Set(arr));
  const seen = new Set<unknown>();
  return arr.filter((item) => { const k = key(item); if (seen.has(k)) return false; seen.add(k); return true; });
}

function betterGrade(a: EvidenceGrade, b: EvidenceGrade): EvidenceGrade {
  return (GRADE_RANK[a] ?? 0) >= (GRADE_RANK[b] ?? 0) ? a : b;
}

const TIER_RANK: Record<MicConfidenceTier, number> = { VERY_HIGH: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
function betterTier(a: MicConfidenceTier, b: MicConfidenceTier): MicConfidenceTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
