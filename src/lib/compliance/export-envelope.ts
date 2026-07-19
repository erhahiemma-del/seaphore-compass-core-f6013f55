/**
 * HR-7 — Every export (PDF, Word, Brief, Pack) automatically and irremovably
 * includes:
 *   • Evidence list with sources
 *   • Confidence levels for all data
 *   • Complete audit trail
 *   • Officer name and role
 *   • Date, time, and WAT timestamp
 *
 * Callers pass the *body* of the export. `buildExportEnvelope` wraps the body
 * with the mandatory envelope. Downstream renderers (PDF/Word/Brief) MUST
 * accept only `ExportPackage` produced by this function.
 */

import { SEAPHORE_OATH } from "./rules";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";

export interface EvidenceItem {
  id: string;
  label: string;
  sourceId: string; // registered in authoritative-sources when verified
  sourceName: string;
  tier: ConfidenceTier;
  retrievedAt: string; // ISO 8601 UTC
}

export interface AuditEntry {
  at: string; // ISO 8601 UTC
  officerId: string;
  officerName: string;
  action: string;
  entity: string;
  ip: string;
}

export interface OfficerIdentity {
  id: string;
  name: string;
  role: string;
}

export interface ExportBody {
  kind: "pdf" | "word" | "brief" | "pack";
  title: string;
  html?: string;
  data?: unknown;
}

export interface ExportEnvelope {
  generatedAtUtc: string;
  generatedAtWat: string;
  officer: OfficerIdentity;
  evidence: readonly EvidenceItem[];
  audit: readonly AuditEntry[];
  oath: typeof SEAPHORE_OATH;
}

export interface ExportPackage {
  envelope: ExportEnvelope;
  body: ExportBody;
}

/** West Africa Time is UTC+1 with no DST. */
function toWat(iso: string): string {
  const d = new Date(iso);
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  return wat.toISOString().replace("Z", "+01:00");
}

export function buildExportEnvelope(input: {
  officer: OfficerIdentity;
  evidence: readonly EvidenceItem[];
  audit: readonly AuditEntry[];
  body: ExportBody;
  now?: string;
}): ExportPackage {
  const now = input.now ?? new Date().toISOString();

  if (!input.officer?.id || !input.officer.name || !input.officer.role) {
    throw new Error("[HR-7] Export envelope requires officer id, name, and role.");
  }
  if (input.evidence.length === 0) {
    throw new Error(
      "[HR-7] Export envelope requires at least one evidence item. " +
        "An export without evidence violates the honesty contract.",
    );
  }
  if (input.audit.length === 0) {
    throw new Error("[HR-7] Export envelope requires the audit trail for this artefact.");
  }
  for (const e of input.evidence) {
    if (!e.sourceName || !e.tier) {
      throw new Error(`[HR-7] Evidence item ${e.id} missing sourceName or confidence tier.`);
    }
  }

  return {
    envelope: Object.freeze({
      generatedAtUtc: now,
      generatedAtWat: toWat(now),
      officer: Object.freeze({ ...input.officer }),
      evidence: Object.freeze([...input.evidence]),
      audit: Object.freeze([...input.audit]),
      oath: SEAPHORE_OATH,
    }),
    body: Object.freeze({ ...input.body }),
  };
}
