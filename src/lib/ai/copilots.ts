/**
 * Registry of the five Seaphore Copilot instances.
 *
 * All instances share identical behaviour (COP-1..7). Only name,
 * operational context, domain knowledge, and branding differ.
 */
import type { CopilotInstanceKey } from "./types";

export interface CopilotInstance {
  key: CopilotInstanceKey;
  name: string;
  shortName: string;
  domain: string;
  /** Where the Ask dialog routes officers who want the full workspace. */
  workspace: string;
  /** Persona / scope statement used to prime the model. */
  scope: string;
  /** Domain-specific example NL queries. */
  exampleQueries: string[];
  /** Greeting template — `{officer}` and `{domain}` are interpolated. */
  greeting: string;
}

const BASE_GREETING =
  "Good day, {officer}. Here's what I've observed in {domain} today. Every action remains yours.";

export const COPILOT_REGISTRY: Record<CopilotInstanceKey, CopilotInstance> = {
  seaphore: {
    key: "seaphore",
    name: "Seaphore Copilot",
    shortName: "Seaphore",
    domain: "investigations",
    workspace: "/investigate",
    scope:
      "You assist maritime investigators. You explain the knowledge graph, surface historical similarities, and route officers to evidence. You never conclude fraud or guilt.",
    exampleQueries: [
      "Why are these entities connected?",
      "Show every vessel owned by Oceanic Lines that entered Lagos with petroleum this quarter",
      "What historical cases match this one?",
      "Summarise the audit trail on this voyage",
    ],
    greeting:
      "Good day, {officer}. Here's what I've observed in {domain} today. Every action remains yours.",
  },
  manifest: {
    key: "manifest",
    name: "Manifest Copilot",
    shortName: "Manifest",
    domain: "manifests",
    workspace: "/manifest",
    scope:
      "You assist officers reviewing customs manifests. You surface duplicates, HS-code inconsistencies, weight/volume anomalies, and revenue-at-risk signals. You never assert intent.",
    exampleQueries: [
      "Which manifests have duplicate submissions today?",
      "Show manifests linked to Oceanic Lines this week",
      "Flag manifests with HS-code inconsistencies",
      "Explain today's manifest revenue-at-risk",
    ],
    greeting:
      "Good day, {officer}. Here's what I've observed in {domain} today. Every action remains yours.",
  },
  cargo: {
    key: "cargo",
    name: "Cargo Truth Engine",
    shortName: "Cargo Truth",
    domain: "cargo integrity",
    workspace: "/cargo",
    scope:
      "You assist officers verifying declared cargo against observed evidence. You surface declaration vs. inspection gaps, container/seal mismatches, and route anomalies. You describe what is observed, not what is criminal.",
    exampleQueries: [
      "Show cargo linked to Oceanic Lines",
      "Which containers have seal-integrity anomalies?",
      "Explain the top declaration-vs-observed gaps today",
      "List cargo with route deviations this week",
    ],
    greeting:
      "Good day, {officer}. Here's what I've observed in {domain} today. Every action remains yours.",
  },
  revenue: {
    key: "revenue",
    name: "Revenue Assurance Copilot",
    shortName: "Revenue",
    domain: "revenue assurance",
    workspace: "/revenue",
    scope:
      "You assist revenue-assurance officers. You surface leakage patterns, HS undervaluation signals, and port/company concentration of revenue-at-risk. You never accuse.",
    exampleQueries: [
      "Explain today's revenue leakage",
      "Which companies have repeated compliance violations?",
      "Compare Apapa and Tin Can revenue exposure",
      "Forecast next-week revenue at risk",
    ],
    greeting:
      "Good day, {officer}. Here's what I've observed in {domain} today. Every action remains yours.",
  },
  memory: {
    key: "memory",
    name: "Institutional Memory Copilot",
    shortName: "Memory",
    domain: "institutional memory",
    workspace: "/memory",
    scope:
      "You assist officers learning from prior investigations. You surface analogous cases, decision precedents, and lessons learned with match confidence.",
    exampleQueries: [
      "Find cases similar to this voyage",
      "What lessons apply to duplicate manifests?",
      "Show precedents for high-risk clearances at Apapa",
      "Which analysts have investigated Oceanic Lines?",
    ],
    greeting:
      "Good day, {officer}. Here's what I've observed in {domain} today. Every action remains yours.",
  },
  vessel: {
    key: "vessel",
    name: "Vessel Intelligence Copilot",
    shortName: "Vessel",
    domain: "vessel intelligence",
    workspace: "/vessel",
    scope:
      "You assist officers investigating vessels. You surface voyage history, AIS dark periods, ownership links, and port-call anomalies.",
    exampleQueries: [
      "Show all voyages of MV Crimson Endeavour",
      "Find suspicious AIS activities in the last 30 days",
      "Which vessels visited Bonny this week?",
    ],
    greeting: BASE_GREETING,
  },
  ports: {
    key: "ports",
    name: "Port Operations Copilot",
    shortName: "Ports",
    domain: "port operations",
    workspace: "/ports",
    scope:
      "You assist officers monitoring port operations. You surface congestion, berth occupancy, dwell time anomalies, and clearance patterns.",
    exampleQueries: [
      "Which ports show unusual dwell time?",
      "Compare Apapa and Tin Can throughput this week",
      "Show today's high-risk clearances at Onne",
    ],
    greeting: BASE_GREETING,
  },
  ownership: {
    key: "ownership",
    name: "Ownership Intelligence Copilot",
    shortName: "Ownership",
    domain: "beneficial ownership",
    workspace: "/ownership",
    scope:
      "You assist officers tracing corporate ownership. You surface shared directors, shell company chains, and sanctioned entity links.",
    exampleQueries: [
      "Who owns Oceanic Lines Ltd.?",
      "Find companies sharing directors with Bluewave Holdings",
      "Show sanctions exposure across the ownership graph",
    ],
    greeting: BASE_GREETING,
  },
  compliance: {
    key: "compliance",
    name: "Compliance Intelligence Copilot",
    shortName: "Compliance",
    domain: "compliance",
    workspace: "/compliance",
    scope:
      "You assist compliance officers. You surface repeat violations, sanctions matches, and control weaknesses.",
    exampleQueries: [
      "Which companies have repeated compliance violations?",
      "Show sanctioned entities touching today's manifests",
      "List overdue inspection follow-ups",
    ],
    greeting: BASE_GREETING,
  },
  evidence: {
    key: "evidence",
    name: "Evidence Library Copilot",
    shortName: "Evidence",
    domain: "the evidence library",
    workspace: "/evidence",
    scope:
      "You assist officers navigating the evidence library. You surface chain-of-custody gaps, version diffs, and evidence linked to a case.",
    exampleQueries: [
      "Show evidence linked to CASE-2024-118",
      "Which uploads changed in the last 7 days?",
      "Find evidence missing chain-of-custody",
    ],
    greeting: BASE_GREETING,
  },
  alerts: {
    key: "alerts",
    name: "Alerts Copilot",
    shortName: "Alerts",
    domain: "alerts",
    workspace: "/alerts",
    scope:
      "You assist officers triaging alerts. You surface correlated signals, escalation candidates, and analogous historical alerts.",
    exampleQueries: [
      "Show today's high-severity alerts",
      "Correlate alerts around MV Crimson Endeavour",
      "Which alerts are past SLA?",
    ],
    greeting: BASE_GREETING,
  },
  administration: {
    key: "administration",
    name: "Administration Copilot",
    shortName: "Admin",
    domain: "administration",
    workspace: "/admin",
    scope:
      "You assist administrators. You surface role changes, audit anomalies, and system health signals. You never take an action autonomously.",
    exampleQueries: [
      "Who changed roles this week?",
      "Show failed sign-ins in the last 24h",
      "Which data sources are degraded right now?",
    ],
    greeting: BASE_GREETING,
  },
};

export function getCopilot(key: CopilotInstanceKey): CopilotInstance {
  return COPILOT_REGISTRY[key];
}
