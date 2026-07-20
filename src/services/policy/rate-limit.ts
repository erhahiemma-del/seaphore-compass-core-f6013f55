/**
 * Sprint 10 · Rate limiting — sliding hour window per officer per workflow.
 *
 * In-memory counter store. Sprint 12 will swap for Redis; the interface is
 * the seam. Defaults deliberately generous so legitimate work is never
 * throttled — spec says "start permissive, tighten with feedback".
 */
import type { WorkflowId } from "@/services/workflows";

export interface RateLimitStore {
  /** Record a hit at `at` and return the number of hits within the window. */
  hit(key: string, at: number, windowMs: number): number;
  /** Read the current count without mutating. */
  count(key: string, at: number, windowMs: number): number;
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const rows = new Map<string, number[]>();
  function prune(times: number[], cutoff: number): number[] {
    let i = 0;
    while (i < times.length && times[i] <= cutoff) i++;
    return i === 0 ? times : times.slice(i);
  }
  return {
    hit(key, at, windowMs) {
      const cutoff = at - windowMs;
      const kept = prune(rows.get(key) ?? [], cutoff);
      kept.push(at);
      rows.set(key, kept);
      return kept.length;
    },
    count(key, at, windowMs) {
      const cutoff = at - windowMs;
      const kept = prune(rows.get(key) ?? [], cutoff);
      rows.set(key, kept);
      return kept.length;
    },
  };
}

/** Per-workflow hourly ceilings. Missing entries default to `DEFAULT_LIMIT`. */
export const DEFAULT_LIMIT = 60;
export const HOURLY_LIMITS: Readonly<Partial<Record<WorkflowId, number>>> = Object.freeze({
  freeze_clearance: 3,
  assign_officer: 10,
  notify_customs: 30,
  request_manifest: 60,
  open_investigation: 20,
});
export const WINDOW_MS = 60 * 60 * 1000;

export function limitFor(workflow: WorkflowId): number {
  return HOURLY_LIMITS[workflow] ?? DEFAULT_LIMIT;
}
export function keyFor(officerId: string, workflow: WorkflowId): string {
  return `${officerId}:${workflow}`;
}
