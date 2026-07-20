/**
 * Sprint 9 · State machine (Layer 5.3).
 *
 *   pending → running → completed
 *                     ↘ failed → retrying → running
 *   pending → denied  (Policy Engine short-circuit)
 *
 * The machine is a pure function; the engine applies it and persists the
 * resulting record via the WorkflowStore.
 */
import type { WorkflowStatus } from "./types";

const ALLOWED: Readonly<Record<WorkflowStatus, ReadonlyArray<WorkflowStatus>>> = Object.freeze({
  pending: ["running", "denied"],
  running: ["completed", "failed"],
  failed: ["retrying"],
  retrying: ["running"],
  completed: [],
  denied: [],
});

export function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal workflow transition: ${from} → ${to}`);
  }
}

export function isTerminal(status: WorkflowStatus): boolean {
  return status === "completed" || status === "denied";
}
