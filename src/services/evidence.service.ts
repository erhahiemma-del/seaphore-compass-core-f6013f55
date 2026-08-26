/**
 * Evidence service — Supabase-first, with the seed reported as a seed.
 *
 * The Library workspace calls `listEvidence()`. When `public.evidence` has
 * rows we map them onto the enriched UI shape; when the table is empty or
 * unreachable we return the deterministic seed so officers get a
 * live-feel workspace without polluting the DB. Uploads still hit the DB
 * via `recordEvidence()`.
 *
 * ## Why the return value is tagged
 *
 * This used to hand back `EVIDENCE_LIBRARY` from the failure path in the
 * same shape as real rows, so the caller could not tell them apart and
 * the Library presented demonstration fixtures as authoritative evidence
 * — in an application whose first principle is "evidence first". Nothing
 * in the UI was lying on purpose; there was simply no fact available to
 * be honest with.
 *
 * The listing now carries where its rows came from, and why the seed was
 * used when it was. `unavailable` and `empty` stay distinct: a backend
 * that failed and a backend that holds no evidence are different
 * situations, and collapsing them would hide an outage behind "no
 * records yet".
 */
import { supabase } from "@/integrations/supabase/client";
import {
  EVIDENCE_LIBRARY,
  type EvidenceItem,
  KIND_TO_CATEGORY,
  type EvidenceKind,
} from "@/features/evidence/data";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";

interface EvidenceRow {
  id: string;
  investigation_id: string | null;
  evidence_type: string | null;
  source: string | null;
  collected_at: string | null;
  collected_by: string | null;
  storage_path: string | null;
}

function rowToItem(r: EvidenceRow): EvidenceItem {
  const kind = (r.evidence_type as EvidenceKind) ?? "Bill of Lading";
  const category = KIND_TO_CATEGORY[kind] ?? "Documents";
  const uploadedAt = r.collected_at ?? new Date().toISOString();
  const uploader = r.collected_by ?? "System Ingest";
  return {
    id: r.id,
    refNumber: (r.storage_path ?? r.id).split("/").pop() ?? r.id,
    kind,
    category,
    format: "PDF",
    classification: "Official Document",
    source: r.source ?? "Uploaded",
    confidence: "observed" as ConfidenceTier,
    confidenceScore: 80,
    uploadedAt,
    uploadedBy: uploader,
    sizeKb: 128,
    linkedInvestigation: r.investigation_id ?? undefined,
    tags: [kind],
    description: `${kind} ingested from ${r.source ?? "unknown source"}.`,
    custody: [{ step: "Uploaded", at: uploadedAt, by: uploader }],
  };
}

/** Where the rows in a listing came from. */
export type EvidenceSource = "backend" | "fixture";

export interface EvidenceListing {
  readonly items: EvidenceItem[];
  readonly source: EvidenceSource;
  /**
   * Why the fixture stood in. Absent when `source` is `"backend"`.
   *
   * `unavailable` — the query failed or returned nothing at all.
   * `empty` — the backend answered, and holds no evidence.
   */
  readonly reason?: "unavailable" | "empty";
}

/** The seed, labelled as the seed. Exported so callers can show it while asking. */
export const FIXTURE_EVIDENCE_LISTING: EvidenceListing = {
  items: EVIDENCE_LIBRARY,
  source: "fixture",
  reason: "unavailable",
};

export async function listEvidence(): Promise<EvidenceListing> {
  const { data, error } = await supabase
    .from("evidence")
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return { items: EVIDENCE_LIBRARY, source: "fixture", reason: "unavailable" };
  }
  if (data.length === 0) {
    return { items: EVIDENCE_LIBRARY, source: "fixture", reason: "empty" };
  }
  return { items: (data as EvidenceRow[]).map(rowToItem), source: "backend" };
}
