/**
 * UIP Registry — runtime Single Source of Truth for Unified Intelligence
 * Packages. Every canonical pipeline run produces exactly one UIP and
 * stores it here; every downstream capability (MKG, PIE, OKL, OSAE,
 * Revenue, NMRSE, MIW, Mission, Copilot, Executive Briefing, MIBC) can
 * resolve the same evidence set by `unifiedPackageId`.
 *
 * In-memory only for now — persistence to `intel_briefings.source_uip_id`
 * happens via the orchestrator. This module deliberately has no external
 * dependencies so it is safe to import from server functions and browser
 * code alike.
 */
import type { UnifiedIntelligencePackage } from "./unified";

const store = new Map<string, UnifiedIntelligencePackage>();
const byQueryHash = new Map<string, string>();

/** Canonical identifier: the UIP id is the unifiedPackageId. */
export type UnifiedPackageId = string;

export function registerUip(uip: UnifiedIntelligencePackage, queryHash?: string): UnifiedPackageId {
  store.set(uip.id, uip);
  if (queryHash) byQueryHash.set(queryHash, uip.id);
  return uip.id;
}

export function getUip(id: UnifiedPackageId): UnifiedIntelligencePackage | undefined {
  return store.get(id);
}

export function getUipByQueryHash(queryHash: string): UnifiedIntelligencePackage | undefined {
  const id = byQueryHash.get(queryHash);
  return id ? store.get(id) : undefined;
}

export function listUipIds(): UnifiedPackageId[] {
  return Array.from(store.keys());
}

/** Test hook — clear the registry between test cases. */
export function __resetUipRegistry(): void {
  store.clear();
  byQueryHash.clear();
}

/** Djb2-style stable hash for query strings (registry index only). */
export function hashQuery(query: string, extra?: string): string {
  const s = `${query}::${extra ?? ""}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `qh_${(h >>> 0).toString(36)}`;
}
