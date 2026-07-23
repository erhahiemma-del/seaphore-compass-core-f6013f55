import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasFinding, revenueExposure, formatNaira, tier } from "./helpers";

export const revenueLeakagePlaybook: Playbook = {
  skillId: "revenue_leakage",
  label: "Revenue Leakage Analysis",
  objective:
    "Quantify potential revenue shortfall and identify the mechanism (under-declaration, misclassification, unpaid levy).",
  operationalQuestions: [
    "What is the declared revenue basis vs assessed?",
    "Which line items are undervalued or misclassified?",
    "Are peer operators paying more on comparable voyages?",
    "Is the shortfall recurring for this operator?",
    "What is the recoverable exposure?",
  ],
  evidenceSequence: [
    "Retrieve declared revenue basis (tariff, levy, fee schedule)",
    "Retrieve assessed vs paid amounts",
    "Retrieve peer operator benchmarks",
    "Retrieve historical payment record",
    "Compute shortfall by line item",
  ],
  requiredEvidence: {
    mandatory: [
      "Declared tariff or levy basis",
      "Assessed vs paid amount",
      "Comparable voyage or operator benchmark",
    ],
    optional: ["Historical payment record", "Auditor annotations"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "revenue.validation.rate",
      description: "Applied tariff rate must match published schedule.",
      severity: "warn",
      onFail: "Applied tariff rate is inconsistent with the published schedule.",
      when: (ctx) => hasFinding(ctx, ["tariff", "rate", "levy"]) && hasFinding(ctx, ["mismatch", "wrong"]),
    },
  ],
  reasoningRules: [
    {
      id: "revenue.reason.undervaluation",
      description: "Undervaluation vs peer benchmark.",
      note: (ctx) =>
        hasFinding(ctx, ["undervalue", "under-declare", "under declared"])
          ? "Declared value trails peer benchmarks — undervaluation is plausible."
          : "Declared value is broadly in line with peer benchmarks.",
    },
    {
      id: "revenue.reason.misclassification",
      description: "HS code misclassification.",
      note: (ctx) =>
        hasFinding(ctx, ["misclassif", "wrong hs", "hs code"])
          ? "HS code may be misclassified into a lower-duty band."
          : "HS classification appears consistent with the commodity.",
    },
    {
      id: "revenue.reason.recurrence",
      description: "Recurring shortfall for this operator.",
      note: (ctx) =>
        hasFinding(ctx, ["recurring", "pattern", "history"])
          ? "Shortfall is recurring — operator profile warrants targeted audit."
          : "Shortfall appears isolated to this voyage.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Tariff, peer benchmark, and payment record all corroborated (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "Partial corroboration — one benchmark or record is missing.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Only the declared record is available; no independent benchmark.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "Revenue evidence stack did not respond; do not quantify.",
    },
  ],
  escalationRules: [
    {
      id: "revenue.escalate.exposure",
      when: (ctx) => revenueExposure(ctx) >= 10_000_000,
      action: "Escalate to Revenue Intelligence for recovery assessment",
      route: "Revenue Intelligence Centre",
    },
  ],
  operationalRisks: [
    "Recurring under-declaration eroding levy base",
    "Misclassification concentrated on a specific commodity family",
    "Systemic shortfall across an operator's fleet",
  ],
  recommendations: [
    {
      id: "revenue.rec.escalate",
      when: (ctx) => revenueExposure(ctx) >= 1_000_000,
      action: "Escalate to Revenue Intelligence for shortfall recovery",
      priority: "critical",
      rationale: (ctx) =>
        `Estimated shortfall ${formatNaira(revenueExposure(ctx))} exceeds the SOP escalation threshold.`,
    },
    {
      id: "revenue.rec.reassess_hs",
      when: (ctx) => hasFinding(ctx, ["hs code", "misclassif"]),
      action: "Reassess HS classification against the physical cargo",
      priority: "high",
      rationale: () => "HS misclassification indicated — reassessment is mandatory.",
    },
    {
      id: "revenue.rec.audit_operator",
      when: (ctx) => hasFinding(ctx, ["recurring", "pattern"]),
      action: "Open a targeted audit on the operator's last 12 months",
      priority: "high",
      rationale: () => "Recurring shortfall justifies a broader audit window.",
    },
    {
      id: "revenue.rec.monitor",
      when: (ctx) => revenueExposure(ctx) < 1_000_000 && ctx.criticalFindings.length === 0,
      action: "Log the shortfall and continue monitoring",
      priority: "monitor",
      rationale: () => "Exposure below the SOP escalation threshold.",
    },
  ],
  baselineInformationGaps: [
    "Confirmed physical cargo classification",
    "Peer operator benchmark for the same commodity",
  ],
  followUps: [
    "Break down shortfall by line item",
    "Compare with peer operators",
    "Review historical payment record",
    "Escalate for recovery assessment",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
