/**
 * OIE · Playbook Engine — type contracts.
 *
 * A Playbook is the standard operating procedure (SOP) for one
 * Operational Skill. Playbooks encode maritime investigation
 * expertise as data: evidence requirements, reasoning rules,
 * confidence bands, recommendations, and follow-ups.
 *
 * The Playbook Engine executes a Playbook deterministically against
 * the current briefing. It never invents facts and it never talks
 * to a model. Downstream, its output overrides the reasoning
 * provider's recommendations so responses stay repeatable and
 * explainable regardless of which brain answered.
 */
import type { Briefing, ConfidenceMatrix } from "@/services/orchestration";
import type { ConfidenceBadge, OperationalMission } from "../types";

/** Shape of a Critical Finding as it lives in the engine's briefing. */
export interface PlaybookFinding {
  priority: "critical" | "high" | "monitor" | string;
  title: string;
  source?: string;
  grade?: string;
}

/** Context handed to every playbook rule / trigger. Read-only. */
export interface PlaybookContext {
  briefing: Briefing;
  criticalFindings: PlaybookFinding[];
  gaps: string[];
  matrix: ConfidenceMatrix;
  intelligenceStatus: "complete" | "partial" | "insufficient";
  sources: { queried: number; responded: number; corroborated: number };
  decisionImpact?: {
    revenue: number;
    security: number;
    operational: number;
    cargo: number;
  };
  mission?: OperationalMission;
}

/** A single deterministic rule the Playbook Engine will evaluate. */
export interface PlaybookRule {
  id: string;
  description: string;
  /** Optional guard — omit for rules that are always noted. */
  when?: (ctx: PlaybookContext) => boolean;
}

/** Reasoning rule — a maritime heuristic the response must reflect. */
export interface ReasoningRule extends PlaybookRule {
  /** How to phrase this rule in the response's reasoning notes. */
  note: (ctx: PlaybookContext) => string;
}

/** Confidence band — deterministic mapping to the officer-facing badge. */
export interface ConfidenceBand {
  badge: ConfidenceBadge;
  when: (ctx: PlaybookContext) => boolean;
  explanation: (ctx: PlaybookContext) => string;
}

/** Escalation rule — trigger + officer action if breached. */
export interface EscalationRule {
  id: string;
  when: (ctx: PlaybookContext) => boolean;
  action: string;
  route: string;
}

/** Deterministic recommendation triggered by a rule breach. */
export interface RecommendationRule {
  id: string;
  when: (ctx: PlaybookContext) => boolean;
  action: string;
  priority: "critical" | "high" | "monitor";
  rationale: (ctx: PlaybookContext) => string;
}

/** Validation rule — evidence integrity checks the SOP mandates. */
export interface ValidationRule extends PlaybookRule {
  severity: "block" | "warn";
  onFail: string;
}

/** The full SOP for one Operational Skill. */
export interface Playbook {
  /** Must match an OperationalSkill.id. */
  skillId: string;
  label: string;
  /** One-sentence investigation objective. */
  objective: string;
  /** Operational questions the officer expects the SOP to answer. */
  operationalQuestions: string[];
  /** Ordered evidence collection sequence. */
  evidenceSequence: string[];
  requiredEvidence: {
    mandatory: string[];
    optional: string[];
    /** Minimum count of mandatory items needed before reasoning proceeds. */
    minimumBeforeReasoning: number;
  };
  validationRules: ValidationRule[];
  reasoningRules: ReasoningRule[];
  confidenceBands: ConfidenceBand[];
  escalationRules: EscalationRule[];
  operationalRisks: string[];
  recommendations: RecommendationRule[];
  /** Baseline gaps the SOP always considers. Merged with runtime gaps. */
  baselineInformationGaps: string[];
  followUps: string[];
  /** Ordered section labels the response template must cover. */
  responseTemplate: string[];
}

/** Result of running a Playbook against a briefing. */
export interface PlaybookEvaluation {
  playbookId: string;
  /** Deterministic recommendations (may be empty when no rule fires). */
  recommendedActions: Array<{
    action: string;
    priority: "critical" | "high" | "monitor";
    confidence: ConfidenceBadge;
    rationale: string;
  }>;
  informationStillNeeded: string[];
  suggestedNextQuestions: string[];
  confidence: { badge: ConfidenceBadge; explanation: string };
  /** Reasoning notes derived from the applied maritime rules. */
  reasoningNotes: string[];
  /** IDs of rules that fired — useful for tests & audit. */
  appliedRuleIds: string[];
  /** Evidence limitations flagged when mandatory items are missing. */
  evidenceLimitations: string[];
  /** Escalations that must be surfaced to the officer. */
  escalations: string[];
  /** True when the SOP mandates that reasoning cannot proceed. */
  insufficientEvidence: boolean;
}
