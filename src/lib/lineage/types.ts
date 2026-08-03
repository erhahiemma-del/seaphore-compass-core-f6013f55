/**
 * Evidence Lineage — types.
 *
 * Presentation layer only. The lineage view projects existing backend
 * intelligence (OIE citations, IBE hypotheses, mission context, workspace
 * REJECTED bucket, orchestration conflicts) into an officer-facing
 * chain-of-custody per recommendation. No reasoning happens here.
 *
 * Golden Rule: every intelligence artefact the backend produced must be
 * either projected, intentionally hidden, or explicitly justified as
 * unnecessary. This trace projects the artefacts that explain WHERE each
 * recommendation came from.
 */
import type { EvidenceGrade } from "@/components/copilot/briefing";

/** A single evidence record supporting or contradicting a claim. */
export interface LineageEvidence {
  id: string;
  source: string;
  grade: EvidenceGrade;
  excerpt?: string;
  hash?: string;
  collectedAt?: string;
  /** Which key finding / hypothesis / contradiction referenced this record. */
  referencedBy?: string;
}

/** A pointer into the shared mission / workspace context. */
export interface LineageContextLink {
  kind: "mission_slice" | "hypothesis" | "decision" | "prior_finding" | "entity" | "conversation";
  label: string;
  detail?: string;
  /** Free-form ref (mission slice key, hypothesis id, decision id, entity name). */
  ref?: string;
}

/** Evidence that was rejected, contradicted, or superseded. */
export interface DiscardedEvidence {
  id: string;
  label: string;
  source?: string;
  reason: string;
  /** Where the discard decision came from. */
  origin:
    | "workspace_rejected"
    | "hypothesis_contradicting"
    | "fusion_conflict"
    | "intelligence_gap"
    | "information_needed";
  grade?: EvidenceGrade;
  supersededBy?: string;
}

/** Lineage for one recommendation. */
export interface RecommendationLineage {
  id: string;
  action: string;
  confidenceBadge?: string;
  rationale?: string;
  /** Evidence the recommendation is built on. */
  supporting: LineageEvidence[];
  /** Shared operational state that scoped this recommendation. */
  sharedContext: LineageContextLink[];
  /** Evidence weighed then discarded. */
  discarded: DiscardedEvidence[];
}

/** Lineage trace for an entire briefing. */
export interface LineageTrace {
  briefingId: string;
  query: string;
  generatedAt: string;
  recommendations: RecommendationLineage[];
  /** Discarded evidence that did not attach to a specific recommendation. */
  globalDiscarded: DiscardedEvidence[];
  /** Provenance-level notice explaining how the trace was assembled. */
  notice: string;
}
