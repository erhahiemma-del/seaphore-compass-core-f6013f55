/**
 * OIE · Module 3 — Operational Skills Registry.
 *
 * Each skill is a reusable investigation template. Adding a skill is
 * one entry here: intents it satisfies, capabilities the scheduler
 * should invoke, evidence it requires, the reasoning objective, the
 * response template, and the adaptive follow-ups shown at the end.
 *
 * Downstream, the planner picks ONE primary skill per query plus any
 * supporting skills, and the Response Generator uses the skill's
 * template + follow-ups as its scaffolding.
 */
import type { OperationalIntent, OperationalSkill } from "./types";

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

export const SKILLS: readonly OperationalSkill[] = Object.freeze([
  {
    id: "manifest_investigation",
    label: "Manifest Investigation",
    domain: "manifest",
    intents: ["manifest_investigation", "manifest_comparison"] as OperationalIntent[],
    capabilities: ["MANIFEST_CORRELATION", "DOCUMENT_ANALYSIS", "EVIDENCE_SEARCH"],
    requiredEvidence: [
      "Declared cargo manifest",
      "Prior manifests for the same vessel or route",
      "Customs declaration and bill of lading",
    ],
    objective:
      "Determine whether the declared manifest is consistent with corroborating records and prior voyages.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Compare with previous voyage",
      "Review declared cargo against known norms",
      "Check vessel ownership",
      "Assess revenue exposure on this manifest",
    ],
    description: "Verify the declared cargo manifest against corroborating records.",
  },
  {
    id: "cargo_investigation",
    label: "Cargo Investigation",
    domain: "cargo",
    intents: ["cargo_investigation"] as OperationalIntent[],
    capabilities: ["MANIFEST_CORRELATION", "PATTERN_DETECTION", "EVIDENCE_SEARCH"],
    requiredEvidence: [
      "Declared cargo items and commodity codes",
      "Container / hazmat classification",
      "Historical cargo profile for this operator",
    ],
    objective:
      "Assess whether the declared cargo profile is consistent with the vessel type, route, and operator history.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Cross-check container declarations",
      "Review hazmat handling posture",
      "Compare with previous cargo profile",
      "Escalate to physical inspection",
    ],
    description: "Assess cargo declarations against vessel, route and operator norms.",
  },
  {
    id: "vessel_investigation",
    label: "Vessel Investigation",
    domain: "vessel",
    intents: [
      "vessel_investigation",
      "arrival_search",
      "risk_investigation",
    ] as OperationalIntent[],
    capabilities: ["PATTERN_DETECTION", "EVIDENCE_SEARCH", "RISK_SCORING"],
    requiredEvidence: [
      "Registry and flag record",
      "AIS movement history",
      "Prior incidents and detentions",
      "Ownership snapshot",
    ],
    objective:
      "Assemble a vessel dossier and surface the operational risk indicators the officer should weigh.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Show voyage history",
      "Review ownership network",
      "Check sanctions and watchlist exposure",
      "Run manifest cross-check",
    ],
    description: "Dossier and risk read on a specific vessel.",
  },
  {
    id: "ownership_investigation",
    label: "Ownership Investigation",
    domain: "ownership",
    intents: ["ownership_investigation"] as OperationalIntent[],
    capabilities: ["OWNERSHIP_ANALYSIS", "RELATIONSHIP_DISCOVERY", "SANCTIONS_SCREENING"],
    requiredEvidence: [
      "Registered owner and operator",
      "Beneficial-owner chain",
      "Corporate registry filings",
      "Sanctions and watchlist checks",
    ],
    objective:
      "Trace the beneficial-ownership network and identify any exposure through affiliated entities.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Expand corporate network two hops",
      "Screen owner and directors for sanctions",
      "Cross-check with previous investigations",
      "Review linked vessels in the same network",
    ],
    description: "Trace beneficial ownership and affiliated exposure.",
  },
  {
    id: "revenue_leakage",
    label: "Revenue Leakage",
    domain: "revenue",
    intents: ["revenue_leakage", "revenue_investigation"] as OperationalIntent[],
    capabilities: ["REVENUE_LEAKAGE_DETECTION", "PATTERN_DETECTION", "DOCUMENT_ANALYSIS"],
    requiredEvidence: [
      "Declared revenue basis (tariff, levy, fee schedule)",
      "Assessed vs paid amounts",
      "Comparable voyages / operators",
    ],
    objective:
      "Quantify potential revenue shortfall and identify the mechanism (under-declaration, misclassification, unpaid levy).",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Break down shortfall by line item",
      "Compare with peer operators",
      "Review historical payment record",
      "Escalate for recovery assessment",
    ],
    description: "Quantify revenue exposure and its mechanism.",
  },
  {
    id: "compliance_review",
    label: "Compliance Review",
    domain: "compliance",
    intents: ["compliance_review"] as OperationalIntent[],
    capabilities: ["COMPLIANCE_ASSESSMENT", "SANCTIONS_SCREENING", "RISK_SCORING"],
    requiredEvidence: [
      "Applicable NIMASA / IMO obligations",
      "Prior breaches and detentions",
      "Certification status (SOLAS, MARPOL, ISPS)",
    ],
    objective:
      "Assess the current compliance posture against applicable maritime regulations and highlight material gaps.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Show unresolved breaches",
      "Review certification expiry",
      "Escalate to Compliance Officer",
      "Compare with peer vessels",
    ],
    description: "Regulatory posture against NIMASA / IMO obligations.",
  },
  {
    id: "voyage_comparison",
    label: "Voyage Comparison",
    domain: "voyage",
    intents: ["voyage_comparison", "manifest_comparison"] as OperationalIntent[],
    capabilities: ["PATTERN_DETECTION", "MANIFEST_CORRELATION", "EVIDENCE_SEARCH"],
    requiredEvidence: [
      "Current voyage record",
      "Prior voyage(s) for the same vessel or operator",
      "Manifest and port-call sequence for each",
    ],
    objective:
      "Compare the current voyage against prior baselines and surface material deviations.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Highlight port sequence differences",
      "Diff cargo declarations",
      "Review timing and dwell anomalies",
      "Assess operator behaviour trend",
    ],
    description: "Side-by-side comparison of voyages.",
  },
  {
    id: "executive_briefing",
    label: "Executive Briefing",
    domain: "general",
    intents: [
      "executive_briefing",
      "operational_assessment",
      "risk_investigation",
      "arrival_search",
      "entity_dossier",
    ] as OperationalIntent[],
    capabilities: ["PATTERN_DETECTION", "RISK_SCORING", "RECOMMENDATION_ENGINE", "EVIDENCE_SEARCH"],
    requiredEvidence: [
      "All available intelligence on the subject",
      "Risk indicators across ownership, revenue, and compliance",
      "Historical case similarities",
    ],
    objective: "Deliver a concise, decision-oriented briefing suitable for leadership sign-off.",
    responseTemplate: STANDARD_TEMPLATE,
    followUps: [
      "Why is the risk High?",
      "Show manifest",
      "Explain ownership",
      "Compare last voyage",
      "Replay AIS timeline",
      "Generate executive report",
    ],
    description: "Decision-oriented briefing for leadership.",
  },
]);

export function findSkill(id: string): OperationalSkill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function skillForIntent(intent: OperationalIntent): OperationalSkill | undefined {
  return SKILLS.find((s) => s.intents.includes(intent));
}
