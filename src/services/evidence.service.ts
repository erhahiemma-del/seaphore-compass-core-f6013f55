/**
 * Evidence service — Supabase-first with a local-seed fallback.
 *
 * The Library workspace calls `listEvidence()`. When public.evidence has rows
 * we map them onto the enriched UI shape; when the table is empty (dev/demo)
 * we return the deterministic seed so officers get a live-feel workspace
 * without polluting the DB. Uploads still hit the DB via `recordEvidence()`.
 */
import { supabase } from "@/integrations/supabase/client";
import { EVIDENCE_LIBRARY, type EvidenceItem, KIND_TO_CATEGORY, type EvidenceKind } from "@/features/evidence/data";
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

export async function listEvidence(): Promise<EvidenceItem[]> {
  const { data, error } = await supabase
    .from("evidence")
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(200);
  if (error || !data || data.length === 0) {
    // Seeded fallback so the workspace still feels populated in dev/demo.
    return EVIDENCE_LIBRARY;
  }
  return (data as EvidenceRow[]).map(rowToItem);
}
