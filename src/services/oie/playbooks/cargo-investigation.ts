import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { findingsMatch, hasFinding, tier } from "./helpers";

export const cargoInvestigationPlaybook: Playbook = {
  skillId: "cargo_investigation",
  label: "Cargo Verification",
  objective:
    "Assess whether the declared cargo profile is consistent with the vessel type, route, and operator history.",
  operationalQuestions: [
    "Is the declared cargo consistent with the vessel type?",
    "Does the commodity mix match the trade lane?",
    "Are hazardous items declared and stowed correctly?",
    "Do container declarations reconcile with shipping instructions?",
    "Has this operator declared similar cargo before?",
  ],
  evidenceSequence: [
    "Retrieve cargo declaration",
    "Retrieve container / hazmat classification",
    "Pull vessel-type profile",
    "Fetch operator historical cargo profile",
    "Cross-check trade-lane norms",
  ],
  requiredEvidence: {
    mandatory: [
      "Declared cargo items",
      "Container classification",
      "Historical cargo profile for the operator",
    ],
    optional: ["Hazmat manifest annex", "Stowage plan"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "cargo.validation.hazmat",
      description: "Hazmat items must carry UN class and packing group.",
      severity: "block",
      onFail: "Hazmat declaration is missing UN class or packing group.",
      when: (ctx) => hasFinding(ctx, ["hazmat", "dangerous goods"]) && hasFinding(ctx, ["missing", "absent"]),
    },
  ],
  reasoningRules: [
    {
      id: "cargo.reason.vessel_fit",
      description: "Cargo must fit the vessel type.",
      note: (ctx) =>
        hasFinding(ctx, ["vessel type", "unsuitable", "mismatch"])
          ? "Declared cargo does not fit the vessel type on file."
          : "Declared cargo is consistent with the vessel type.",
    },
    {
      id: "cargo.reason.route_fit",
      description: "Cargo must be plausible for the trade lane.",
      note: (ctx) =>
        hasFinding(ctx, ["route", "trade lane"])
          ? "Cargo profile is unusual for this trade lane."
          : "Cargo profile is typical for this trade lane.",
    },
    {
      id: "cargo.reason.container_reconciliation",
      description: "Container counts must reconcile with cargo lines.",
      note: (ctx) =>
        hasFinding(ctx, ["container", "teu"])
          ? "Container counts do not reconcile with declared cargo lines."
          : "Container counts reconcile with declared cargo lines.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Three or more sources corroborate the cargo picture (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: (ctx) =>
        `Some corroboration (${ctx.sources.corroborated}) but conflicting signals remain.`,
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Single-source cargo evidence only; treat as provisional.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "Cargo evidence stack did not respond; do not conclude.",
    },
  ],
  escalationRules: [
    {
      id: "cargo.escalate.hazmat",
      when: (ctx) => hasFinding(ctx, ["hazmat", "dangerous goods"]),
      action: "Alert Hazmat Handling Desk before berth allocation",
      route: "Port Operations Desk",
    },
  ],
  operationalRisks: [
    "Undeclared dangerous goods on board",
    "Cargo used to mask prohibited or controlled items",
    "Container/manifest reconciliation gap indicating diversion",
  ],
  recommendations: [
    {
      id: "cargo.rec.verify_before_clearance",
      when: (ctx) => findingsMatch(ctx, ["mismatch", "discrepancy"]).length > 0,
      action: "Verify cargo physically before clearance",
      priority: "critical",
      rationale: () =>
        "Cargo discrepancy identified; SOP requires physical verification before goods release.",
    },
    {
      id: "cargo.rec.hazmat_inspection",
      when: (ctx) => hasFinding(ctx, ["hazmat", "dangerous goods"]),
      action: "Trigger hazmat inspection and confirm stowage compliance",
      priority: "high",
      rationale: () =>
        "Hazmat exposure detected; SOLAS/IMDG obligations apply and must be verified.",
    },
    {
      id: "cargo.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log the cargo profile to the operator's baseline",
      priority: "monitor",
      rationale: () =>
        "No SOP rule breached; keep the profile for future comparisons.",
    },
  ],
  baselineInformationGaps: [
    "Physical inspection outcome",
    "Hazmat stowage confirmation",
  ],
  followUps: [
    "Cross-check container declarations",
    "Compare with previous cargo profile",
    "Escalate to physical inspection",
    "Route to hazmat desk",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
