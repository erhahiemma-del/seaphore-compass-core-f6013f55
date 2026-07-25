/**
 * PIE Zustand store — a UI-friendly projection of the engine.
 *
 * Components subscribe here for reactive updates. The engine itself remains
 * pure and independently testable.
 */
import { create } from "zustand";
import { getPie, type PieIngestInput } from "./engine";
import type { Prediction, PredictionCycle } from "./types";

interface PieState {
  predictions: ReadonlyArray<Prediction>;
  alerts: ReadonlyArray<Prediction>;
  lastCycle?: PredictionCycle;
  ingest(input: PieIngestInput): PredictionCycle;
  forEntity(entityId: string): ReadonlyArray<Prediction>;
  reset(): void;
}

export const usePieStore = create<PieState>((set, get) => {
  const pie = getPie();
  pie.subscribe((cycle) => {
    set({
      predictions: pie.all(),
      alerts: cycle.alerts,
      lastCycle: cycle,
    });
  });
  return {
    predictions: pie.all(),
    alerts: [],
    lastCycle: undefined,
    ingest(input) {
      return pie.ingest(input);
    },
    forEntity(id) {
      return pie.forEntity(id);
    },
    reset() {
      pie.reset();
      set({ predictions: [], alerts: [], lastCycle: undefined });
    },
  };
});
