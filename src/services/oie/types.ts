/**
 * Operational Intelligence Engine (OIE) — type contracts.
 *
 * The OIE is the cognitive layer between the Copilot UI and the
 * Adaptive Briefing. It sits *above* the orchestration engine (Layer 2)
 * and choreographs the 8-module operational pipeline:
 *
 *   Officer Query → Interpreter → Mission Context → Skills Registry →
 *   Planner → Evidence Collector → Reasoning Provider →
 *   Decision Support → Human Response → Adaptive Briefing
 *
 * Trust Model — never violated by any downstream code:
 *   • Verified Facts and Analytical Assessments are always separated.
 *   • No AI / model / prompt terminology reaches the officer.
 *   • Every recommendation carries an explicit confidence badge.
 *   • Every response ends with the immutable line
 *     "Officer decides — Seaphore only observes and recommends."
 */
import type { Briefing, OfficerQuery, Workspace } from "@/services/orchestration";

/** Operational domains the interpreter recognises. */
export type OperationalDomain =
  | "vessel"
  | "voyage"
  | "manifest"
  | "cargo"
  | "port"
  | "ownership"
  | "revenue"
  | "compliance"
  | "evidence"
  | "sanctions"
  | "general";

/**
 * Operational intent — semantic, verb-shaped. The interpreter maps a
 * raw query to exactly one primary intent. `ambiguous` triggers the
 * clarifier; `entity_dossier` triggers clarification with skill options.
 */
export type OperationalIntent =
  | "arrival_search"
  | "risk_investigation"
  | "manifest_investigation"
  | "manifest_comparison"
  | "cargo_investigation"
  | "vessel_investigation"
  | "ownership_investigation"
  | "revenue_investigation"
  | "revenue_leakage"
  | "compliance_review"
  | "voyage_comparison"
  | "executive_briefing"
  | "operational_assessment"
  | "entity_dossier"
  | "ambiguous";

export type ConfidenceBadge =
  | "High Confidence"
  | "Medium Confidence"
  | "Low Confidence"
  | "Insufficient Evidence";

export type EntityKind =
  | "vessel"
  | "imo"
  | "mmsi"
  | "company"
  | "port"
  | "officer"
  | "manifest"
  | "voyage"
  | "other";

export interface EntityMention {
  type: EntityKind;
  value: string;
  /** Original text span where the mention was captured. */
  span?: string;
}

export interface InterpretedQuery {
  raw: string;
  /** Query text after pronoun / anaphora resolution. */
  resolved: string;
  intent: OperationalIntent;
  /** Coarse orchestration mode the underlying engine still needs. */
  mode: "lookup" | "assessment" | "investigation" | "forecast";
  domains: OperationalDomain[];
  entities: EntityMention[];
  /**
   * Salient entity carried over from mission context (used when the
   * officer says "it" / "them" / "this vessel"). May be undefined.
   */
  anchor?: EntityMention;
  reasoning: string;
  ambiguous: boolean;
}

export interface OperationalMission {
  investigationId?: string;
  vesselRef?: string;
  voyageRef?: string;
  portRef?: string;
  companyRefs?: string[];
  workspace?: Workspace;
  /** Raw mission-context snapshot from the store. */
  snapshot?: Record<string, unknown>;
  /** Rolling conversation history (officer + copilot turns). */
  conversation: MissionConversationTurn[];
  /** Last salient entity mentioned in the conversation. */
  lastEntity?: EntityMention;
}

export interface MissionConversationTurn {
  role: "officer" | "copilot";
  text: string;
  ts: number;
  /** Entities the interpreter recorded for this turn. */
  entities?: EntityMention[];
}

/**
 * Operational skill — one reusable investigation template. Every skill
 * declares its evidence needs, its reasoning objective, and the
 * follow-up questions the officer is most likely to ask next.
 */
export interface OperationalSkill {
  id: string;
  label: string;
  domain: OperationalDomain;
  intents: OperationalIntent[];
  /** Orchestration capability strings passed to the scheduler. */
  capabilities: string[];
  /** Human-readable evidence requirements. */
  requiredEvidence: string[];
  /** One-sentence reasoning objective the response must satisfy. */
  objective: string;
  /** Ordered section labels the Response Generator must fill. */
  responseTemplate: string[];
  /** Adaptive follow-up chips shown at the end of the briefing. */
  followUps: string[];
  description: string;
}

export interface OperationalPlan {
  interpreted: InterpretedQuery;
  primarySkill: OperationalSkill;
  supportingSkills: OperationalSkill[];
  capabilities: string[];
  followUps: string[];
}

/** A citation attaches a Key Finding to the exact evidence record supporting it. */
export interface EvidenceCitation {
  id: string;
  source: string;
  grade: "VERIFIED" | "CORROBORATED" | "OBSERVED" | "REPORTED" | "INFERRED" | "UNKNOWN";
  hash?: string;
  excerpt?: string;
  collectedAt?: string;
}

/** The mandated 8-section operational response. */
export interface HumanResponse {
  executiveSummary: string;
  situationOverview: string;
  keyFindings: Array<{
    priority: "critical" | "high" | "monitor";
    text: string;
    citations: EvidenceCitation[];
  }>;
  operationalImpact: string;
  recommendedActions: Array<{
    action: string;
    confidence: ConfidenceBadge;
    rationale: string;
  }>;
  informationStillNeeded: string[];
  suggestedNextQuestions: string[];
  confidenceAssessment: { badge: ConfidenceBadge; explanation: string };
  officerNotice: "Officer decides — Seaphore only observes and recommends.";
}

/**
 * A clarifier turn — returned when the interpreter cannot commit to a
 * single operational intent (typically bare entity mentions).
 */
export interface Clarification {
  question: string;
  options: Array<{ id: string; label: string; hint?: string }>;
  /** The entity the clarifier believes the officer is asking about. */
  anchor?: EntityMention;
}

/** Discriminated union — a conversation turn is either a clarify or a full briefing. */
export type OIEResult =
  | {
      kind: "clarify";
      clarification: Clarification;
      interpreted: InterpretedQuery;
      latencyMs: number;
    }
  | {
      kind: "briefing";
      briefing: Briefing;
      humanResponse: HumanResponse;
      plan: OperationalPlan;
      provider: { id: string; label: string; degraded: boolean };
      latencyMs: number;
    };

export interface OIERequest {
  query: OfficerQuery;
  /** Which reasoning provider to route through. Defaults to gemini. */
  providerId?: string;
}
