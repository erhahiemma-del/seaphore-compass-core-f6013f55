/**
 * Knowledge graph edge writer.
 *
 * After a connector ingests a batch, the scheduler calls this to extract
 * relationships (via the connector's `extractEdges` hook) and upserts
 * them into `osint_graph_edges`. Edges are deduped on (from, rel, to).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorInterface, SeaphoreRecord } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export async function writeGraphEdges(
  db: AnyDb,
  connector: ConnectorInterface,
  records: SeaphoreRecord[],
): Promise<number> {
  if (!connector.extractEdges) return 0;

  // Look up ingested record ids so edges can point to their source record.
  const refs = records.map((r) => r.sourceRef);
  const { data: stored } = await db
    .from("osint_records")
    .select("id, source_id, source_ref")
    .eq("source_id", connector.name)
    .in("source_ref", refs);

  const idBySourceRef = new Map<string, string>();
  for (const row of stored ?? []) {
    idBySourceRef.set((row as { source_ref: string }).source_ref, (row as { id: string }).id);
  }

  const edges: Array<Record<string, unknown>> = [];
  for (const record of records) {
    const extracted = connector.extractEdges(record);
    const sourceRecordId = idBySourceRef.get(record.sourceRef) ?? null;
    for (const e of extracted) {
      edges.push({
        from_entity_type: e.fromEntityType,
        from_entity_id: e.fromEntityId,
        relationship: e.relationship,
        to_entity_type: e.toEntityType,
        to_entity_id: e.toEntityId,
        source_record_id: sourceRecordId,
        confidence: e.confidence,
      });
    }
  }

  if (edges.length === 0) return 0;

  const { error } = await db.from("osint_graph_edges").upsert(edges, {
    onConflict: "from_entity_type,from_entity_id,relationship,to_entity_type,to_entity_id",
    ignoreDuplicates: false,
  });
  if (error) {
    console.warn("[OSINT] graph edge upsert failed", error.message);
    return 0;
  }
  return edges.length;
}
