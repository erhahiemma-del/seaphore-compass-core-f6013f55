/**
 * SPRINT 3 — Adaptive Briefing Renderer
 *
 * UI-oriented JSON contract for the NIMASA Copilot Briefing Renderer.
 * Mirrors Volume I, Layer 2.8 (Intelligence Contract) and Layer 3.3
 * (Active State Layout) but is decoupled from the orchestration server
 * types so it can be produced by mocks, previews, or the live pipeline.
 *
 * Sections are optional — the renderer omits any section whose payload
 * is missing, empty, or `null`. Never fabricate placeholders.
 */

export type EvidenceGrade =
  | "VERIFIED"
  | "CORROBORATED"
  | "OBSERVED"
  | "REPORTED"
  | "INFERRED"
  | "UNKNOWN";

export type FindingPriority = "immediate" | "today" | "monitor" | "archive";

export type OverrideDecision = "agree" | "disagree" | "modify" | "dismiss";

export type ConfidenceTier = "low" | "medium" | "high";

export type EvidenceStrength = "weak" | "moderate" | "strong";

export interface Classification {
  typeBadge: string;
  tier: ConfidenceTier;
  compositeConfidence: number; // 0..1
  evidenceStrength: EvidenceStrength;
  latencyMs?: number;
  model?: string;
}

export interface EvidenceCardData {
  id: string;
  grade: EvidenceGrade;
  title: string;
  source: string;
  observedAt?: string;
  summary?: string;
  hash?: string;
}

export interface EntityCardData {
  id: string;
  type: "vessel" | "company" | "person" | "port" | "manifest" | "sanction" | string;
  name: string;
  identifiers?: Array<{ label: string; value: string }>;
  flag?: string;
  role?: string;
  riskTier?: "low" | "medium" | "high" | "critical";
  lastSeen?: string;
  summary?: string;
}

export interface PatternCardData {
  id: string;
  pattern: string;
  significance: "informational" | "notable" | "material";
  caseRefs?: string[];
  observedCount?: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface WhyChainStep {
  step: string;
  from: string;
  to: string;
}

export interface DecisionImpact {
  revenue: number; // 0..1
  security: number;
  operational: number;
  cargo: number;
}

export interface DecisionRequired {
  deadline: string; // ISO
  risk: string;
}

export interface OfficerActionItem {
  id: string;
  label: string;
  description?: string;
}

export interface EvidenceSourcesSummary {
  queried: number;
  responded: number;
  corroborated: number;
  detail?: Array<{ name: string; grade: EvidenceGrade; responded: boolean }>;
}

export interface EvidenceCitation {
  id: string;
  source: string;
  grade: EvidenceGrade;
  hash?: string;
  excerpt?: string;
  collectedAt?: string;
}

export interface CriticalFinding {
  id: string;
  priority: FindingPriority;
  title: string;
  grade: EvidenceGrade;
  source: string;
  citations?: EvidenceCitation[];
}

export interface AdaptiveBriefing {
  id: string;
  query: string;
  classification: Classification;
  executive?: { text: string };
  criticalFindings?: CriticalFinding[];
  evidence?: EvidenceCardData[];
  entities?: EntityCardData[];
  patterns?: PatternCardData[];
  analytical?: { text: string };
  whyChain?: WhyChainStep[];
  counterHypotheses?: string[];
  intelligenceGaps?: string[];
  decisionImpact?: DecisionImpact;
  decisionRequired?: DecisionRequired;
  officerActions?: OfficerActionItem[];
  evidenceSources?: EvidenceSourcesSummary;
  nextQuestions?: string[];
}

export interface OverrideSubmission {
  decision: OverrideDecision;
  justification?: string;
  actionsAccepted?: string[];
}
