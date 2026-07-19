/**
 * LAYER 4.2 — Workspace Contracts.
 * Each workspace binds an agent set, evidence sources, permitted officer
 * actions, and enabled capabilities. This is the ONLY place that defines
 * per-workspace behaviour.
 */
import type { CapabilityId, Workspace } from "./types";

export interface WorkspaceContract {
  id: Workspace;
  label: string;
  evidenceSources: string[];
  actions: Array<{ id: string; label: string }>;
  capabilities: CapabilityId[];
}

export const WORKSPACE_CONTRACTS: Record<Workspace, WorkspaceContract> = {
  ownership: {
    id: "ownership",
    label: "Ownership Intelligence",
    evidenceSources: ["CAC", "IMO"],
    actions: [
      { id: "verify_owner", label: "Verify Owner" },
      { id: "request_director_list", label: "Request Director List" },
    ],
    capabilities: ["OWNERSHIP_ANALYSIS", "RELATIONSHIP_DISCOVERY", "SANCTIONS_SCREENING"],
  },
  revenue: {
    id: "revenue",
    label: "Revenue Assurance",
    evidenceSources: ["Manifest", "Customs"],
    actions: [
      { id: "recover_revenue", label: "Recover Revenue" },
      { id: "request_invoice", label: "Request Invoice" },
    ],
    capabilities: ["REVENUE_LEAKAGE_DETECTION", "DOCUMENT_ANALYSIS"],
  },
  compliance: {
    id: "compliance",
    label: "Compliance Intelligence",
    evidenceSources: ["Certificates", "ISPS"],
    actions: [
      { id: "detain_vessel", label: "Detain Vessel" },
      { id: "request_certificate", label: "Request Certificate" },
    ],
    capabilities: ["COMPLIANCE_ASSESSMENT", "RISK_SCORING"],
  },
  evidence: {
    id: "evidence",
    label: "Evidence Library",
    evidenceSources: ["Documents", "Photos"],
    actions: [
      { id: "validate_evidence", label: "Validate Evidence" },
      { id: "request_chain_of_custody", label: "Request Chain of Custody" },
    ],
    capabilities: ["EVIDENCE_SEARCH", "DOCUMENT_ANALYSIS"],
  },
  vessel: {
    id: "vessel",
    label: "Vessel Intelligence",
    evidenceSources: ["AIS", "Registry", "Certificates"],
    actions: [
      { id: "track_voyage", label: "Track Voyage" },
      { id: "inspect_vessel", label: "Inspect Vessel" },
    ],
    capabilities: ["OWNERSHIP_ANALYSIS", "COMPLIANCE_ASSESSMENT", "PATTERN_DETECTION"],
  },
  port: {
    id: "port",
    label: "Port Operations",
    evidenceSources: ["Terminal Ops", "Manifest"],
    actions: [
      { id: "clear_cargo", label: "Clear Cargo" },
      { id: "hold_shipment", label: "Hold Shipment" },
    ],
    capabilities: ["MANIFEST_CORRELATION", "REVENUE_LEAKAGE_DETECTION"],
  },
};
