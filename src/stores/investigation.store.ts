/**
 * investigation.store — active case workspace context.
 *
 * Client-only state (STATE-2). Server data (investigations, voyages, signals)
 * MUST come from React Query using QUERY_KEYS.investigations(). This store
 * only tracks the officer's active selection and lifecycle stage plus
 * handoff context passed between screens.
 */
import { create } from "zustand";

import type { HandoffContext } from "@/lib/nav-context";

export type LifecycleStage = "detect" | "investigate" | "decide" | "share" | "learn";

/** Legacy convenience shape retained for existing consumers. */
interface ActiveInvestigation {
  id: string;
  vessel?: string;
  imo?: string;
}

interface InvestigationState {
  // Spec fields (PART D):
  activeInvestigationId: string | null;
  activeStage: LifecycleStage | null;
  context: HandoffContext | null;

  // Legacy convenience field — mirrors activeInvestigationId + light metadata.
  active: ActiveInvestigation | null;

  setActive: (
    input:
      | ActiveInvestigation
      | { id: string; stage?: LifecycleStage; context?: HandoffContext | null }
      | null,
  ) => void;
  setStage: (stage: LifecycleStage | null) => void;
  setContext: (context: HandoffContext | null) => void;
  clearActive: () => void;
  /** @deprecated use clearActive */
  clear: () => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  activeInvestigationId: null,
  activeStage: null,
  context: null,
  active: null,

  setActive: (input) => {
    if (!input) {
      set({
        activeInvestigationId: null,
        activeStage: null,
        context: null,
        active: null,
      });
      return;
    }
    const stage = "stage" in input ? (input.stage ?? null) : null;
    const context = "context" in input ? (input.context ?? null) : null;
    const legacy: ActiveInvestigation = {
      id: input.id,
      vessel: "vessel" in input ? input.vessel : undefined,
      imo: "imo" in input ? input.imo : undefined,
    };
    set({
      activeInvestigationId: input.id,
      activeStage: stage,
      context,
      active: legacy,
    });
  },
  setStage: (activeStage) => set({ activeStage }),
  setContext: (context) => set({ context }),
  clearActive: () =>
    set({
      activeInvestigationId: null,
      activeStage: null,
      context: null,
      active: null,
    }),
  clear: () =>
    set({
      activeInvestigationId: null,
      activeStage: null,
      context: null,
      active: null,
    }),
}));
