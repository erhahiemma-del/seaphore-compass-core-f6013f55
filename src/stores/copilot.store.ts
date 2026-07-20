/**
 * copilot.store — UI state for the Sprint 2 Copilot modal.
 *
 * Client-only (STATE-2). Holds open/minimize state plus a lightweight
 * context descriptor rendered in the Context Bar. All reasoning-pipeline
 * data lives elsewhere; this store is intentionally decoupled from any
 * AI/LLM plumbing so the modal can be exercised standalone (Storybook,
 * unit tests, offline mocks).
 */
import { create } from "zustand";

export type CopilotContextKind = "investigation" | "vessel" | "port" | "case";

export interface CopilotContext {
  kind: CopilotContextKind;
  label: string;
  detail?: string;
}

interface CopilotState {
  open: boolean;
  minimized: boolean;
  context: CopilotContext | null;
  openCopilot: (ctx?: CopilotContext | null) => void;
  closeCopilot: () => void;
  minimizeCopilot: () => void;
  restoreCopilot: () => void;
  toggleCopilot: () => void;
  setContext: (ctx: CopilotContext | null) => void;
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  open: false,
  minimized: false,
  context: null,
  openCopilot: (ctx) =>
    set((s) => ({
      open: true,
      minimized: false,
      context: ctx === undefined ? s.context : ctx,
    })),
  closeCopilot: () => set({ open: false, minimized: false }),
  minimizeCopilot: () => set({ open: false, minimized: true }),
  restoreCopilot: () => set({ open: true, minimized: false }),
  toggleCopilot: () => {
    const { open, minimized } = get();
    if (open) set({ open: false, minimized: false });
    else set({ open: true, minimized: false });
  },
  setContext: (ctx) => set({ context: ctx }),
}));
