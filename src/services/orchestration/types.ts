/**
 * LAYER 2 & 4 — Type contracts for the Intelligence Orchestration Engine.
 *
 * Contracts here are stable across model swaps (Layer 6). No component in
 * `src/services/orchestration/*` may deviate.
 */

export type BriefingMode = "lookup" | "assessment" | "investigation" | "forecast";

export type Workspace =
  | "ownership"
  | "revenue"
  | "compliance"
  | "evidence"
  | "vessel"
  | "port";

export type EvidenceGrade =
  | "VERIFIED"
  | "CORROBORATED"
  | "OBSERVED"
  | "REPORTED"
  | "INFERRED"
  | "UNKNOWN";

export type CapabilityId =
  | "OWNERSHIP_ANALYSIS"
  | "REVENUE_LEAKAGE_DETECTION"
  | "MANIFEST_CORRELATION"
  | "RELATIONSHIP_DISCOVERY"
  | "PATTERN_DETECTION"
  | "COMPLIANCE_ASSESSMENT"
  | "SANCTIONS_SCREENING"
  | "EVIDENCE_SEARCH"
  | "DOCUMENT_ANALYSIS"
  | "RISK_SCORING"
  | "RECOMMENDATION_ENGINE";

export type AgentId =
  | "ownership"
  | "revenue"
  | "manifest"
  | "compliance"
  | "evidence"
  | "forecast";

export interface QueryContext {
  investigation_id?: string;
  vessel?: string;
  port?: string;
  workspace?: Workspace;
}

export interface OfficerQuery {
  query: string;
  session_id?: string;
  officer_id: string;
  context?: QueryContext;
}

/** 2.1 output of the Intent Classifier. */
export interface Intent {
  mode: BriefingMode;
  capabilities: CapabilityId[];
  entities: Array<{ type: string; value: string }>;
  workspace?: Workspace;
  raw: string;
  reasoning: string;
}

export interface EvidenceItem {
  id: string;
  grade: EvidenceGrade;
  source_system: string;
  content: string;
  entity_ids: string[];
  collected_at?: string;
  hash_sha256?: string;
  provenance?: Record<string, unknown>;
  /** Assigned by the Evidence Fusion Engine after ranking. */
  weight?: number;
  authority?: number;
  freshness?: number;
  conflicts_with?: string[];
}

export interface RetrievalResult {
  agent: AgentId;
  capability: CapabilityId;
  source_name: string;
  responded: boolean;
  evidence: EvidenceItem[];
  latency_ms: number;
  error?: string;
}

export interface FusedEvidence {
  ranked: EvidenceItem[];
  conflicts: Array<{ a: string; b: string; reason: string }>;
  sources_queried: number;
  sources_responded: number;
  sources_corroborated: number;
}

export interface ConfidenceMatrix {
  evidenceQuality: number;
  coverage: number;
  freshness: number;
  corroboration: number;
  consistency: number;
  /** Weighted composite [0,1]. */
  composite: number;
  /** Human tier used for UI banners and rule 2.3 counter-hypothesis gating. */
  tier: "low" | "medium" | "high";
}

/** 2.13 Four-Layer Analytical Assessment. */
export interface Assessment {
  verifiedFacts: string[];
  observedPatterns: Array<{ pattern: string; caseRefs: string[] }>;
  analyticalAssessment: string;
  recommendation: string;
  counterHypotheses: string[];
  intelligenceGaps: string[];
  whyChain: Array<{ step: string; from: string; to: string }>;
}

export type SectionKind =
  | "classification"
  | "executive"
  | "why_this_matters"
  | "critical_findings"
  | "verified_evidence"
  | "observed_patterns"
  | "analytical_assessment"
  | "explainability_chain"
  | "counter_hypotheses"
  | "intelligence_gaps"
  | "decision_impact"
  | "decision_required"
  | "officer_actions"
  | "evidence_sources"
  | "next_questions";

export interface BriefingSection {
  kind: SectionKind;
  title: string;
  payload: unknown;
}

export interface Briefing {
  id: string;
  session_id?: string;
  officer_id: string;
  query: string;
  workspace?: Workspace;
  investigation_id?: string;
  mode: BriefingMode;
  classification: {
    typeBadge: string;
    matrix: ConfidenceMatrix;
    evidenceStrength: "weak" | "moderate" | "strong";
  };
  sections: BriefingSection[];
  intelligence_status: "complete" | "partial" | "insufficient";
  sources_queried: number;
  sources_responded: number;
  sources_corroborated: number;
  confidence_matrix: ConfidenceMatrix;
  latency_ms: number;
  model_used: string;
}

export type OverrideDecision = "agree" | "disagree" | "modify" | "dismiss";

export type OrchestrationEventType =
  | "evidence.collected"
  | "relationship.detected"
  | "risk.changed"
  | "blackout.detected"
  | "briefing.generated"
  | "officer.actioned";
