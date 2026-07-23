/**
 * Evidence correlation.
 *
 * Groups normalised records by canonical entity, then by field. Records
 * that describe the same vessel/voyage/cargo/company/owner/port/manifest
 * end up in the same bucket regardless of which provider supplied them,
 * because the IAL already normalised entity ids (e.g.
 * `vessel:imo:9438291`, `port:unlocode:NGLOS`).
 */
import type { CanonicalEntityRef, NormalizedEvidence } from "@/services/ial/types";

export interface EntityBucket {
  readonly entity: CanonicalEntityRef;
  readonly records: NormalizedEvidence[];
  /** field -> records that mention that field */
  readonly byField: Map<string, NormalizedEvidence[]>;
}

export function correlate(records: ReadonlyArray<NormalizedEvidence>): EntityBucket[] {
  const buckets = new Map<string, EntityBucket>();
  for (const r of records) {
    const key = r.entity.id;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        entity: r.entity,
        records: [],
        byField: new Map(),
      };
      buckets.set(key, bucket);
    }
    bucket.records.push(r);
    for (const field of Object.keys(r.fields)) {
      let arr = bucket.byField.get(field);
      if (!arr) {
        arr = [];
        bucket.byField.set(field, arr);
      }
      arr.push(r);
    }
  }
  return Array.from(buckets.values());
}
