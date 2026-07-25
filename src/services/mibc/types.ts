/**
 * Maritime Intelligence Briefing Centre (MIBC) — types.
 *
 * Enterprise reporting engine. Reports NEVER read from connectors. Sole
 * inputs are the Maritime Investigation Workspace and, when available,
 * derived layers (OKL / MKG) that themselves consume the UIP.
 */

export const REPORT_TYPES = [
  "EXECUTIVE_BRIEF",
  "OPERATIONAL_BRIEF",
  "INVESTIGATION_REPORT",
  "REVENUE_INTELLIGENCE",
  "CARGO_INTELLIGENCE",
  "CONTAINER_INTELLIGENCE",
  "MANIFEST_INTELLIGENCE",
  "COMPLIANCE_REPORT",
  "PORT_INTELLIGENCE",
  "HISTORICAL_COMPARISON",
  "TREND_ANALYSIS",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  EXECUTIVE_BRIEF: "Executive Brief",
  OPERATIONAL_BRIEF: "Operational Brief",
  INVESTIGATION_REPORT: "Investigation Report",
  REVENUE_INTELLIGENCE: "Revenue Intelligence",
  CARGO_INTELLIGENCE: "Cargo Intelligence",
  CONTAINER_INTELLIGENCE: "Container Intelligence",
  MANIFEST_INTELLIGENCE: "Manifest Intelligence",
  COMPLIANCE_REPORT: "Compliance Report",
  PORT_INTELLIGENCE: "Port Intelligence",
  HISTORICAL_COMPARISON: "Historical Comparison",
  TREND_ANALYSIS: "Trend Analysis",
};

export const REPORT_PERIODS = [
  "YESTERDAY",
  "LAST_7D",
  "LAST_30D",
  "QUARTER",
  "YEAR",
  "ON_DEMAND",
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABEL: Record<ReportPeriod, string> = {
  YESTERDAY: "Yesterday",
  LAST_7D: "Last 7 days",
  LAST_30D: "Last 30 days",
  QUARTER: "This quarter",
  YEAR: "This year",
  ON_DEMAND: "On demand",
};

export const REPORT_CADENCES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ON_DEMAND"] as const;
export type ReportCadence = (typeof REPORT_CADENCES)[number];

export type ExportFormat = "PDF" | "DOCX" | "XLSX" | "PPTX";

/** A single section rendered by every exporter in the same order. */
export interface ReportSection {
  id: string;
  title: string;
  body?: string; // plain text / markdown-lite (bullets prefixed with "- ")
  bullets?: string[];
  rows?: Array<Record<string, string | number>>;
  columns?: string[]; // for rows
  confidence?: number; // 0..100
  references?: string[]; // evidence ids / source names
}

export interface ReportChart {
  id: string;
  title: string;
  kind: "bar" | "pie" | "line";
  data: Array<{ label: string; value: number }>;
  evidenceRefs: string[]; // Golden Rule: every chart references evidence
}

/**
 * Origin of a MIBC report.
 *
 * - `LIVE_UIP`             — one-off intelligence report generated directly from a
 *                            Canonical UIP (e.g. sanctions screening result, ad-hoc
 *                            live query). Requires `sourceUipIds`.
 * - `INVESTIGATION`        — report assembled from Investigation Workspaces; each
 *                            workspace carries `sourceUipId` so the UIP lineage
 *                            remains intact.
 * - `OPERATIONAL_RUNTIME`  — report assembled from the full operational chain
 *                            (UIP → OSAE → Investigation → Mission). Each sourced
 *                            workspace must carry `sourceUipId` and at least one
 *                            linked mission plan must exist.
 */
export type ReportOrigin = "LIVE_UIP" | "INVESTIGATION" | "OPERATIONAL_RUNTIME";

/**
 * Engine version stamped onto every ReportPackage and embedded in
 * every exported artifact (PDF/DOCX/PPTX/XLSX). Bump only when the
 * assembly logic changes in a way that alters output structure.
 */
export const MIBC_ENGINE_VERSION = "2.3.1" as const;

export interface ReportPackage {
  /** Stable synthetic id (not persisted). */
  id: string;
  reportType: ReportType;
  reportTypeLabel: string;
  period: ReportPeriod;
  periodLabel: string;
  generatedAt: string;
  officer: string;
  /** Officer's stable auth id when available (mirrors audit_log.officer_id). */
  officerId?: string;
  title: string;
  subtitle?: string;

  /** Which arm of the Operational Runtime this report was assembled from. */
  origin: ReportOrigin;

  /** MIBC engine version — copied into every export's document metadata. */
  engineVersion: string;

  /** intel_briefings.id from the orchestrator run that produced the source UIP(s). */
  briefingId?: string;
  /** Officer-visible subject labels (vessel names, companies, …). */
  subjects?: string[];
  /** Mission label / type when the report is scoped to an operational mission. */
  mission?: string;

  /** Source investigation IDs — reports are ONLY built from these. */
  sourceInvestigationIds: string[];
  /** Canonical UIP ids this report traces back to. */
  sourceUipIds: string[];
  /** Mission plan ids included (Operational Runtime origin). */
  sourceMissionIds: string[];

  /** Ordered sections (Executive Summary → Appendices → Sources). */
  sections: ReportSection[];
  charts: ReportChart[];

  /** For the confidence chip in the header. */
  overallConfidence: number;
  /** Evidence provenance summary (source names, first/last seen). */
  sources: Array<{ name: string; count: number }>;
  /** Explainability line for the footer beside the immutable Seaphore line. */
  provenanceLine: string;
}
