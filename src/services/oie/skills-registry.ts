/**
 * OIE · Module 3 — Operational Skills Registry.
 *
 * A skill = one operational capability the OIE can invoke. Skills are
 * declarative; they map to orchestration capabilities so the underlying
 * scheduler can dispatch specialist agents without changes.
 *
 * The registry is intentionally static; adding a new operational skill
 * is a code change reviewable in one file.
 */
import type { OperationalSkill } from "./types";

export const SKILLS: readonly OperationalSkill[] = Object.freeze([
  {
    id: "ownership_analysis",
    label: "Ownership network analysis",
    domain: "ownership",
    capabilities: ["OWNERSHIP_ANALYSIS", "RELATIONSHIP_DISCOVERY"],
    description: "Trace beneficial-ownership and corporate ties around a vessel or company.",
  },
  {
    id: "revenue_leakage",
    label: "Revenue leakage detection",
    domain: "revenue",
    capabilities: ["REVENUE_LEAKAGE_DETECTION", "PATTERN_DETECTION"],
    description: "Compare declared manifests, tariffs, and payments for underpayment patterns.",
  },
  {
    id: "manifest_correlation",
    label: "Manifest correlation",
    domain: "manifest",
    capabilities: ["MANIFEST_CORRELATION", "DOCUMENT_ANALYSIS"],
    description: "Cross-check declared cargo against known records and voyages.",
  },
  {
    id: "sanctions_screening",
    label: "Sanctions & watchlist screening",
    domain: "sanctions",
    capabilities: ["SANCTIONS_SCREENING", "COMPLIANCE_ASSESSMENT"],
    description: "Screen entities against OFAC, UN, EU, and internal watchlists.",
  },
  {
    id: "compliance_assessment",
    label: "Compliance posture assessment",
    domain: "compliance",
    capabilities: ["COMPLIANCE_ASSESSMENT", "RISK_SCORING"],
    description: "Assess regulatory posture against NIMASA and IMO obligations.",
  },
  {
    id: "evidence_search",
    label: "Evidence library search",
    domain: "evidence",
    capabilities: ["EVIDENCE_SEARCH", "DOCUMENT_ANALYSIS"],
    description: "Retrieve corroborating records from the evidence library.",
  },
  {
    id: "risk_scoring",
    label: "Risk scoring",
    domain: "general",
    capabilities: ["RISK_SCORING", "RECOMMENDATION_ENGINE"],
    description: "Compute a composite risk score with contributing factors.",
  },
  {
    id: "vessel_profile",
    label: "Vessel profile lookup",
    domain: "vessel",
    capabilities: ["PATTERN_DETECTION", "EVIDENCE_SEARCH"],
    description: "Assemble a vessel dossier from registry, AIS, and history.",
  },
  {
    id: "port_activity",
    label: "Port activity assessment",
    domain: "port",
    capabilities: ["PATTERN_DETECTION"],
    description: "Analyse call patterns, dwell, and congestion around a port.",
  },
]);

export function findSkill(id: string): OperationalSkill | undefined {
  return SKILLS.find((s) => s.id === id);
}
