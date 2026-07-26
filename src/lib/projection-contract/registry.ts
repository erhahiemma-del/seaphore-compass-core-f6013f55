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
    id: "ial.opensanctions-evidence-provider",
    name: "OpenSanctions Evidence Provider",
    producer: "IAL",
    description:
      "Sprint EP-01 — first production Evidence Provider (Tier 1, no auth, daily refresh). Live OpenSanctions /v3/search results normalized into the Seaphore evidence model (entityName, aliases, countries, sanctionLists, sanctionPrograms, imoNumber, startDate/endDate, lastUpdated, confidence, evidenceUrl, rawPayload, rawHash) and cached 24h. Connector responsibility ends at a validated EvidencePackage: no DB writes, no identity resolution, no dedupe, no UIP creation.",
    state: "PROJECTED",
    projection: {
      surface: "Evidence Provenance · citation list (and MIBC evidence sources)",
      location: "src/components/copilot/briefing/EvidenceProvenancePanel.tsx",
      component: "src/connectors/implementations/OpenSanctionsConnector.ts",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  {
    id: "ial.provider-resolution",
    name: "Provider Resolution Strategy",
    producer: "IAL",
    description:
      "Sprint EP-01A — resolves exactly ONE active Evidence Provider per capability (explicit override → environment → priority → health failover). Hybrid simulator/live execution is disabled by default. Descriptive provider metadata (providerType, priority, environment, enabled) lives on each connector.",
    state: "INTERNAL",
    internal: {
      reason: "raw-transport",
      note: "Selection mechanics inside the Connector Framework. Officers already see WHICH provider produced each record through the Evidence Provenance citation list; the resolution decision itself is an acquisition-layer detail.",
    },
    reviewedAt: REVIEWED,
  },

  {
    id: "copilot.voice-dictation",
    name: "Officer Voice Dictation (speech-to-text)",
    producer: "REASONING",
    description:
      "Microphone capture in the Copilot command bar, transcribed server-side via the AI gateway at /api/copilot/transcribe. Produces the officer's own words as text only — no interpretation, enrichment, entity resolution or routing.",
    state: "PROJECTED",
    projection: {
      surface: "Copilot command bar · microphone control with live transcript",
      location: "src/components/copilot/InvestigationLanding.tsx",
      interaction: "action",
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
    id: "capability.intelligence-evidence-explorer",
    name: "Intelligence Evidence Explorer (first Canonical UIP consumer)",
    producer: "CAPABILITY",
    description:
      "Sprint 2.1B — first production consumer of the Canonical Unified Intelligence Package. The route loads evidence exclusively via `getUip(briefing.source_uip_id)` from the UIP registry (no demo fixtures, no seedEvidence). The `UipCanonicalPanel` (mounted above the Explorer) projects the FULL fused package: (a) raw evidence + freshest observation, (b) canonical entities with alias-merge counts and per-record OC-001 grade, (c) correlations — every IFE contradiction with severity, resolution rationale, and per-source values, (d) package-level confidence and composite grade, (e) provenance and sources with per-connector record count, agreement score, and fusion weight, plus deep-link filters back into the Explorer. Every evidence row below carries `connector`, `sourceName`, `providerRecordId`, and content `hash` so it traces back to its originating connector and evidence record. Explorer views (List / Graph / Timeline / Source) are unchanged; only the data source now flows from the Canonical UIP. Existing OKL explainability rows continue to surface inside List/Timeline via `capability.okl-evidence-explainability`.",
    state: "PROJECTED",
    projection: {
      surface: "Intelligence Evidence · Canonical UIP Panel + Explorer",
      location: "src/routes/intelligence-evidence.tsx",
      component: "src/components/intelligence/UipCanonicalPanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },

  {
    id: "capability.okl-evidence-explainability",
    name: "OKL Evidence Explainability",
    producer: "OKL",
    description:
      "Every Operational Knowledge Layer pattern is projected into the Intelligence Evidence Explorer as an evidence row carrying full officer-facing explainability: WHY the pattern was detected (headline reasoning step and full reasoning trace), supporting evidence ids from the UIP, contradictory evidence ids, source connectors, alternative benign explanations with likelihood, the 5-level Confidence Pyramid (identity/evidence/fusion/pattern/recommendation with tier and rationale), historical context, officer-approval-gated recommendation labels, and provenance (uip id, fused package id, detector). Rendered as a collapsible violet panel inside List and Timeline evidence rows so explainability sits alongside the timeline — no OKL conclusion is surfaced without its evidence chain.",
    state: "PROJECTED",
    projection: {
      surface: "Intelligence Evidence · OKL Explainability panel",
      location: "src/routes/intelligence-evidence.tsx",
      component: "src/components/intelligence/IntelligenceEvidenceExplorer.tsx",
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
  {
    id: "capability.maritime-knowledge-graph",
    name: "Maritime Knowledge Graph (MKG)",
    producer: "CAPABILITY",
    description:
      "Downstream of the Intelligence Fusion Engine. The MKG stores one node per canonical entity (vessel/company/person/port/cargo/voyage/manifest/sanction/inspection/incident) and one edge per evidence-backed relationship (OWNS, OPERATES, MANAGES, FLAGGED_BY, CALLS_AT, DEPARTED_FROM, ARRIVED_AT, PERFORMED_VOYAGE, CARRIED, LISTED_ON_MANIFEST, CONSIGNED_TO/BY, SANCTIONED_BY, SUBJECT_OF_INSPECTION, SUBJECT_OF_INCIDENT, ALIAS_OF, ...). Every node and every edge carries the source connector, evidence record id, timestamp, and OC-001 grade — nothing enters the graph without provenance. The graph exposes bounded traversal (BFS, findPaths) so Copilot and OSAE can answer multi-hop questions (Vessel → Owner → Company → Director → Port → Cargo → Incident) with cited relationships. Officers explore it interactively at /knowledge-graph with a radial visualisation and an Entity Inspector panel.",
    state: "PROJECTED",
    projection: {
      surface: "Knowledge Graph · Relational Intelligence",
      location: "src/routes/knowledge-graph.tsx",
      component: "src/components/mkg/GraphView.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.predictive-intelligence-engine",
    name: "Predictive Intelligence Engine (PIE)",
    producer: "CAPABILITY",
    description:
      "Downstream of the IFE and MKG. PIE consumes fused, evidence-backed intelligence and produces deterministic, explainable predictions: AIS behaviour forecasts, route-deviation likelihood, ownership churn, sanctions proximity, cargo/tonnage anomalies, compliance recurrence, and revenue anomalies. Every prediction carries a headline, model probability, OC-001 confidence (aggregated as the weakest supporting grade), horizon, weighted contributing factors, alternative hypotheses, baseline snapshot (mean/stddev/n/z-score), and per-record evidence citations. Predictions are keyed by a stable id so repeat cycles update — not duplicate — them, and alerting is gated by both a probability threshold and a cooldown window to minimise false positives. Connectors cannot generate predictions directly; PIE only accepts IAL-normalised evidence. Officers explore predictions at /predictions with a Predictions Panel that reveals factors, alternatives, baselines, and citations for every forecast.",
    state: "PROJECTED",
    projection: {
      surface: "Predictive Intelligence · PIE",
      location: "src/routes/predictions.tsx",
      component: "src/components/pie/PredictionsPanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.mission-planning",
    name: "AI-Assisted Mission Planning",
    producer: "CAPABILITY",
    description:
      "Sprint 1G. Deterministic, evidence-backed mission planner producing objectives, tasking, resource allocation, timeline, and recommendations from PIE predictions and unified intelligence. Every mission carries an immutable audit trail; execution requires explicit officer approval per the Golden Rule (Detect. Decide. Act).",
    state: "PROJECTED",
    projection: {
      surface: "Mission Planning",
      location: "src/routes/missions.tsx",
      component: "src/services/mission/index.ts",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.investigation-workflows",
    name: "Investigation Workflows",
    producer: "CAPABILITY",
    description:
      "Sprint 1G. Structured, evidence-backed case workflow for vessels, cargo, companies, people, sanctions, compliance, and incidents. Stage machine (intake → evidence → analysis → decision → closed) with linked evidence, officer-approved findings, and an immutable append-only audit trail. Additive to existing /investigate.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workflows",
      location: "src/routes/investigations-workflow.tsx",
      component: "src/services/investigations-workflow/index.ts",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.revenue-leakage-detection",
    name: "Revenue Leakage Detection",
    producer: "CAPABILITY",
    description:
      "Sprint 1G. Deterministic detectors that scan fused evidence for manifest under-declaration, unpaid port fees, cargo under-valuation, unscheduled movement mismatches, and compliance-linked fee bypasses. Every finding carries factors, magnitude, currency, confidence, and citations, and enforcement requires officer approval.",
    state: "PROJECTED",
    projection: {
      surface: "Revenue Leakage",
      location: "src/routes/revenue-leakage.tsx",
      component: "src/services/revenue-leakage/index.ts",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.national-maritime-risk",
    name: "National Maritime Risk Scoring Engine (NMRSE)",
    producer: "CAPABILITY",
    description:
      "Sprint 1G. Continuous, explainable composite risk score (0–100) for vessels, ports, operators, companies, and activities. Composes PIE predictions, OSAE priority, sanctions proximity, compliance history, MKG connectivity, and revenue leakage with fixed weights and a per-component breakdown that carries evidence ids. OSAE remains the sole authority for operational priority.",
    state: "PROJECTED",
    projection: {
      surface: "National Maritime Risk",
      location: "src/routes/national-risk.tsx",
      component: "src/services/nmrse/index.ts",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.maritime-investigation-workspace",
    name: "Maritime Investigation Workspace (MIW) — Dashboard",
    producer: "CAPABILITY",
    description:
      "Sprint 1H Landing 1. Officer-facing dashboard aggregating every persistent investigation from the workspace store with lifecycle stage (INTAKE → EVIDENCE → ANALYSIS → DECISION → REPORT → CLOSED), priority, explainable confidence tier, evidence coverage, revenue at risk, overdue tracking, and open task count. Every KPI is derived deterministically from evidence and hypotheses; the officer remains the sole decision maker.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Dashboard",
      location: "src/routes/investigations.tsx",
      component: "src/stores/workspace.store.ts",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.operational-knowledge-layer",
    name: "Operational Knowledge Layer (OKL)",
    producer: "CAPABILITY",
    description:
      "Consumes ONLY the Unified Intelligence Package and the Maritime Knowledge Graph and produces explainable operational patterns (repeat offender, suspicious routing, dark AIS, ownership networks, cargo/manifest anomalies, revenue leakage, sanctions exposure, port congestion, cross-investigation links, historical behaviour). Every pattern carries a full Confidence Pyramid (identity · evidence · fusion · pattern · recommendation), source connectors, contradictions, alternative explanations, reasoning trace, and officer-approval-gated recommendations. The officer decides.",
    state: "PROJECTED",
    projection: {
      surface: "Operational Knowledge",
      location: "src/routes/operational-knowledge.tsx",
      component: "src/components/intelligence/OperationalInsights.tsx",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.maritime-intelligence-briefing-centre",
    name: "Maritime Intelligence Briefing Centre (MIBC)",
    producer: "CAPABILITY",
    description:
      "Enterprise reporting engine. Consumes ONLY the Maritime Investigation Workspace (enriched by IFE / OKL / MKG) — never raw connector data. Produces 11 report types (Executive, Operational, Investigation, Revenue, Cargo, Container, Manifest, Compliance, Port, Historical Comparison, Trend) as PDF / DOCX / XLSX / PPTX. Every chart references evidence; every recommendation references the Operational Knowledge Layer; every conclusion is explainable. Officer decides.",
    state: "PROJECTED",
    projection: {
      surface: "Briefing Centre",
      location: "src/routes/briefing-centre.tsx",
      component: "src/services/mibc/engine.ts",
      interaction: "drill-in",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.investigation-mission-bridge",
    name: "Investigation → Mission Planning bridge",
    producer: "CAPABILITY",
    description:
      "Operational Command Platform integration. Mission plans may only be created from within a Maritime Investigation Workspace, and only when the investigation has (a) an officer-approved decision, (b) an officer-approved recommendation, or (c) a linked Operational Knowledge Layer pattern. Every mission inherits subjects, objectives, and citations from the investigation and appends an audit-trail entry that traces the mission back to the case ID. Mission Planning does NOT operate independently.",
    state: "PROJECTED",
    projection: {
      surface: "MissionsPanel inside Investigation Workspace",
      location: "src/components/investigation/MissionsPanel.tsx",
      component: "src/services/mission/from-investigation.ts",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.okl-investigation-auto-ingest",
    name: "OKL → Investigation Workspace auto-ingest",
    producer: "CAPABILITY",
    description:
      "Every Operational Knowledge Package produced by the OKL is automatically projected into all ACTIVE / MONITORING investigations whose subject overlaps a detected pattern. Patterns are linked via oklPatternIds; each pattern anchors a COLLECTED evidence entry (source OKL/<detector>, hash okl:<patternId>), each officer-approval-gated recommendation becomes a workspace task with urgency-mapped priority, contradictions land on the case timeline as conflict events, and HIGH/CRITICAL patterns auto-advance INTAKE cases to ANALYSIS with a stage-history note. Idempotent: re-runs never duplicate. Officer decides on every task.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Evidence / Tasks / Timeline / Stage history",
      location: "src/stores/workspace.store.ts",
      component: "src/services/okl/auto-ingest.ts",
      interaction: "passive-display",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.okl-workspace-drilldown",
    name: "OKL Patterns Panel · Investigation Workspace",
    producer: "OKL",
    description:
      "Dedicated panel inside the Maritime Investigation Workspace that surfaces every OKL pattern linked to the case with full drill-down: risk level chip, 5-level Confidence Pyramid (identity/evidence/fusion/pattern/recommendation with tier and explanation), reasoning trace, supporting evidence ids, contradictory evidence ids, source connectors, alternative benign explanations, and historical context. Every recommended action is officer-approval-gated: Approve creates a workspace task (sourceCommand okl:rec:<id>) with urgency-mapped priority AND records an immutable decision citing rationale/confidence/evidence ids AND emits a timeline event; Reject records a decision (detail contains okl:reject:<id>) AND emits a timeline event. A Sync OKL control runs auto-ingest on demand and reports the delta. A Drill-down link opens the Intelligence Evidence Explorer scoped to the investigation and pattern.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Knowledge panel",
      location: "src/routes/workspace.$id.tsx",
      component: "src/components/investigation/OklPatternsPanel.tsx",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "workspace.outcome-learning-loop",
    name: "Investigation Outcome & Learning Loop",
    producer: "WORKSPACE",
    description:
      "Sprint 2.6 — every closed investigation records a structured outcome (finalOutcome, officerDecision, actionTaken, resolutionStatus, success rating, lessonsLearned, per-recommendation effectiveness, optional KPIs). Persisted via workspace.recordOutcome, emitted into OKL as rich OUTCOME rows (plus one OUTCOME row per rated recommendation labelled REC_<effectiveness>). Feeds OIE HISTORICAL_OUTCOME and RECOMMENDATION_EFFECTIVENESS lenses so future investigations answer 'which recommendations historically worked' from real history — not fixtures.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Outcome & Lessons card",
      location: "src/routes/workspace.$id.tsx",
      component: "src/features/investigate/OutcomeCaptureCard.tsx",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "capability.mibc-background-scheduler",
    name: "MIBC background report scheduler",
    producer: "CAPABILITY",
    description:
      "Durable, retry-capable scheduling for the Briefing Centre. Officers configure daily / weekly / monthly / quarterly schedules; a pg_cron dispatcher advances next_run_at and enqueues jobs into report_jobs, resets jobs stuck in CLAIMED > 10 min with exponential backoff, and dead-letters after 5 attempts. A browser worker atomically claims one QUEUED job at a time (mibc_claim_next_job RPC), assembles the report from the Investigation Workspace, uploads the PDF to the exports bucket under {userId}/{jobId}.pdf, and marks the job SUCCEEDED. Signed URLs are minted server-side and scoped to the officer. Jobs survive tab closes; the UI never blocks on generation. Every schedule and job row is owner-RLS'd.",
    state: "PROJECTED",
    projection: {
      surface: "Briefing Centre · Scheduled reports and Job history",
      location: "src/routes/briefing-centre.tsx",
      component: "src/components/briefing/SchedulesPanel.tsx",
      interaction: "action",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ife.unified-intelligence-package",
    name: "Unified Intelligence Package (canonical SSOT)",
    producer: "IFE",
    description:
      "Single canonical evidence artifact per officer query/investigation, addressed by unifiedPackageId. Every downstream capability (MKG, PIE, OKL, OSAE, Revenue, NMRSE, MIW, Mission Planning, Copilot, Executive Briefing, MIBC) resolves the same evidence set through the UIP registry. No route generates its own intelligence.",
    state: "PROJECTED",
    projection: {
      surface: "Executive Briefing header · UIP chip",
      location: "src/components/copilot/briefing/ExecutiveBriefing.tsx",
      interaction: "hover-explainer",
    },
    reviewedAt: REVIEWED,
  },
  {
    id: "ife.canonical-pipeline",
    name: "Canonical IFE pipeline (IAL Bridge → Identity Resolution → Fusion → UIP)",
    producer: "IFE",
    description:
      "Slice 3 producer swap: retrieval evidence flows through the IAL Bridge, canonical identity resolution, and the IFE fusion engine, producing the Unified Intelligence Package registered as the single source of truth. Legacy `orchestration.evidence-fusion` and `orchestration.uip-adapter` have been retired.",
    state: "PROJECTED",
    projection: {
      surface: "Executive Briefing header · UIP chip",
      location: "src/components/copilot/briefing/ExecutiveBriefing.tsx",
      interaction: "hover-explainer",
    },
    reviewedAt: REVIEWED,
  },

  // ── OKL (Sprint 2.4) ───────────────────────────────────────────────────
  {
    id: "okl.persistent-store",
    name: "Operational Knowledge persistent store",
    producer: "OKL",
    description:
      "Immutable per-investigation ingest of entities, relationships, patterns, risks, decisions, outcomes and recommendations, each stamped with source_uip_id and briefing_id.",
    state: "INTERNAL",
    internal: {
      reason: "implementation-detail",
      note: "Officers do not read the raw store; projected via Historical Knowledge panel.",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "okl.related-investigations",
    name: "Related investigations (cross-investigation)",
    producer: "OKL",
    description:
      "Prior investigations that touched the same entities as the current workspace subject.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Historical Knowledge panel",
      location: "src/components/okl/HistoricalKnowledgePanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "okl.known-patterns",
    name: "Known patterns (recurring across investigations)",
    producer: "OKL",
    description: "Patterns confirmed in prior investigations touching the current entity set.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Historical Knowledge panel",
      location: "src/components/okl/HistoricalKnowledgePanel.tsx",
      interaction: "passive-display",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "okl.historical-decisions",
    name: "Historical officer decisions",
    producer: "OKL",
    description: "Decisions recorded on prior investigations touching the same entities.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Historical Knowledge panel",
      location: "src/components/okl/HistoricalKnowledgePanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "okl.recurring-risks",
    name: "Recurring risks (cross-investigation)",
    producer: "OKL",
    description: "Risk levels attached to entities that recur across the OKL store.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Historical Knowledge panel",
      location: "src/components/okl/HistoricalKnowledgePanel.tsx",
      interaction: "passive-display",
    },
    reviewedAt: "2026-07-25",
  },

  // ── OIE Reasoning (Sprint 2.5) ─────────────────────────────────────────
  {
    id: "oie.similar-investigations",
    name: "Similar investigations",
    producer: "OIE",
    description:
      "Historical investigations whose OKL entity fingerprint overlaps the current subject. Jaccard-scored, connector-free.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Intelligence Engine panel",
      location: "src/components/oie/OperationalInsightsPanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "oie.recurring-patterns",
    name: "Recurring operational patterns",
    producer: "OIE",
    description:
      "Pattern kinds that recur across ≥2 investigations in the OKL, ranked by breadth and peak record confidence.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Intelligence Engine panel",
      location: "src/components/oie/OperationalInsightsPanel.tsx",
      interaction: "passive-display",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "oie.historical-outcomes",
    name: "Historical outcomes",
    producer: "OIE",
    description:
      "Decision↔Outcome pairings replayed from prior investigations that touched the subject. Read-only; no re-computation.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Intelligence Engine panel",
      location: "src/components/oie/OperationalInsightsPanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "oie.emerging-risks",
    name: "Emerging risks",
    producer: "OIE",
    description:
      "Risk-band records concentrated on the same entity within the last 60 days, weighted by severity and recency.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Intelligence Engine panel",
      location: "src/components/oie/OperationalInsightsPanel.tsx",
      interaction: "passive-display",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "oie.recommendation-effectiveness",
    name: "Recommendation effectiveness",
    producer: "OIE",
    description:
      "OKL RECOMMENDATION rows paired with subsequent OUTCOME rows to derive a historical effectiveness ratio.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Intelligence Engine panel",
      location: "src/components/oie/OperationalInsightsPanel.tsx",
      interaction: "passive-display",
    },
    reviewedAt: "2026-07-25",
  },
  {
    id: "oie.cross-case-relationships",
    name: "Cross-case relationships",
    producer: "OIE",
    description:
      "Non-subject entities that co-appear alongside the current subject across ≥2 investigations.",
    state: "PROJECTED",
    projection: {
      surface: "Investigation Workspace · Operational Intelligence Engine panel",
      location: "src/components/oie/OperationalInsightsPanel.tsx",
      interaction: "drill-in",
    },
    reviewedAt: "2026-07-25",
  },
];


export function getContractEntry(id: string): ProjectionContractEntry | undefined {
  return PROJECTION_CONTRACT.find((e) => e.id === id);
}
