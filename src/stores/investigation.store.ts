/**
 * investigation.store — active case workspace context.
 *
 * Holds the currently selected investigation id + light metadata used by
 * lifecycle screens (Investigate → Decide → Share). Fetching remains in
 * services/React Query; this store only tracks selection.
 */
import { create } from "zustand";

interface ActiveInvestigation {
  id: string;
  vessel?: string;
  imo?: string;
}

interface InvestigationState {
  active: ActiveInvestigation | null;
  setActive: (a: ActiveInvestigation | null) => void;
  clear: () => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  active: null,
  setActive: (active) => set({ active }),
  clear: () => set({ active: null }),
}));
