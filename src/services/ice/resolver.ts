/**
 * ICE-4 · Entity Resolution (ICE-scoped).
 *
 * The IAL already resolves each record to a canonical entity ref
 * (`vessel:imo:9438291`, `port:unlocode:NGLOS`, …). This module simply
 * groups evidence by that canonical ID so the correlator can walk
 * one entity at a time. New entities discovered in this query are
 * returned so callers can persist them if they wish — ICE itself keeps
 * canonical IDs as opaque text.
 */

import type { CanonicalEntityRef, NormalizedEvidence } from "@/services/ial/types";

export interface Resolution {
  readonly canonicalId: string;
  readonly entity: CanonicalEntityRef;
  readonly evidence: ReadonlyArray<NormalizedEvidence>;
}

export function resolveEntities(
  evidence: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<Resolution> {
  const byId = new Map<string, { entity: CanonicalEntityRef; records: NormalizedEvidence[] }>();
  for (const ev of evidence) {
    const id = ev.entity.id;
    const bucket = byId.get(id);
    if (bucket) bucket.records.push(ev);
    else byId.set(id, { entity: ev.entity, records: [ev] });
  }
  return [...byId.entries()].map(([canonicalId, v]) => ({
    canonicalId,
    entity: v.entity,
    evidence: v.records,
  }));
}
