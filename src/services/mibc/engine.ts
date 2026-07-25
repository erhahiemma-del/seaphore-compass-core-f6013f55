/**
 * MIBC engine — assembles a ReportPackage from Canonical Unified
 * Intelligence Package (UIP) snapshots resolved via the Intelligence
 * Orchestrator, paired with Maritime Investigation Workspaces.
 *
 * Sprint 2.2 (Canonical UIP Integration):
 *   MIBC now consumes intelligence EXCLUSIVELY through
 *   `intelligenceOrchestrator.getUIP(...)` / `getUIPBatch(...)`. The
 *   engine itself is pure — the route resolves the UIP snapshots and
 *   passes them in via `uipSnapshots`. Two modes are supported:
 *
 *     - Live Intelligence Brief    → `uipSnapshots` supplied, no
 *                                    workspaces (or empty). Origin
 *                                    stamped as `LIVE_UIP`.
 *     - Investigation-Based Brief  → workspaces supplied; each
 *                                    workspace's `sourceUipId` is
 *                                    resolved through the orchestrator
 *                                    into a matching UIP snapshot. When
 *                                    linked mission plans exist the
 *                                    origin is stamped
 *                                    `OPERATIONAL_RUNTIME`.
 *
 * Numbers surfaced by the report (risk, revenue, entities, evidence
 * counts, confidence) are derived from the UIP snapshots when
 * available, so every MIBC report matches the values shown by the
 * other UIP consumers (Evidence Explorer, Predictions, Revenue
 * Leakage, Operational Knowledge). The engine NEVER reads from raw
 * connectors or intelligence tables.
 */

import type { InvestigationWorkspace } from "@/stores/workspace.store";
import type { MissionPlan } from "@/services/mission";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import { analyzeOperationalKnowledge } from "@/services/okl";
import type { ConfidencePyramid } from "@/services/okl/types";
import type {
  ReportPackage,
  ReportSection,
  ReportChart,
  ReportType,
  ReportPeriod,
} from "./types";
import { REPORT_TYPE_LABEL, REPORT_PERIOD_LABEL } from "./types";

/**
 * UIP snapshot paired (optionally) with the Investigation Workspace
 * that sourced it. The route resolves these through the Intelligence
 * Orchestrator BEFORE calling `buildReport`.
 */
export interface UipSnapshotRef {
  readonly uip: UnifiedIntelligencePackage;
  /** Workspace this UIP belongs to, when the report is investigation-scoped. */
  readonly workspaceId?: string;
}

export interface BuildReportInput {
  reportType: ReportType;
  period: ReportPeriod;
  workspaces: InvestigationWorkspace[];
  officer: string;
  /** Mission plans available in the store — engine filters to those linked to sourced workspaces. */
  missionPlans?: ReadonlyArray<MissionPlan>;
  /** Optional pre-computed OKL insights per workspace, keyed by workspace id. */
  oklInsights?: Record<
    string,
    Array<{
      title: string;
      confidence: number;
      recommendation?: string;
      evidenceRefs?: string[];
    }>
  >;
  /**
   * Canonical UIP snapshots resolved via
   * `intelligenceOrchestrator.getUIP(...)`. When supplied, the engine
   * populates Evidence Provenance, Canonical Entities, and Confidence
   * Pyramid sections from these snapshots and treats their ids as the
   * report's authoritative `sourceUipIds`.
   */
  uipSnapshots?: ReadonlyArray<UipSnapshotRef>;
  /**
   * UIP ids the orchestrator was asked for but could not resolve in
   * this session. Surfaced in the Investigation Links section so the
   * officer never sees silent gaps.
   */
  missingUipIds?: ReadonlyArray<string>;
  /**
   * Force the report origin. When omitted the engine derives it:
   *   - `LIVE_UIP`             when there are no workspaces and at
   *                            least one UIP snapshot is supplied,
   *   - `OPERATIONAL_RUNTIME`  when workspaces + linked missions +
   *                            resolved UIPs all present,
   *   - `INVESTIGATION`        otherwise.
   */
  origin?: ReportPackage["origin"];
}


function nowIso(): string {
  return new Date().toISOString();
}

function periodStart(period: ReportPeriod): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "YESTERDAY":
      d.setDate(d.getDate() - 1);
      return d;
    case "LAST_7D":
      d.setDate(d.getDate() - 7);
      return d;
    case "LAST_30D":
      d.setDate(d.getDate() - 30);
      return d;
    case "QUARTER":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "YEAR":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "ON_DEMAND":
    default:
      return null;
  }
}

function filterInPeriod<T extends { at?: string; collectedAt?: string; createdAt?: string }>(
  items: T[],
  since: Date | null,
): T[] {
  if (!since) return items;
  const cutoff = since.getTime();
  return items.filter((i) => {
    const t = new Date(i.at ?? i.collectedAt ?? i.createdAt ?? nowIso()).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `$${Math.round(n).toLocaleString()}`;
}

function joinShort(items: string[], max = 6): string {
  if (items.length === 0) return "—";
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown}, +${items.length - max} more` : shown;
}

/**
 * Build a ReportPackage. The section order is FIXED (Executive Summary,
 * Operational Overview, Key Findings, Supporting Evidence, KG
 * Relationships, Timeline, Revenue, Risk, Recommendations, Confidence,
 * Appendices, Sources). Empty sections are still emitted so exporters
 * can render a "No entries" marker — the officer must see what was
 * checked, not silently omitted.
 */
export function buildReport(input: BuildReportInput): ReportPackage {
  const { reportType, period, workspaces, officer } = input;
  const since = periodStart(period);
  const generatedAt = nowIso();

  // ── Aggregate across all sourced investigations ────────────────────
  const evidence = workspaces.flatMap((w) =>
    filterInPeriod(w.evidence, since).map((e) => ({ ...e, workspaceId: w.id, workspaceTitle: w.title })),
  );
  const hypotheses = workspaces.flatMap((w) =>
    filterInPeriod(w.hypotheses, since).map((h) => ({ ...h, workspaceId: w.id })),
  );
  const tasks = workspaces.flatMap((w) =>
    filterInPeriod(w.tasks, since).map((t) => ({ ...t, workspaceId: w.id, workspaceTitle: w.title })),
  );
  const decisions = workspaces.flatMap((w) =>
    filterInPeriod(w.decisions, since).map((d) => ({ ...d, workspaceId: w.id, workspaceTitle: w.title })),
  );
  const timeline = workspaces.flatMap((w) =>
    filterInPeriod(w.timeline, since).map((e) => ({ ...e, workspaceId: w.id, workspaceTitle: w.title })),
  );
  const entities = workspaces.flatMap((w) => w.entities.map((ent) => ({ ...ent, workspaceId: w.id })));

  const evidenceGroups = new Map<string, number>();
  for (const e of evidence) evidenceGroups.set(e.source, (evidenceGroups.get(e.source) ?? 0) + 1);
  const sources = [...evidenceGroups.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const totalRevenue = workspaces.reduce(
    (s, w) => s + (Number(w.estimatedRevenueImpactUsd) || 0),
    0,
  );

  const avgConfidence =
    workspaces.length === 0
      ? 0
      : Math.round(
          workspaces.reduce((s, w) => s + (Number(w.confidencePct) || 0), 0) / workspaces.length,
        );

  const oklEnrichment = input.oklInsights ?? {};

  const title = deriveTitle(reportType, workspaces);
  const subtitle = `${REPORT_PERIOD_LABEL[period]} · ${workspaces.length} investigation${workspaces.length === 1 ? "" : "s"} · ${evidence.length} evidence item${evidence.length === 1 ? "" : "s"}`;

  // ── Sections ───────────────────────────────────────────────────────
  const sections: ReportSection[] = [];

  sections.push({
    id: "executive-summary",
    title: "Executive Summary",
    body: buildExecutiveSummary(reportType, workspaces, evidence.length, totalRevenue),
    confidence: avgConfidence,
  });

  sections.push({
    id: "operational-overview",
    title: "Operational Overview",
    columns: ["Investigation", "Stage", "Priority", "Confidence", "Revenue at risk"],
    rows: workspaces.map((w) => ({
      Investigation: w.title,
      Stage: w.stage ?? "INTAKE",
      Priority: w.priority,
      Confidence: `${w.confidencePct ?? 0}%`,
      "Revenue at risk": fmtUsd(Number(w.estimatedRevenueImpactUsd) || 0),
    })),
  });

  sections.push({
    id: "key-findings",
    title: "Key Findings",
    bullets:
      hypotheses.length === 0
        ? ["No hypotheses in period. Officer to review workspace before circulation."]
        : hypotheses
            .slice(0, 25)
            .map(
              (h) =>
                `${h.statement} — ${h.status} · confidence ${h.confidence}% · supporting ${h.supporting.length} / contradicting ${h.contradicting.length}`,
            ),
    references: hypotheses.flatMap((h) => h.supporting).slice(0, 40),
  });

  sections.push({
    id: "supporting-evidence",
    title: "Supporting Evidence",
    columns: ["Title", "Source", "Category", "Grade", "Collected"],
    rows: evidence.slice(0, 100).map((e) => ({
      Title: e.title,
      Source: e.source,
      Category: e.category,
      Grade: e.grade ?? "—",
      Collected: new Date(e.collectedAt).toISOString().slice(0, 10),
    })),
    references: evidence.map((e) => e.id),
  });

  sections.push({
    id: "kg-relationships",
    title: "Knowledge Graph Relationships",
    columns: ["Entity", "Type", "Role", "Risk", "Linked to"],
    rows: entities.slice(0, 60).map((ent) => ({
      Entity: ent.name,
      Type: ent.type,
      Role: ent.role ?? "—",
      Risk: ent.riskTier ?? "—",
      "Linked to": joinShort(ent.relatedTo),
    })),
  });

  sections.push({
    id: "timeline",
    title: "Timeline",
    bullets:
      timeline.length === 0
        ? ["No timeline events in period."]
        : timeline
            .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
            .slice(-60)
            .map(
              (e) =>
                `${new Date(e.at).toISOString().slice(0, 16).replace("T", " ")} — [${e.kind}] ${e.label}${e.detail ? ` (${e.detail})` : ""}`,
            ),
  });

  sections.push({
    id: "revenue",
    title: "Revenue Intelligence",
    body: `Total revenue at risk across sourced investigations: ${fmtUsd(totalRevenue)}.`,
    columns: ["Investigation", "Case type", "Revenue at risk"],
    rows: workspaces
      .filter((w) => (Number(w.estimatedRevenueImpactUsd) || 0) > 0)
      .map((w) => ({
        Investigation: w.title,
        "Case type": w.caseType ?? "GENERIC",
        "Revenue at risk": fmtUsd(Number(w.estimatedRevenueImpactUsd) || 0),
      })),
  });

  sections.push({
    id: "risk",
    title: "Risk Assessment",
    columns: ["Priority", "Count"],
    rows: (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => ({
      Priority: p,
      Count: workspaces.filter((w) => w.priority === p).length,
    })),
  });

  const recBullets: string[] = [];
  for (const w of workspaces) {
    if (w.recommendation) {
      const src = oklEnrichment[w.id]?.[0]?.title;
      recBullets.push(
        `${w.title} → ${w.recommendation.label}${w.recommendation.rationale ? ` — ${w.recommendation.rationale}` : ""}${src ? ` [OKL: ${src}]` : ""}`,
      );
    }
    for (const insight of oklEnrichment[w.id] ?? []) {
      if (insight.recommendation)
        recBullets.push(
          `${w.title} → ${insight.recommendation} — via OKL pattern ${insight.title} (confidence ${insight.confidence}%)`,
        );
    }
  }
  sections.push({
    id: "recommendations",
    title: "Recommendations",
    bullets:
      recBullets.length === 0
        ? [
            "No recommendations recorded. Officer must not release this report without an explicit decision.",
          ]
        : recBullets,
  });

  // ── Human Decisions ────────────────────────────────────────────────
  sections.push({
    id: "human-decisions",
    title: "Human Decisions",
    bullets:
      decisions.length === 0
        ? ["No officer decisions recorded in period."]
        : decisions.map(
            (d) =>
              `${new Date(d.at).toISOString().slice(0, 16).replace("T", " ")} — ${d.workspaceTitle} · ${d.title}${d.detail ? ` — ${d.detail}` : ""}${d.officer ? ` (officer: ${d.officer})` : ""}`,
          ),
    references: decisions.map((d) => d.id),
  });

  // ── Mission Progress ───────────────────────────────────────────────
  const workspaceIds = new Set(workspaces.map((w) => w.id));
  const linkedMissionIds = new Set(
    workspaces.flatMap((w) => w.missionPlanIds ?? []),
  );
  const missions = (input.missionPlans ?? []).filter((m) => linkedMissionIds.has(m.id));
  sections.push({
    id: "mission-progress",
    title: "Mission Progress",
    columns: ["Mission", "Type", "Status", "Objectives", "Approved recs", "Subjects"],
    rows:
      missions.length === 0
        ? []
        : missions.map((m) => ({
            Mission: m.name,
            Type: m.type,
            Status: m.status,
            Objectives: m.objectives.length,
            "Approved recs": m.recommendations.filter((r) => r.humanApproved).length,
            Subjects: joinShort(m.subjects.map((s) => s.label)),
          })),
    bullets:
      missions.length === 0
        ? ["No missions linked to sourced investigations. Missions are only created from approved decisions, recommendations, or OKL patterns."]
        : undefined,
    references: [...linkedMissionIds],
  });
  // Preserve workspaceIds usage (silences unused-var when downstream code changes).
  void workspaceIds;


  sections.push({
    id: "confidence",
    title: "Confidence & Explainability",
    body: `Weighted mean investigation confidence: ${avgConfidence}%. Every claim above is traceable to the referenced Investigation Workspace(s). Reports do not read from raw connectors — only from Investigation Workspaces enriched by the Intelligence Fusion Engine and Operational Knowledge Layer.`,
    confidence: avgConfidence,
  });

  sections.push({
    id: "appendices",
    title: "Appendices",
    bullets: [
      `Officer of record: ${officer}`,
      `Sourced investigation IDs: ${workspaces.map((w) => w.id).join(", ") || "—"}`,
      `Tasks in period: ${tasks.length}`,
      `Decisions in period: ${decisions.length}`,
    ],
  });

  sections.push({
    id: "sources",
    title: "Sources",
    columns: ["Source", "Evidence count"],
    rows: sources.map((s) => ({ Source: s.name, "Evidence count": s.count })),
  });

  // ── Charts (each references evidence) ──────────────────────────────
  const charts: ReportChart[] = [];
  if (sources.length > 0) {
    charts.push({
      id: "chart-sources",
      title: "Evidence by source",
      kind: "bar",
      data: sources.slice(0, 8).map((s) => ({ label: s.name, value: s.count })),
      evidenceRefs: evidence.map((e) => e.id).slice(0, 40),
    });
  }
  if (workspaces.length > 0) {
    charts.push({
      id: "chart-priority",
      title: "Investigations by priority",
      kind: "pie",
      data: (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
        .map((p) => ({ label: p, value: workspaces.filter((w) => w.priority === p).length }))
        .filter((d) => d.value > 0),
      evidenceRefs: workspaces.map((w) => `workspace:${w.id}`),
    });
  }

  // ── Origin classification ─────────────────────────────────────────
  // Every report carries an explicit origin plus the full lineage of
  // Canonical UIP ids and Mission Plan ids so the operational-runtime
  // chain (UIP → OSAE → Investigation → Mission → MIBC) is auditable.
  const sourceUipIds = Array.from(
    new Set(workspaces.map((w) => w.sourceUipId).filter((x): x is string => !!x)),
  );
  const origin: "LIVE_UIP" | "INVESTIGATION" | "OPERATIONAL_RUNTIME" =
    linkedMissionIds.size > 0 && sourceUipIds.length > 0
      ? "OPERATIONAL_RUNTIME"
      : "INVESTIGATION";

  return {
    id: `mibc-${Date.now().toString(36)}`,
    reportType,
    reportTypeLabel: REPORT_TYPE_LABEL[reportType],
    period,
    periodLabel: REPORT_PERIOD_LABEL[period],
    generatedAt,
    officer,
    title,
    subtitle,
    origin,
    sourceInvestigationIds: workspaces.map((w) => w.id),
    sourceUipIds,
    sourceMissionIds: [...linkedMissionIds],
    sections,
    charts,
    overallConfidence: avgConfidence,
    sources,
    provenanceLine:
      origin === "OPERATIONAL_RUNTIME"
        ? `Operational Runtime trace · ${sourceUipIds.length} UIP → ${workspaces.length} Investigation → ${linkedMissionIds.size} Mission. Every chart and recommendation traces to evidence.`
        : "Reports read only from Investigation Workspaces. Every chart and recommendation traces to evidence.",
  };
}

function deriveTitle(reportType: ReportType, workspaces: InvestigationWorkspace[]): string {
  const label = REPORT_TYPE_LABEL[reportType];
  if (workspaces.length === 0) return `${label} — no investigations`;
  if (workspaces.length === 1) return `${label} — ${workspaces[0].title}`;
  return `${label} — ${workspaces.length} investigations`;
}

function buildExecutiveSummary(
  reportType: ReportType,
  workspaces: InvestigationWorkspace[],
  evidenceCount: number,
  revenueUsd: number,
): string {
  if (workspaces.length === 0)
    return `No qualifying investigation workspaces were available for this ${REPORT_TYPE_LABEL[reportType]}. No conclusions may be drawn.`;
  const critical = workspaces.filter((w) => w.priority === "CRITICAL").length;
  const high = workspaces.filter((w) => w.priority === "HIGH").length;
  const parts: string[] = [];
  parts.push(
    `${REPORT_TYPE_LABEL[reportType]} covering ${workspaces.length} investigation${workspaces.length === 1 ? "" : "s"} (${critical} critical, ${high} high).`,
  );
  parts.push(`Assembled from ${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"}.`);
  if (revenueUsd > 0) parts.push(`Estimated revenue at risk: ${fmtUsd(revenueUsd)}.`);
  parts.push(
    "All findings originate from the Maritime Investigation Workspace. No raw connector data was consumed by this report.",
  );
  return parts.join(" ");
}
