/**
 * Government evidence lineage (Sprint EP-GOV-01).
 *
 * Every authoritative record carries a full chain from the agency
 * endpoint to the officer surface, so an officer can always answer
 * "where did this come from?" without leaving the briefing.
 *
 * Pure functions, no state, no persistence.
 */
import { stableHash } from "@/services/ial/hash";
import type { GovernmentEvidenceRecord } from "./types";

export interface LineageStep {
  readonly stage:
    | "agency-endpoint"
    | "adapter-mapping"
    | "canonical-normalisation"
    | "validation"
    | "confidence-scoring"
    | "evidence-package"
    | "officer-projection";
  readonly detail: string;
}

export interface GovernmentLineage {
  readonly evidenceId: string;
  readonly agency: string;
  readonly agencyName: string;
  readonly recordType: string;
  readonly agencyRecordId: string;
  /** Hash over the raw agency payload — stable citation anchor. */
  readonly payloadHash: string;
  readonly retrievedAt: string;
  readonly chain: ReadonlyArray<LineageStep>;
}

export function buildLineage(
  record: GovernmentEvidenceRecord,
  opts: { evidenceId: string; retrievedAt: string; endpointEnv: string },
): GovernmentLineage {
  return {
    evidenceId: opts.evidenceId,
    agency: record.agency,
    agencyName: record.agencyName,
    recordType: record.recordType,
    agencyRecordId: record.recordId,
    payloadHash: stableHash(record.raw ?? record.fields),
    retrievedAt: opts.retrievedAt,
    chain: [
      {
        stage: "agency-endpoint",
        detail: `${record.agencyName} API (${opts.endpointEnv}) returned ${record.recordType} ${record.recordId}`,
      },
      {
        stage: "adapter-mapping",
        detail: `${record.agency} Government Adapter translated the agency payload into the neutral government vocabulary`,
      },
      {
        stage: "canonical-normalisation",
        detail: "Frozen normalizeRecord() produced CAPABILITY.CARGO v1.0 canonical fields",
      },
      {
        stage: "validation",
        detail: "Frozen validateRecords() flagged issues without discarding the record",
      },
      {
        stage: "confidence-scoring",
        detail:
          "Cargo Confidence Model scored authority, completeness, corroboration and freshness",
      },
      {
        stage: "evidence-package",
        detail: "Record placed in the canonical EvidencePackage handed to the IAL",
      },
      {
        stage: "officer-projection",
        detail:
          "Projected to the Cargo Intelligence Workspace with its confidence chip and citation",
      },
    ],
  };
}
