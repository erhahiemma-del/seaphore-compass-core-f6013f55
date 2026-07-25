/**
 * Sprint 2.5 — Operational Intelligence Engine (OIE) · Reasoning Layer.
 *
 * The OIE is the reasoning layer that sits ABOVE the Operational Knowledge
 * Layer (OKL). It consumes only:
 *   • Canonical UIP snapshots (indirectly, via `source_uip_id` stamped on
 *     OKL records — never re-fetched here)
 *   • OKL records / ingests
 *   • The active Investigation Workspace subject/entities
 *
 * It NEVER:
 *   • calls a connector
 *   • re-computes evidence, identity resolution, fusion, or briefings
 *   • mutates historical knowledge (OKL rows are immutable)
 *
 * Every insight is fully explainable: it carries a rationale string, a
 * confidence 0..100 and a provenance array pinning each contributing OKL
 * record back to its `source_uip_id`, `briefing_id` and `investigation_id`.
 */

export type OieInsightKind =
  | "SIMILAR_INVESTIGATION"
  | "RECURRING_PATTERN"
  | "HISTORICAL_OUTCOME"
  | "EMERGING_RISK"
  | "RECOMMENDATION_EFFECTIVENESS"
  | "CROSS_CASE_RELATIONSHIP";

export interface OieProvenanceRef {
  investigationId: string;
  sourceUipId: string;
  briefingId: string | null;
  oklRecordIds: string[];
}

export interface OieInsight {
  id: string;
  kind: OieInsightKind;
  title: string;
  summary: string;
  /** Plain-language "why this fired" — every officer sees it. */
  rationale: string;
  /** 0..100. Composed from OKL confidence + corroboration breadth. */
  confidence: number;
  /** Machine-friendly signals feeding the rationale. */
  signals: Record<string, string | number | boolean | null>;
  provenance: OieProvenanceRef[];
  createdAt: string;
}

export interface OieInsightBundle {
  subjectEntityIds: string[];
  subjectEntityLabels: string[];
  investigationId?: string;
  generatedAt: string;
  insights: OieInsight[];
  /** Counters for the UI banner + tests. */
  stats: {
    recordsScanned: number;
    investigationsTouched: number;
    uipsTouched: number;
  };
}
