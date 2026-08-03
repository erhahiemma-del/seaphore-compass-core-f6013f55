/**
 * Supabase ingestion for normalized OSINT records.
 *
 * Server-only. Uses the service-role admin client and MUST only be
 * invoked from server functions or scheduled routes.
 *
 * Upsert key: (source_id, source_ref). Newer fetchedAt wins. rawData is
 * always preserved alongside the normalized payload.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorInterface, IngestionError, IngestionResult, SeaphoreRecord } from "./types";
import { validateRecord } from "./pipeline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export async function ingestRecords(
  db: AnyDb,
  connector: ConnectorInterface,
  syncRunId: string,
  records: SeaphoreRecord[],
): Promise<IngestionResult> {
  const errors: IngestionError[] = [];
  const valid: SeaphoreRecord[] = [];

  for (const r of records) {
    const v = validateRecord({ ...r, syncRunId });
    if (v.ok) valid.push(v.record);
    else
      errors.push({ sourceRef: r.sourceRef ?? "unknown", error: v.error, rawPayload: r.rawData });
  }

  let ingested = 0;
  if (valid.length > 0) {
    const rows = valid.map((r) => ({
      source_id: r.sourceId,
      source_ref: r.sourceRef,
      entity_type: r.entityType,
      entity_id: r.entityId,
      data: r.data,
      raw_data: r.rawData,
      confidence: r.confidence,
      confidence_level: r.confidenceLevel,
      fetched_at: r.fetchedAt,
      valid_from: r.validFrom,
      valid_to: r.validTo,
      tags: r.tags,
      sync_run_id: syncRunId,
    }));

    const { data, error } = await db
      .from("osint_records")
      .upsert(rows, { onConflict: "source_id,source_ref", ignoreDuplicates: false })
      .select("id, entity_type, entity_id");

    if (error) {
      // Whole-batch failure: fall back to dead-letter for each row.
      for (const r of valid) {
        errors.push({ sourceRef: r.sourceRef, error: error.message, rawPayload: r.rawData });
      }
    } else {
      ingested = data?.length ?? valid.length;

      // Update the entity index.
      if (data && data.length > 0) {
        const idxRows = data.map((row: { id: string; entity_type: string; entity_id: string }) => ({
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          record_id: row.id,
        }));
        await db
          .from("osint_entity_index")
          .upsert(idxRows, {
            onConflict: "entity_type,entity_id,record_id",
            ignoreDuplicates: true,
          });
      }
    }
  }

  // Dead-letter the failures.
  let deadLettered = 0;
  if (errors.length > 0) {
    const dlqRows = errors.map((e) => ({
      connector_id: null as string | null, // filled by caller if it has the id
      sync_run_id: syncRunId,
      source_ref: e.sourceRef,
      raw_payload: e.rawPayload ?? {},
      error_message: e.error,
      attempts: 1,
    }));
    const { error: dlqErr } = await db.from("osint_dead_letters").insert(dlqRows);
    if (!dlqErr) deadLettered = dlqRows.length;
    // Alert on dead-letter insertion (HR-6 style honest signal).
    console.warn(
      `[OSINT] ${errors.length} record(s) dead-lettered for connector ${connector.name}`,
    );
  }

  return {
    fetched: records.length,
    ingested,
    errors,
    deadLettered,
  };
}
