/**
 * LAYER 4.2 — Workspace Contracts.
 * Each workspace binds an agent set, evidence sources, permitted officer
 * actions, and enabled capabilities. This is the ONLY place that defines
 * per-workspace behaviour.
 *
 * ## Adaptive workspaces (G6.0)
 *
 * The original six contracts are unchanged, ids included, so persisted
 * briefings keep resolving. Twelve adaptive workspaces were added; their
 * ids match `WorkspaceMode`, so the workspace planner's output is a
 * contract key directly.
 *
 * `panels` is what makes a workspace adaptive. Every layout declares the
 * panels it shows and, as importantly, the ones it collapses: a fleet
 * question must not surface an ownership graph, and an officer who has to
 * skip past irrelevant panels is paying for them in attention.
 */
import type { CapabilityId, Workspace } from "./types";

/**
 * Panels a workspace can mount. Named for what the officer sees, not for
 * the component that renders it.
 */
export type PanelId =
  | "fleet-map"
  | "fleet-table"
  | "fleet-kpis"
  | "executive-summary"
  | "top-alerts"
  | "recommended-actions"
  | "vessel-snapshot"
  | "timeline"
  | "evidence"
  | "reasoning"
  | "risk-card"
  | "ownership-graph"
  | "company-fleet"
  | "manifest-timeline"
  | "cargo-breakdown"
  | "revenue-chart"
  | "compliance-violations"
  | "port-traffic"
  | "port-congestion"
  | "voyage-path"
  | "pattern-chart"
  | "decision-queue";

export interface WorkspaceContract {
  id: Workspace;
  label: string;
  evidenceSources: string[];
  actions: Array<{ id: string; label: string }>;
  capabilities: CapabilityId[];
  /**
   * Panels this layout mounts, in reading order.
   *
   * Capped at five by convention: an officer should not be asked to weigh
   * more than five things to reach a decision, and a layout that needs
   * more is usually two questions wearing one coat.
   */
  panels?: PanelId[];
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

  /* ── Adaptive workspaces (G6.0) ──────────────────────────────── */

  "fleet-overview": {
    id: "fleet-overview",
    label: "Fleet Overview",
    evidenceSources: ["AIS", "Global Fishing Watch"],
    actions: [
      { id: "open_investigation", label: "Investigate Vessel" },
      { id: "export_fleet", label: "Export Fleet List" },
    ],
    capabilities: ["PATTERN_DETECTION", "RISK_SCORING"],
    // No ownership graph, no vessel snapshot: a fleet question is about
    // the fleet, and a single vessel's card here is the contamination
    // this sprint removed.
    panels: ["executive-summary", "fleet-kpis", "fleet-map", "fleet-table", "top-alerts"],
  },
  "executive-briefing": {
    id: "executive-briefing",
    label: "Executive Briefing",
    evidenceSources: ["AIS", "Risk Modules"],
    actions: [
      { id: "export_brief", label: "Export Brief" },
      { id: "escalate", label: "Escalate" },
    ],
    capabilities: ["RISK_SCORING", "RECOMMENDATION_ENGINE", "PATTERN_DETECTION"],
    panels: ["executive-summary", "fleet-kpis", "top-alerts", "recommended-actions"],
  },
  investigation: {
    id: "investigation",
    label: "Investigation",
    evidenceSources: ["AIS", "Registry", "Certificates", "Sanctions"],
    actions: [
      { id: "escalate", label: "Escalate" },
      { id: "close_investigation", label: "Close Investigation" },
    ],
    capabilities: ["PATTERN_DETECTION", "OWNERSHIP_ANALYSIS", "COMPLIANCE_ASSESSMENT"],
    panels: ["executive-summary", "vessel-snapshot", "timeline", "evidence", "reasoning"],
  },
  "company-intelligence": {
    id: "company-intelligence",
    label: "Company Intelligence",
    evidenceSources: ["CAC", "OpenCorporates", "Sanctions"],
    actions: [
      { id: "verify_owner", label: "Verify Owner" },
      { id: "screen_company", label: "Screen Company" },
    ],
    capabilities: ["OWNERSHIP_ANALYSIS", "RELATIONSHIP_DISCOVERY", "SANCTIONS_SCREENING"],
    panels: ["executive-summary", "ownership-graph", "company-fleet", "risk-card"],
  },
  "manifest-intelligence": {
    id: "manifest-intelligence",
    label: "Manifest Intelligence",
    evidenceSources: ["Manifest", "Customs"],
    actions: [
      { id: "request_invoice", label: "Request Invoice" },
      { id: "flag_discrepancy", label: "Flag Discrepancy" },
    ],
    capabilities: ["MANIFEST_CORRELATION", "DOCUMENT_ANALYSIS"],
    panels: ["executive-summary", "manifest-timeline", "cargo-breakdown", "evidence"],
  },
  "cargo-intelligence": {
    id: "cargo-intelligence",
    label: "Cargo Intelligence",
    evidenceSources: ["Manifest", "Terminal Ops"],
    actions: [
      { id: "hold_shipment", label: "Hold Shipment" },
      { id: "clear_cargo", label: "Clear Cargo" },
    ],
    capabilities: ["MANIFEST_CORRELATION", "REVENUE_LEAKAGE_DETECTION"],
    panels: ["executive-summary", "cargo-breakdown", "manifest-timeline", "evidence"],
  },
  "port-operations": {
    id: "port-operations",
    label: "Port Operations",
    evidenceSources: ["Terminal Ops", "AIS"],
    actions: [
      { id: "clear_cargo", label: "Clear Cargo" },
      { id: "hold_shipment", label: "Hold Shipment" },
    ],
    capabilities: ["PATTERN_DETECTION", "MANIFEST_CORRELATION"],
    panels: ["executive-summary", "port-traffic", "port-congestion", "fleet-table"],
  },
  voyage: {
    id: "voyage",
    label: "Voyage Intelligence",
    evidenceSources: ["AIS", "Port Calls"],
    actions: [
      { id: "track_voyage", label: "Track Voyage" },
      { id: "replay_voyage", label: "Replay Voyage" },
    ],
    capabilities: ["PATTERN_DETECTION", "EVIDENCE_SEARCH"],
    panels: ["executive-summary", "voyage-path", "timeline", "evidence"],
  },
  "pattern-analysis": {
    id: "pattern-analysis",
    label: "Pattern Analysis",
    evidenceSources: ["AIS", "Risk Modules"],
    actions: [
      { id: "open_investigation", label: "Investigate Vessel" },
      { id: "export_pattern", label: "Export Pattern" },
    ],
    capabilities: ["PATTERN_DETECTION", "RELATIONSHIP_DISCOVERY"],
    panels: ["executive-summary", "pattern-chart", "fleet-table", "evidence"],
  },
  timeline: {
    id: "timeline",
    label: "Timeline",
    evidenceSources: ["AIS", "Port Calls"],
    actions: [
      { id: "replay_voyage", label: "Replay Voyage" },
      { id: "export_timeline", label: "Export Timeline" },
    ],
    capabilities: ["PATTERN_DETECTION", "EVIDENCE_SEARCH"],
    panels: ["executive-summary", "timeline", "voyage-path", "evidence"],
  },
  "evidence-review": {
    id: "evidence-review",
    label: "Evidence Review",
    evidenceSources: ["Documents", "Photos"],
    actions: [
      { id: "validate_evidence", label: "Validate Evidence" },
      { id: "request_chain_of_custody", label: "Request Chain of Custody" },
    ],
    capabilities: ["EVIDENCE_SEARCH", "DOCUMENT_ANALYSIS"],
    panels: ["executive-summary", "evidence", "reasoning", "timeline"],
  },
  "decision-support": {
    id: "decision-support",
    label: "Decision Support",
    evidenceSources: ["Risk Modules", "AIS"],
    actions: [
      { id: "escalate", label: "Escalate" },
      { id: "dismiss", label: "Dismiss" },
    ],
    capabilities: ["RECOMMENDATION_ENGINE", "RISK_SCORING"],
    panels: ["executive-summary", "decision-queue", "recommended-actions", "top-alerts"],
  },
};
