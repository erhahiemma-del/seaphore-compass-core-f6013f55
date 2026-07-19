/**
 * LAYER 2.2 — Agent Scheduler.
 * Parallelises specialist agent execution. NEVER accesses the knowledge
 * graph directly. Enforces the Performance Budget from Layer 5.4 by aborting
 * retrievals that exceed the mode's `max` window.
 */
import { PERF_BUDGETS } from "./constants";
import type { BriefingMode, CapabilityId, Intent, OfficerQuery, RetrievalResult } from "./types";
import { pickAgentForCapability } from "./agents";

export async function scheduleRetrievals(
  intent: Intent,
  query: OfficerQuery,
  mode: BriefingMode,
): Promise<RetrievalResult[]> {
  const budget = PERF_BUDGETS[mode].max;
  const tasks = intent.capabilities.map<Promise<RetrievalResult>>((cap: CapabilityId) => {
    const agent = pickAgentForCapability(cap);
    if (!agent) {
      return Promise.resolve({
        agent: "evidence" as const,
        capability: cap,
        source_name: "unassigned",
        responded: false,
        evidence: [],
        latency_ms: 0,
        error: "No agent registered for capability",
      });
    }
    return withTimeout(agent.retrieve(cap, intent, query), budget, cap, agent.id);
  });
  return Promise.all(tasks);
}

function withTimeout<T extends RetrievalResult>(
  p: Promise<T>,
  ms: number,
  cap: CapabilityId,
  agentId: RetrievalResult["agent"],
): Promise<RetrievalResult> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      resolve({
        agent: agentId,
        capability: cap,
        source_name: "timeout",
        responded: false,
        evidence: [],
        latency_ms: ms,
        error: `retrieval exceeded ${ms}ms performance budget`,
      });
    }, ms);
    p.then((r) => { clearTimeout(t); resolve(r); }).catch((err: unknown) => {
      clearTimeout(t);
      resolve({
        agent: agentId,
        capability: cap,
        source_name: "error",
        responded: false,
        evidence: [],
        latency_ms: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
