/**
 * copilot-run.store — persistence for an in-flight Copilot investigation run.
 *
 * A page refresh or a navigation away kills the in-flight pipeline call: the
 * browser tab is the client of the OIE run. Rather than silently dropping the
 * officer's submission, we persist the run intent (query + stage + start time)
 * so the Copilot can restore the progress card on return and re-issue the run
 * from where it left off — with the original elapsed clock preserved so the
 * readout stays honest about how long the officer has been waiting.
 *
 * Presentation/continuity layer only. No intelligence is stored here; a
 * restored run always re-executes the single canonical pipeline.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type PersistedStage = "classifying" | "retrieving" | "reasoning" | "rendering";

export interface PendingRun {
  query: string;
  /** Epoch ms the officer submitted — powers the continuous elapsed readout. */
  startedAt: number;
  stage: PersistedStage;
}

/** Runs older than this are treated as abandoned, never silently resumed. */
export const PENDING_RUN_TTL_MS = 10 * 60 * 1000;

interface CopilotRunState {
  pending: PendingRun | null;
  begin: (query: string, startedAt: number) => void;
  setStage: (stage: PersistedStage) => void;
  clear: () => void;
}

export const useCopilotRunStore = create<CopilotRunState>()(
  persist(
    (set, get) => ({
      pending: null,
      begin: (query, startedAt) =>
        set({ pending: { query, startedAt, stage: "classifying" } }),
      setStage: (stage) => {
        const p = get().pending;
        if (!p) return;
        set({ pending: { ...p, stage } });
      },
      clear: () => set({ pending: null }),
    }),
    {
      name: "seaphore.copilot.pending-run",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Returns the persisted run only when it is recent enough to resume. */
export function readResumableRun(): PendingRun | null {
  const p = useCopilotRunStore.getState().pending;
  if (!p) return null;
  if (Date.now() - p.startedAt > PENDING_RUN_TTL_MS) {
    useCopilotRunStore.getState().clear();
    return null;
  }
  return p;
}
