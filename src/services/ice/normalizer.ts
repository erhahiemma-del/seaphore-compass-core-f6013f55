/**
 * ICE-3 · Normaliser (ICE-scoped).
 *
 * The IAL already returns canonical-ish fields. This layer folds any
 * provider-native aliases the IAL passed through into a single set of
 * Seaphore-canonical field names, so downstream correlation compares
 * apples to apples across sources.
 *
 * Unknown fields are preserved on the evidence's `fields` map so nothing
 * is silently dropped.
 */

import type { NormalizedEvidence } from "@/services/ial/types";
import { FIELD_ALIASES } from "./field-config";

const ALIAS_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const { canonical, aliases } of FIELD_ALIASES) {
    m.set(canonical, canonical);
    for (const a of aliases) m.set(a, canonical);
  }
  return m;
})();

export function normaliseFieldName(field: string): string {
  return ALIAS_TO_CANONICAL.get(field) ?? field;
}

export function normaliseEvidence(ev: NormalizedEvidence): NormalizedEvidence {
  const out: Record<string, NormalizedEvidence["fields"][string]> = {};
  for (const [k, v] of Object.entries(ev.fields)) {
    const canonical = normaliseFieldName(k);
    // If both alias and canonical exist, keep the canonical value.
    if (!(canonical in out)) out[canonical] = v;
  }
  return { ...ev, fields: out };
}

export function normaliseAll(
  evidence: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<NormalizedEvidence> {
  return evidence.map(normaliseEvidence);
}
