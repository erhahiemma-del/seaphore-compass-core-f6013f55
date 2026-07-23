/**
 * Conflict detection.
 *
 * For each (entity, field) group, determine whether the providers agree.
 * Values are compared after Seaphore canonicalisation (already done by the
 * IAL normalizer), so string/number equality is sufficient. Arrays are
 * compared as sorted joined strings — order should not create a false
 * conflict.
 */
import type { EvidenceFieldValue, NormalizedEvidence } from "@/services/ial/types";

export interface FieldDisagreement {
  readonly field: string;
  readonly groups: ReadonlyArray<{
    readonly value: EvidenceFieldValue;
    readonly records: ReadonlyArray<NormalizedEvidence>;
  }>;
}

export function detectDisagreements(
  byField: Map<string, NormalizedEvidence[]>,
): FieldDisagreement[] {
  const out: FieldDisagreement[] = [];
  for (const [field, records] of byField.entries()) {
    const buckets = new Map<string, { value: EvidenceFieldValue; records: NormalizedEvidence[] }>();
    for (const r of records) {
      const v = r.fields[field] ?? null;
      const k = valueKey(v);
      let b = buckets.get(k);
      if (!b) {
        b = { value: v, records: [] };
        buckets.set(k, b);
      }
      b.records.push(r);
    }
    if (buckets.size > 1) {
      out.push({ field, groups: Array.from(buckets.values()) });
    }
  }
  return out;
}

export function valueKey(v: EvidenceFieldValue): string {
  if (v === null || v === undefined) return "\0null";
  if (Array.isArray(v)) return "\0arr:" + [...v].map(String).sort().join("|");
  if (typeof v === "number") return "\0num:" + v.toString();
  if (typeof v === "boolean") return "\0bool:" + (v ? "1" : "0");
  return "\0str:" + v.toString().trim().toLowerCase();
}
