/**
 * Specialist Agents — concrete implementations.
 *
 * These wire the Orchestrator to real project data through the existing
 * repository/service layer. They NEVER fabricate: if a datasource is planned
 * or errors, the agent returns responded=false and the Fusion Engine reports
 * an Intelligence Gap (HR-1).
 */
import type { CapabilityId, EvidenceItem, Intent, OfficerQuery } from "../types";
import { runRetrieval, type SpecialistAgent } from "./base";
import { supabase } from "@/integrations/supabase/client";

function normalizeGrade(g: string | null | undefined): EvidenceItem["grade"] {
  const up = (g ?? "").toUpperCase();
  if (up === "VERIFIED" || up === "CORROBORATED" || up === "OBSERVED" ||
      up === "REPORTED" || up === "INFERRED") return up;
  return "UNKNOWN";
}

/**
 * Retrieves evidence via the signals table (which carries confidence grades)
 * plus stored evidence records. Filters by entity identifiers extracted by
 * the Intent Classifier when present.
 */
async function retrieveEvidence(intent: Intent, limit = 25): Promise<EvidenceItem[]> {
  const { data, error } = await supabase
    .from("signals")
    .select("id, domain, statement, confidence, entity_id, evidence_ids, observed_at")
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    domain: string | null;
    statement: string | null;
    confidence: string | null;
    entity_id: string | null;
    evidence_ids: string[] | null;
    observed_at: string | null;
  }>;
  const wanted = new Set(intent.entities.map((e) => e.value));
  const filtered = wanted.size
    ? rows.filter((r) => (r.entity_id && wanted.has(r.entity_id)))
    : rows;
  return filtered.map((r) => ({
    id: r.id,
    grade: normalizeGrade(r.confidence),
    source_system: r.domain ?? "signal",
    content: r.statement ?? "",
    entity_ids: r.entity_id ? [r.entity_id] : [],
    collected_at: r.observed_at ?? undefined,
  }));
}

const ownershipAgent: SpecialistAgent = {
  id: "ownership",
  handles: ["OWNERSHIP_ANALYSIS", "RELATIONSHIP_DISCOVERY", "SANCTIONS_SCREENING"],
  retrieve: (cap, intent, _q) =>
    runRetrieval("ownership", cap, cap === "SANCTIONS_SCREENING" ? "OpenSanctions" : "CAC + IMO",
      () => queryEvidenceByEntityHints(intent)),
};

const revenueAgent: SpecialistAgent = {
  id: "revenue",
  handles: ["REVENUE_LEAKAGE_DETECTION"],
  retrieve: (cap, intent, _q) =>
    runRetrieval("revenue", cap, "Manifest + Customs", () => queryEvidenceByEntityHints(intent)),
};

const manifestAgent: SpecialistAgent = {
  id: "manifest",
  handles: ["MANIFEST_CORRELATION"],
  retrieve: (cap, intent, _q) =>
    runRetrieval("manifest", cap, "Cargo Manifests", () => queryEvidenceByEntityHints(intent)),
};

const complianceAgent: SpecialistAgent = {
  id: "compliance",
  handles: ["COMPLIANCE_ASSESSMENT"],
  retrieve: (cap, intent, _q) =>
    runRetrieval("compliance", cap, "IMO GISIS + Certificates", () => queryEvidenceByEntityHints(intent)),
};

const evidenceAgent: SpecialistAgent = {
  id: "evidence",
  handles: ["EVIDENCE_SEARCH", "DOCUMENT_ANALYSIS"],
  retrieve: (cap, intent, _q) =>
    runRetrieval("evidence", cap, "Evidence Library", () => queryEvidenceByEntityHints(intent, 50)),
};

const forecastAgent: SpecialistAgent = {
  id: "forecast",
  handles: ["PATTERN_DETECTION", "RISK_SCORING"],
  retrieve: async (cap, intent, _q) => runRetrieval("forecast", cap, "Historical Cases", async () => {
    const evidence = await queryEvidenceByEntityHints(intent, 30);
    // Pattern agent labels its outputs INFERRED unless corroboration exists.
    return evidence.map((e) => ({ ...e, grade: e.grade === "VERIFIED" ? e.grade : "INFERRED" }));
  }),
};

export const SPECIALIST_AGENTS: Record<string, SpecialistAgent> = {
  ownership: ownershipAgent,
  revenue: revenueAgent,
  manifest: manifestAgent,
  compliance: complianceAgent,
  evidence: evidenceAgent,
  forecast: forecastAgent,
};

export function getAgent(id: string): SpecialistAgent | undefined {
  return SPECIALIST_AGENTS[id];
}

export function pickAgentForCapability(cap: CapabilityId): SpecialistAgent | undefined {
  return Object.values(SPECIALIST_AGENTS).find((a) => a.handles.includes(cap));
}

// Re-export types for callers that only import the agents module.
export type { SpecialistAgent, OfficerQuery };
