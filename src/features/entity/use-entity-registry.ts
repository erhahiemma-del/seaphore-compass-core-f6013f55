/**
 * EIE client store — a single process-wide Entity Registry fed from the
 * Canonical UIP store, so every officer surface reads one entity layer.
 */
import { useMemo } from "react";
import { create } from "zustand";
import { EntityRegistry } from "@/services/eie";
import { useUipStore } from "@/stores/uip.store";

interface EieStoreState {
  readonly registry: EntityRegistry;
  readonly revision: number;
  readonly ingested: ReadonlySet<string>;
  readonly ingestUip: (uipId: string) => void;
}

export const useEieStore = create<EieStoreState>((set, get) => ({
  registry: new EntityRegistry(),
  revision: 0,
  ingested: new Set<string>(),
  ingestUip(uipId) {
    if (get().ingested.has(uipId)) return;
    const uip = useUipStore.getState().byId[uipId];
    if (!uip) return;
    get().registry.ingest(uip.rawEvidence ?? []);
    const next = new Set(get().ingested);
    next.add(uipId);
    set({ ingested: next, revision: get().revision + 1 });
  },
}));

/**
 * Entity Registry hydrated with every UIP the officer has generated in
 * this session. Empty until evidence is acquired — reported honestly.
 */
export function useEntityRegistry(): { registry: EntityRegistry; revision: number } {
  const order = useUipStore((s) => s.order);
  const revision = useEieStore((s) => s.revision);
  const registry = useEieStore((s) => s.registry);
  const ingest = useEieStore((s) => s.ingestUip);

  useMemo(() => {
    for (const id of order) ingest(id);
  }, [order, ingest]);

  return { registry, revision };
}
