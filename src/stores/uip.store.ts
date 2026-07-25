/**
 * Client-side UIP store — the runtime cache of Unified Intelligence
 * Packages delivered by the server (`runOIEFn`). Downstream client
 * surfaces (Evidence Explorer, Predictions, Revenue Leakage,
 * Operational Knowledge, Investigation panels) resolve their evidence
 * through this store keyed by `briefing.source_uip_id`, instead of
 * reading demo fixtures.
 *
 * The server-side IFE registry is not reachable from the browser (it
 * lives in worker memory). This client store mirrors registered UIPs
 * as they flow back with each briefing so `getUip(source_uip_id)`
 * remains the single lookup contract on every surface.
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";

interface UipState {
  readonly byId: Readonly<Record<string, UnifiedIntelligencePackage>>;
  readonly order: ReadonlyArray<string>;
  register: (uip: UnifiedIntelligencePackage | null | undefined) => void;
  clear: () => void;
}

export const useUipStore = create<UipState>()(
  subscribeWithSelector((set) => ({
    byId: {},
    order: [],
    register: (uip) => {
      if (!uip || !uip.id) return;
      set((prev) => {
        if (prev.byId[uip.id]) return prev;
        return {
          ...prev,
          byId: { ...prev.byId, [uip.id]: uip },
          order: [uip.id, ...prev.order.filter((x) => x !== uip.id)].slice(0, 32),
        };
      });
    },
    clear: () => set({ byId: {}, order: [] }),
  })),
);

/** Non-hook access — mirrors the server-side `getUip` contract on the client. */
export function getUip(id: string | null | undefined): UnifiedIntelligencePackage | undefined {
  if (!id) return undefined;
  return useUipStore.getState().byId[id];
}

/** Latest UIP the officer has generated in this session, if any. */
export function latestUip(): UnifiedIntelligencePackage | undefined {
  const { order, byId } = useUipStore.getState();
  const id = order[0];
  return id ? byId[id] : undefined;
}
