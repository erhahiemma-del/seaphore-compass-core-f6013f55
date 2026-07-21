/**
 * mission-context.store — persistent Mission Context.
 *
 * A single per-investigation object every module reads and updates. It
 * carries the full operational state (vessel, voyage, manifest, port,
 * companies, alerts, evidence, decisions, tasks, hypotheses, next
 * actions) plus the shared Copilot `conversation`. Every Copilot
 * surface (global launcher modal, /copilot page, centre panels) reads
 * from and writes to the same slice, so moving between modules never
 * loses context.
 *
 * Persisted to localStorage under `seaphore.mission-context.v1`. A
 * future server-side snapshot table can hydrate this on sign-in; for
 * now the store is authoritative on the client.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MissionSliceKey =
  | "vessel"
  | "voyage"
  | "manifest"
  | "port"
  | "companies"
  | "alerts"
  | "evidence"
  | "decisions"
  | "tasks"
  | "hypotheses"
  | "nextActions";

export interface ConversationEntry {
  id: string;
  ts: number;
  role: "officer" | "copilot";
  /** Free-text query (officer) or short briefing summary (copilot). */
  text: string;
  /** For briefings, the id of the AdaptiveBriefingData rendered. */
  briefingId?: string;
  /** Copilot instance / module that produced or received this turn. */
  instance?: string;
}

export interface MissionContext {
  investigationId: string;
  title?: string;
  vessel?: unknown;
  voyage?: unknown;
  manifest?: unknown;
  port?: unknown;
  companies: unknown[];
  alerts: unknown[];
  evidence: unknown[];
  decisions: unknown[];
  tasks: unknown[];
  hypotheses: unknown[];
  nextActions: unknown[];
  conversation: ConversationEntry[];
  updatedAt: number;
}

interface MissionState {
  activeId: string | null;
  missions: Record<string, MissionContext>;
  setActive: (id: string | null) => void;
  ensureMission: (id: string, title?: string) => MissionContext;
  setMissionSlice: <K extends MissionSliceKey>(
    id: string,
    key: K,
    value: MissionContext[K],
  ) => void;
  appendConversation: (id: string, entry: Omit<ConversationEntry, "id" | "ts">) => void;
  resetConversation: (id: string) => void;
  reset: (id: string) => void;
}

const AMBIENT_ID = "ambient";

function emptyMission(id: string, title?: string): MissionContext {
  return {
    investigationId: id,
    title,
    companies: [],
    alerts: [],
    evidence: [],
    decisions: [],
    tasks: [],
    hypotheses: [],
    nextActions: [],
    conversation: [],
    updatedAt: Date.now(),
  };
}

export const useMissionContextStore = create<MissionState>()(
  persist(
    (set, get) => ({
      activeId: AMBIENT_ID,
      missions: { [AMBIENT_ID]: emptyMission(AMBIENT_ID, "Ambient session") },
      setActive: (id) => set({ activeId: id ?? AMBIENT_ID }),
      ensureMission: (id, title) => {
        const existing = get().missions[id];
        if (existing) return existing;
        const created = emptyMission(id, title);
        set((s) => ({ missions: { ...s.missions, [id]: created } }));
        return created;
      },
      setMissionSlice: (id, key, value) =>
        set((s) => {
          const current = s.missions[id] ?? emptyMission(id);
          return {
            missions: {
              ...s.missions,
              [id]: { ...current, [key]: value, updatedAt: Date.now() },
            },
          };
        }),
      appendConversation: (id, entry) =>
        set((s) => {
          const current = s.missions[id] ?? emptyMission(id);
          const full: ConversationEntry = {
            ...entry,
            id: crypto.randomUUID(),
            ts: Date.now(),
          };
          return {
            missions: {
              ...s.missions,
              [id]: {
                ...current,
                conversation: [...current.conversation, full].slice(-200),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      resetConversation: (id) =>
        set((s) => {
          const current = s.missions[id];
          if (!current) return s;
          return {
            missions: {
              ...s.missions,
              [id]: { ...current, conversation: [], updatedAt: Date.now() },
            },
          };
        }),
      reset: (id) =>
        set((s) => ({
          missions: { ...s.missions, [id]: emptyMission(id, s.missions[id]?.title) },
        })),
    }),
    {
      name: "seaphore.mission-context.v1",
      version: 1,
    },
  ),
);

/** Convenience selector for the active mission (falls back to ambient). */
export function useActiveMission(): MissionContext {
  return useMissionContextStore((s) => {
    const id = s.activeId ?? AMBIENT_ID;
    return s.missions[id] ?? emptyMission(id);
  });
}

export const MISSION_AMBIENT_ID = AMBIENT_ID;
