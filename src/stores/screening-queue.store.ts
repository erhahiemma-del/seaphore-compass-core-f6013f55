/**
 * screening-queue.store — Live "Entities Requiring Screening" tracker.
 *
 * Presentation + persistence layer. Actual screening runs through the
 * SANCTIONS capability (`runSanctionsScreening`) — this store only tracks
 * queue state and reflects per-entity progress as each screening resolves.
 *
 * Persistence: localStorage via zustand/persist so an officer returning
 * tomorrow sees the same queue and outcomes.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { runSanctionsScreening } from "@/services/capabilities/sanctions";

export type ScreeningStatus =
  | "PENDING"
  | "RUNNING"
  | "CLEAR"
  | "HIT"
  | "REVIEW"
  | "ERROR";

export type ScreeningEntityKind =
  | "vessel"
  | "company"
  | "person"
  | "port"
  | "manifest"
  | string;

export interface ScreeningEntity {
  id: string;
  name: string;
  kind?: ScreeningEntityKind;
  imo?: string;
  status: ScreeningStatus;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  hitCount?: number;
  providers?: string[];
  summary?: string;
  error?: string;
  /** free-text tag so callers (workspace, compliance) can group items. */
  origin?: string;
}

interface ScreeningQueueState {
  entities: Record<string, ScreeningEntity>;
  order: string[];
  runningCount: number;

  enqueue: (
    e: Omit<ScreeningEntity, "status" | "addedAt"> & { status?: ScreeningStatus },
  ) => string;
  enqueueMany: (
    es: Array<Omit<ScreeningEntity, "status" | "addedAt">>,
  ) => string[];
  remove: (id: string) => void;
  clearCompleted: () => void;
  reset: (id: string) => void;
  markRunning: (id: string) => void;
  markResult: (id: string, patch: Partial<ScreeningEntity>) => void;

  /** Run screening for one queued entity end-to-end. Safe to call in parallel. */
  runOne: (id: string) => Promise<void>;
  /** Run every PENDING (and ERROR) entity with bounded concurrency. */
  runAllPending: (concurrency?: number) => Promise<void>;
}

const now = () => new Date().toISOString();

const genId = () =>
  `scr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function classifyHits(hitCount: number): ScreeningStatus {
  if (hitCount <= 0) return "CLEAR";
  if (hitCount >= 3) return "HIT";
  return "REVIEW";
}

export const useScreeningQueueStore = create<ScreeningQueueState>()(
  persist(
    (set, get) => ({
      entities: {},
      order: [],
      runningCount: 0,

      enqueue: (e) => {
        const id = e.id || genId();
        const existing = get().entities[id];
        if (existing) return id;
        const entity: ScreeningEntity = {
          id,
          name: e.name,
          kind: e.kind,
          imo: e.imo,
          origin: e.origin,
          status: e.status ?? "PENDING",
          addedAt: now(),
        };
        set((s) => ({
          entities: { ...s.entities, [id]: entity },
          order: [...s.order, id],
        }));
        return id;
      },

      enqueueMany: (es) => {
        const ids: string[] = [];
        for (const e of es) ids.push(get().enqueue(e));
        return ids;
      },

      remove: (id) =>
        set((s) => {
          const next = { ...s.entities };
          delete next[id];
          return { entities: next, order: s.order.filter((x) => x !== id) };
        }),

      clearCompleted: () =>
        set((s) => {
          const keep: Record<string, ScreeningEntity> = {};
          const order: string[] = [];
          for (const id of s.order) {
            const e = s.entities[id];
            if (!e) continue;
            if (e.status === "PENDING" || e.status === "RUNNING") {
              keep[id] = e;
              order.push(id);
            }
          }
          return { entities: keep, order };
        }),

      reset: (id) =>
        set((s) => {
          const e = s.entities[id];
          if (!e) return s;
          return {
            entities: {
              ...s.entities,
              [id]: {
                ...e,
                status: "PENDING",
                startedAt: undefined,
                completedAt: undefined,
                hitCount: undefined,
                providers: undefined,
                summary: undefined,
                error: undefined,
              },
            },
          };
        }),

      markRunning: (id) =>
        set((s) => {
          const e = s.entities[id];
          if (!e) return s;
          return {
            entities: {
              ...s.entities,
              [id]: { ...e, status: "RUNNING", startedAt: now() },
            },
            runningCount: s.runningCount + 1,
          };
        }),

      markResult: (id, patch) =>
        set((s) => {
          const e = s.entities[id];
          if (!e) return s;
          const wasRunning = e.status === "RUNNING";
          return {
            entities: {
              ...s.entities,
              [id]: { ...e, ...patch, completedAt: now() },
            },
            runningCount: Math.max(0, s.runningCount - (wasRunning ? 1 : 0)),
          };
        }),

      runOne: async (id) => {
        const e = get().entities[id];
        if (!e || e.status === "RUNNING") return;
        get().markRunning(id);
        try {
          const result = await runSanctionsScreening({
            target: { kind: e.kind, name: e.name, imo: e.imo },
          });
          const findings = result.package.findings ?? [];
          const hitCount = findings.length;
          const providers = result.providers.map((p) => p.displayName);
          const status = classifyHits(hitCount);
          const summary =
            hitCount === 0
              ? `No matches across ${providers.length} provider${providers.length === 1 ? "" : "s"}.`
              : `${hitCount} potential match${hitCount === 1 ? "" : "es"} · ${providers.join(", ")}`;
          get().markResult(id, { status, hitCount, providers, summary });
        } catch (err) {
          get().markResult(id, {
            status: "ERROR",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      runAllPending: async (concurrency = 3) => {
        const s = get();
        const targets = s.order
          .map((id) => s.entities[id])
          .filter((e): e is ScreeningEntity =>
            !!e && (e.status === "PENDING" || e.status === "ERROR"),
          )
          .map((e) => e.id);

        let cursor = 0;
        const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
          while (cursor < targets.length) {
            const idx = cursor++;
            const id = targets[idx];
            if (!id) return;
            await get().runOne(id);
          }
        });
        await Promise.all(workers);
      },
    }),
    {
      name: "seaphore.screening-queue.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ entities: s.entities, order: s.order }),
    },
  ),
);

/** Convenience selector: derive live counts by status. */
export function selectScreeningStats(s: ScreeningQueueState) {
  const counts: Record<ScreeningStatus, number> = {
    PENDING: 0,
    RUNNING: 0,
    CLEAR: 0,
    HIT: 0,
    REVIEW: 0,
    ERROR: 0,
  };
  for (const id of s.order) {
    const e = s.entities[id];
    if (!e) continue;
    counts[e.status]++;
  }
  return {
    counts,
    total: s.order.length,
    outstanding: counts.PENDING + counts.RUNNING,
    completed: counts.CLEAR + counts.HIT + counts.REVIEW,
  };
}
