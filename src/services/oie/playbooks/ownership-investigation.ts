import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasFinding, tier } from "./helpers";

export const ownershipInvestigationPlaybook: Playbook = {
  skillId: "ownership_investigation",
  label: "Ownership Investigation",
  objective:
    "Trace the beneficial-ownership network and identify any exposure through affiliated entities.",
  operationalQuestions: [
    "Who is the registered owner vs the operator?",
    "Who is the ultimate beneficial owner?",
    "Are directors or shareholders on any sanctions list?",
    "Are there affiliated vessels in the same network?",
    "Does the corporate structure include known shell jurisdictions?",
  ],
  evidenceSequence: [
    "Retrieve registered owner and operator",
    "Retrieve beneficial-owner chain",
    "Retrieve corporate registry filings",
    "Screen owner, directors, shareholders for sanctions",
    "Expand corporate network two hops",
  ],
  requiredEvidence: {
    mandatory: [
      "Registered owner",
      "Beneficial owner chain",
      "Sanctions screening result",
    ],
    optional: ["Corporate registry filing", "Affiliated vessels list"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "ownership.validation.beneficial",
      description: "Beneficial-owner chain must terminate in a natural person or state entity.",
      severity: "warn",
      onFail: "Beneficial-owner chain terminates in an opaque entity.",
      when: (ctx) => hasFinding(ctx, ["opaque", "unknown owner", "shell"]),
    },
  ],
  reasoningRules: [
    {
      id: "ownership.reason.shell",
      description: "Shell-jurisdiction indicator.",
      note: (ctx) =>
        hasFinding(ctx, ["shell", "opaque", "nominee"])
          ? "Corporate chain routes through jurisdictions with limited disclosure — treat as elevated risk."
          : "Corporate chain does not obviously route through opaque jurisdictions.",
    },
    {
      id: "ownership.reason.sanctions",
      description: "Sanctions across the network.",
      note: (ctx) =>
        hasFinding(ctx, ["sanction", "ofac", "watchlist"])
          ? "Sanctioned party detected in the ownership network."
          : "No sanctioned party surfaced in the ownership network.",
    },
    {
      id: "ownership.reason.affiliates",
      description: "Affiliated vessel exposure.",
      note: (ctx) =>
        hasFinding(ctx, ["affiliated", "sister", "fleet"])
          ? "Affiliated vessels share directors or beneficial owners — expand scope."
          : "No affiliated-vessel exposure surfaced.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Registry, beneficial-owner filing, and sanctions screen all corroborated (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "Some corroboration but the beneficial-owner chain is incomplete.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Registry visible but no independent beneficial-owner corroboration.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "Ownership evidence stack did not respond; do not conclude.",
    },
  ],
  escalationRules: [
    {
      id: "ownership.escalate.sanctions",
      when: (ctx) => hasFinding(ctx, ["sanction", "ofac", "watchlist"]),
      action: "Route to Compliance and Sanctions Desk",
      route: "Compliance Intelligence Centre",
    },
  ],
  operationalRisks: [
    "Beneficial owner sanctioned but registered owner is not",
    "Directors linked to prior detentions or seizures",
    "Fleet-wide exposure through shared corporate parent",
  ],
  recommendations: [
    {
      id: "ownership.rec.beneficial_verification",
      when: (ctx) => hasFinding(ctx, ["opaque", "shell", "unknown owner"]),
      action: "Request beneficial-ownership verification from the operator",
      priority: "critical",
      rationale: () =>
        "SOP requires a natural-person or state terminus for the beneficial chain.",
    },
    {
      id: "ownership.rec.sanctions_hold",
      when: (ctx) => hasFinding(ctx, ["sanction", "ofac", "watchlist"]),
      action: "Hold operations pending sanctions clearance",
      priority: "critical",
      rationale: () =>
        "Sanctioned party in the network blocks routine clearance under SOP.",
    },
    {
      id: "ownership.rec.expand_network",
      when: (ctx) => hasFinding(ctx, ["affiliated", "sister", "fleet"]),
      action: "Expand the corporate network two hops and re-screen",
      priority: "high",
      rationale: () =>
        "Affiliated exposure demands network-level screening rather than single-vessel review.",
    },
    {
      id: "ownership.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log the ownership snapshot in institutional memory",
      priority: "monitor",
      rationale: () => "No SOP rule breached; keep the snapshot for future queries.",
    },
  ],
  baselineInformationGaps: [
    "Beneficial-owner declaration signed by the operator",
    "Corporate registry filings for intermediate holding companies",
  ],
  followUps: [
    "Expand corporate network two hops",
    "Screen owner and directors for sanctions",
    "Cross-check with previous investigations",
    "Review linked vessels in the same network",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
