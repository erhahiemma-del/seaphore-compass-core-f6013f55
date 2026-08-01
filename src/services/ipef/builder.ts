/**
 * INT-01A.3 — IPEF · Record Builder
 *
 * Constructs an IpefRecord from the runtime outputs of all pipeline stages.
 * Called by the orchestrator after all stages complete — receives the
 * raw facts from each stage and assembles the provenance record.
 *
 * Pure function. Never throws. No I/O. No side effects beyond the returned record.
 */
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { MicBootstrapResult } from "@/services/mic/bootstrap";
import type { Briefing } from "@/services/orchestration/types";
import { mic } from "@/services/mic/container";
import type {
  IpefRecord,
  IpefContributorRecord,
  IpefPipelineStage,
  IpefStageStatus,
  IpefFact,
  IpefConfidenceDecomposition,
  IpefRecommendationProvenance,
  IpefLineageNode,
} from "./types";
import { PIPELINE_STAGE_ORDER } from "./types";

export interface IpefBuildInput {
  readonly correlationId: string; // == source_uip_id / uipId
  readonly uip: UnifiedIntelligencePackage;
  readonly micBootstrapResult: MicBootstrapResult | null;
  readonly briefing: Briefing;
  readonly orchestrationStartedAt: number; // Date.now() at start of orchestrate()
  readonly evidenceCollectionMs: number;
  readonly sourcesQueried: number;
  readonly sourcesResponded: number;
  readonly sourcesCorroborated: number;
  readonly evidenceCount: number;
}

function fact(label: string, value: string | number | boolean, unit?: string): IpefFact {
  return unit ? { label, value, unit } : { label, value };
}

function worstStatus(statuses: IpefStageStatus[]): IpefStageStatus {
  const rank: Record<IpefStageStatus, number> = {
    failed: 4,
    degraded: 3,
    skipped: 2,
    "not-run": 1,
    success: 0,
  };
  const worst = statuses.reduce((a, b) => (rank[a] >= rank[b] ? a : b), "success");
  return worst;
}

export function buildIpefRecord(input: IpefBuildInput): IpefRecord {
  const now = new Date().toISOString();
  const correlationId = input.correlationId;
  const contributors: IpefContributorRecord[] = [];

  // ── Evidence Providers ─────────────────────────────────────────────
  const providerStatus: IpefStageStatus =
    input.sourcesResponded === 0
      ? "failed"
      : input.sourcesResponded < input.sourcesQueried
        ? "degraded"
        : "success";
  contributors.push({
    contributorId: "evidence-providers",
    displayName: "Evidence Providers",
    executionId: `ep_${correlationId}`,
    correlationId,
    startedAt: new Date(input.orchestrationStartedAt).toISOString(),
    durationMs: input.evidenceCollectionMs,
    status: providerStatus,
    facts: [
      fact("Providers Queried", input.sourcesQueried, "providers"),
      fact("Providers Responded", input.sourcesResponded, "providers"),
      fact("Providers Corroborated", input.sourcesCorroborated, "providers"),
      fact("Evidence Records Collected", input.evidenceCount, "records"),
    ],
    warnings:
      input.sourcesResponded < input.sourcesQueried
        ? [`${input.sourcesQueried - input.sourcesResponded} provider(s) did not respond`]
        : [],
    errors: [],
  });

  // ── IAL ────────────────────────────────────────────────────────────
  contributors.push({
    contributorId: "ial",
    displayName: "Intelligence Acquisition Layer (IAL)",
    executionId: `ial_${correlationId}`,
    correlationId,
    startedAt: new Date(input.orchestrationStartedAt).toISOString(),
    durationMs: input.evidenceCollectionMs,
    status: "success",
    facts: [
      fact("Evidence Records Normalised", input.evidenceCount, "records"),
      fact("Source Attributions Built", input.sourcesResponded, "sources"),
    ],
    warnings: [],
    errors: [],
  });

  // ── IFE ────────────────────────────────────────────────────────────
  const ifeStats = input.uip.fused.stats;
  contributors.push({
    contributorId: "ife",
    displayName: "Intelligence Fusion Engine (IFE)",
    executionId: `ife_${correlationId}`,
    correlationId,
    startedAt: new Date(input.orchestrationStartedAt + input.evidenceCollectionMs).toISOString(),
    durationMs: 0, // IFE runs synchronously inside buildUnifiedIntelligencePackage
    status: "success",
    facts: [
      fact("Canonical UIP Generated", "yes"),
      fact("Input Records", ifeStats.inputRecords, "records"),
      fact("Canonical Entities", ifeStats.canonicalEntities, "entities"),
      fact("Contradictions Surfaced", ifeStats.contradictions, "contradictions"),
      fact("Sources Queried", ifeStats.sourcesQueried, "sources"),
      fact("Sources Responded", ifeStats.sourcesResponded, "sources"),
      fact("Avg Evidence Freshness", Math.round(ifeStats.averageFreshnessSeconds / 60), "minutes"),
      fact("Identity Clusters Formed", input.uip.identity.length, "clusters"),
      fact("Has Contradictions", input.uip.hasContradictions),
    ],
    warnings: input.uip.hasContradictions
      ? ["Contradictions detected — IFE surfaced conflicting field values"]
      : [],
    errors: [],
  });

  // ── MIC ────────────────────────────────────────────────────────────
  const micResult = input.micBootstrapResult;
  const micStatus: IpefStageStatus =
    micResult === null
      ? "skipped"
      : micResult.outcome === "failed"
        ? "failed"
        : micResult.outcome === "degraded"
          ? "degraded"
          : "success";
  const micStats = micResult?.telemetry;

  contributors.push({
    contributorId: "mic",
    displayName: "Maritime Intelligence Core (MIC)",
    executionId: micStats?.executionId ?? `mic_skipped_${correlationId}`,
    correlationId,
    startedAt: micStats?.timestamp ?? now,
    durationMs: micStats?.totalDurationMs ?? 0,
    status: micStatus,
    facts: micStats
      ? [
          fact("Entities Registered", micStats.entitiesRegistered, "entities"),
          fact("Relationships Registered", micStats.relationshipsRegistered, "relationships"),
          fact("Evidence Records Registered", micStats.evidenceRegistered, "records"),
          fact("Timeline Events Generated", micStats.timelineEvents, "events"),
          fact("Risk Profiles Computed", micStats.riskProfilesComputed, "profiles"),
          fact("Reasoning Records Generated", micStats.reasoningRecords, "records"),
          fact("Graph Nodes Added", micStats.graphNodes, "nodes"),
          fact("Graph Edges Added", micStats.graphEdges, "edges"),
          fact(
            "Heap Memory",
            micStats.heapUsedBytes !== null
              ? `${+(micStats.heapUsedBytes / 1_048_576).toFixed(1)} MB`
              : "unknown",
          ),
        ]
      : [fact("Status", "MIC was skipped (MIC_ENABLED=false or disabled)")],
    warnings: micStats?.warnings.slice() ?? [],
    errors: micStats?.errors.slice() ?? [],
  });

  // ── Canonical UIP ──────────────────────────────────────────────────
  contributors.push({
    contributorId: "canonical-uip",
    displayName: "Canonical Unified Intelligence Package (UIP)",
    executionId: `uip_${correlationId}`,
    correlationId,
    startedAt: now,
    durationMs: 0,
    status: "success",
    facts: [
      fact("UIP ID", correlationId),
      fact("Evidence Package Grade", input.uip.fused.grade),
      fact("Package Confidence", input.uip.fused.confidence),
      fact("Freshest Evidence", `${Math.round(input.uip.freshestSeconds / 60)} minutes ago`),
      fact("Registered in Session", "yes"),
    ],
    warnings: [],
    errors: [],
  });

  // ── OIE ────────────────────────────────────────────────────────────
  const gapSection = input.briefing.sections.find((s) => s.kind === "intelligence_gaps");
  const gapList: string[] = (gapSection?.payload as { list?: string[] } | undefined)?.list ?? [];
  const counterSection = input.briefing.sections.find((s) => s.kind === "counter_hypotheses");
  const hypotheses: string[] =
    (counterSection?.payload as { list?: string[] } | undefined)?.list ?? [];
  const actionSection = input.briefing.sections.find((s) => s.kind === "officer_actions");
  const actionCount =
    (actionSection?.payload as { actions?: unknown[] } | undefined)?.actions?.length ?? 0;

  contributors.push({
    contributorId: "oie",
    displayName: "Operational Intelligence Engine (OIE)",
    executionId: input.briefing.id,
    correlationId,
    startedAt: now,
    durationMs: input.briefing.latency_ms,
    status: "success",
    facts: [
      fact("Briefing Mode", input.briefing.mode),
      fact("Classification", input.briefing.classification.typeBadge),
      fact("Intelligence Status", input.briefing.intelligence_status),
      fact("Confidence Score", `${Math.round(input.briefing.confidence_matrix.composite * 100)}%`),
      fact("Evidence Quality", input.briefing.classification.evidenceStrength),
      fact("Counter-Hypotheses Generated", hypotheses.length, "hypotheses"),
      fact("Intelligence Gaps Identified", gapList.length, "gaps"),
      fact("Officer Actions Generated", actionCount, "actions"),
      fact("Sections Produced", input.briefing.sections.length, "sections"),
    ],
    warnings: [],
    errors: [],
  });

  // ── Copilot ────────────────────────────────────────────────────────
  const execSection = input.briefing.sections.find((s) => s.kind === "executive");
  const hasExecBrief = Boolean(execSection?.payload);
  contributors.push({
    contributorId: "copilot",
    displayName: "Copilot (IBE + Reasoning)",
    executionId: `copilot_${input.briefing.id}`,
    correlationId,
    startedAt: now,
    durationMs: 0,
    status: "success",
    facts: [
      fact("Executive Briefing Generated", hasExecBrief ? "yes" : "no"),
      fact("Model Used", input.briefing.model_used),
      fact("Total Latency", input.briefing.latency_ms, "ms"),
    ],
    warnings: [],
    errors: [],
  });

  // ── Pipeline trace (ordered) ────────────────────────────────────────
  const contributorMap = new Map(contributors.map((c) => [c.contributorId, c]));
  const pipelineTrace: IpefPipelineStage[] = PIPELINE_STAGE_ORDER.map((stageId) => {
    const c = contributorMap.get(stageId);
    return {
      contributorId: stageId,
      displayName: c?.displayName ?? stageId,
      status: c?.status ?? "not-run",
      durationMs: c?.durationMs ?? null,
      facts: c?.facts ?? [],
      warnings: c?.warnings ?? [],
      errors: c?.errors ?? [],
    };
  });

  // ── Confidence decompositions (from MIC confidence registry) ────────
  const confidenceDecompositions: IpefConfidenceDecomposition[] = [];
  const micEntities = mic.entities.getAll();
  for (const entity of micEntities) {
    const confEntry = mic.confidence.getForSubject("entity", entity.canonicalId);
    if (!confEntry) continue;
    const riskEntry = mic.risk.getForEntity(entity.canonicalId);
    const timelineEvs = mic.timeline.getForEntity(entity.canonicalId);
    const evidenceForEntity = mic.evidence.getForEntity(entity.canonicalId);

    const gaps: string[] = [];
    if (evidenceForEntity.length === 0) gaps.push("No evidence records available");
    if (!evidenceForEntity.some((e) => e.grade === "VERIFIED" || e.grade === "CORROBORATED"))
      gaps.push("No VERIFIED or CORROBORATED evidence — all evidence is REPORTED or lower");
    if (evidenceForEntity.length === 1)
      gaps.push("Single-source entity — cross-source corroboration missing");

    const reasoning = buildConfidenceReasoning(entity.label, confEntry, evidenceForEntity.length);

    confidenceDecompositions.push({
      entityId: entity.canonicalId,
      entityLabel: entity.label,
      compositeScore: confEntry.score,
      tier: confEntry.tier as IpefConfidenceDecomposition["tier"],
      factors: confEntry.components.map((c) => ({
        factor: c.factor,
        contribution: c.contribution,
        weight: c.contribution, // stored as weighted contribution
        explanation: c.explanation,
      })),
      supportingEvidenceIds: evidenceForEntity
        .filter((e) => ["VERIFIED", "CORROBORATED"].includes(e.grade))
        .map((e) => e.evidenceId),
      conflictingEvidenceIds: input.uip.fused.contradictions
        .filter((c) => c.entity.id === entity.canonicalId)
        .flatMap((c) => c.values.filter((v) => !v.accepted).map((v) => v.evidenceId)),
      intelligenceGaps: gaps,
      reasoning,
    });
  }

  // ── Recommendation provenance ───────────────────────────────────────
  const recommendationProvenance: IpefRecommendationProvenance[] = [];
  const criticalSection = input.briefing.sections.find((s) => s.kind === "critical_findings");
  const findings =
    (criticalSection?.payload as { findings?: IpefCriticalFinding[] } | undefined)?.findings ?? [];

  for (const finding of findings.slice(0, 5)) {
    // top 5
    const nodes: IpefLineageNode[] = [];
    const recNodeId = `rec_${finding.title?.replace(/\s+/g, "_").slice(0, 20)}`;
    const oieNodeId = `oie_${recNodeId}`;
    const evidenceNodeId = `ev_${recNodeId}`;
    const providerNodeId = `prov_${recNodeId}`;

    nodes.push({
      id: recNodeId,
      kind: "recommendation",
      label: finding.title ?? "Finding",
      detail: `Priority ${finding.priority} finding produced by the OIE`,
      contributorId: "oie",
      timestamp: now,
      children: [oieNodeId],
    });
    nodes.push({
      id: oieNodeId,
      kind: "reasoning",
      label: `OIE assessment — ${finding.grade ?? "UNKNOWN"} grade`,
      detail: `Intelligence Fusion Engine surfaced this finding from ${finding.source ?? "provider evidence"}`,
      contributorId: "ife",
      timestamp: now,
      children: [evidenceNodeId],
    });
    nodes.push({
      id: evidenceNodeId,
      kind: "evidence",
      label: `Evidence: ${finding.source ?? "multiple sources"}`,
      detail: `Raw evidence from ${finding.source ?? "the provider catalog"} — grade: ${finding.grade ?? "UNKNOWN"}`,
      contributorId: "evidence-providers",
      timestamp: now,
      children: [providerNodeId],
    });
    nodes.push({
      id: providerNodeId,
      kind: "provider",
      label: finding.source ?? "Evidence Provider",
      detail: "Original evidence provider",
      contributorId: "evidence-providers",
      timestamp: now,
      children: [],
    });

    recommendationProvenance.push({
      recommendationText: finding.title ?? "",
      chain: nodes,
      rootNodes: [recNodeId],
    });
  }

  // ── Intelligence gaps (union across all contributors) ────────────────
  const allGaps = [...gapList, ...confidenceDecompositions.flatMap((c) => c.intelligenceGaps)];
  const uniqueGaps = Array.from(new Set(allGaps));

  const totalDurationMs = input.briefing.latency_ms;
  const overallStatus = worstStatus(contributors.map((c) => c.status));

  return {
    correlationId,
    createdAt: now,
    contributors,
    pipelineTrace,
    confidenceDecompositions,
    recommendationProvenance,
    intelligenceGaps: uniqueGaps,
    totalDurationMs,
    overallStatus,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────

function buildConfidenceReasoning(
  label: string,
  confEntry: {
    score: number;
    tier: string;
    components: ReadonlyArray<{ factor: string; contribution: number; explanation: string }>;
  },
  evidenceCount: number,
): string {
  const pct = Math.round(confEntry.score * 100);
  const topFactor = [...confEntry.components].sort((a, b) => b.contribution - a.contribution)[0];
  const topDesc = topFactor
    ? `The dominant factor is ${topFactor.factor.toLowerCase()} (${topFactor.explanation}).`
    : "";
  return `${label} carries a ${confEntry.tier} confidence score of ${pct}% derived from ${evidenceCount} evidence record(s) across ${confEntry.components.length} weighted factors. ${topDesc}`;
}
