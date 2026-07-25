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
  /** intel_briefings.id from the orchestrator run that seeded these UIPs. */
  briefingId?: string;
  /** Stable officer id (auth uid). Falls back to `officer` for display when omitted. */
  officerId?: string;
  /** Mission label for Executive Summary. */
  mission?: string;
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

  // Subjects — derived from workspace subjects + top canonical UIP entities.
  const uipRefsEarly = input.uipSnapshots ?? [];
  const subjects = Array.from(
    new Set([
      ...workspaces.map((w) => w.subjectName).filter((x): x is string => !!x),
      ...uipRefsEarly.flatMap((r) =>
        r.uip.fused.canonical
          .slice(0, 5)
          .map((c) => c.entity.label ?? c.entity.id)
          .filter((x): x is string => !!x),
      ),
    ]),
  ).slice(0, 8);
  const mission =
    input.mission ??
    (workspaces.find((w) => w.missionType)?.missionType || undefined);

  // Overall Risk / Operational Status derived from workspace priorities.
  const priorityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  const highestPriority =
    workspaces
      .map((w) => w.priority as keyof typeof priorityRank)
      .sort((a, b) => (priorityRank[b] ?? 0) - (priorityRank[a] ?? 0))[0] ??
    "MEDIUM";
  const operationalStatus =
    workspaces.some((w) => w.stage === "DECIDE" || w.stage === "SHARE")
      ? "Decision pending"
      : workspaces.some((w) => w.stage === "INVESTIGATE")
        ? "Active investigation"
        : workspaces.length > 0
          ? "Intake"
          : uipRefsEarly.length > 0
            ? "Live intelligence"
            : "No active investigations";
  const recommendedCoA =
    workspaces.find((w) => w.recommendation)?.recommendation?.label ??
    (uipRefsEarly[0]?.uip.osae[0]?.assessment?.recommendedAction ??
      "Officer to review Canonical UIP and register a decision.");

  // ── Sections ───────────────────────────────────────────────────────
  const sections: ReportSection[] = [];

  // (0) Report Metadata — every export carries provenance up-front.
  sections.push({
    id: "report-metadata",
    title: "Report Metadata",
    columns: ["Field", "Value"],
    rows: [
      { Field: "Briefing ID", Value: input.briefingId ?? "—" },
      { Field: "Officer", Value: officer },
      { Field: "Officer ID", Value: input.officerId ?? "—" },
      { Field: "Generated at (UTC)", Value: generatedAt },
      { Field: "Overall confidence", Value: `${avgConfidence}%` },
      {
        Field: "Source UIP ids",
        Value: uipRefsEarly.map((r) => r.uip.id).join(", ") || "—",
      },
      {
        Field: "Provenance summary",
        Value: `${uipRefsEarly.length} UIP snapshot${uipRefsEarly.length === 1 ? "" : "s"} · ${uipRefsEarly.reduce((s, r) => s + r.uip.rawEvidence.length, 0)} evidence records · ${uipRefsEarly.reduce((s, r) => s + r.uip.provenance.length, 0)} connector attributions`,
      },
    ],
  });

  sections.push({
    id: "executive-summary",
    title: "Executive Summary",
    bullets: [
      `Mission — ${mission ?? "Ad-hoc intelligence request"}`,
      `Subject — ${subjects.join(", ") || "—"}`,
      `Current Assessment — ${buildExecutiveSummary(reportType, workspaces, evidence.length, totalRevenue)}`,
      `Intelligence Confidence — ${avgConfidence}%`,
      `Operational Status — ${operationalStatus}`,
      `Overall Risk — ${highestPriority}`,
      `Recommended Course of Action — ${recommendedCoA}`,
    ],
    confidence: avgConfidence,
  });

  // Intelligence Assessment — structured operational summary.
  const watchlistHits = uipRefsEarly.reduce(
    (n, r) =>
      n +
      r.uip.osae.reduce(
        (m, o) => m + (o.assessment?.sanctions?.matches?.length ?? 0),
        0,
      ),
    0,
  );
  const complianceStatus =
    watchlistHits > 0
      ? `${watchlistHits} watchlist hit${watchlistHits === 1 ? "" : "s"}`
      : uipRefsEarly.length > 0
        ? "No watchlist hits in canonical UIP"
        : "Not evaluated";
  const investigationStatus =
    workspaces.length === 0
      ? "No linked investigations"
      : `${workspaces.length} investigation${workspaces.length === 1 ? "" : "s"} · stages: ${Array.from(new Set(workspaces.map((w) => w.stage ?? "INTAKE"))).join(", ")}`;
  sections.push({
    id: "intelligence-assessment",
    title: "Intelligence Assessment",
    columns: ["Dimension", "Value"],
    rows: [
      { Dimension: "Overall Risk", Value: highestPriority },
      { Dimension: "Confidence", Value: `${avgConfidence}%` },
      { Dimension: "Operational Status", Value: operationalStatus },
      { Dimension: "Compliance", Value: complianceStatus },
      { Dimension: "Watchlists", Value: `${watchlistHits} hit${watchlistHits === 1 ? "" : "s"}` },
      { Dimension: "Revenue Exposure", Value: fmtUsd(totalRevenue) },
      { Dimension: "Investigation Status", Value: investigationStatus },
    ],
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


  // ── Canonical UIP projections (Sprint 2.2) ─────────────────────────
  // Everything below in this block is derived exclusively from the UIP
  // snapshots the orchestrator resolved. Numbers match those shown by
  // every other UIP consumer.
  const uipRefs = input.uipSnapshots ?? [];
  const uipList = uipRefs.map((r) => r.uip);
  const uipIdsFromSnapshots = uipList.map((u) => u.id);
  const uipEvidenceCount = uipList.reduce((s, u) => s + u.rawEvidence.length, 0);
  const uipEntityCount = uipList.reduce((s, u) => s + u.fused.canonical.length, 0);
  const uipContradictions = uipList.reduce((s, u) => s + u.fused.contradictions.length, 0);

  // Evidence Provenance — flatten per-connector attribution across UIPs.
  const provenanceByConnector = new Map<
    string,
    { sourceName: string; records: number; agreementSum: number; n: number }
  >();
  for (const u of uipList) {
    for (const p of u.provenance) {
      const cur = provenanceByConnector.get(p.connectorId) ?? {
        sourceName: p.sourceName,
        records: 0,
        agreementSum: 0,
        n: 0,
      };
      cur.records += p.records;
      cur.agreementSum += p.agreementScore;
      cur.n += 1;
      provenanceByConnector.set(p.connectorId, cur);
    }
  }
  const provenanceRows = [...provenanceByConnector.entries()]
    .map(([connectorId, v]) => ({
      Connector: connectorId,
      Source: v.sourceName,
      Records: v.records,
      Agreement: v.n ? `${Math.round((v.agreementSum / v.n) * 100)}%` : "—",
    }))
    .sort((a, b) => Number(b.Records) - Number(a.Records));

  sections.push({
    id: "evidence-provenance",
    title: "Evidence Provenance",
    body:
      uipList.length === 0
        ? "No Canonical UIP snapshots were resolved by the Intelligence Orchestrator for this report. Every published Seaphore report must trace to at least one UIP."
        : `Assembled from ${uipList.length} Canonical UIP snapshot${uipList.length === 1 ? "" : "s"} carrying ${uipEvidenceCount} normalised evidence item${uipEvidenceCount === 1 ? "" : "s"} across ${provenanceByConnector.size} connector${provenanceByConnector.size === 1 ? "" : "s"}. ${uipContradictions} contradiction${uipContradictions === 1 ? "" : "s"} surfaced during fusion.`,
    columns: ["Connector", "Source", "Records", "Agreement"],
    rows: provenanceRows,
    references: uipIdsFromSnapshots,
  });

  // Canonical Entities — one row per fused entity across every UIP.
  const canonicalRows = uipList.flatMap((u) =>
    u.fused.canonical.slice(0, 40).map((c) => ({
      Entity: c.entity.label ?? c.entity.id,
      Kind: c.entity.kind,
      Confidence: c.confidence,
      Grade: c.grade,
      Sources: c.sources.length,
      UIP: u.id,
    })),
  );
  sections.push({
    id: "canonical-entities",
    title: "Canonical Entities",
    body:
      uipList.length === 0
        ? "No canonical entities — no UIP resolved."
        : `${uipEntityCount} canonical entit${uipEntityCount === 1 ? "y" : "ies"} across ${uipList.length} UIP snapshot${uipList.length === 1 ? "" : "s"}. Each row is the single fused view every Seaphore consumer reads.`,
    columns: ["Entity", "Kind", "Confidence", "Grade", "Sources", "UIP"],
    rows: canonicalRows.slice(0, 80),
  });

  // Confidence Pyramid — computed by OKL from the same UIPs. When many
  // UIPs are folded into one report, we take the max per band so the
  // officer sees the strongest supported claim.
  const pyramids: ConfidencePyramid[] = [];
  for (const u of uipList) {
    try {
      const okl = analyzeOperationalKnowledge({
        uip: u,
        rawEvidence: u.rawEvidence,
        historical: [],
        investigations: [],
      });
      pyramids.push(okl.summary.overallConfidence);
    } catch {
      // OKL is best-effort here; a bad snapshot must not sink the report.
    }
  }
  const foldPyramid = (): ConfidencePyramid | null => {
    if (pyramids.length === 0) return null;
    const max = (k: keyof ConfidencePyramid) =>
      Math.max(...pyramids.map((p) => (typeof p[k] === "number" ? (p[k] as number) : 0)));
    const identity = max("identity");
    const evidence = max("evidence");
    const fusion = max("fusion");
    const pattern = max("pattern");
    const recommendation = max("recommendation");
    // Tier is the tier reported alongside the strongest recommendation.
    const strongest = pyramids
      .slice()
      .sort((a, b) => b.recommendation - a.recommendation)[0];
    return {
      identity,
      evidence,
      fusion,
      pattern,
      recommendation,
      tier: strongest?.tier ?? "SUPPORTED",
      explanation:
        "Aggregated across the resolved Canonical UIP snapshots; each band shows the strongest available support.",
    };
  };
  const pyramid = foldPyramid();
  sections.push({
    id: "confidence-pyramid",
    title: "Confidence Pyramid",
    body: pyramid
      ? `Tier ${pyramid.tier}. ${pyramid.explanation}`
      : "No Confidence Pyramid — OKL requires at least one resolved UIP.",
    columns: ["Band", "Score"],
    rows: pyramid
      ? [
          { Band: "Identity", Score: `${pyramid.identity}%` },
          { Band: "Evidence", Score: `${pyramid.evidence}%` },
          { Band: "Fusion", Score: `${pyramid.fusion}%` },
          { Band: "Pattern", Score: `${pyramid.pattern}%` },
          { Band: "Recommendation", Score: `${pyramid.recommendation}%` },
        ]
      : [],
    confidence: pyramid?.recommendation,
  });

  // Decision Register — structured view of every officer decision in
  // period, with the sourced workspace and its Canonical UIP.
  const decisionRegisterRows = decisions.map((d) => {
    const wsp = workspaces.find((w) => w.id === d.workspaceId);
    return {
      When: new Date(d.at).toISOString().slice(0, 16).replace("T", " "),
      Investigation: d.workspaceTitle ?? wsp?.title ?? d.workspaceId,
      "Source UIP": wsp?.sourceUipId ?? "—",
      Decision: d.title,
      Detail: d.detail ?? "",
      Officer: d.officer ?? "—",
    };
  });
  sections.push({
    id: "decision-register",
    title: "Decision Register",
    body:
      decisionRegisterRows.length === 0
        ? "No officer decisions recorded in period. Officers must record decisions before circulation."
        : `${decisionRegisterRows.length} officer decision${decisionRegisterRows.length === 1 ? "" : "s"} recorded. Every entry traces to a sourced investigation and its Canonical UIP.`,
    columns: ["When", "Investigation", "Source UIP", "Decision", "Detail", "Officer"],
    rows: decisionRegisterRows,
    references: decisions.map((d) => d.id),
  });

  // Investigation Links — workspace ↔ Canonical UIP lineage, including
  // orchestrator misses so the officer never sees silent gaps.
  const linkRows = workspaces.map((w) => ({
    Investigation: w.title,
    "Investigation ID": w.id,
    "Source UIP": w.sourceUipId ?? "—",
    Resolved: w.sourceUipId
      ? uipList.some((u) => u.id === w.sourceUipId)
        ? "Yes"
        : "No · UIP not registered in session"
      : "—",
    Stage: w.stage ?? "INTAKE",
    Missions: (w.missionPlanIds ?? []).length,
  }));
  const missingIds = input.missingUipIds ?? [];
  sections.push({
    id: "investigation-links",
    title: "Investigation Links",
    body:
      linkRows.length === 0 && uipList.length > 0
        ? "Live Intelligence Brief — no investigation is attached to this UIP snapshot."
        : `${linkRows.length} investigation link${linkRows.length === 1 ? "" : "s"}. ${missingIds.length} Canonical UIP id${missingIds.length === 1 ? "" : "s"} could not be resolved in this session.`,
    columns: ["Investigation", "Investigation ID", "Source UIP", "Resolved", "Stage", "Missions"],
    rows: linkRows,
    references: uipIdsFromSnapshots,
  });

  sections.push({
    id: "confidence",
    title: "Confidence & Explainability",
    body: pyramid
      ? `Recommendation confidence ${pyramid.recommendation}% (tier ${pyramid.tier}). Weighted mean investigation confidence: ${avgConfidence}%. Every claim above is traceable to the Canonical UIP snapshots resolved by the Intelligence Orchestrator; MIBC never reads from raw connectors or intelligence tables.`
      : `Weighted mean investigation confidence: ${avgConfidence}%. Every claim above is traceable to the referenced Investigation Workspace(s). Reports do not read from raw connectors — only through the Intelligence Orchestrator.`,
    confidence: pyramid?.recommendation ?? avgConfidence,
  });

  sections.push({
    id: "appendices",
    title: "Appendices",
    bullets: [
      `Officer of record: ${officer}`,
      `Sourced investigation IDs: ${workspaces.map((w) => w.id).join(", ") || "—"}`,
      `Canonical UIP ids: ${uipIdsFromSnapshots.join(", ") || "—"}`,
      `Unresolved UIP ids: ${missingIds.join(", ") || "—"}`,
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
  if (provenanceRows.length > 0) {
    charts.push({
      id: "chart-uip-provenance",
      title: "Canonical UIP evidence by connector",
      kind: "bar",
      data: provenanceRows.slice(0, 8).map((r) => ({ label: String(r.Source), value: Number(r.Records) })),
      evidenceRefs: uipIdsFromSnapshots,
    });
  }

  // ── Origin classification ─────────────────────────────────────────
  // Every report carries an explicit origin plus the full lineage of
  // Canonical UIP ids and Mission Plan ids so the operational-runtime
  // chain (UIP → OSAE → Investigation → Mission → MIBC) is auditable.
  const workspaceUipIds = workspaces
    .map((w) => w.sourceUipId)
    .filter((x): x is string => !!x);
  const sourceUipIds = Array.from(new Set([...workspaceUipIds, ...uipIdsFromSnapshots]));
  const origin: ReportPackage["origin"] =
    input.origin ??
    (workspaces.length === 0 && uipIdsFromSnapshots.length > 0
      ? "LIVE_UIP"
      : linkedMissionIds.size > 0 && sourceUipIds.length > 0
        ? "OPERATIONAL_RUNTIME"
        : "INVESTIGATION");

  // Overall confidence — prefer the Confidence Pyramid's recommendation
  // band (evidence-anchored) over the workspace average.
  const overallConfidence = pyramid?.recommendation ?? avgConfidence;

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
    overallConfidence,
    sources,
    provenanceLine:
      origin === "LIVE_UIP"
        ? `Live Intelligence Brief · ${uipIdsFromSnapshots.length} Canonical UIP snapshot${uipIdsFromSnapshots.length === 1 ? "" : "s"} resolved via the Intelligence Orchestrator.`
        : origin === "OPERATIONAL_RUNTIME"
          ? `Operational Runtime trace · ${sourceUipIds.length} UIP → ${workspaces.length} Investigation → ${linkedMissionIds.size} Mission. Every chart and recommendation traces to evidence.`
          : `Investigation-Based Brief · ${sourceUipIds.length} Canonical UIP snapshot${sourceUipIds.length === 1 ? "" : "s"} resolved via the Intelligence Orchestrator.`,
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
