/**
 * Entity Resolver — merges records that describe the same real-world
 * entity across providers into a single canonical reference.
 *
 * The canonical id is authoritative: two providers that report on IMO
 * 9438291 will collide on `vessel:imo:9438291` regardless of whether one
 * spelled the vessel "MV Ocean Pearl" and another "OCEAN PEARL".
 */
import type { CanonicalEntityRef, NormalizedEvidence } from "./types";

export interface ResolvedEntities {
  readonly canonical: ReadonlyArray<CanonicalEntityRef>;
  readonly evidenceByEntity: ReadonlyMap<string, ReadonlyArray<NormalizedEvidence>>;
}

export function resolveEntities(records: ReadonlyArray<NormalizedEvidence>): ResolvedEntities {
  const grouped = new Map<string, NormalizedEvidence[]>();
  const labels = new Map<string, string>();
  const kinds = new Map<string, CanonicalEntityRef["kind"]>();

  for (const r of records) {
    const key = r.entity.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
    kinds.set(key, r.entity.kind);
    // Prefer the earliest non-empty label we see; providers vary in casing.
    if (r.entity.label && !labels.has(key)) labels.set(key, r.entity.label);
  }

  const canonical: CanonicalEntityRef[] = [];
  for (const [id, kind] of kinds) {
    canonical.push({ id, kind, label: labels.get(id) });
  }

  return {
    canonical,
    evidenceByEntity: grouped as ReadonlyMap<string, ReadonlyArray<NormalizedEvidence>>,
  };
}
