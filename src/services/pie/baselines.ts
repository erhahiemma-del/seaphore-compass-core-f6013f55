/**
 * PIE — running per-metric baselines using Welford's algorithm. Deterministic,
 * evidence-driven, and disk-free: baselines live in-memory but survive across
 * cycles for the lifetime of the engine.
 */
import type { BaselineSnapshot, BaselineStore } from "./types";

interface BaselineState {
  n: number;
  mean: number;
  m2: number;
  min: number;
  max: number;
  last?: number;
}

export function createBaselineStore(): BaselineStore {
  const map = new Map<string, BaselineState>();

  return {
    observe(key, value) {
      if (!Number.isFinite(value)) return;
      const s = map.get(key) ?? {
        n: 0,
        mean: 0,
        m2: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      };
      s.n += 1;
      const delta = value - s.mean;
      s.mean += delta / s.n;
      s.m2 += delta * (value - s.mean);
      if (value < s.min) s.min = value;
      if (value > s.max) s.max = value;
      s.last = value;
      map.set(key, s);
    },
    snapshot(key) {
      const s = map.get(key);
      if (!s || s.n === 0) return undefined;
      const variance = s.n > 1 ? s.m2 / (s.n - 1) : 0;
      const out: BaselineSnapshot = {
        n: s.n,
        mean: s.mean,
        stddev: Math.sqrt(variance),
        min: s.min,
        max: s.max,
        lastObserved: s.last,
      };
      return out;
    },
    keys() {
      return Array.from(map.keys());
    },
  };
}

/** z-score with a small-N shrinkage floor so a single outlier does not fire. */
export function zScore(observed: number, snap: BaselineSnapshot): number {
  if (snap.n < 3) return 0;
  const sd = snap.stddev < 1e-6 ? 1e-6 : snap.stddev;
  return (observed - snap.mean) / sd;
}
