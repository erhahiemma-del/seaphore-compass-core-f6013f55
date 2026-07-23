/**
 * ICE-2 · Evidence Collector.
 *
 * Delegates the entire acquisition step to the IAL. ICE never talks to
 * an external provider — the IAL owns caching, timeouts, and health.
 * This module simply invokes the manager with the planned connector
 * allowlist and returns the raw normalised evidence.
 */

import type { ConnectorManager } from "@/services/ial/manager";
import type { AcquisitionQuery, NormalizedEvidence } from "@/services/ial/types";
import type { QueryPlan } from "./types";

export interface CollectionResult {
  readonly evidence: ReadonlyArray<NormalizedEvidence>;
  readonly perSource: ReadonlyMap<string, { records: number; latencyMs: number }>;
}

export async function collectForPlan(
  manager: ConnectorManager,
  plan: QueryPlan,
): Promise<CollectionResult> {
  const query: AcquisitionQuery = {
    entity: plan.entity,
    text: plan.text,
    connectors: plan.selected,
  };
  const pkg = await manager.acquire(query);
  const perSource = new Map<string, { records: number; latencyMs: number }>();
  for (const s of pkg.sources) {
    perSource.set(s.connectorId, { records: s.records, latencyMs: s.latencyMs });
  }
  return { evidence: pkg.verified, perSource };
}
