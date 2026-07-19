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

type EvidenceRow = {
  id: string;
  grade: string | null;
  source_system?: string | null;
  content?: string | null;
  entity_ids?: string[] | null;
  collected_at?: string | null;
  hash_sha256?: string | null;
};

function normalizeGrade(g: string | null | undefined): EvidenceItem["grade"] {
  const up = (g ?? "").toUpperCase();
  if (up === "VERIFIED" || up === "CORROBORATED" || up === "OBSERVED" ||
      up === "REPORTED" || up === "INFERRED") return up;
  return "UNKNOWN";
}

async function queryEvidenceByEntityHints(intent: Intent, limit = 25): Promise<EvidenceItem[]> {
  const q = supabase
    .from("evidence")
    .select("id, grade, source_system, content, entity_ids, collected_at, hash_sha256")
    .order("collected_at", { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as EvidenceRow[];
  const wantedIds = new Set(intent.entities.map((e) => e.value));
  const filtered = wantedIds.size
    ? rows.filter((r) => (r.entity_ids ?? []).some((id) => wantedIds.has(id)))
    : rows;
  return filtered.map((r) => ({
    id: r.id,
    grade: normalizeGrade(r.grade),
    source_system: r.source_system ?? "unknown",
    content: r.content ?? "",
    entity_ids: r.entity_ids ?? [],
    collected_at: r.collected_at ?? undefined,
    hash_sha256: r.hash_sha256 ?? undefined,
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
