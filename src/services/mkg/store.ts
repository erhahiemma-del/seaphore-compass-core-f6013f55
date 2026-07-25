/**
 * MKG — Zustand singleton store.
 *
 * Holds a single process-wide `MaritimeKnowledgeGraph` so the Copilot,
 * OSAE, and the visualization surface all see one source of truth.
 *
 * The graph itself is a class with mutable state; the store simply
 * signals subscribers whenever the underlying graph changes.
 */
import { create } from "zustand";
import type { NormalizedEvidence } from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import { MaritimeKnowledgeGraph } from "./graph";
import { ingestUnifiedPackage, type IngestResult } from "./ingest";
import type { MkgSnapshot } from "./types";

interface MkgStoreState {
  readonly graph: MaritimeKnowledgeGraph;
  /** Monotonic revision id — bumped on every write so React re-renders. */
  readonly revision: number;
  readonly ingest: (
    uip: UnifiedIntelligencePackage,
    evidence?: ReadonlyArray<NormalizedEvidence>,
  ) => IngestResult;
  readonly snapshot: () => MkgSnapshot;
  readonly clear: () => void;
}

export const useMkgStore = create<MkgStoreState>((set, get) => {
  const graph = new MaritimeKnowledgeGraph();
  return {
    graph,
    revision: 0,
    ingest(uip, evidence) {
      const result = ingestUnifiedPackage(get().graph, uip, { evidence });
      set({ revision: get().revision + 1 });
      return result;
    },
    snapshot() {
      return get().graph.toSnapshot();
    },
    clear() {
      get().graph.clear();
      set({ revision: get().revision + 1 });
    },
  };
});
