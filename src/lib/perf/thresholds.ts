/**
 * Seaphore performance budgets (ms). Exceeding a budget emits a perf alert
 * through the monitor. Values reflect the 60fps interaction target
 * (≤16.7ms per frame) with realistic ceilings for compound work.
 */
export const PERF_THRESHOLDS = {
  /** Single pan drag frame (mouse move → setState → paint). */
  "pan.frame": 16,
  /** Single zoom step. */
  "zoom.step": 24,
  /** Feed panel render (initial + updates). */
  "feed.render": 50,
  /** Detect signal list render. */
  "signals.render": 80,
  /** Ownership graph re-layout. */
  "graph.layout": 120,
  /** Map marker render pass. */
  "map.render": 100,
} as const;

export type PerfTraceName = keyof typeof PERF_THRESHOLDS;

export function budgetFor(name: string): number | undefined {
  return (PERF_THRESHOLDS as Record<string, number>)[name];
}
