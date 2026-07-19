/**
 * LAYER 2.7 — Capability Registry.
 * Maps each capability to its owning specialist agents. The Orchestrator
 * consults this registry; it never hard-codes agent selection anywhere else.
 */
import type { AgentId, CapabilityId } from "./types";

interface Capability {
  id: CapabilityId;
  name: string;
  description: string;
  agents: AgentId[];
}

export const CAPABILITY_REGISTRY: Record<CapabilityId, Capability> = {
  OWNERSHIP_ANALYSIS: {
    id: "OWNERSHIP_ANALYSIS",
    name: "Ownership Analysis",
    description: "Map beneficial ownership and director networks",
    agents: ["ownership"],
  },
  REVENUE_LEAKAGE_DETECTION: {
    id: "REVENUE_LEAKAGE_DETECTION",
    name: "Revenue Leakage Detection",
    description: "Identify under-declaration and duty evasion",
    agents: ["revenue"],
  },
  MANIFEST_CORRELATION: {
    id: "MANIFEST_CORRELATION",
    name: "Manifest Correlation",
    description: "Cross-reference cargo declarations with actuals",
    agents: ["manifest"],
  },
  RELATIONSHIP_DISCOVERY: {
    id: "RELATIONSHIP_DISCOVERY",
    name: "Relationship Discovery",
    description: "Find hidden connections between entities",
    agents: ["ownership", "evidence"],
  },
  PATTERN_DETECTION: {
    id: "PATTERN_DETECTION",
    name: "Pattern Detection",
    description: "Match current case against historical patterns",
    agents: ["forecast"],
  },
  COMPLIANCE_ASSESSMENT: {
    id: "COMPLIANCE_ASSESSMENT",
    name: "Compliance Assessment",
    description: "Evaluate certificates and regulatory status",
    agents: ["compliance"],
  },
  SANCTIONS_SCREENING: {
    id: "SANCTIONS_SCREENING",
    name: "Sanctions Screening",
    description: "Check entities against sanctions lists",
    agents: ["ownership"],
  },
  EVIDENCE_SEARCH: {
    id: "EVIDENCE_SEARCH",
    name: "Evidence Search",
    description: "Retrieve and validate documents and records",
    agents: ["evidence"],
  },
  DOCUMENT_ANALYSIS: {
    id: "DOCUMENT_ANALYSIS",
    name: "Document Analysis",
    description: "Extract and verify information from documents",
    agents: ["evidence"],
  },
  RISK_SCORING: {
    id: "RISK_SCORING",
    name: "Risk Scoring",
    description: "Calculate composite risk scores",
    agents: ["ownership", "revenue", "manifest", "compliance", "evidence", "forecast"],
  },
  RECOMMENDATION_ENGINE: {
    id: "RECOMMENDATION_ENGINE",
    name: "Recommendation Engine",
    description: "Generate operational actions (Orchestrator-owned)",
    agents: [],
  },
};

export function agentsForCapabilities(caps: CapabilityId[]): AgentId[] {
  const set = new Set<AgentId>();
  for (const cap of caps) for (const a of CAPABILITY_REGISTRY[cap]?.agents ?? []) set.add(a);
  return Array.from(set);
}
