/**
 * SPRINT UX-004 — Adaptive Intelligence Briefing Engine (AIBE)
 *
 * Configuration-driven profiles that let a single briefing renderer
 * behave like a team of specialised maritime analysts. NO reasoning
 * happens here — every profile is pure presentation logic applied on
 * top of the frozen `AdaptiveBriefing` contract produced by the OIE.
 *
 * Adding a new mission type is a config change: append an entry to the
 * registry. The renderer will pick it up automatically.
 */
import type { AdaptiveBriefing } from "../types";

/** Canonical mission types. Must match the values used by dispatchers. */
export type MissionBriefingType =
  | "SANCTIONS_SCREENING"
  | "REVENUE_LEAKAGE"
  | "AIS_INVESTIGATION"
  | "OWNERSHIP_INVESTIGATION"
  | "PORT_CONGESTION"
  | "VESSEL_RISK"
  | "COMPLIANCE_REVIEW"
  | "ENVIRONMENTAL_RISK"
  | "GENERIC";

/** Section slots the renderer knows how to draw. */
export type BriefingSlot =
  | "header" // Officer Decision Header (Executive Assessment, Recommendation, Confidence, Completeness, Progress, Screening)
  | "kpis" // Mission-specific KPI banner
  | "gaps" // Recommended Intelligence Collection
  | "criticalFindings"
  | "evidence"
  | "entities"
  | "patterns"
  | "analytical"
  | "counterHypotheses"
  | "decisionImpact"
  | "decisionRequired"
  | "officerActions"
  | "override"
  | "followUpCommands" // Mission-specific commands
  | "sources" // Technical metadata (should always be last)
  | "nextQuestions";

export interface KPI {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}

export interface FollowUpCommand {
  label: string;
  /** Free-form query that will be re-submitted through the same OIE pipeline. */
  query: string;
}

export interface InvestigationTask {
  key: string;
  label: string;
  /** Case-insensitive haystack match against evidence / source names. */
  match: RegExp;
}

export interface BriefingProfile {
  id: MissionBriefingType;
  /** Display badge shown at the top of the briefing (overrides typeBadge). */
  badge: string;
  /** Short human-readable label describing the investigation kind. */
  label: string;
  /** One-line description of what this briefing answers. */
  purpose: string;
  /** Fallback recommendation used by the header when nothing more specific applies. */
  defaultRecommendation: string;
  /** Ordered slot list — sections not in the list are omitted. */
  sectionOrder: BriefingSlot[];
  /** Task set the Investigation Progress tracker cares about for this mission. */
  investigationTasks: InvestigationTask[];
  /** Confidence-reason hints appended when the pipeline supplies none. */
  confidenceFactors: string[];
  /**
   * Compute mission-specific KPIs from the briefing payload. Empty array
   * means "no KPI banner". Never fabricates data — returns cards only when
   * the underlying briefing actually contains the signal.
   */
  computeKPIs(briefing: AdaptiveBriefing): KPI[];
  /**
   * Generate mission-specific follow-up commands. Only related suggestions —
   * never generic Copilot chatter.
   */
  followUpCommands(briefing: AdaptiveBriefing): FollowUpCommand[];
  /**
   * Derive an operational recommendation from the briefing. Returning
   * `undefined` lets the header apply its generic fallback.
   */
  recommendation?: (briefing: AdaptiveBriefing) => string | undefined;
}
