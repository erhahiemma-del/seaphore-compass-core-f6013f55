/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A.3 — Intelligence Provenance & Explainability Framework (IPEF)
 *  types.ts — Canonical type vocabulary
 * ─────────────────────────────────────────────────────────────────────
 *
 *  IPEF is a platform-level capability, not a MIC feature.
 *  Any current or future intelligence engine registers with IPEF
 *  through the IpefContributor interface — no engine-specific code here.
 *
 *  Design principles:
 *    • Facts only. No invented contribution percentages.
 *    • Every fact traces to a runtime measurement.
 *    • Every confidence score has a decomposition.
 *    • Every recommendation has a lineage chain.
 *    • Provider-agnostic. OpenTelemetry-ready.
 * ─────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────
//  CONTRIBUTOR MODEL
// ─────────────────────────────────────────────────────────────────────

/**
 * Every intelligence pipeline stage is a Contributor.
 * Current: evidence-providers, ial, ife, mic, canonical-uip, oie, copilot.
 * Future: cargo-intelligence, threat-intelligence, behavioral-engine, etc.
 */
export type IpefContributorId =
  | "evidence-providers"
  | "ial"
  | "ife"
  | "mic"
  | "canonical-uip"
  | "oie"
  | "copilot"
  | string; // future engines register their own id

export type IpefStageStatus = "success" | "degraded" | "failed" | "skipped" | "not-run";

/**
 * A measurable output fact from one pipeline stage.
 * Only runtime facts — never invented or estimated values.
 */
export interface IpefFact {
  readonly label: string; // human-readable: "Evidence Records Collected"
  readonly value: string | number | boolean;
  readonly unit?: string; // "records" | "ms" | "MB" | "%"
}

/**
 * A single contributor's provenance record for one pipeline execution.
 * Registered by the contributor itself — the IPEF registry never injects facts.
 */
export interface IpefContributorRecord {
  readonly contributorId: IpefContributorId;
  readonly displayName: string;
  readonly executionId: string; // contributor's own execution id
  readonly correlationId: string; // ties all contributors in one pipeline run
  readonly startedAt: string; // ISO 8601
  readonly durationMs: number;
  readonly status: IpefStageStatus;
  /** Measurable output facts — what this stage actually produced. */
  readonly facts: ReadonlyArray<IpefFact>;
  /** Warnings produced (non-fatal). */
  readonly warnings: ReadonlyArray<string>;
  /** Errors produced (fatal within the stage). */
  readonly errors: ReadonlyArray<string>;
}

// ─────────────────────────────────────────────────────────────────────
//  EXECUTION TRACE
// ─────────────────────────────────────────────────────────────────────

/**
 * The canonical pipeline stage order for visual trace rendering.
 */
export const PIPELINE_STAGE_ORDER: ReadonlyArray<IpefContributorId> = [
  "evidence-providers",
  "ial",
  "ife",
  "mic",
  "canonical-uip",
  "oie",
  "copilot",
] as const;

export interface IpefPipelineStage {
  readonly contributorId: IpefContributorId;
  readonly displayName: string;
  readonly status: IpefStageStatus;
  readonly durationMs: number | null;
  readonly facts: ReadonlyArray<IpefFact>;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
}

// ─────────────────────────────────────────────────────────────────────
//  CONFIDENCE EXPLAINABILITY
// ─────────────────────────────────────────────────────────────────────

export interface IpefConfidenceFactor {
  readonly factor: string; // "Provider authority" | "Evidence freshness" | etc.
  readonly contribution: number; // 0..1 numeric contribution to the composite
  readonly weight: number; // fixed weight in the model
  readonly explanation: string; // plain English
}

export interface IpefConfidenceDecomposition {
  readonly entityId: string;
  readonly entityLabel: string;
  readonly compositeScore: number; // 0..1
  readonly tier: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  readonly factors: ReadonlyArray<IpefConfidenceFactor>;
  readonly supportingEvidenceIds: ReadonlyArray<string>;
  readonly conflictingEvidenceIds: ReadonlyArray<string>;
  readonly intelligenceGaps: ReadonlyArray<string>;
  readonly reasoning: string; // one paragraph plain English
}

// ─────────────────────────────────────────────────────────────────────
//  RECOMMENDATION LINEAGE
// ─────────────────────────────────────────────────────────────────────

/**
 * A single node in the recommendation provenance chain.
 * The chain runs: recommendation → hypothesis → reasoning → entity
 *   → relationship → evidence → provider → raw record
 */
export type IpefLineageNodeKind =
  | "recommendation"
  | "hypothesis"
  | "reasoning"
  | "entity"
  | "relationship"
  | "evidence"
  | "provider"
  | "raw-record";

export interface IpefLineageNode {
  readonly id: string;
  readonly kind: IpefLineageNodeKind;
  readonly label: string;
  readonly detail: string; // one sentence description
  readonly contributorId: IpefContributorId;
  readonly timestamp: string; // ISO 8601
  readonly children: ReadonlyArray<string>; // ids of child nodes
}

export interface IpefRecommendationProvenance {
  readonly recommendationText: string;
  readonly chain: ReadonlyArray<IpefLineageNode>;
  readonly rootNodes: ReadonlyArray<string>; // top-level recommendation node ids
}

// ─────────────────────────────────────────────────────────────────────
//  THE IPEF RECORD — one per pipeline execution
// ─────────────────────────────────────────────────────────────────────

/**
 * The complete provenance record for one intelligence pipeline execution.
 * Attached to the OIE response and stored in the CapturingSink.
 * Serialisable — safe to send over the wire with the briefing.
 */
export interface IpefRecord {
  /** Shared correlation id — matches source_uip_id from the briefing. */
  readonly correlationId: string;
  readonly createdAt: string; // ISO 8601

  /** One record per contributor, in pipeline stage order. */
  readonly contributors: ReadonlyArray<IpefContributorRecord>;

  /** Visual pipeline trace — ordered by PIPELINE_STAGE_ORDER. */
  readonly pipelineTrace: ReadonlyArray<IpefPipelineStage>;

  /** Confidence decompositions for every entity processed by the MIC. */
  readonly confidenceDecompositions: ReadonlyArray<IpefConfidenceDecomposition>;

  /** Recommendation provenance chains. */
  readonly recommendationProvenance: ReadonlyArray<IpefRecommendationProvenance>;

  /** Measurable intelligence gaps identified across all contributors. */
  readonly intelligenceGaps: ReadonlyArray<string>;

  /** Total pipeline wall-clock time. */
  readonly totalDurationMs: number;

  /** Overall pipeline status — worst-case contributor status. */
  readonly overallStatus: IpefStageStatus;
}
