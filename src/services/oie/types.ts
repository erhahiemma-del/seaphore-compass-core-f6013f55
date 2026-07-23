/**
 * Operational Intelligence Engine (OIE) — type contracts.
 *
 * The OIE is the cognitive layer between the Copilot UI and the Adaptive
 * Briefing. It sits *above* the orchestration engine (Layer 2). It does
 * NOT re-implement retrieval, fusion, or the reasoning pipeline; it
 * choreographs those layers and produces a **Human Response** in strict
 * operational language.
 *
 * Contract rules (Seaphore Trust Model):
 *   • Verified Facts and Analytical Assessments are ALWAYS separated.
 *   • No AI / model / prompt terminology reaches the officer.
 *   • Every response ends with the immutable line
 *     "Officer decides — Seaphore only observes and recommends."
 *   • Every recommendation carries an explicit confidence badge.
 */
import type { Briefing, OfficerQuery, Workspace } from "@/services/orchestration";

export type OperationalDomain =
  | "vessel"
  | "voyage"
  | "manifest"
  | "port"
  | "ownership"
  | "revenue"
  | "compliance"
  | "evidence"
  | "sanctions"
  | "general";

export type ConfidenceBadge =
  | "High Confidence"
  | "Medium Confidence"
  | "Low Confidence"
  | "Insufficient Evidence";

export interface InterpretedQuery {
  raw: string;
  intent: "lookup" | "assessment" | "investigation" | "forecast";
  domains: OperationalDomain[];
  entities: Array<{ type: "vessel" | "imo" | "company" | "port" | "officer" | "manifest" | "other"; value: string }>;
  reasoning: string;
}

export interface OperationalMission {
  investigationId?: string;
  vesselRef?: string;
  voyageRef?: string;
  portRef?: string;
  companyRefs?: string[];
  workspace?: Workspace;
  /** Free-form snapshot from `mission-context.store`. */
  snapshot?: Record<string, unknown>;
}

export interface OperationalSkill {
  id: string;
  label: string;
  domain: OperationalDomain;
  /** Capability strings map onto orchestration `CapabilityId`s. */
  capabilities: string[];
  description: string;
}

export interface OperationalPlan {
  interpreted: InterpretedQuery;
  skills: OperationalSkill[];
  /** True when we need to hit external decision-support tables. */
  requiresDecisionSupport: boolean;
}

/** Structured, operational-language response the UI renders. */
export interface HumanResponse {
  /** 1. Situation Overview — 1–2 sentences, plain English. */
  situationOverview: string;
  /** 2. Verified Facts — hard, sourced data only. */
  verifiedFacts: string[];
  /** 3. Analytical Assessment — the "so what", clearly marked as assessment. */
  analyticalAssessment: string;
  /** 4. Key Findings — bullet observations, priority-ordered. */
  keyFindings: Array<{ priority: "critical" | "high" | "monitor"; text: string }>;
  /** 5. Recommendations — each carries its own confidence badge. */
  recommendations: Array<{ action: string; confidence: ConfidenceBadge; rationale: string }>;
  /** 6. Confidence Assessment — plain-language overall confidence. */
  confidenceAssessment: { badge: ConfidenceBadge; explanation: string };
  /** 7. Operational Impact — what happens if the officer acts / does not act. */
  operationalImpact: string;
  /** 8. Next Best Questions — chip suggestions in operational language. */
  nextQuestions: string[];
  /** 9. Immutable officer notice — never omit. */
  officerNotice: "Officer decides — Seaphore only observes and recommends.";
}

export interface OIEResult {
  briefing: Briefing;
  humanResponse: HumanResponse;
  plan: OperationalPlan;
  provider: { id: string; label: string; degraded: boolean };
  latencyMs: number;
}

export interface OIERequest {
  query: OfficerQuery;
  /** Which reasoning provider to route through. Defaults to registry default. */
  providerId?: string;
}
