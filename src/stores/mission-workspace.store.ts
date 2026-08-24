/**
 * mission-workspace.store — per-investigation UI workspace state.
 *
 * A single per-investigation object every module reads and updates. It
 * carries the full operational working state (vessel, voyage, manifest,
 * port, companies, alerts, evidence, decisions, tasks, hypotheses, next
 * actions) plus the shared Copilot `conversation`. Every Copilot
 * surface (global launcher modal, /copilot page, centre panels) reads
 * from and writes to the same slice, so moving between modules never
 * loses context.
 *
 * ## Why this is not `MissionContext`
 *
 * It was called that, and shared the name with
 * `services/orchestration/mission-context.ts` while having an entirely
 * different shape and responsibility. That one is a narrow, fully typed
 * contract — `{ investigationId, subject, openedAt }` — describing *one
 * subject* for the classifier, and it is the input to
 * `ambientEntityOf()`, the single function guarding against an open
 * investigation contaminating an unrelated query.
 *
 * This is a UI accumulator: fifteen slices, most typed `unknown`, plus
 * conversation history. Merging the two would push all of that into the
 * contract that protects query isolation. They are deliberately
 * separate, and now named accordingly.
 *
 * Persisted to localStorage under `seaphore.mission-context.v1` — the
 * storage key is intentionally unchanged, so existing sessions rehydrate
 * across this rename rather than silently losing their workspace.
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

export interface MissionWorkspaceState {
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
  /**
   * The open investigation, or null.
   *
   * G6.0: `null` is the normal state. Before it, the console booted with
   * an investigation already selected, so there was no such thing as "no
   * investigation" and every question was asked against a subject — an
   * officer looking at the whole fleet was silently looking at one vessel.
   */
  activeId: string | null;
  missions: Record<string, MissionWorkspaceState>;
  setActive: (id: string | null) => void;
  /**
   * Open a subject. Replaces whatever was open rather than stacking: a
   * second subject means the officer moved on, and keeping the first is
   * the contamination G6.0 removed.
   */
  openInvestigation: (id: string, title?: string) => void;
  /** Close the open investigation, returning to null. */
  closeInvestigation: () => void;
  ensureMission: (id: string, title?: string) => MissionWorkspaceState;
  setMissionSlice: <K extends MissionSliceKey>(
    id: string,
    key: K,
    value: MissionWorkspaceState[K],
  ) => void;
  appendConversation: (id: string, entry: Omit<ConversationEntry, "id" | "ts">) => void;
  resetConversation: (id: string) => void;
  reset: (id: string) => void;
}

const AMBIENT_ID = "ambient";

function emptyMission(id: string, title?: string): MissionWorkspaceState {
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

export const useMissionWorkspaceStore = create<MissionState>()(
  persist(
    (set, get) => ({
      // No investigation until the officer opens one.
      activeId: null,
      missions: { [AMBIENT_ID]: emptyMission(AMBIENT_ID, "Ambient session") },
      setActive: (id) => set({ activeId: id }),
      openInvestigation: (id, title) => {
        const existing = get().missions[id];
        if (!existing) {
          set((s) => ({ missions: { ...s.missions, [id]: emptyMission(id, title) } }));
        }
        set({ activeId: id });
      },
      closeInvestigation: () => set({ activeId: null }),
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
      // v2: activeId is nullable and no longer defaults to the ambient
      // session. A persisted v1 state would restore a subject the officer
      // never opened in this session, so the active selection is dropped
      // on migration while the mission bodies are kept.
      version: 2,
      migrate: (persisted, from) => {
        const state = persisted as Partial<MissionState> | undefined;
        if (from < 2) return { ...state, activeId: null } as MissionState;
        return state as MissionState;
      },
    },
  ),
);

/**
 * The open investigation, or null when there is none.
 *
 * Callers must handle null — that is the point. A component that renders
 * a vessel name regardless is how the hardcoded subject survived.
 */
export function useActiveMission(): MissionWorkspaceState | null {
  return useMissionWorkspaceStore((s) => (s.activeId ? (s.missions[s.activeId] ?? null) : null));
}

/**
 * The ambient scratch session, for surfaces that must write somewhere even
 * with no investigation open (e.g. the global Copilot conversation log).
 * Distinct from an investigation: it is never a query subject.
 */
export function useAmbientMission(): MissionWorkspaceState {
  return useMissionWorkspaceStore((s) => s.missions[AMBIENT_ID] ?? emptyMission(AMBIENT_ID));
}

export const MISSION_AMBIENT_ID = AMBIENT_ID;
