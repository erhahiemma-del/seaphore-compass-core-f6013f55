/**
 * Officer-Facing Projection Contract — registry.
 *
 * The single source of truth mapping every backend intelligence artifact to
 * its projection state. Adding a new backend capability without updating this
 * registry is a Golden Rule violation.
 *
 * Keep entries stable-sorted by producer, then id. When state === "PROJECTED"
 * the `projection` field is required. When state === "INTERNAL" the
 * `internal` field is required. When state === "JUSTIFIED_UNNECESSARY" the
 * `justified` field is required. The validator enforces this at test time.
 */

import type { ProjectionContractEntry } from "./types";

const REVIEWED = "2026-07-24";

export const PROJECTION_CONTRACT: ReadonlyArray<ProjectionContractEntry> = [
  // ── IAL ────────────────────────────────────────────────────────────────
  {
    id: "ial.connector-envelope",
    name: "Connector response envelope",
    producer: "IAL",
    description: "Raw connector payload wrapper (source, timestamp, request id).",
    state: "INTERNAL",
    internal: {
      reason: "raw-transport",
      note: "Consumed by IFE; officers see the fused evidence, not the transport envelope.",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ial.freshness-metadata",
    name: "Source freshness age",
    producer: "IAL",
    description: "Age of each source record used in a finding.",
    state: "PROJECTED",
    projection: {
      surface: "Evidence Lineage · freshness note",
      location: "src/components/copilot/briefing/EvidenceLineageView.tsx",
      interaction: "hover-explainer",
      component: "ExplainableConfidenceChip",
    },
    reviewedAt: REVIEWED,
  },

  // ── IFE ────────────────────────────────────────────────────────────────
  {
    id: "ife.evidence-fusion",
    name: "Fused evidence bundle",
    producer: "IFE",
    description: "Consolidated multi-source evidence with corroboration count.",
    state: "PROJECTED",
    projection: {
      surface: "Supporting Evidence Groups",
      location: "src/components/copilot/briefing/SupportingEvidenceGroups.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ife.discarded-evidence",
    name: "Discarded / contradicted evidence",
    producer: "IFE",
    description: "Evidence rejected during fusion (contradiction, staleness, low grade).",
    state: "PROJECTED",
    projection: {
      surface: "Evidence Lineage · Discarded",
      location: "src/components/copilot/briefing/EvidenceLineageView.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  // ── ICE ────────────────────────────────────────────────────────────────
  {
    id: "ice.correlation-graph",
    name: "Correlation graph edges",
    producer: "ICE",
    description: "Entity-to-entity correlation edges with weight and rationale.",
    state: "PROJECTED",
    projection: {
      surface: "ICE Explainability tab",
      location: "src/routes/evidence.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ice.module-scores",
    name: "Per-module ICE scores (14 modules)",
    producer: "ICE",
    description: "Individual scoring outputs for each of the 14 ICE modules.",
    state: "PROJECTED",
    projection: {
      surface: "ICE Explainability · module breakdown",
      location: "src/routes/evidence.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  // ── OIE ────────────────────────────────────────────────────────────────
  {
    id: "oie.eight-section-brief",
    name: "OIE 8-section operational brief",
    producer: "OIE",
    description: "Structured operational output (assessment, evidence, actions, …).",
    state: "PROJECTED",
    projection: {
      surface: "Adaptive Briefing",
      location: "src/components/copilot/briefing/AdaptiveBriefing.tsx",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "oie.query-interpretation",
    name: "Query interpretation trace",
    producer: "OIE",
    description: "Intent, entities, and mission inferred from the officer's utterance.",
    state: "PROJECTED",
    projection: {
      surface: "Officer Decision Header · subject line",
      location: "src/components/copilot/briefing/OfficerDecisionHeader.tsx",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "oie.raw-prompt",
    name: "Model prompt payload",
    producer: "OIE",
    description: "Exact tokens sent to the underlying LLM.",
    state: "INTERNAL",
    internal: {
      reason: "developer-diagnostic",
      note: "Available in observability logs; not part of the officer decision surface.",
    },
    reviewedAt: REVIEWED,
  },

  // ── IBE ────────────────────────────────────────────────────────────────
  {
    id: "ibe.hypotheses",
    name: "Working hypotheses",
    producer: "IBE",
    description: "Derived hypotheses with supporting/contradicting evidence counts.",
    state: "PROJECTED",
    projection: {
      surface: "Working Hypotheses card (Intelligence Projection Panel)",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "drill-in",
      component: "WorkingHypothesesCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.proactive-nudges",
    name: "Proactive intelligence nudges",
    producer: "IBE",
    description: "System-initiated 'while investigating…' discoveries.",
    state: "PROJECTED",
    projection: {
      surface: "Proactive Discoveries banner (Intelligence Projection Panel)",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "action",
      component: "ProactiveDiscoveriesCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.thought-summary",
    name: "IBE pre-response thought (officer-safe projection)",
    producer: "IBE",
    description:
      "What the Copilot considered, what remains unknown, and why the recommendation follows. Chain-of-thought is deliberately not exposed.",
    state: "PROJECTED",
    projection: {
      surface: "Reasoning Summary card (Intelligence Projection Panel)",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "passive-display",
      component: "ReasoningSummaryCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.persona",
    name: "Adaptive officer persona",
    producer: "IBE",
    description: "Communication style the Copilot is using for the current officer.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Status · Style hint",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "passive-display",
      component: "InvestigationStatusCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.investigation-status",
    name: "Investigation status projection",
    producer: "IBE",
    description:
      "Live mission, stage, progress, next milestone, outstanding evidence, confidence for the current turn.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Status card (Intelligence Projection Panel)",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "passive-display",
      component: "InvestigationStatusCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.recommendation",
    name: "Recommended next operational action",
    producer: "IBE",
    description:
      "The single most important next action the Copilot recommends, with confidence and alternatives.",
    state: "PROJECTED",
    projection: {
      surface: "Recommendation card (Intelligence Projection Panel)",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "action",
      component: "RecommendationCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.live-timeline",
    name: "Live investigation timeline",
    producer: "IBE",
    description:
      "Chronological ribbon of mission start, evidence collected, hypothesis updates, discoveries and recommendations.",
    state: "PROJECTED",
    projection: {
      surface: "Live Investigation Timeline (Intelligence Projection Panel)",
      location: "src/components/copilot/projection/IntelligenceProjectionPanel.tsx",
      interaction: "passive-display",
      component: "LiveInvestigationTimelineCard",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.response-contract-audit",
    name: "9-step Response Contract audit record",
    producer: "IBE",
    description: "Per-turn record of which contract steps were satisfied or backfilled.",
    state: "JUSTIFIED_UNNECESSARY",
    justified: {
      justification:
        "The contract is enforced before display; showing officers the audit for every turn would create decision-noise. Exposed on demand in the Projection Contract admin view for governance review.",
      approvedBy: "Director",
      approvedAt: REVIEWED,
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.stage-inference",
    name: "Investigation stage inference",
    producer: "IBE",
    description: "Inferred lifecycle stage (Detect/Investigate/Decide/Share/Memory).",
    state: "PROJECTED",
    projection: {
      surface: "Investigation State panel",
      location: "src/routes/workspace.$id.tsx",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },

  // ── REASONING ─────────────────────────────────────────────────────────
  {
    id: "reasoning.confidence-composite",
    name: "Composite confidence score",
    producer: "REASONING",
    description: "Weighted score combining grade distribution, corroboration, freshness.",
    state: "PROJECTED",
    projection: {
      surface: "Explainable Confidence Chip",
      location: "src/components/intelligence/ExplainableConfidenceChip.tsx",
      interaction: "hover-explainer",
      component: "ExplainableConfidenceChip",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "reasoning.alternative-explanations",
    name: "Alternative / rejected hypotheses",
    producer: "REASONING",
    description: "Hypotheses considered and rejected with reasons.",
    state: "PROJECTED",
    projection: {
      surface: "Evidence Lineage · Discarded",
      location: "src/components/copilot/briefing/EvidenceLineageView.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  // ── COPILOT / COMMANDS ────────────────────────────────────────────────
  {
    id: "copilot.command-registry",
    name: "Copilot command registry",
    producer: "COPILOT",
    description: "The 11 operational commands and their execution metadata.",
    state: "PROJECTED",
    projection: {
      surface: "Copilot Commands panel",
      location: "src/components/copilot/CopilotCommandsPanel.tsx",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },

  // ── WORKSPACE ─────────────────────────────────────────────────────────
  {
    id: "workspace.persistence",
    name: "Persistent investigation state",
    producer: "WORKSPACE",
    description: "Mission, artefacts, decisions retained across sessions.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace (6-panel)",
      location: "src/routes/workspace.$id.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "workspace.rejected-artefacts",
    name: "Rejected workspace artefacts",
    producer: "WORKSPACE",
    description: "Evidence artefacts the officer or system marked REJECTED.",
    state: "PROJECTED",
    projection: {
      surface: "Evidence Lineage · Discarded",
      location: "src/components/copilot/briefing/EvidenceLineageView.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  // ── CAPABILITY (Sanctions) ────────────────────────────────────────────
  {
    id: "capability.sanctions-hits",
    name: "Sanctions screening hits",
    producer: "CAPABILITY",
    description: "OpenSanctions matches with match-score and topic tags.",
    state: "PROJECTED",
    projection: {
      surface: "Entities Requiring Screening · row detail",
      location: "src/features/compliance/Compliance.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.screening-run-history",
    name: "Screening run history (retries)",
    producer: "CAPABILITY",
    description: "Prior + latest run records for retried entities.",
    state: "PROJECTED",
    projection: {
      surface: "Compliance retry timeline",
      location: "src/features/compliance/Compliance.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  // ── COMPLIANCE ────────────────────────────────────────────────────────
  {
    id: "compliance.report-metadata",
    name: "Compliance report metadata",
    producer: "COMPLIANCE",
    description: "workspaceId, generatedAt, posture banner data on exported PDF.",
    state: "PROJECTED",
    projection: {
      surface: "Compliance PDF header + posture banner",
      location: "src/lib/compliance/export-compliance-report.ts",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "compliance.audit-log-row",
    name: "Immutable audit log row",
    producer: "AUDIT",
    description: "Append-only record of every officer decision.",
    state: "PROJECTED",
    projection: {
      surface: "Administration · Audit Log",
      location: "src/routes/admin.index.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  // ── OBSERVABILITY ─────────────────────────────────────────────────────
  {
    id: "observability.pipeline-latency",
    name: "Per-stage pipeline latency percentiles",
    producer: "OBSERVABILITY",
    description: "p50/p95 latency for each pipeline stage.",
    state: "PROJECTED",
    projection: {
      surface: "Observability dashboard",
      location: "src/routes/observability.tsx",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "observability.model-token-usage",
    name: "Per-model token usage",
    producer: "OBSERVABILITY",
    description: "Token in/out per model per window.",
    state: "INTERNAL",
    internal: {
      reason: "developer-diagnostic",
      note: "Cost / capacity signal for platform operators; not intelligence for the officer.",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "copilot.executive-brief",
    name: "Executive Maritime Intelligence Brief",
    producer: "COPILOT",
    description:
      "Nine-section executive projection (summary, KPIs, key facts, relationships, timeline, risks, insights, recommendations, evidence) synthesised from AdaptiveBriefing + IBE + OIE HumanResponse.",
    state: "PROJECTED",
    projection: {
      surface: "Copilot workspace · Executive Brief",
      location: "src/components/copilot/briefing/ExecutiveBriefing.tsx",
      interaction: "drill-in",
      component: "ExecutiveBriefing",
    },
    reviewedAt: REVIEWED,
  },

  // ── Sprint 1C — Global Fishing Watch + OSAE ────────────────────────────
  {
    id: "ial.gfw-vessel-evidence",
    name: "GFW vessel identity + last position",
    producer: "IAL",
    description: "Identity, flag, MMSI/IMO, and last-known position collected from Global Fishing Watch.",
    state: "PROJECTED",
    projection: {
      surface: "Key Facts · vessel identity",
      location: "src/components/copilot/briefing/ExecutiveBriefing.tsx",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ial.gfw-movement-history",
    name: "GFW AIS movement history",
    producer: "IAL",
    description: "90-day AIS movement events used to compute continuity.",
    state: "PROJECTED",
    projection: {
      surface: "Timeline Intelligence",
      location: "src/components/copilot/briefing/ExecutiveBriefing.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "reasoning.ais-continuity-report",
    name: "AIS Behaviour Analyzer continuity report",
    producer: "REASONING",
    description: "Contextualised gap analysis (weather, distance from coast, historical frequency). Never risk-scored.",
    state: "PROJECTED",
    projection: {
      surface: "Supporting Evidence · AIS continuity",
      location: "src/components/copilot/briefing/SupportingEvidenceGroups.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.osae-assessment",
    name: "OSAE operational priority + narrative",
    producer: "CAPABILITY",
    description: "Priority (watch/monitor/act/urgent) and officer-safe narrative — the only authorised interpretation of AIS continuity.",
    state: "PROJECTED",
    projection: {
      surface: "Officer Decision Header · priority chip",
      location: "src/components/copilot/briefing/OfficerDecisionHeader.tsx",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.intelligence-evidence-viewer",
    name: "Intelligence Evidence Viewer",
    producer: "CAPABILITY",
    description:
      "Unified officer-facing surface listing every sanitized evidence item (GFW identity, gap events, AIS continuity, OSAE assessment, workspace evidence) with source, timestamp, confidence, type, status, and safe source link.",
    state: "PROJECTED",
    projection: {
      surface: "Intelligence Evidence · Assessment Basis",
      location: "src/routes/intelligence-evidence.tsx",
      component: "src/components/intelligence/IntelligenceEvidenceViewer.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.identity-confidence",
    name: "Identity Confidence Scorer",
    producer: "CAPABILITY",
    description:
      "Every vessel search (GFW today, all identity connectors going forward) scores each candidate against the query using IMO, MMSI, call sign, name similarity, aliases, historical names, and flag, modified by the upstream provider's match verdict. When the top score falls below the auto-select threshold or a runner-up sits within the tie band, the pipeline MUST NOT auto-select — the officer is prompted to confirm.",
    state: "PROJECTED",
    projection: {
      surface: "Vessel Identity Confirmation · Copilot / Compliance",
      location: "src/components/intelligence/VesselIdentityConfirm.tsx",
      component: "src/components/intelligence/VesselIdentityConfirm.tsx",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.unified-intelligence-package",
    name: "Unified Intelligence Package (IFE)",
    producer: "CAPABILITY",
    description:
      "Sprint 1D: the Intelligence Fusion Engine consolidates evidence from every connector into a single canonical view. Cross-connector identity resolution merges records that describe the same vessel/company under different id schemes (IMO vs MMSI vs name). Contradictions are surfaced with per-source attribution — never silently overwritten. OSAE assessments attach to the resolved canonical entity so OIE renders one coherent Executive Maritime Intelligence Brief regardless of how many connectors contributed. Connectors remain evidence providers only; OSAE remains the sole authority for operational priority.",
    state: "PROJECTED",
    projection: {
      surface: "Executive Brief · Supporting Evidence + Contradictions",
      location: "src/components/copilot/briefing/SupportingEvidenceGroups.tsx",
      component: "src/services/ife/unified.ts",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
];

export function getContractEntry(id: string): ProjectionContractEntry | undefined {
  return PROJECTION_CONTRACT.find((e) => e.id === id);
}
