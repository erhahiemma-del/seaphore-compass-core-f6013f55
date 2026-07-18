/**
 * entity.store — last-viewed entity + selection breadcrumbs + light id→entity
 * cache used by handoff panels to render without prop-drilling.
 *
 * Client-only state (STATE-2). This cache is a UI convenience only; the
 * authoritative source for entity records is React Query
 * (QUERY_KEYS.entities(id)). Do not use it as a substitute for fetching.
 */
import { create } from "zustand";

interface SelectedEntity {
  id: string;
  type?: string;
  label?: string;
}

/** Minimal entity shape kept in the client cache. */
export interface BaseEntity {
  id: string;
  type?: string;
  name?: string;
  [k: string]: unknown;
}

interface EntityState {
  selected: SelectedEntity | null;
  recent: SelectedEntity[];
  cache: Record<string, BaseEntity>;

  select: (e: SelectedEntity | null) => void;
  addToCache: (entity: BaseEntity) => void;
  clearRecent: () => void;
  clearCache: () => void;
}

export const useEntityStore = create<EntityState>((set) => ({
  selected: null,
  recent: [],
  cache: {},

  select: (selected) =>
    set((s) => ({
      selected,
      recent: selected
        ? [selected, ...s.recent.filter((r) => r.id !== selected.id)].slice(0, 10)
        : s.recent,
    })),
  addToCache: (entity) =>
    set((s) => ({ cache: { ...s.cache, [entity.id]: entity } })),
  clearRecent: () => set({ recent: [] }),
  clearCache: () => set({ cache: {} }),
}));
