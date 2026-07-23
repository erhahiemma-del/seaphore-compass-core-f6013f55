import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasFinding, tier } from "./helpers";

export const vesselRiskAssessmentPlaybook: Playbook = {
  skillId: "vessel_investigation",
  label: "Vessel Risk Assessment",
  objective:
    "Assemble a vessel dossier and surface the operational risk indicators the officer should weigh.",
  operationalQuestions: [
    "Is the flag state on any watchlist?",
    "Does AIS history show gaps or spoofing indicators?",
    "Are there open detentions or PSC deficiencies?",
    "Is the owner or operator sanctioned?",
    "Has this vessel appeared in prior Seaphore cases?",
  ],
  evidenceSequence: [
    "Retrieve registry and flag record",
    "Retrieve AIS movement history",
    "Fetch PSC detentions and deficiencies",
    "Screen owner and operator for sanctions",
    "Cross-check institutional memory for prior cases",
  ],
  requiredEvidence: {
    mandatory: [
      "Vessel registry record",
      "AIS movement history",
      "Owner and operator record",
    ],
    optional: ["PSC deficiency history", "Prior incident record"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "vessel.validation.ais_gap",
      description: "AIS gaps > 12h must be explained.",
      severity: "warn",
      onFail: "AIS history contains an unexplained gap of more than 12 hours.",
      when: (ctx) => hasFinding(ctx, ["ais gap", "ais off", "signal loss"]),
    },
  ],
  reasoningRules: [
    {
      id: "vessel.reason.flag",
      description: "Flag state posture.",
      note: (ctx) =>
        hasFinding(ctx, ["flag", "paris mou", "tokyo mou"])
          ? "Flag state carries elevated PSC scrutiny — factor into risk weighting."
          : "Flag state carries no elevated PSC scrutiny at this time.",
    },
    {
      id: "vessel.reason.sanctions",
      description: "Sanctions and watchlist exposure.",
      note: (ctx) =>
        hasFinding(ctx, ["sanction", "watchlist", "ofac", "un"])
          ? "Sanctions or watchlist proximity detected in the ownership network."
          : "No sanctions or watchlist proximity was surfaced.",
    },
    {
      id: "vessel.reason.psc",
      description: "PSC detention history.",
      note: (ctx) =>
        hasFinding(ctx, ["detention", "psc", "deficiency"])
          ? "Prior detentions or PSC deficiencies are on file."
          : "No prior detentions surfaced in the record.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Registry, AIS, and ownership all corroborated (${ctx.sources.corroborated} sources).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "Partial corroboration — some feeds are silent or conflicting.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Only single-source vessel evidence is available.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "Vessel evidence stack did not respond; suspend risk decisions.",
    },
  ],
  escalationRules: [
    {
      id: "vessel.escalate.sanctions",
      when: (ctx) => hasFinding(ctx, ["sanction", "ofac", "watchlist"]),
      action: "Escalate to Compliance and Sanctions Desk immediately",
      route: "Compliance Intelligence Centre",
    },
  ],
  operationalRisks: [
    "Sanctioned owner routing goods through Nigerian waters",
    "AIS manipulation to hide port calls",
    "Repeat detentions signalling substandard operations",
  ],
  recommendations: [
    {
      id: "vessel.rec.sanctions_hold",
      when: (ctx) => hasFinding(ctx, ["sanction", "ofac", "watchlist"]),
      action: "Place vessel on hold pending sanctions clearance",
      priority: "critical",
      rationale: () =>
        "Sanctions proximity detected — clearance may not proceed without a positive screening result.",
    },
    {
      id: "vessel.rec.inspection",
      when: (ctx) => hasFinding(ctx, ["detention", "psc", "deficiency"]),
      action: "Schedule an enhanced Port State Control inspection",
      priority: "high",
      rationale: () =>
        "Prior PSC issues are on file; SOP requires an enhanced boarding.",
    },
    {
      id: "vessel.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log the dossier and monitor next port call",
      priority: "monitor",
      rationale: () =>
        "No SOP rule breached; retain the vessel dossier for institutional memory.",
    },
  ],
  baselineInformationGaps: [
    "Beneficial-owner confirmation",
    "Live AIS position",
  ],
  followUps: [
    "Show voyage history",
    "Review ownership network",
    "Check sanctions and watchlist exposure",
    "Run manifest cross-check",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
