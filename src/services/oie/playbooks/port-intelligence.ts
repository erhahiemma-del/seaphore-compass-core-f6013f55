import type { Playbook } from "./types";
import { STANDARD_RESPONSE_TEMPLATE } from "./manifest-investigation";
import { hasFinding, tier } from "./helpers";

/**
 * Port Intelligence — a new SOP surfaced by the Playbook Engine.
 * The Operational Skills Registry maps port-scoped queries to the
 * `arrival_search` intent and the vessel_investigation skill; this
 * playbook is invoked explicitly by moduleHint === "port" and by
 * downstream port-centric follow-ups.
 */
export const portIntelligencePlaybook: Playbook = {
  skillId: "port_intelligence",
  label: "Port Intelligence",
  objective:
    "Provide a decision-oriented picture of the port's current operational posture, congestion, and risk exposure.",
  operationalQuestions: [
    "How many vessels are currently in port and at anchorage?",
    "What is the current berth-waiting time trend?",
    "Are any high-risk vessels berthed or expected?",
    "Are there active security or safety incidents?",
    "How does today's throughput compare to the baseline?",
  ],
  evidenceSequence: [
    "Retrieve port vessel roster (arrived, berthed, expected)",
    "Retrieve congestion and dwell metrics",
    "Retrieve open incidents and security alerts",
    "Retrieve high-risk vessel flags in the roster",
    "Compare with 7-day / 30-day baselines",
  ],
  requiredEvidence: {
    mandatory: [
      "Current port vessel roster",
      "Congestion / dwell metrics",
      "Open incident record",
    ],
    optional: ["Baseline throughput history", "Weather advisory"],
    minimumBeforeReasoning: 2,
  },
  validationRules: [
    {
      id: "port.validation.roster",
      description: "Vessel roster must be under 24h old.",
      severity: "warn",
      onFail: "Vessel roster is stale (>24h) — refresh before decisions.",
      when: (ctx) => hasFinding(ctx, ["stale", "outdated", "old data"]),
    },
  ],
  reasoningRules: [
    {
      id: "port.reason.congestion",
      description: "Congestion vs baseline.",
      note: (ctx) =>
        hasFinding(ctx, ["congestion", "queue", "waiting"])
          ? "Congestion exceeds baseline — expect operational delays."
          : "Congestion is within baseline envelope.",
    },
    {
      id: "port.reason.high_risk",
      description: "High-risk vessels in roster.",
      note: (ctx) =>
        hasFinding(ctx, ["high risk", "sanction", "watchlist"])
          ? "High-risk vessel present in the roster — apply enhanced monitoring."
          : "No high-risk vessels currently in the roster.",
    },
    {
      id: "port.reason.incidents",
      description: "Open incidents.",
      note: (ctx) =>
        hasFinding(ctx, ["incident", "security", "fire", "spill"])
          ? "Open incidents affect the operational picture."
          : "No open incidents affecting operations.",
    },
  ],
  confidenceBands: [
    {
      badge: "High Confidence",
      when: (ctx) => ctx.sources.corroborated >= 3 && tier(ctx) === "high",
      explanation: (ctx) =>
        `Roster, congestion, and incident feeds all corroborated (${ctx.sources.corroborated}).`,
    },
    {
      badge: "Medium Confidence",
      when: (ctx) => ctx.sources.corroborated >= 1,
      explanation: () => "One or two feeds are corroborated; picture is workable but partial.",
    },
    {
      badge: "Low Confidence",
      when: (ctx) => ctx.sources.responded >= 1,
      explanation: () => "Only one port feed is responding — treat as provisional.",
    },
    {
      badge: "Insufficient Evidence",
      when: () => true,
      explanation: () => "Port evidence stack did not respond; suspend port decisions.",
    },
  ],
  escalationRules: [
    {
      id: "port.escalate.high_risk",
      when: (ctx) => hasFinding(ctx, ["sanction", "watchlist", "high risk"]),
      action: "Alert Port Operations Desk about high-risk arrival",
      route: "Port Intelligence Centre",
    },
  ],
  operationalRisks: [
    "Sanctioned vessel entering restricted berth",
    "Congestion cascading into revenue loss and demurrage",
    "Unreported incident affecting shared infrastructure",
  ],
  recommendations: [
    {
      id: "port.rec.enhanced_monitoring",
      when: (ctx) => hasFinding(ctx, ["high risk", "sanction", "watchlist"]),
      action: "Apply enhanced monitoring on high-risk vessels in the roster",
      priority: "critical",
      rationale: () =>
        "High-risk arrival present; SOP mandates enhanced monitoring.",
    },
    {
      id: "port.rec.congestion",
      when: (ctx) => hasFinding(ctx, ["congestion", "queue"]),
      action: "Coordinate with berth planning to smooth congestion",
      priority: "high",
      rationale: () => "Congestion above baseline; berth planning must be engaged.",
    },
    {
      id: "port.rec.incident_response",
      when: (ctx) => hasFinding(ctx, ["incident", "fire", "spill", "security"]),
      action: "Activate incident-response protocol",
      priority: "critical",
      rationale: () => "Open incidents demand documented response actions.",
    },
    {
      id: "port.rec.monitor",
      when: (ctx) => ctx.criticalFindings.length === 0,
      action: "Log the port state and continue routine monitoring",
      priority: "monitor",
      rationale: () => "No SOP rule breached; keep the state snapshot for the log.",
    },
  ],
  baselineInformationGaps: [
    "Berth allocation schedule for the next 24h",
    "Confirmed pilot availability",
  ],
  followUps: [
    "List high-risk vessels in port",
    "Compare congestion to 7-day baseline",
    "Show open incidents",
    "Assess revenue impact of current dwell",
  ],
  responseTemplate: STANDARD_RESPONSE_TEMPLATE,
};
