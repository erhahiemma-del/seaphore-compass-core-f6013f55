/**
 * Seaphore end-to-end performance monitor.
 *
 * Captures traces (start/end pairs) for pan/zoom, feed rendering and other
 * interaction-critical work, holds them in a bounded ring buffer, and emits
 * alerts when a trace exceeds its budget (see thresholds.ts).
 *
 * Consumers:
 *  - `startTrace(name, meta?)` returns `end(extraMeta?)` — the canonical API.
 *  - `traceSync(name, fn)` / `traceAsync(name, fn)` — one-shot wrappers.
 *  - `subscribe(fn)` — receive every completed trace (for overlay / audit).
 *  - `subscribeAlerts(fn)` — receive only threshold breaches.
 *
 * Zero-dependency, SSR-safe (uses Date.now when performance.now is absent),
 * and per-tab (no cross-tab coupling). Alerts are also mirrored to
 * `console.warn` so they surface in stack_modern--server-function-logs and
 * the browser console during Playwright runs.
 */
import { budgetFor } from "./thresholds";

export interface PerfTrace {
  id: string;
  name: string;
  startedAt: number;
  durationMs: number;
  budgetMs?: number;
  overBudget: boolean;
  meta?: Record<string, unknown>;
}

type TraceListener = (t: PerfTrace) => void;

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const RING_CAPACITY = 500;
const traces: PerfTrace[] = [];
const listeners = new Set<TraceListener>();
const alertListeners = new Set<TraceListener>();

let traceCounter = 0;
const nextId = () => `trc_${++traceCounter}_${Math.floor(Math.random() * 1e6)}`;

function record(trace: PerfTrace) {
  traces.push(trace);
  if (traces.length > RING_CAPACITY) traces.splice(0, traces.length - RING_CAPACITY);
  listeners.forEach((l) => l(trace));
  if (trace.overBudget) {
    alertListeners.forEach((l) => l(trace));
    if (typeof console !== "undefined") {
      console.warn(
        `[perf] ${trace.name} ${trace.durationMs.toFixed(1)}ms exceeds ${trace.budgetMs}ms`,
        trace.meta ?? {},
      );
    }
    if (typeof performance !== "undefined" && "measure" in performance) {
      try {
        performance.measure(`perf-alert:${trace.name}`, {
          start: trace.startedAt,
          duration: trace.durationMs,
        } as PerformanceMeasureOptions);
      } catch {
        /* ignore — some browsers reject non-mark start values */
      }
    }
  }
}

/** Start a trace; returns an end() function. */
export function startTrace(
  name: string,
  meta?: Record<string, unknown>,
): (extraMeta?: Record<string, unknown>) => PerfTrace {
  const startedAt = now();
  const id = nextId();
  return (extraMeta) => {
    const durationMs = now() - startedAt;
    const budgetMs = budgetFor(name);
    const trace: PerfTrace = {
      id,
      name,
      startedAt,
      durationMs,
      budgetMs,
      overBudget: typeof budgetMs === "number" && durationMs > budgetMs,
      meta: extraMeta || meta ? { ...meta, ...extraMeta } : undefined,
    };
    record(trace);
    return trace;
  };
}

export function traceSync<T>(name: string, fn: () => T, meta?: Record<string, unknown>): T {
  const end = startTrace(name, meta);
  try {
    return fn();
  } finally {
    end();
  }
}

export async function traceAsync<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const end = startTrace(name, meta);
  try {
    return await fn();
  } finally {
    end();
  }
}

export function subscribe(fn: TraceListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeAlerts(fn: TraceListener): () => void {
  alertListeners.add(fn);
  return () => alertListeners.delete(fn);
}

export function getRecentTraces(limit = 50): PerfTrace[] {
  return traces.slice(-limit).reverse();
}

export function getRecentAlerts(limit = 20): PerfTrace[] {
  return traces
    .filter((t) => t.overBudget)
    .slice(-limit)
    .reverse();
}

export function clearTraces(): void {
  traces.length = 0;
}

/** Convenience: aggregate p50/p95/max by trace name over the ring. */
export function summarize(): Record<
  string,
  { count: number; p50: number; p95: number; max: number; breaches: number }
> {
  const groups = new Map<string, number[]>();
  const breaches = new Map<string, number>();
  for (const t of traces) {
    const arr = groups.get(t.name) ?? [];
    arr.push(t.durationMs);
    groups.set(t.name, arr);
    if (t.overBudget) breaches.set(t.name, (breaches.get(t.name) ?? 0) + 1);
  }
  const out: ReturnType<typeof summarize> = {};
  for (const [name, arr] of groups) {
    const sorted = [...arr].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    out[name] = {
      count: arr.length,
      p50: q(0.5),
      p95: q(0.95),
      max: sorted[sorted.length - 1],
      breaches: breaches.get(name) ?? 0,
    };
  }
  return out;
}
