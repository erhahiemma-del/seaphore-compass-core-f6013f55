/**
 * LAYER 2.2 — Specialist Agents.
 * Each agent retrieves domain-specific evidence via project services/adapters.
 * Agents NEVER generate assessments. If a source is planned/not-in-scope, the
 * agent returns `responded: false` so the Fusion Engine can report the gap.
 */
import type {
  AgentId,
  CapabilityId,
  EvidenceItem,
  Intent,
  OfficerQuery,
  RetrievalResult,
} from "../types";

export interface SpecialistAgent {
  id: AgentId;
  handles: CapabilityId[];
  retrieve(cap: CapabilityId, intent: Intent, query: OfficerQuery): Promise<RetrievalResult>;
}

/** Utility to time a retrieval and normalize failure into a responded=false result. */
export async function runRetrieval(
  agent: AgentId,
  capability: CapabilityId,
  source_name: string,
  fn: () => Promise<EvidenceItem[]>,
): Promise<RetrievalResult> {
  const start = performance.now();
  try {
    const evidence = await fn();
    return {
      agent,
      capability,
      source_name,
      responded: true,
      evidence,
      latency_ms: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      agent,
      capability,
      source_name,
      responded: false,
      evidence: [],
      latency_ms: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
