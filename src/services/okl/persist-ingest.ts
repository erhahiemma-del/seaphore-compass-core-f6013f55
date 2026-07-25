/**
 * OKL persistence — client helper (Sprint 2.4).
 *
 * Takes a completed InvestigationWorkspace + the Canonical UIP that seeded it
 * and calls `persistOklIngest` to write an immutable record set into the
 * Operational Knowledge Layer. Never queries connectors, IAL, or the Data
 * API directly — the workspace is already a projection of the Canonical UIP.
 */
import { persistOklIngest } from "@/lib/okl-knowledge.functions";
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { getUip } from "@/services/ife/registry";

function tierPct(pct: number | undefined): "LOW" | "MEDIUM" | "HIGH" {
  const v = pct ?? 0;
  if (v >= 80) return "HIGH";
  if (v >= 50) return "MEDIUM";
  return "LOW";
}

export interface OklIngestResult {
  ok: true;
  ingestId: string;
  version: number;
  createdAt: string;
  recordCount: number;
}

/**
 * Persist a completed investigation into the Operational Knowledge Store.
 * Idempotency is enforced only by version numbering — repeated calls create
 * incrementing versions rather than mutating the prior ingest (immutability).
 */
export async function persistInvestigationToOkl(
  ws: InvestigationWorkspace,
  opts: { officerName?: string } = {},
): Promise<OklIngestResult> {
  const sourceUipId = ws.sourceUipId ?? "unlinked";
  const briefingId = ws.lastBriefingId ?? null;
  const uip = ws.sourceUipId ? getUip(ws.sourceUipId) : null;

  const records: Array<Record<string, unknown>> = [];

  // ENTITIES ----------------------------------------------------------
  for (const e of ws.entities ?? []) {
    records.push({
      kind: "ENTITY",
      entityId: e.id,
      entityLabel: e.name,
      entityKind: e.type,
      confidence: typeof e.confidence === "number" ? Math.round(e.confidence) : null,
      riskLevel: e.riskTier ? e.riskTier.toUpperCase() : null,
      label: e.name,
      detail: e.role ?? null,
      payload: {
        role: e.role,
        evidenceIds: e.evidenceIds,
        relatedTo: e.relatedTo,
      },
    });
  }

  // RELATIONSHIPS -----------------------------------------------------
  for (const e of ws.entities ?? []) {
    for (const otherId of e.relatedTo ?? []) {
      const other = ws.entities.find((x) => x.id === otherId);
      records.push({
        kind: "RELATIONSHIP",
        entityId: e.id,
        entityLabel: e.name,
        entityKind: e.type,
        label: `${e.name} → ${other?.name ?? otherId}`,
        payload: { from: e.id, to: otherId },
      });
    }
  }

  // PATTERNS (hypotheses that were confirmed or supported) -----------
  for (const h of ws.hypotheses ?? []) {
    if (h.status === "CONFIRMED" || h.status === "SUPPORTED") {
      records.push({
        kind: "PATTERN",
        patternKind: h.status,
        confidence: Math.round(h.confidence),
        label: h.statement,
        detail: `Supported by ${h.supporting.length} evidence item(s)`,
        payload: {
          hypothesisId: h.id,
          supporting: h.supporting,
          contradicting: h.contradicting,
        },
      });
    }
  }

  // RISKS --------------------------------------------------------------
  for (const e of ws.entities ?? []) {
    if (e.riskTier && (e.riskTier === "high" || e.riskTier === "critical")) {
      records.push({
        kind: "RISK",
        entityId: e.id,
        entityLabel: e.name,
        entityKind: e.type,
        riskLevel: e.riskTier.toUpperCase(),
        confidence: typeof e.confidence === "number" ? Math.round(e.confidence) : null,
        label: `${e.riskTier.toUpperCase()} risk on ${e.name}`,
        payload: { evidenceIds: e.evidenceIds },
      });
    }
  }

  // DECISIONS ----------------------------------------------------------
  for (const d of ws.decisions ?? []) {
    records.push({
      kind: "DECISION",
      label: d.title,
      detail: d.detail ?? null,
      payload: { officer: d.officer, at: d.at, id: d.id },
    });
  }

  // OUTCOMES (final stage transition to CLOSED) -----------------------
  const closedTransition = (ws.stageHistory ?? []).find((s) => s.to === "CLOSED");
  if (closedTransition) {
    records.push({
      kind: "OUTCOME",
      label: `Investigation closed at ${ws.stage ?? "CLOSED"}`,
      detail: closedTransition.note ?? null,
      confidence: Math.round(ws.confidencePct ?? 0),
      payload: {
        stage: ws.stage,
        officer: closedTransition.officer,
        evidenceCompleteness: ws.evidenceCompleteness,
        progress: ws.progress,
      },
    });
  }

  // RECOMMENDATIONS ---------------------------------------------------
  if (ws.recommendation) {
    records.push({
      kind: "RECOMMENDATION",
      label: ws.recommendation.label,
      detail: ws.recommendation.rationale ?? null,
      payload: {
        supportingEvidence: ws.recommendation.supportingEvidence ?? [],
      },
    });
  }

  const snapshot = {
    workspace: {
      id: ws.id,
      title: ws.title,
      missionType: ws.missionType,
      caseType: ws.caseType,
      subjectId: ws.subjectId,
      subjectName: ws.subjectName,
      region: ws.region,
      tags: ws.tags,
      priority: ws.priority,
      status: ws.status,
      stage: ws.stage,
      startedAt: ws.startedAt,
      updatedAt: ws.updatedAt,
      confidenceTier: ws.confidenceTier,
      confidencePct: ws.confidencePct,
      evidenceCompleteness: ws.evidenceCompleteness,
      progress: ws.progress,
      officer: ws.officer,
    },
    counts: {
      evidence: ws.evidence?.length ?? 0,
      hypotheses: ws.hypotheses?.length ?? 0,
      tasks: ws.tasks?.length ?? 0,
      decisions: ws.decisions?.length ?? 0,
      entities: ws.entities?.length ?? 0,
      timeline: ws.timeline?.length ?? 0,
      notebook: ws.notebook?.length ?? 0,
    },
    uip: uip
      ? {
          id: uip.id,
          entities: uip.fused?.stats?.canonicalEntities ?? 0,
          sourcesResponded: uip.fused?.stats?.sourcesResponded ?? 0,
        }
      : null,
    ingestedAt: new Date().toISOString(),
    tier: tierPct(ws.confidencePct),
  };

  const result = await persistOklIngest({
    data: {
      investigationId: ws.id,
      investigationTitle: ws.title,
      sourceUipId,
      briefingId: briefingId ?? undefined,
      officerName: opts.officerName ?? ws.officer ?? undefined,
      packageId: `okl-pkg-${ws.id}-${Date.now()}`,
      overallConfidence: Math.round(ws.confidencePct ?? 0),
      overallRisk: tierPct(ws.confidencePct),
      snapshot,
      records,
    },
  });

  return result;
}
