import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasFinding, tier } from "./helpers";

export const voyageComparisonPlaybook: Playbook = {
  skillId: "voyage_comparison",
  label: "Voyage Comparison",
  objective:
    "Compare the current voyage against prior baselines and surface material deviations.",
  operationalQuestions: [
    "Which ports differ from the prior baseline?",
    "How does cargo differ between voyages?",
    "Are dwell times materially different?",
    "Has the operator changed intermediaries?",
    "Do timing patterns match seasonal norms?",
  ],
  evidenceSequence: [
    "Retrieve current voyage record",
    "Retrieve prior voyage(s) for same vessel or operator",
    "Retrieve manifest for each voyage",
    "Retrieve port-call sequence for each",
    "Compute deviations",
  ],
  requiredEvidence: {
    mandatory: [
      "Current voyage record",
      "At least one prior voyage record",
      "Manifest for both voyages",
    ],
    optional: ["Port-call timing history", "Weather / seasonal baseline"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "voyage.validation.baseline",
      description: "A comparable prior voyage must exist.",
      severity: "warn",
      onFail: "No comparable prior voyage is available for baseline comparison.",
      when: (ctx) => hasFinding(ctx, ["no prior", "first voyage", "no baseline"]),
    },
  ],
  reasoningRules: [
    {
      id: "voyage.reason.port_sequence",
      description: "Port-sequence deviation.",
      note: (ctx) =>
        hasFinding(ctx, ["port sequence", "route change"])
          ? "Port sequence has changed relative to the baseline."
          : "Port sequence matches the baseline.",
    },
    {
      id: "voyage.reason.cargo_diff",
      description: "Cargo diff between voyages.",
      note: (ctx) =>
        hasFinding(ctx, ["cargo diff", "manifest change", "commodity"])
          ? "Cargo profile diverges from the baseline voyage."
          : "Cargo profile is consistent with the baseline voyage.",
    },
    {
      id: "voyage.reason.dwell",
      description: "Dwell / timing anomaly.",
      note: (ctx) =>
        hasFinding(ctx, ["dwell", "delay", "timing"])
          ? "Dwell timing is anomalous vs baseline."
          : "Dwell timing is within the baseline envelope.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Current, prior, and manifest evidence all corroborated (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "One baseline is corroborated but another is silent.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Only single-voyage evidence — comparison is provisional.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "No prior voyage was retrievable; comparison suspended.",
    },
  ],
  escalationRules: [],
  operationalRisks: [
    "Route change masking a sanctioned port call",
    "Cargo swap between voyages hiding a controlled commodity",
    "Timing anomalies indicating ship-to-ship transfer",
  ],
  recommendations: [
    {
      id: "voyage.rec.investigate_route_change",
      when: (ctx) => hasFinding(ctx, ["port sequence", "route change"]),
      action: "Investigate the route change and screen all new port calls",
      priority: "high",
      rationale: () =>
        "Route changes must be screened for sanctioned or high-risk ports.",
    },
    {
      id: "voyage.rec.reconcile_cargo",
      when: (ctx) => hasFinding(ctx, ["cargo diff", "manifest change"]),
      action: "Reconcile the cargo diff with the operator",
      priority: "high",
      rationale: () =>
        "Cargo changes between voyages require operator explanation.",
    },
    {
      id: "voyage.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log the comparison as within-envelope",
      priority: "monitor",
      rationale: () => "No SOP rule breached; retain for future baselines.",
    },
  ],
  baselineInformationGaps: [
    "Confirmed prior manifest for the same route",
    "AIS trace for the baseline voyage",
  ],
  followUps: [
    "Highlight port sequence differences",
    "Diff cargo declarations",
    "Review timing and dwell anomalies",
    "Assess operator behaviour trend",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
