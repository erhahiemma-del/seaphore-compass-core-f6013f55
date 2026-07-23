import type { Playbook } from "./types";
import {
  findingsMatch,
  hasFinding,
  revenueExposure,
  formatNaira,
  tier,
} from "./helpers";

const STANDARD_TEMPLATE = [
  "Executive Summary",
  "Situation Overview",
  "Key Findings",
  "Operational Impact",
  "Recommended Actions",
  "Information Still Needed",
  "Suggested Next Questions",
  "Confidence Assessment",
];

export const manifestInvestigationPlaybook: Playbook = {
  skillId: "manifest_investigation",
  label: "Manifest Investigation",
  objective:
    "Determine whether the declared manifest is consistent with corroborating records and prior voyages.",
  operationalQuestions: [
    "Does the declared cargo match the Bill of Lading?",
    "Is the declared weight within the historical envelope for this route?",
    "Do the HS codes match the physical cargo type?",
    "Is the consignee the same as prior voyages?",
    "Are there prior manifest amendments for this operator?",
  ],
  evidenceSequence: [
    "Retrieve declared manifest",
    "Retrieve last 3 manifests for same vessel/route",
    "Pull matching Bill of Lading",
    "Fetch customs declaration",
    "Fetch historical HS code profile",
  ],
  requiredEvidence: {
    mandatory: [
      "Declared cargo manifest",
      "Bill of Lading",
      "Prior manifest for the same vessel or route",
    ],
    optional: [
      "Customs declaration",
      "Consignee registry filing",
      "HS code historical profile",
    ],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "manifest.validation.consignee",
      description: "Consignee must be present on the manifest.",
      severity: "warn",
      onFail: "Consignee field is missing or unreadable on the declared manifest.",
      when: (ctx) => hasFinding(ctx, ["consignee missing", "no consignee"]),
    },
    {
      id: "manifest.validation.hs_code",
      description: "HS codes must be present for every line item.",
      severity: "warn",
      onFail: "One or more line items are missing HS codes.",
      when: (ctx) => hasFinding(ctx, ["hs code", "harmonised code"]) && hasFinding(ctx, ["missing", "absent"]),
    },
  ],
  reasoningRules: [
    {
      id: "manifest.reason.weight_delta",
      description: "Compare declared weight vs historical average.",
      note: (ctx) => {
        const hits = findingsMatch(ctx, ["weight", "tonnage"]);
        return hits.length > 0
          ? `Declared weight deviates from the historical baseline (${hits.length} evidence item${hits.length === 1 ? "" : "s"}).`
          : "Declared weight is within the historical envelope for comparable voyages.";
      },
    },
    {
      id: "manifest.reason.hs_delta",
      description: "Compare declared HS codes vs prior manifests.",
      note: (ctx) =>
        hasFinding(ctx, ["hs code", "commodity code"])
          ? "HS code profile diverges from prior declarations for this operator."
          : "HS code profile is consistent with prior declarations.",
    },
    {
      id: "manifest.reason.consignee",
      description: "Compare consignee against prior voyages.",
      note: (ctx) =>
        hasFinding(ctx, ["consignee", "receiver"])
          ? "Consignee has changed relative to prior voyages — verify commercial relationship."
          : "Consignee is consistent with prior voyages.",
    },
    {
      id: "manifest.reason.voyage_pattern",
      description: "Compare voyage pattern against operator history.",
      note: (ctx) =>
        hasFinding(ctx, ["route", "voyage", "port sequence"])
          ? "Voyage pattern differs from the operator's typical trade lane."
          : "Voyage pattern is consistent with the operator's typical trade lane.",
    },
    {
      id: "manifest.reason.bol",
      description: "Compare declared cargo against Bill of Lading.",
      note: (ctx) =>
        hasFinding(ctx, ["bill of lading", "bol"])
          ? "Manifest and Bill of Lading disagree on at least one line item."
          : "Manifest and Bill of Lading are aligned on the reviewed line items.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Three or more independent sources corroborate the manifest picture (${ctx.sources.corroborated} corroborated of ${ctx.sources.responded} responded).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: (ctx) =>
        `Some evidence conflicts or corroboration is limited (${ctx.sources.corroborated} corroborated). Weight decisions accordingly.`,
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () =>
        "Only single-source evidence is available; treat inferences as provisional.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () =>
        "No corroborating source responded within the SOP window. Do not conclude without further evidence.",
    },
  ],
  escalationRules: [
    {
      id: "manifest.escalate.revenue",
      when: (ctx) => revenueExposure(ctx) >= 5_000_000,
      action: `Escalate to Revenue Intelligence — potential exposure ${formatNaira(0)}`,
      route: "Revenue Intelligence Centre",
    },
    {
      id: "manifest.escalate.mismatch",
      when: (ctx) => hasFinding(ctx, ["mismatch", "discrepancy", "diverge"]),
      action: "Hold clearance pending manifest amendment",
      route: "Port Operations Desk",
    },
  ],
  operationalRisks: [
    "Duty and levy under-declaration",
    "Cargo mis-declaration masking prohibited goods",
    "Consignee substitution to evade sanctions screening",
  ],
  recommendations: [
    {
      id: "manifest.rec.request_revised_manifest",
      when: (ctx) => hasFinding(ctx, ["mismatch", "discrepancy", "diverge"]),
      action: "Request a revised manifest before clearance",
      priority: "critical",
      rationale: () =>
        "A material mismatch was surfaced. SOP requires a revised manifest before goods release.",
    },
    {
      id: "manifest.rec.verify_bol",
      when: (ctx) => hasFinding(ctx, ["bill of lading", "bol"]),
      action: "Physically verify the Bill of Lading against the declared manifest",
      priority: "high",
      rationale: () =>
        "BoL divergence must be reconciled at document level before physical clearance.",
    },
    {
      id: "manifest.rec.escalate_revenue",
      when: (ctx) => revenueExposure(ctx) >= 1_000_000,
      action: "Escalate to Revenue Intelligence for shortfall assessment",
      priority: "high",
      rationale: (ctx) =>
        `Estimated shortfall of ${formatNaira(revenueExposure(ctx))} exceeds the SOP threshold.`,
    },
    {
      id: "manifest.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Clear the manifest and log the voyage in institutional memory",
      priority: "monitor",
      rationale: () =>
        "No mandatory rule breached; retain the audit trail for future comparisons.",
    },
  ],
  baselineInformationGaps: [
    "Physical inspection outcome",
    "Consignee corporate registry filing",
  ],
  followUps: [
    "Compare with previous voyage",
    "Check consignee ownership network",
    "Assess revenue exposure on this manifest",
    "Route to physical inspection",
  ],
  responseTemplate: STANDARD_TEMPLATE,
};

export const STANDARD_RESPONSE_TEMPLATE = STANDARD_TEMPLATE;
