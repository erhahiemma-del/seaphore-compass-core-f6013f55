/**
 * Sprint 10 · Conflict detection.
 *
 * A workflow is blocked when it collides with an existing case/hold — e.g.
 * freezing clearance on a vessel that is already frozen, or opening a new
 * investigation for an entity that already has an active one.
 *
 * The engine exposes a `ConflictDetector` seam so Sprint 12 can wire it to
 * Supabase. Sprint 10 ships an in-memory detector for tests + local dev.
 */
import type { WorkflowId } from "@/services/workflows";
import type { OfficerContext } from "@/services/workflows";

export interface ConflictSubject {
  readonly workflow: WorkflowId;
  readonly officer: OfficerContext;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ConflictFinding {
  readonly conflictWith: string;
  readonly explanation: string;
}

export interface ConflictDetector {
  detect(subject: ConflictSubject): ConflictFinding | null;
}

/** Never blocks — the default when no detector is provided. */
export const noopConflictDetector: ConflictDetector = { detect: () => null };

/** In-memory detector for tests and local development. */
export function createMemoryConflictDetector(): ConflictDetector & {
  registerActiveHold(vesselId: string, caseRef: string): void;
  registerActiveInvestigation(vesselId: string, caseRef: string): void;
  release(vesselId: string): void;
} {
  const holds = new Map<string, string>();
  const investigations = new Map<string, string>();
  return {
    registerActiveHold(vesselId, caseRef) {
      holds.set(vesselId, caseRef);
    },
    registerActiveInvestigation(vesselId, caseRef) {
      investigations.set(vesselId, caseRef);
    },
    release(vesselId) {
      holds.delete(vesselId);
      investigations.delete(vesselId);
    },
    detect(subject) {
      const vesselId = String(subject.input.vesselId ?? "");
      if (!vesselId) return null;
      if (subject.workflow === "freeze_clearance" && holds.has(vesselId)) {
        return {
          conflictWith: holds.get(vesselId)!,
          explanation: `Vessel ${vesselId} already has an active hold on case ${holds.get(vesselId)}.`,
        };
      }
      if (subject.workflow === "open_investigation" && investigations.has(vesselId)) {
        return {
          conflictWith: investigations.get(vesselId)!,
          explanation: `Vessel ${vesselId} already has active investigation ${investigations.get(vesselId)}.`,
        };
      }
      return null;
    },
  };
}
