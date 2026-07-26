/**
 * SPRINT CAP-03 — Cargo Knowledge Graph data access.
 *
 * One shared build of the graph from the Canonical UIP. The hook is a
 * pure consumer: it never fetches provider data and never seeds the
 * graph when no UIP exists — it reports the absence instead.
 */
import { useMemo } from "react";

import {
  buildCargoGraph,
  cargoGraphFacade,
  createCargoGraphQuery,
  type CargoGraphFacade,
  type CargoGraphStats,
} from "@/services/cargo-graph";
import { useUipStore } from "@/stores/uip.store";

export interface CargoGraphView {
  readonly facade: CargoGraphFacade | null;
  readonly stats: CargoGraphStats | null;
  readonly uipId: string | null;
  readonly evidenceCount: number;
  /** `rel.*` references pointing at entities no evidence described. */
  readonly danglingRefs: ReadonlyArray<string>;
  readonly empty: boolean;
}

export function useCargoGraph(): CargoGraphView {
  const uip = useUipStore((s) => {
    const id = s.order[0];
    return id ? s.byId[id] : undefined;
  });
  const evidence = uip?.rawEvidence ?? [];

  return useMemo(() => {
    if (evidence.length === 0) {
      return {
        facade: null,
        stats: null,
        uipId: uip?.id ?? null,
        evidenceCount: 0,
        danglingRefs: [],
        empty: true,
      };
    }
    const { graph, danglingRefs } = buildCargoGraph(evidence);
    const stats = graph.stats();
    return {
      facade: cargoGraphFacade(createCargoGraphQuery(graph)),
      stats,
      uipId: uip?.id ?? null,
      evidenceCount: evidence.length,
      danglingRefs,
      empty: stats.nodes === 0,
    };
  }, [evidence, uip?.id]);
}
