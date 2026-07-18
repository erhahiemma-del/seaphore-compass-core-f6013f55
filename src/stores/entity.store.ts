/**
 * entity.store — last-viewed entity + selection breadcrumbs.
 *
 * Feeds the Investigate/Entity handoff without prop-drilling. Business
 * logic (search, resolution) stays in services.
 */
import { create } from "zustand";

interface SelectedEntity {
  id: string;
  type?: string;
  label?: string;
}

interface EntityState {
  selected: SelectedEntity | null;
  recent: SelectedEntity[];
  select: (e: SelectedEntity | null) => void;
  clearRecent: () => void;
}

export const useEntityStore = create<EntityState>((set) => ({
  selected: null,
  recent: [],
  select: (selected) =>
    set((s) => ({
      selected,
      recent: selected
        ? [selected, ...s.recent.filter((r) => r.id !== selected.id)].slice(0, 10)
        : s.recent,
    })),
  clearRecent: () => set({ recent: [] }),
}));
