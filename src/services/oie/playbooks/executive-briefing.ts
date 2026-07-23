import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasCriticalFinding, hasFinding, tier } from "./helpers";

export const executiveBriefingPlaybook: Playbook = {
  skillId: "executive_briefing",
  label: "Executive Intelligence Briefing",
  objective:
    "Deliver a concise, decision-oriented briefing suitable for leadership sign-off.",
  operationalQuestions: [
    "What is the single most material risk right now?",
    "What decision does the officer need to make today?",
    "What corroborating evidence exists?",
    "What is the operational and revenue impact?",
    "What is the recommended posture?",
  ],
  evidenceSequence: [
    "Retrieve all available intelligence on the subject",
    "Retrieve risk indicators across ownership, revenue, compliance",
    "Retrieve institutional-memory case similarities",
    "Retrieve current operational impact metrics",
    "Assemble decision-oriented summary",
  ],
  requiredEvidence: {
    mandatory: [
      "Risk indicator summary",
      "Operational impact summary",
      "At least one corroborating source",
    ],
    optional: ["Historical case similarities", "Peer benchmark"],
    minimumBeforeReasoning: 1,
  },
  validationRules: [
    {
      id: "briefing.validation.decision_focus",
      description: "The briefing must name a concrete officer decision.",
      severity: "warn",
      onFail: "Briefing does not surface a concrete officer decision.",
      when: (ctx) => ctx.criticalFindings.length === 0 && ctx.gaps.length > 3,
    },
  ],
  reasoningRules: [
    {
      id: "briefing.reason.materiality",
      description: "Materiality of the highest-priority finding.",
      note: (ctx) =>
        hasCriticalFinding(ctx)
          ? "A material finding is present — the briefing must state the decision clearly."
          : "No material finding; briefing may be logged as routine.",
    },
    {
      id: "briefing.reason.coverage",
      description: "Coverage across ownership / revenue / compliance.",
      note: (ctx) =>
        hasFinding(ctx, ["ownership", "revenue", "compliance"])
          ? "Coverage spans multiple risk families — cross-referenced view is presented."
          : "Coverage is narrow — flag single-vector exposure.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Three or more independent sources corroborate the briefing (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "Corroboration is present but not multi-source.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Only single-source evidence — briefing is provisional.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () =>
        "No corroborating source responded; leadership decision must not rely on this briefing alone.",
    },
  ],
  escalationRules: [
    {
      id: "briefing.escalate.critical",
      when: (ctx) => hasCriticalFinding(ctx),
      action: "Route the briefing to Director on-call",
      route: "Director Desk",
    },
  ],
  operationalRisks: [
    "Leadership decision made without corroborating evidence",
    "Single high-signal source over-weighted in the summary",
    "Critical finding hidden behind operational noise",
  ],
  recommendations: [
    {
      id: "briefing.rec.route_director",
      when: (ctx) => hasCriticalFinding(ctx),
      action: "Present to Director for immediate decision",
      priority: "critical",
      rationale: () =>
        "A material finding requires a documented officer decision.",
    },
    {
      id: "briefing.rec.deep_dive",
      when: (ctx) => ctx.criticalFindings.length > 0,
      action: "Open a deep dive on the highest-priority finding",
      priority: "high",
      rationale: () => "Highest-priority finding deserves an SOP-driven deep dive.",
    },
    {
      id: "briefing.rec.log_routine",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log as a routine intelligence brief",
      priority: "monitor",
      rationale: () => "No material finding; routine logging is sufficient.",
    },
  ],
  baselineInformationGaps: [
    "Confirmation of officer decision",
    "Latest institutional-memory similar case",
  ],
  followUps: [
    "Deep dive on the highest-risk finding",
    "Show supporting evidence",
    "Route to relevant Intelligence Centre",
    "Prepare for officer decision",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
