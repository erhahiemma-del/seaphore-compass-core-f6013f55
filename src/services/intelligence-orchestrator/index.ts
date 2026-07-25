/**
 * Intelligence Orchestrator — the single client-side surface every
 * downstream operational consumer uses to resolve the Canonical
 * Unified Intelligence Package (UIP).
 *
 * Golden Rule (Sprint 2.2):
 *   Nothing downstream (MIBC, MIW, Mission Planning, Evidence Explorer,
 *   Predictions, Revenue Leakage, OKL surfaces) reads directly from
 *   intelligence tables, connectors, or the IFE registry. Every read
 *   goes through `intelligenceOrchestrator.getUIP(source_uip_id)` or
 *   `intelligenceOrchestrator.getUIPBatch([...])`. That guarantees the
 *   values every consumer displays — risk, revenue, entities,
 *   evidence, confidence — trace back to the same UIP snapshot.
 *
 * The orchestrator is intentionally thin. It:
 *   1. wraps the client-side UIP store (populated by the OIE run),
 *   2. exposes batch lookup so multi-investigation reports resolve
 *      lineage in a single call, and
 *   3. carries a per-lookup `resolved` flag so callers can render
 *      "UIP not found in session" affordances rather than silently
 *      swap in demo data.
 */
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import { useUipStore, getUip as getUipDirect, latestUip } from "@/stores/uip.store";
import type { InvestigationWorkspace } from "@/stores/workspace.store";

/** Result of a batch lookup. `uip` is null when the id was requested
 * but no matching UIP has been registered in this session. */
export interface UipLookupResult {
  readonly id: string;
  readonly uip: UnifiedIntelligencePackage | null;
  /**
   * Optional back-reference — set when the id was derived from an
   * Investigation Workspace, so MIBC can pair the UIP snapshot back
   * to the workspace that sourced it.
   */
  readonly workspaceId?: string;
}

export interface UipBatchResult {
  readonly resolved: ReadonlyArray<UipLookupResult>;
  readonly missing: ReadonlyArray<string>;
}

export const intelligenceOrchestrator = {
  /**
   * Resolve a single Canonical UIP by id. Returns `null` when no UIP
   * is registered — never falls back to any other source.
   */
  getUIP(id: string | null | undefined): UnifiedIntelligencePackage | null {
    return getUipDirect(id) ?? null;
  },

  /**
   * Resolve many UIPs in one call. Preserves input order and reports
   * unresolved ids on the `missing` list so callers can label the
   * report with a truthful lineage summary.
   */
  getUIPBatch(ids: ReadonlyArray<string | null | undefined>): UipBatchResult {
    const state = useUipStore.getState().byId;
    const seen = new Set<string>();
    const resolved: UipLookupResult[] = [];
    const missing: string[] = [];
    for (const raw of ids) {
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      const uip = state[raw] ?? null;
      resolved.push({ id: raw, uip });
      if (!uip) missing.push(raw);
    }
    return { resolved, missing };
  },

  /**
   * Resolve UIPs paired with the investigation workspaces that
   * sourced them. Used by MIBC to build Investigation-Based Briefs
   * where each workspace maps 1:1 to a source_uip_id.
   */
  getUIPsForWorkspaces(
    workspaces: ReadonlyArray<InvestigationWorkspace>,
  ): UipBatchResult {
    const state = useUipStore.getState().byId;
    const resolved: UipLookupResult[] = [];
    const missing: string[] = [];
    for (const w of workspaces) {
      if (!w.sourceUipId) continue;
      const uip = state[w.sourceUipId] ?? null;
      resolved.push({ id: w.sourceUipId, uip, workspaceId: w.id });
      if (!uip) missing.push(w.sourceUipId);
    }
    return { resolved, missing };
  },

  /**
   * Latest UIP the officer generated in this session. Used by MIBC's
   * "Live Intelligence Brief" mode to report on the current
   * Copilot-produced snapshot without touching a workspace.
   */
  getLatestUIP(): UnifiedIntelligencePackage | null {
    return latestUip() ?? null;
  },

  /**
   * Full session registry, most-recent first. Exposed so surfaces
   * that let the officer pick a snapshot (e.g. the Briefing Centre's
   * Live-UIP selector) can enumerate available packages.
   */
  listRegisteredUIPs(): ReadonlyArray<UnifiedIntelligencePackage> {
    const { order, byId } = useUipStore.getState();
    return order.map((id) => byId[id]).filter((x): x is UnifiedIntelligencePackage => !!x);
  },
} as const;

export type IntelligenceOrchestrator = typeof intelligenceOrchestrator;
