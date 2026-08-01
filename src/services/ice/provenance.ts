/**
 * ICE-10 · Provenance Engine. Builds a plain-language origin chain per
 * matrix cell so an officer can trace any value back to its source. The
 * chain includes the source, the connector, the raw payload hash, the
 * retrieval time, and — when known — the source URL and provider record
 * id from the underlying IAL evidence.
 */

import type { NormalizedEvidence } from "@/services/ial/types";
import type { MatrixCell } from "./types";
import { SOURCE_LABEL } from "./field-config";

export interface ProvenanceChain {
  readonly canonicalId: string;
  readonly fieldName: string;
  readonly fieldValue: unknown;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceUrl?: string;
  readonly retrievedAt: string;
  readonly rawHash?: string;
  readonly providerRecordId?: string;
  readonly excerpt?: string;
  readonly chainIntegrity: boolean;
}

export function buildProvenanceChain(
  cell: MatrixCell,
  evidence: ReadonlyArray<NormalizedEvidence>,
): ProvenanceChain {
  const ev = evidence.find((e) => e.id === cell.evidenceId);
  return {
    canonicalId: cell.canonicalId,
    fieldName: cell.fieldName,
    fieldValue: cell.normalizedValue,
    sourceId: cell.sourceId,
    sourceName: SOURCE_LABEL[cell.sourceId] ?? cell.sourceId,
    sourceUrl: cell.sourceUrl,
    retrievedAt: cell.retrievedAt,
    rawHash: cell.rawHash,
    providerRecordId: ev?.providerRecordId,
    excerpt: ev?.excerpt,
    chainIntegrity: !!ev && ev.hash === cell.rawHash,
  };
}

export function buildQueryProvenance(
  cells: ReadonlyArray<MatrixCell>,
  evidence: ReadonlyArray<NormalizedEvidence>,
): ReadonlyArray<ProvenanceChain> {
  return cells.map((c) => buildProvenanceChain(c, evidence));
}
