/**
 * Seaphore AI Copilot — canonical types.
 *
 * Every Copilot response passes through this shape. Confidence, evidence,
 * and observed language are mandatory (HR-1, HR-3, HR-4, HR-11, COP-1..7).
 *
 * The engine is modular so that different providers (Lovable AI / Gemini,
 * OpenAI, local rules) can plug into the same contract without changing
 * the UI layer or the Copilot instance configs.
 */
import type { ConfidenceTier } from "@/components/confidence-chip";
import type { RiskLevel } from "@/components/risk-pill";

/** The four canonical intelligence modes (Command Center Part 09). */
export type CopilotMode = "SEARCH" | "RETRIEVE" | "INTERPRET" | "ADVISE";

export const COPILOT_MODES: {
  key: CopilotMode;
  ordinal: string;
  question: string;
  capabilities: string[];
}[] = [
  {
    key: "SEARCH",
    ordinal: "01",
    question: "What exists?",
    capabilities: [
      "Vessel lookup",
      "IMO lookup",
      "Company lookup",
      "Manifest lookup",
      "Container lookup",
      "Port lookup",
    ],
  },
  {
    key: "RETRIEVE",
    ordinal: "02",
    question: "What happened?",
    capabilities: [
      "Timeline",
      "Events",
      "Documents",
      "Transactions",
      "Inspections",
      "Alerts",
    ],
  },
  {
    key: "INTERPRET",
    ordinal: "03",
    question: "Why did it happen?",
    capabilities: [
      "Pattern Detection",
      "Risk Assessment",
      "Anomaly Detection",
      "Relationship Mapping",
      "Root Cause Analysis",
      "Impact Assessment",
    ],
  },
  {
    key: "ADVISE",
    ordinal: "04",
    question: "What should we do?",
    capabilities: [
      "Priorities",
      "Recommendations",
      "Forecasting",
      "Scenario Analysis",
      "Resource Allocation",
      "Strategic Briefing",
    ],
  },
];

export type CopilotInstanceKey =
  | "seaphore"
  | "manifest"
  | "cargo"
  | "revenue"
  | "memory";

/** A single piece of evidence backing an observed pattern or recommendation. */
export interface CopilotEvidence {
  id: string;
  label: string;
  source: string; // authoritative source name (e.g. "AIS", "Customs Manifest DB")
  confidence: ConfidenceTier;
  href?: string;
  entityRef?: string; // IMO / Company ID / Manifest ID
}

export interface CopilotObservation {
  id: string;
  text: string; // observed-language statement
  confidence: ConfidenceTier;
  evidence: CopilotEvidence[];
}

export interface CopilotRecommendation {
  id: string;
  action: string; // what to do
  rationale: string; // why (evidence basis)
  risk: RiskLevel;
  confidence: ConfidenceTier;
  route?: string; // workspace to route to (COP-4)
  evidence: CopilotEvidence[];
}

export interface CopilotHistoricalMatch {
  id: string;
  caseRef: string;
  summary: string;
  matchPct: number;
  outcome: string;
  route?: string;
}

export interface CopilotRelatedInvestigation {
  id: string;
  ref: string;
  title: string;
  status: "Open" | "Closed" | "Escalated";
  route?: string;
}

/** The canonical response object returned by every Copilot call. */
export interface CopilotResponse {
  instance: CopilotInstanceKey;
  mode: CopilotMode;
  query: string;
  /** Short summary — always observed language (COP-2). */
  summary: string;
  /** Overall confidence for the response. */
  confidence: ConfidenceTier;
  /** True when evidence is insufficient (COP-7). Summary should say so. */
  insufficientEvidence: boolean;
  observations: CopilotObservation[];
  recommendations: CopilotRecommendation[];
  historical: CopilotHistoricalMatch[];
  related: CopilotRelatedInvestigation[];
  /** Suggested next mode / next question chips. */
  followUps: string[];
  /** Was this served from mock intelligence or a live model call? */
  served: "mock" | "gemini" | "hybrid";
  latencyMs: number;
}

export interface AskCopilotInput {
  instance: CopilotInstanceKey;
  query: string;
  /** Optional forced mode; otherwise classified from the query. */
  mode?: CopilotMode;
  /** Optional context object (entityId, voyageId, caseId, etc.). */
  context?: Record<string, string>;
}
