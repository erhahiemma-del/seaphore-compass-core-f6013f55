import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasFinding, tier } from "./helpers";

export const complianceReviewPlaybook: Playbook = {
  skillId: "compliance_review",
  label: "Compliance Review",
  objective:
    "Assess the current compliance posture against applicable maritime regulations and highlight material gaps.",
  operationalQuestions: [
    "Are all mandatory NIMASA / IMO certifications current?",
    "Are there open detentions or unresolved PSC deficiencies?",
    "Are SOLAS, MARPOL, ISPS obligations satisfied?",
    "Have any breaches been recorded in the last 12 months?",
    "Is the compliance posture better or worse than peer vessels?",
  ],
  evidenceSequence: [
    "Retrieve certification status (SOLAS, MARPOL, ISPS)",
    "Retrieve NIMASA obligations and expiries",
    "Retrieve open breaches and detentions",
    "Retrieve peer vessel benchmarks",
    "Cross-check institutional memory",
  ],
  requiredEvidence: {
    mandatory: [
      "Certification status",
      "NIMASA obligations record",
      "Open breach or detention record",
    ],
    optional: ["Peer vessel benchmark", "Auditor annotations"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "compliance.validation.certificate_expiry",
      description: "Certificates must be within validity.",
      severity: "block",
      onFail: "At least one mandatory certificate has expired.",
      when: (ctx) => hasFinding(ctx, ["expired", "expiry", "lapsed"]),
    },
  ],
  reasoningRules: [
    {
      id: "compliance.reason.breaches",
      description: "Open breaches signal material risk.",
      note: (ctx) =>
        hasFinding(ctx, ["breach", "detention", "deficiency"])
          ? "Open breaches or detentions are recorded — posture is degraded."
          : "No open breaches or detentions on the record.",
    },
    {
      id: "compliance.reason.certifications",
      description: "Certification coverage.",
      note: (ctx) =>
        hasFinding(ctx, ["solas", "marpol", "isps", "certificate"])
          ? "Certification set requires officer review."
          : "Certification coverage appears complete.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Certifications, obligations, and breach record all corroborated (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "Partial corroboration — at least one compliance feed is silent.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Only a single compliance record is visible.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "Compliance evidence stack did not respond; do not certify posture.",
    },
  ],
  escalationRules: [
    {
      id: "compliance.escalate.expired",
      when: (ctx) => hasFinding(ctx, ["expired", "lapsed"]),
      action: "Escalate to Compliance Officer — expired certification",
      route: "Compliance Intelligence Centre",
    },
  ],
  operationalRisks: [
    "Vessel operating with expired mandatory certification",
    "Repeat MARPOL breaches indicating systemic issue",
    "ISPS gaps exposing port facilities",
  ],
  recommendations: [
    {
      id: "compliance.rec.hold_expired",
      when: (ctx) => hasFinding(ctx, ["expired", "lapsed"]),
      action: "Hold clearance until the expired certificate is reissued",
      priority: "critical",
      rationale: () => "SOP does not permit operations under an expired mandatory certificate.",
    },
    {
      id: "compliance.rec.resolve_breach",
      when: (ctx) => hasFinding(ctx, ["breach", "detention", "deficiency"]),
      action: "Require resolution plan for each open breach before next port call",
      priority: "high",
      rationale: () => "Open breaches must be resolved to restore compliance posture.",
    },
    {
      id: "compliance.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log a green compliance snapshot and monitor renewal calendar",
      priority: "monitor",
      rationale: () => "No SOP rule breached; keep the snapshot for the audit trail.",
    },
  ],
  baselineInformationGaps: ["Latest PSC boarding report", "Peer vessel compliance benchmark"],
  followUps: [
    "Show unresolved breaches",
    "Review certification expiry",
    "Escalate to Compliance Officer",
    "Compare with peer vessels",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
