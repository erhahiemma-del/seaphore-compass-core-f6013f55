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
      surface: "Hypothesis Ledger",
      location: "src/components/copilot/briefing/AdaptiveBriefing.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ibe.proactive-nudges",
    name: "Proactive intelligence nudges",
    producer: "IBE",
    description: "System-initiated suggestions when new evidence changes posture.",
    state: "PROJECTED",
    projection: {
      surface: "Copilot proactive banner",
      location: "src/routes/copilot.tsx",
      interaction: "action",
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
];

export function getContractEntry(id: string): ProjectionContractEntry | undefined {
  return PROJECTION_CONTRACT.find((e) => e.id === id);
}
